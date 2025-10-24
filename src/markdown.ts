import hljs from "highlight.js";
import type { Tokens } from "marked";
import { marked } from "marked";
import { emojify } from "node-emoji";

type DiagramLanguage = "mermaid" | "plantuml";

const PLAIN_LANGUAGE = "plaintext";
const DIFF_LANGUAGES = new Set(["diff"]);
const DIAGRAM_LANGUAGES = new Set<DiagramLanguage>(["mermaid", "plantuml"]);

const LANGUAGE_ALIASES: Record<string, string> = {
  console: "bash",
  shell: "bash",
  sh: "bash",
  shellsession: "bash",
  zsh: "bash",
  text: PLAIN_LANGUAGE,
  plain: PLAIN_LANGUAGE,
  plaintext: PLAIN_LANGUAGE,
  txt: PLAIN_LANGUAGE,
  js: "javascript",
  javascript: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  typescript: "typescript",
  mermaid: "mermaid",
  plantuml: "plantuml",
  puml: "plantuml",
  yml: "yaml",
  md: "markdown",
  "c#": "csharp",
  docker: "dockerfile",
};

marked.setOptions({
  gfm: true,
  breaks: false,
});

type TokensList = ReturnType<typeof marked.lexer>;

export function renderMarkdown(markdown: string): string {
  const renderer = new marked.Renderer();
  const slugCounts = new Map<string, number>();
  let codeBlockId = 0;
  let diagramId = 0;

  renderer.heading = ({ tokens, depth, text }) => {
    const slug = createSlug(text, slugCounts);
    const content = renderer.parser.parseInline(tokens);
    return `<h${depth} id="${slug}">${content}</h${depth}>\n`;
  };

  const originalBlockquote = renderer.blockquote.bind(renderer);
  renderer.blockquote = (token) => {
    const callout = parseCallout(token);
    if (!callout) {
      return originalBlockquote(token);
    }

    const bodyHtml =
      callout.bodyTokens.length > 0
        ? renderer.parser.parse(callout.bodyTokens)
        : "";

    const titleHtml = escapeHtml(callout.title);
    const iconHtml = escapeHtml(callout.icon);

    const body =
      bodyHtml.trim().length > 0
        ? `
  <div class="callout-content">
${bodyHtml}
  </div>
`
        : "";

    return `
<div class="callout callout-${callout.variant}">
  <p class="callout-title">
    <span class="callout-icon" aria-hidden="true">${iconHtml}</span>
    ${titleHtml}
  </p>${body}
</div>
`;
  };

  const originalText = renderer.text.bind(renderer);
  renderer.text = (token) => {
    const output = originalText(token);
    return emojifyText(output);
  };

  renderer.code = ({ text, lang }) => {
    const normalizedLanguage =
      typeof lang === "string" && lang.trim().length > 0
        ? normalizeLanguage(lang)
        : undefined;

    if (normalizedLanguage && isDiagramLanguage(normalizedLanguage)) {
      diagramId += 1;
      const targetId = createDiagramTargetId(normalizedLanguage, diagramId);
      return renderDiagram({
        kind: normalizedLanguage,
        source: text,
        targetId,
      });
    }

    codeBlockId += 1;
    const blockId = `code-block-${codeBlockId}`;

    const codeContent = normalizeNewlines(text);
    const { value: highlighted, language: detected } = highlightCode(
      codeContent,
      normalizedLanguage,
    );
    const finalLanguage = detected ?? normalizedLanguage;
    const languageClass = finalLanguage ? ` language-${finalLanguage}` : "";
    const codeLines = wrapCodeLines(highlighted, codeContent, finalLanguage);
    const blockClasses = [
      "code-block",
      finalLanguage ? `code-block-${finalLanguage}` : "code-block-plain",
    ];

    if (isDiffLanguage(finalLanguage)) {
      blockClasses.push("code-block-diff");
    }

    const blockAttributes = finalLanguage
      ? ` data-language="${escapeHtml(finalLanguage)}"`
      : "";

    return `<div class="${blockClasses.join(" ")}"${blockAttributes}>
  <button type="button" class="code-copy" data-code-target="${blockId}" aria-label="Copy">
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
    </svg>
  </button>
  <pre><code id="${blockId}" class="hljs${languageClass}">${codeLines}</code></pre>
</div>
`;
  };

  return marked.parse(markdown, { async: false, renderer }) as string;
}

