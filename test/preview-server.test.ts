import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolvePreviewRequestPath } from "../src/preview-server.js";

describe("preview route helpers", () => {
  it("resolves markdown routes relative to the preview root", async () => {
    await withFixtureRepo(async (repo) => {
      await writeFile(repo, "docs/README.md", "# Docs");

      await expect(
        resolvePreviewRequestPath("/docs/README.md", repo),
      ).resolves.toMatchObject({
        kind: "markdown",
        fullPath: path.join(repo, "docs", "README.md"),
        sourcePath: "docs/README.md",
      });
    });
  });

  it("resolves directories to markdown README files", async () => {
    await withFixtureRepo(async (repo) => {
      await writeFile(repo, "docs/README.markdown", "# Docs");

      await expect(
        resolvePreviewRequestPath("/docs", repo),
      ).resolves.toMatchObject({
        kind: "markdown",
        fullPath: path.join(repo, "docs", "README.markdown"),
        sourcePath: "docs/README.markdown",
      });
    });
  });

  it("resolves hidden repo assets as static files", async () => {
    await withFixtureRepo(async (repo) => {
      await writeFile(repo, ".github/assets/image.png", "fake image");

      await expect(
        resolvePreviewRequestPath("/.github/assets/image.png", repo),
      ).resolves.toMatchObject({
        kind: "static",
        fullPath: path.join(repo, ".github", "assets", "image.png"),
      });
    });
  });

  it("rejects .git internals and traversal outside the preview root", async () => {
    await withFixtureRepo(async (repo) => {
      await writeFile(repo, ".git/config", "[core]");
      const outsideDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "md-preview-outside-"),
      );
      try {
        const outsideFile = path.join(outsideDir, "outside.png");
        await fs.writeFile(outsideFile, "outside");

        await expect(
          resolvePreviewRequestPath("/.git/config", repo),
        ).resolves.toBeUndefined();
        const outsideRelative = path
          .relative(repo, outsideFile)
          .split(path.sep)
          .join("/");
        await expect(
          resolvePreviewRequestPath(`/${outsideRelative}`, repo),
        ).resolves.toBeUndefined();
      } finally {
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });
  });

  it("returns undefined for missing files and directories without README files", async () => {
    await withFixtureRepo(async (repo) => {
      await fs.mkdir(path.join(repo, "empty"), { recursive: true });

      await expect(
        resolvePreviewRequestPath("/missing.png", repo),
      ).resolves.toBeUndefined();
      await expect(
        resolvePreviewRequestPath("/empty", repo),
      ).resolves.toBeUndefined();
    });
  });
});

async function withFixtureRepo(
  callback: (repoPath: string) => Promise<void>,
): Promise<void> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "md-preview-"));
  try {
    await callback(repo);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
}

async function writeFile(root: string, relativePath: string, value: string) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value);
}
