import { describe, expect, it } from "bun:test";
import path from "node:path";

import {
  createPreviewAssetUrl,
  resolvePreviewAssetPath,
} from "../src/preview-server.js";

describe("preview asset helpers", () => {
  it("rewrites relative asset paths to the preview asset route", () => {
    expect(createPreviewAssetUrl("./images/diagram.png")).toBe(
      "/__preview_asset?source=.%2Fimages%2Fdiagram.png",
    );
    expect(createPreviewAssetUrl("../shared/chart.webp")).toBe(
      "/__preview_asset?source=..%2Fshared%2Fchart.webp",
    );
  });

  it("leaves absolute and remote asset paths unchanged", () => {
    expect(createPreviewAssetUrl("/images/diagram.png")).toBe(
      "/images/diagram.png",
    );
    expect(createPreviewAssetUrl("https://example.com/diagram.png")).toBe(
      "https://example.com/diagram.png",
    );
    expect(createPreviewAssetUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
  });

  it("resolves preview asset paths relative to the markdown file", () => {
    const markdownFile = path.join("/tmp", "docs", "guide.md");
    expect(resolvePreviewAssetPath("./images/diagram.png", markdownFile)).toBe(
      path.join("/tmp", "docs", "images", "diagram.png"),
    );
    expect(resolvePreviewAssetPath("../shared/chart.webp", markdownFile)).toBe(
      path.join("/tmp", "shared", "chart.webp"),
    );
  });

  it("rejects invalid preview asset paths", () => {
    const markdownFile = path.join("/tmp", "docs", "guide.md");
    expect(resolvePreviewAssetPath(undefined, markdownFile)).toBeUndefined();
    expect(
      resolvePreviewAssetPath("/etc/passwd", markdownFile),
    ).toBeUndefined();
    expect(
      resolvePreviewAssetPath("https://example.com/diagram.png", markdownFile),
    ).toBeUndefined();
    expect(resolvePreviewAssetPath("%E0%A4%A", markdownFile)).toBeUndefined();
  });
});