function createSlug(source: string, counts: Map<string, number>): string {
  const value = String(source);
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const fallback = base || "section";
  const seen = counts.get(fallback) ?? 0;
  counts.set(fallback, seen + 1);
  return seen === 0 ? fallback : `${fallback}-${seen}`;
}

function highlightCode(
  code: string,
  language?: string,
): { value: string; language?: string } {
  const normalizedLanguage = language ? normalizeLanguage(language) : undefined;
  const valueToHighlight = normalizeNewlines(code);

  try {
    if (
      normalizedLanguage &&
      normalizedLanguage !== PLAIN_LANGUAGE &&
      hljs.getLanguage(normalizedLanguage)
    ) {
      return {
        value: hljs.highlight(valueToHighlight, {
          language: normalizedLanguage,
        }).value,
        language: normalizedLanguage,
      };
    }

    if (normalizedLanguage === PLAIN_LANGUAGE) {
      return {
        value: escapeHtml(valueToHighlight),
        language: PLAIN_LANGUAGE,
      };
    }

    const { value, language: guessed } = hljs.highlightAuto(valueToHighlight);
    return {
      value,
      language: guessed ? normalizeLanguage(guessed) : normalizedLanguage,
    };
  } catch (error) {
    console.warn(
      `[md] Failed to highlight code block${language ? ` (${language})` : ""}:`,
      error,
    );
    return {
      value: escapeHtml(valueToHighlight),
      language: normalizedLanguage,
    };
  }
}

function wrapCodeLines(
  highlighted: string,
  raw: string,
  language?: string,
): string {
  const rawLines = toLines(raw);
  const highlightedLines = toLines(highlighted, true);
  const lines: string[] = [];

  if (rawLines.length === 0) {
    return '<span class="code-line code-line-empty" data-line="1">&nbsp;</span>';
  }

  for (const [index, rawLine_] of rawLines.entries()) {
    const rawLine = rawLine_ ?? "";
    const highlightedLine = highlightedLines[index] ?? escapeHtml(rawLine);

    const classes = ["code-line"];
    if (rawLine.length === 0) {
      classes.push("code-line-empty");
    }

    if (isDiffLanguage(language)) {
      const firstChar = rawLine[0];
      switch (firstChar) {
        case "+": {
          classes.push("code-line-addition");

          break;
        }
        case "-": {
          classes.push("code-line-deletion");

          break;
        }
        case "@": {
          classes.push("code-line-hunk");

          break;
        }
        // No default
      }
    }

    const safeLine = highlightedLine.length > 0 ? highlightedLine : "&nbsp;";
    lines.push(`<span class="${classes.join(" ")}">${safeLine}</span>`);
  }

  return lines.join("");
}

