#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { renderMarkdown } from "./markdown.js";
import { openInBrowser } from "./open-browser.js";
import {
  createPreviewServer,
  type BroadcastPayload,
} from "./preview-server.js";

const DEBOUNCE_MS = 75;

async function main(): Promise<void> {
  const [rawPath] = process.argv.slice(2);
  const target = rawPath ?? "README.md";
  const absolutePath = path.resolve(process.cwd(), target);
  const fileName = path.basename(absolutePath);

  await assertReadableFile(absolutePath);

  const preview = await createPreviewServer({
    initialFileName: fileName,
    initialFullPath: absolutePath,
  });

  console.log(`Watching ${absolutePath}`);
  console.log(`Preview available at ${preview.url}`);
  console.log("Press Ctrl+C to exit.");

  let debounceTimer: NodeJS.Timeout | undefined;

  const triggerRender = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      void renderAndBroadcast();
    }, DEBOUNCE_MS);
  };

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

  const directory = path.dirname(absolutePath);
  const watcher = fs.watch(
    directory,
    { persistent: true },
    (event, changed) => {
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

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    watcher.close();
    clearTimeoutSafe();
    await preview.close().catch((error) => {
      console.error(`[md] Failed to close preview server: ${error}`);
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("uncaughtException", async (error) => {
    console.error(`[md] Uncaught exception`, error);
    await shutdown();
  });

  function clearTimeoutSafe(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  }

  async function assertReadableFile(filePath: string): Promise<void> {
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
}

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[md] ${message}`);
  process.exit(1);
}
