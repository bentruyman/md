import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { command } from "@truyman/cli";

import pkg from "../package.json";
import { renderMarkdown } from "./markdown.js";
import { openInBrowser } from "./open-browser.js";
import {
  createPreviewRoutePath,
  createPreviewSourcePath,
} from "./preview-paths.js";
import {
  createPreviewServer,
  type BroadcastPayload,
} from "./preview-server.js";

const DEBOUNCE_MS = 75;
const COMMAND_NAME = Object.keys(pkg.bin ?? {})[0] ?? "md";
const execFileAsync = promisify(execFile);

export const DEFAULT_TARGET = "README.md";

export function resolveTargetPath(
  rawPath: string | undefined,
  cwd = process.cwd(),
): string {
  return path.resolve(cwd, rawPath ?? DEFAULT_TARGET);
}

export async function assertReadableFile(filePath: string): Promise<void> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      throw new Error("Path is not a file");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to open '${filePath}': ${message}`);
  }
}

export async function startPreview(rawPath?: string): Promise<void> {
  const launchDirectory = process.cwd();
  const previewRootPath = await detectPreviewRoot(launchDirectory);
  const initialPath = resolveTargetPath(rawPath, launchDirectory);

  await assertReadableFile(initialPath);

  let activeFullPath = initialPath;
  let activeFileName = path.basename(activeFullPath);
  let watcher: fs.FSWatcher | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const preview = await createPreviewServer({
    initialFileName: activeFileName,
    initialFullPath: activeFullPath,
    previewRootPath,
    navigateToMarkdown: async (nextFilePath) => {
      await setActiveMarkdownFile(nextFilePath);
    },
  });

  console.log(`Watching ${activeFullPath}`);
  console.log(`Preview available at ${preview.url}`);
  console.log("Press Ctrl+C to exit.");

  const renderAndBroadcast = async (): Promise<void> => {
    const currentFullPath = activeFullPath;
    const currentFileName = activeFileName;
    const sourcePath = createPreviewSourcePath(
      currentFullPath,
      previewRootPath,
    );

    try {
      const markdown = await fs.promises.readFile(currentFullPath, "utf8");
      const html = renderMarkdown(markdown);
      if (currentFullPath !== activeFullPath) {
        return;
      }

      preview.broadcast(
        buildPayload({
          html,
          fileName: currentFileName,
          fullPath: currentFullPath,
          sourcePath,
        }),
      );
    } catch (error) {
      if (currentFullPath !== activeFullPath) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      preview.broadcast(
        buildPayload({
          html: `<p>Unable to read markdown file.</p><pre>${escapeHtml(message)}</pre>`,
          fileName: currentFileName,
          fullPath: currentFullPath,
          sourcePath,
          isError: true,
        }),
      );
      console.error(`[md] Failed to read file: ${message}`);
    }
  };

  const triggerRender = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      void renderAndBroadcast();
    }, DEBOUNCE_MS);
  };

  const bindWatcher = (filePath: string): void => {
    watcher?.close();
    watcher = fs.watch(
      path.dirname(filePath),
      { persistent: true },
      (_event, changed) => {
        if (changed && path.basename(changed) !== activeFileName) {
          return;
        }
        triggerRender();
      },
    );

    watcher.on("error", (error) => {
      console.error(
        `[md] Watcher error: ${error instanceof Error ? error.message : error}`,
      );
    });
  };

  const setActiveMarkdownFile = async (filePath: string): Promise<void> => {
    const normalizedPath = path.resolve(filePath);
    await assertReadableFile(normalizedPath);

    if (normalizedPath !== activeFullPath) {
      activeFullPath = normalizedPath;
      activeFileName = path.basename(normalizedPath);
      bindWatcher(normalizedPath);
      console.log(`Watching ${normalizedPath}`);
    }

    clearTimer();
    await renderAndBroadcast();
  };

  bindWatcher(activeFullPath);
  await renderAndBroadcast();

  try {
    await openInBrowser(
      new URL(
        createPreviewRoutePath(activeFullPath, previewRootPath),
        preview.url,
      ).toString(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[md] Unable to open browser automatically: ${message}`);
  }

  let shuttingDown = false;

  const clearTimer = (): void => {
    if (!debounceTimer) {
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  };

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    watcher?.close();
    clearTimer();
    await preview.close().catch((error: unknown) => {
      console.error(`[md] Failed to close preview server: ${String(error)}`);
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", async (error) => {
    console.error("[md] Uncaught exception", error);
    await shutdown();
  });
}

export async function detectPreviewRoot(
  launchDirectory: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      {
        cwd: launchDirectory,
      },
    );
    const gitRoot = stdout.trim();
    if (gitRoot.length > 0) {
      return path.resolve(gitRoot);
    }
  } catch {
    // Outside a Git repository, use the launch directory as the preview root.
  }

  return launchDirectory;
}

export const cli = command({
  name: COMMAND_NAME,
  description:
    pkg.description ??
    "Preview Markdown in your browser with live reload and Mermaid support.",
  version: pkg.version,
  args: [
    {
      name: "file",
      type: "string",
      description: "Markdown file to preview",
      optional: true,
    },
  ] as const,
  handler: async ([file]) => {
    await startPreview(file);
  },
});

function buildPayload(
  options: Omit<BroadcastPayload, "title" | "updatedAt"> & {
    html: string;
    isError?: boolean;
  },
): BroadcastPayload {
  return {
    html: options.html,
    fileName: options.fileName,
    fullPath: options.fullPath,
    sourcePath: options.sourcePath,
    title: `md — ${options.fileName}`,
    updatedAt: new Date().toISOString(),
    isError: options.isError,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
