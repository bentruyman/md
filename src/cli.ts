import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { command } from "@truyman/cli";

import pkg from "../package.json";
import { renderMarkdown } from "./markdown.js";
import { openInBrowser } from "./open-browser.js";
import {
  createPreviewServer,
  type BroadcastPayload,
} from "./preview-server.js";

const DEBOUNCE_MS = 75;
const COMMAND_NAME = Object.keys(pkg.bin ?? {})[0] ?? "md";

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
  const absolutePath = resolveTargetPath(rawPath);
  const fileName = path.basename(absolutePath);

  await assertReadableFile(absolutePath);

  const preview = await createPreviewServer({
    initialFileName: fileName,
    initialFullPath: absolutePath,
  });

  console.log(`Watching ${absolutePath}`);
  console.log(`Preview available at ${preview.url}`);
  console.log("Press Ctrl+C to exit.");

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const renderAndBroadcast = async (): Promise<void> => {
    try {
      const markdown = await fs.promises.readFile(absolutePath, "utf8");
      const html = renderMarkdown(markdown);
      preview.broadcast(
        buildPayload({
          html,
          fileName,
          fullPath: absolutePath,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      preview.broadcast(
        buildPayload({
          html: `<p>Unable to read markdown file.</p><pre>${escapeHtml(message)}</pre>`,
          fileName,
          fullPath: absolutePath,
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

  const watcher = fs.watch(
    path.dirname(absolutePath),
    { persistent: true },
    (_event, changed) => {
      if (changed && path.basename(changed) !== fileName) {
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

  await renderAndBroadcast();

  try {
    await openInBrowser(preview.url);
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
    watcher.close();
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
