import { describe, expect, it } from "bun:test";
import path from "node:path";

import {
  assertReadableFile,
  DEFAULT_TARGET,
  resolveTargetPath,
} from "../src/cli.js";

describe("md cli helpers", () => {
  it("defaults to README.md when no file is provided", () => {
    expect(resolveTargetPath(undefined, "/tmp/project")).toBe(
      path.join("/tmp/project", DEFAULT_TARGET),
    );
  });

  it("resolves an explicit file argument from the cwd", () => {
    expect(resolveTargetPath("docs/guide.md", "/tmp/project")).toBe(
      path.join("/tmp/project", "docs/guide.md"),
    );
  });

  it("rejects unreadable files", async () => {
    const missingPath = path.join("/tmp", "missing-file.md");
    await expect(assertReadableFile(missingPath)).rejects.toThrow(
      `Unable to open '${missingPath}'`,
    );
  });

  it("rejects directories", async () => {
    await expect(assertReadableFile(process.cwd())).rejects.toThrow(
      "Path is not a file",
    );
  });
});
