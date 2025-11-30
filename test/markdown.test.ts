import { describe, expect, it } from "bun:test";
import { renderMarkdown } from "../src/markdown.js";

describe("renderMarkdown", () => {
  it("renders headings", () => {
    const html = renderMarkdown("# Hello\n\nText");
    expect(html).toContain('<h1 id="hello">Hello</h1>');
    expect(html).toContain("<p>Text</p>");
  });

  it("supports GitHub Flavored Markdown features", () => {
    const markdown = String.raw`| a | b |
| - | - |
| 1 | 2 |

~~strike~~`;
    const html = renderMarkdown(markdown);
    expect(html).toContain("<table>");
    expect(html).toContain("<del>strike</del>");
  });

  it("retains table captions", () => {
    const markdown = `<table><caption>Demo</caption><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>`;
    const html = renderMarkdown(markdown);
    expect(html).toContain("<caption>Demo</caption>");
    expect(html).toContain("<td>2</td>");
  });

  it("renders enhanced fenced code blocks", () => {
    const html = renderMarkdown("```ts\nconst x = 1;\n```\n");
    expect(html).toContain('class="code-block code-block-typescript"');
    expect(html).toContain('class="code-copy"');
    expect(html).toContain('class="hljs language-typescript"');
  });

  it("applies diff styling to diff code fences", () => {
    const html = renderMarkdown("```diff\n+ added\n- removed\n```\n");
    expect(html).toContain("code-block-diff");
    expect(html).toMatch(/code-line-addition/);
    expect(html).toMatch(/code-line-deletion/);
  });

  it("renders emoji shortcodes in text", () => {
    const html = renderMarkdown("Hello :sparkles:");
    expect(html).toContain("Hello ✨");
  });

  it("does not emojify inside code blocks", () => {
    const html = renderMarkdown("`code :sparkles:`");
    expect(html).toContain("code :sparkles:");
  });

  it("renders callout blocks", () => {
    const markdown = "> [!TIP]\n> Remember to hydrate\n";
    const html = renderMarkdown(markdown);
    expect(html).toContain("callout callout-tip");
    expect(html).toContain('class="callout-title"');
    expect(html).toContain("Tip");
    expect(html).toContain("Remember to hydrate");
  });

  it("supports custom callout titles", () => {
    const markdown = "> [!IMPORTANT] Read me first\n> Critical instructions\n";
    const html = renderMarkdown(markdown);
    expect(html).toContain("callout callout-important");
    expect(html).toContain("Read me first");
    expect(html).toContain("Critical instructions");
  });

  it("retains details disclosures", () => {
    const markdown =
      "<details>\n<summary>Toggle</summary>\n<p>Hidden</p>\n</details>";
    const html = renderMarkdown(markdown);
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Toggle</summary>");
    expect(html).toContain("Hidden");
  });

  it("wraps mermaid fences in diagram markup", () => {
    const markdown = "```mermaid\ngraph TD; A-->B;\n```\n";
    const html = renderMarkdown(markdown);
    expect(html).toContain('class="diagram diagram-mermaid"');
    expect(html).toContain('data-diagram-kind="mermaid"');
    expect(html).toContain("Rendering Mermaid diagram...");
    expect(html).toContain("data-diagram-copy");
    expect(html).toContain("graph TD; A--&gt;B;");
  });
});