function toLines(source: string, preserveHtml = false): string[] {
  const normalized = normalizeNewlines(source);
  const segments = normalized.split("\n");

  while (segments.length > 0 && segments.at(-1) === "") {
    segments.pop();
  }

  if (preserveHtml) {
    return segments;
  }

  return segments;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

interface CalloutVariant {
  key: string;
  label: string;
  icon: string;
}

interface CalloutMatch {
  variant: string;
  title: string;
  icon: string;
  bodyTokens: TokensList;
}

const CALLOUT_VARIANTS: Record<string, CalloutVariant> = {
  note: { key: "note", label: "Note", icon: "ℹ️" },
  tip: { key: "tip", label: "Tip", icon: "💡" },
  important: { key: "important", label: "Important", icon: "❗" },
  warning: { key: "warning", label: "Warning", icon: "⚠️" },
  caution: { key: "caution", label: "Caution", icon: "⚠️" },
};

function parseCallout(token: Tokens.Blockquote): CalloutMatch | undefined {
  if (!token.raw) {
    return undefined;
  }

  const lines = token.raw.split(/\n/).map((line) => line.replace(/^> ?/, ""));
  const [firstLineRaw, ...rest] = lines;
  if (!firstLineRaw) {
    return undefined;
  }

  const match = firstLineRaw.trim().match(/^\[!(\w+)\](?:\s+(.*))?$/);
  if (!match) {
    return undefined;
  }

  const [, rawType, rawCustomTitle] = match;
  if (!rawType) {
    return undefined;
  }

  const type = rawType.toLowerCase();
  const variant = CALLOUT_VARIANTS[type] ?? CALLOUT_VARIANTS.note;
  if (!variant) {
    return undefined;
  }
  const customTitle = rawCustomTitle?.trim();
  const title =
    customTitle && customTitle.length > 0 ? customTitle : variant.label;

  while (rest.length > 0 && rest.at(-1)?.trim() === "") {
    rest.pop();
  }

  while (rest.length > 0) {
    const firstLine = rest[0];
    if (firstLine && firstLine.trim() === "") {
      rest.shift();
      continue;
    }
    break;
  }

  const contentMarkdown = rest.join("\n");
  const bodyTokens: TokensList =
    contentMarkdown.trim().length > 0
      ? marked.lexer(contentMarkdown)
      : marked.lexer("");

  return {
    variant: variant.key,
    title,
    icon: variant.icon,
    bodyTokens,
  };
}

interface DiagramMetadata {
  label: string;
  initialState: "pending" | "unsupported";
  message: string;
  copyLabel: string;
}

interface RenderDiagramOptions {
  kind: DiagramLanguage;
  source: string;
  targetId: string;
}

const DIAGRAM_METADATA: Record<DiagramLanguage, DiagramMetadata> = {
  mermaid: {
    label: "Mermaid",
    initialState: "pending",
    message: "Rendering Mermaid diagram...",
    copyLabel: "Copy Mermaid source",
  },
  plantuml: {
    label: "PlantUML",
    initialState: "unsupported",
    message:
      "PlantUML preview requires an external renderer. The source is shown below.",
    copyLabel: "Copy PlantUML source",
  },
};

function renderDiagram(options: RenderDiagramOptions): string {
  const metadata = DIAGRAM_METADATA[options.kind];
  const safeSource = escapeHtml(normalizeNewlines(options.source));
  const figureClasses = `diagram diagram-${options.kind}`;
  const ariaLabel = `${metadata.label} diagram`;

  return `<figure class="${figureClasses}" data-diagram-kind="${options.kind}" data-diagram-state="${metadata.initialState}">
  <div class="diagram-target" id="${options.targetId}" data-diagram-target="${options.targetId}" role="img" aria-label="${escapeHtml(ariaLabel)}"></div>
  <p class="diagram-message" data-diagram-message>${escapeHtml(metadata.message)}</p>
  <pre class="diagram-source" data-diagram-source="${options.targetId}"><code>${safeSource}</code></pre>
  <button type="button" class="diagram-copy" data-diagram-copy="${options.targetId}" aria-label="${escapeHtml(metadata.copyLabel)}">
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
    </svg>
  </button>
</figure>
`;
}

function createDiagramTargetId(kind: DiagramLanguage, id: number): string {
  return `diagram-${kind}-${id}`;
}

function normalizeLanguage(language: string): string {
  const lower = language.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

function isDiagramLanguage(language?: string): language is DiagramLanguage {
  if (!language) {
    return false;
  }
  return DIAGRAM_LANGUAGES.has(language as DiagramLanguage);
}

function isDiffLanguage(language?: string): boolean {
  return language ? DIFF_LANGUAGES.has(language) : false;
}

function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emojifyText(value: string): string {
  return emojify(value);
}
