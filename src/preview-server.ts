import fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

export interface BroadcastPayload {
  html: string;
  fileName: string;
  fullPath: string;
  title: string;
  updatedAt: string;
  isError?: boolean;
}

export interface PreviewServer {
  url: string;
  port: number;
  broadcast(payload: BroadcastPayload): void;
  close(): Promise<void>;
}

interface CreatePreviewServerOptions {
  initialFileName: string;
  initialFullPath: string;
}

const require = createRequire(import.meta.url);
const mermaidAssetCache = new Map<string, string>();
const mermaidAssetErrors = new Map<string, Error>();
let mermaidDistDir: string | undefined;

async function loadMermaidAsset(requestPath: string): Promise<string> {
  const cachedError = mermaidAssetErrors.get(requestPath);
  if (cachedError) {
    throw cachedError;
  }

  const cachedSource = mermaidAssetCache.get(requestPath);
  if (cachedSource) {
    return cachedSource;
  }

  try {
    const normalizedRequest = requestPath.startsWith("/")
      ? requestPath.slice(1)
      : requestPath;

    let resolvedFile: string;
    if (normalizedRequest === "mermaid.js") {
      resolvedFile = require.resolve("mermaid/dist/mermaid.esm.mjs");
    } else {
      if (!mermaidDistDir) {
        const mainPath = require.resolve("mermaid/dist/mermaid.esm.mjs");
        mermaidDistDir = path.dirname(mainPath);
      }
      const candidate = path.join(mermaidDistDir, normalizedRequest);
      const relative = path.relative(mermaidDistDir, candidate);
      if (
        !mermaidDistDir ||
        relative.startsWith("..") ||
        path.isAbsolute(relative)
      ) {
        throw new Error("Invalid Mermaid asset path");
      }
      resolvedFile = candidate;
    }

    const source = await fs.readFile(resolvedFile, "utf8");
    mermaidAssetCache.set(requestPath, source);
    return source;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    mermaidAssetErrors.set(requestPath, failure);
    throw failure;
  }
}

export async function createPreviewServer(
  options: CreatePreviewServerOptions,
): Promise<PreviewServer> {
  const clients = new Set<ServerResponse>();
  let lastPayload: BroadcastPayload | undefined;

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Bad request");
      return;
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(req.url, "http://127.0.0.1");
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Bad request");
      return;
    }

    const hasNestedSegments = requestUrl.pathname.includes("/", 1);
    const isJavaScriptRequest = requestUrl.pathname.endsWith(".js");

    if (!hasNestedSegments && isJavaScriptRequest) {
      void loadMermaidAsset(requestUrl.pathname)
        .then((source) => {
          res.writeHead(200, {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-cache, no-store, must-revalidate",
          });
          res.end(source);
        })
        .catch((error) => {
          console.error(
            `[md] Failed to serve Mermaid asset '${requestUrl.pathname}': ${
              error instanceof Error ? error.message : error
            }`,
          );
          res.writeHead(404, {
            "content-type": "text/plain; charset=utf-8",
          });
          res.end("Mermaid asset not found.");
        });
      return;
    }

    if (requestUrl.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-store, must-revalidate",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });

      res.write("\n");
      clients.add(res);

      if (lastPayload) {
        send(res, lastPayload);
      } else {
        send(res, {
          html: `<p class="placeholder">Watching <code>${escapeHtml(options.initialFullPath)}</code>…</p>`,
          fileName: options.initialFileName,
          fullPath: options.initialFullPath,
          title: `md — ${options.initialFileName}`,
          updatedAt: new Date().toISOString(),
        });
      }

      req.on("close", () => {
        clients.delete(res);
      });
      return;
    }

    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
    });
    res.end(buildHtmlShell(options.initialFileName));
  });

  const port: number = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
      } else {
        reject(new Error("Unable to determine server port"));
      }
    });
    server.on("error", (error) => {
      reject(error);
    });
  });

  const broadcast = (payload: BroadcastPayload): void => {
    lastPayload = payload;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
  };

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      for (const client of clients) {
        client.end();
      }
      clients.clear();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    broadcast,
    close,
  };

  function send(stream: ServerResponse, payload: BroadcastPayload): void {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    stream.write(data);
  }
}

function buildHtmlShell(initialFileName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>md — ${escapeHtml(initialFileName)}</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }

      body {
        margin: 0;
        background: var(--bg-color);
        color: var(--text-color);
        transition: background 0.2s ease-in-out, color 0.2s ease-in-out;
      }

      body[data-theme="light"] {
        --bg-color: #f6f8fa;
        --text-color: #1f2328;
        --muted-color: #57606a;
        --code-bg: #f0f1f3;
        --border-color: #d0d7de;
        --link-color: #0969da;
        --table-stripe: #f6f8fa;
      }

      body[data-theme="dark"] {
        --bg-color: #0d1117;
        --text-color: #e6edf3;
        --muted-color: #9ea7b3;
        --code-bg: #161b22;
        --border-color: #30363d;
        --link-color: #4493f8;
        --table-stripe: #161b22;
      }

      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 2.5rem 1.5rem 4rem;
        box-sizing: border-box;
      }

      header {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
      }

      header h1 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--muted-color);
      }

      header h1 code {
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
        font-size: 0.95em;
        background: var(--code-bg);
        padding: 0.15rem 0.4rem;
        border-radius: 0.35rem;
        border: 1px solid var(--border-color);
      }

      header button {
        border: 1px solid var(--border-color);
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        cursor: pointer;
        transition: background 0.15s ease-in-out, border-color 0.15s ease-in-out;
      }

      header button:hover {
        background: var(--code-bg);
      }

      header button:focus-visible {
        outline: 2px solid var(--link-color);
        outline-offset: 2px;
      }

      #status {
        font-size: 0.85rem;
        color: var(--muted-color);
        margin: 0;
      }

      #status.is-error {
        color: #f85149;
      }

      .markdown-body {
        font-size: 16px;
        line-height: 1.6;
      }

      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4,
      .markdown-body h5,
      .markdown-body h6 {
        margin-top: 1.8em;
        margin-bottom: 0.8em;
        font-weight: 600;
        line-height: 1.25;
      }

      .markdown-body h1 {
        padding-bottom: 0.3em;
        border-bottom: 1px solid var(--border-color);
        font-size: 2em;
      }

      .markdown-body h2 {
        padding-bottom: 0.3em;
        border-bottom: 1px solid var(--border-color);
        font-size: 1.65em;
      }

      .markdown-body h3 {
        font-size: 1.35em;
      }

      .markdown-body a {
        color: var(--link-color);
        text-decoration: none;
      }

      .markdown-body a:hover {
        text-decoration: underline;
      }

      .markdown-body pre {
        margin: 0;
        padding: 0;
        background: transparent;
        border: none;
      }

      .markdown-body code {
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
      }

      .markdown-body :not(pre) > code {
        background: var(--code-bg);
        padding: 0.2rem 0.4rem;
        border-radius: 0.3rem;
        border: 1px solid var(--border-color);
        font-size: 0.9em;
      }

      code.hljs {
        display: block;
        width: 100%;
      }

      .code-block {
        position: relative;
        margin: 1.2rem 0;
        border-radius: 0.75rem;
        border: 1px solid var(--border-color);
        background: var(--code-bg);
        overflow: hidden;
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
      }

      .code-block pre {
        margin: 0;
        overflow: auto;
        padding: 0.9rem 0;
        position: relative;
        z-index: 0;
      }

      .code-copy {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        border: 1px solid rgba(125, 133, 144, 0.35);
        background: rgba(22, 27, 34, 0.75);
        color: inherit;
        padding: 0.6rem;
        border-radius: 0.38rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease-in-out, border-color 0.15s ease-in-out, color 0.15s ease-in-out;
        z-index: 2;
      }

      body[data-theme="light"] .code-copy {
        background: rgba(246, 248, 250, 0.85);
        border-color: rgba(208, 215, 222, 0.8);
      }

      .code-copy:hover,
      .code-copy:focus-visible {
        background: rgba(125, 133, 144, 0.25);
        border-color: rgba(125, 133, 144, 0.45);
      }

      body[data-theme="light"] .code-copy:hover,
      body[data-theme="light"] .code-copy:focus-visible {
        background: rgba(9, 105, 218, 0.1);
        border-color: rgba(9, 105, 218, 0.3);
      }

      .code-copy.is-copied {
        border-color: rgba(31, 136, 61, 0.55);
        color: #1f883d;
        background: rgba(31, 136, 61, 0.12);
      }

      body[data-theme="dark"] .code-copy.is-copied {
        color: #3fb950;
        border-color: rgba(63, 185, 80, 0.6);
        background: rgba(63, 185, 80, 0.15);
      }

      .code-copy:focus-visible {
        outline: 2px solid var(--link-color);
        outline-offset: 2px;
      }

      .code-copy svg {
        display: block;
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .diagram {
        position: relative;
        margin: 1.2rem 0;
        border-radius: 0.75rem;
        border: 1px solid var(--border-color);
        background: var(--code-bg);
        padding: 1rem 1rem 1.1rem;
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
      }

      .diagram-target {
        display: none;
        overflow: auto;
      }

      .diagram-target svg {
        display: block;
        max-width: 100%;
      }

      .diagram-message {
        margin: 0;
        font-size: 0.9rem;
        color: var(--muted-color);
        padding-right: 2.5rem;
      }

      .diagram[data-diagram-state="rendered"] .diagram-message {
        display: none;
      }

      .diagram[data-diagram-state="error"] .diagram-message {
        color: #f85149;
      }

      body[data-theme="dark"] .diagram[data-diagram-state="error"] .diagram-message {
        color: #ff7b72;
      }

      .diagram-source {
        display: none;
        margin: 0.85rem 0 0;
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
        font-size: 0.85rem;
        line-height: 1.5;
        border-radius: 0.55rem;
        padding: 0.65rem 0.8rem;
        border: 1px solid rgba(125, 133, 144, 0.35);
        background: rgba(22, 27, 34, 0.5);
        overflow: auto;
      }

      body[data-theme="light"] .diagram-source {
        background: rgba(246, 248, 250, 0.85);
        border-color: rgba(208, 215, 222, 0.8);
      }

      .diagram[data-diagram-state="error"] .diagram-source,
      .diagram[data-diagram-state="unsupported"] .diagram-source {
        display: block;
      }

      .diagram[data-diagram-state="rendered"] .diagram-target {
        display: block;
      }

      .diagram-copy {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        border: 1px solid rgba(125, 133, 144, 0.35);
        background: rgba(22, 27, 34, 0.75);
        color: inherit;
        padding: 0.6rem;
        border-radius: 0.38rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease-in-out, border-color 0.15s ease-in-out, color 0.15s ease-in-out;
      }

      body[data-theme="light"] .diagram-copy {
        background: rgba(246, 248, 250, 0.85);
        border-color: rgba(208, 215, 222, 0.8);
      }

      .diagram-copy:hover,
      .diagram-copy:focus-visible {
        background: rgba(125, 133, 144, 0.25);
        border-color: rgba(125, 133, 144, 0.45);
      }

      body[data-theme="light"] .diagram-copy:hover,
      body[data-theme="light"] .diagram-copy:focus-visible {
        background: rgba(9, 105, 218, 0.1);
        border-color: rgba(9, 105, 218, 0.3);
      }

      .diagram-copy.is-copied {
        border-color: rgba(31, 136, 61, 0.55);
        color: #1f883d;
        background: rgba(31, 136, 61, 0.12);
      }

      body[data-theme="dark"] .diagram-copy.is-copied {
        color: #3fb950;
        border-color: rgba(63, 185, 80, 0.6);
        background: rgba(63, 185, 80, 0.15);
      }

      .diagram-copy:focus-visible {
        outline: 2px solid var(--link-color);
        outline-offset: 2px;
      }

      .diagram-copy svg {
        display: block;
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .code-line {
        display: block;
        position: relative;
        padding: 0.14rem 0.95rem;
        font-size: 0.9em;
        min-height: 1.3em;
        line-height: 1.45;
        white-space: pre;
        tab-size: 2;
      }

      body[data-theme="light"] .code-block-diff .code-line-addition {
        background: #e6ffec;
      }

      body[data-theme="light"] .code-block-diff .code-line-deletion {
        background: #ffeef0;
      }

      body[data-theme="light"] .code-block-diff .code-line-hunk {
        background: #f1f5f9;
        color: #57606a;
      }

      body[data-theme="dark"] .code-block-diff .code-line-addition {
        background: rgba(46, 160, 67, 0.35);
      }

      body[data-theme="dark"] .code-block-diff .code-line-deletion {
        background: rgba(248, 81, 73, 0.4);
      }

      body[data-theme="dark"] .code-block-diff .code-line-hunk {
        background: rgba(110, 118, 129, 0.45);
        color: #c9d1d9;
      }

      .callout {
        margin: 1.25rem 0;
        border-left: 0.25rem solid var(--callout-accent);
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        background: var(--callout-bg);
        color: inherit;
      }

      .callout-title {
        margin: 0 0 0.45rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--callout-accent);
      }

      .callout-icon {
        font-size: 1rem;
      }

      .callout-content > :first-child {
        margin-top: 0;
      }

      .callout-content > :last-child {
        margin-bottom: 0;
      }

      .callout-content p {
        margin: 0.4rem 0;
      }

      body[data-theme="light"] .callout-note {
        --callout-bg: #f6f8fa;
        --callout-accent: #0969da;
      }

      body[data-theme="dark"] .callout-note {
        --callout-bg: rgba(56, 139, 253, 0.08);
        --callout-accent: #58a6ff;
      }

      body[data-theme="light"] .callout-tip {
        --callout-bg: #f0fff4;
        --callout-accent: #1a7f37;
      }

      body[data-theme="dark"] .callout-tip {
        --callout-bg: rgba(46, 160, 67, 0.09);
        --callout-accent: #3fb950;
      }

      body[data-theme="light"] .callout-important {
        --callout-bg: #f8f2ff;
        --callout-accent: #8250df;
      }

      body[data-theme="dark"] .callout-important {
        --callout-bg: rgba(210, 168, 255, 0.12);
        --callout-accent: #c297ff;
      }

      body[data-theme="light"] .callout-warning {
        --callout-bg: #fff1e5;
        --callout-accent: #bf8700;
      }

      body[data-theme="dark"] .callout-warning {
        --callout-bg: rgba(204, 120, 0, 0.15);
        --callout-accent: #ffa657;
      }

      body[data-theme="light"] .callout-caution {
        --callout-bg: #fff5f5;
        --callout-accent: #cf222e;
      }

      body[data-theme="dark"] .callout-caution {
        --callout-bg: rgba(248, 81, 73, 0.12);
        --callout-accent: #ff7b72;
      }

      body[data-theme="light"] .hljs {
        color: #24292e;
        background: var(--code-bg);
      }

      body[data-theme="light"] .hljs-doctag,
      body[data-theme="light"] .hljs-keyword,
      body[data-theme="light"] .hljs-meta .hljs-keyword,
      body[data-theme="light"] .hljs-template-tag,
      body[data-theme="light"] .hljs-template-variable,
      body[data-theme="light"] .hljs-type,
      body[data-theme="light"] .hljs-variable.language_ {
        color: #d73a49;
      }

      body[data-theme="light"] .hljs-title,
      body[data-theme="light"] .hljs-title.class_,
      body[data-theme="light"] .hljs-title.class_.inherited__,
      body[data-theme="light"] .hljs-title.function_ {
        color: #6f42c1;
      }

      body[data-theme="light"] .hljs-attr,
      body[data-theme="light"] .hljs-attribute,
      body[data-theme="light"] .hljs-literal,
      body[data-theme="light"] .hljs-meta,
      body[data-theme="light"] .hljs-number,
      body[data-theme="light"] .hljs-operator,
      body[data-theme="light"] .hljs-variable,
      body[data-theme="light"] .hljs-selector-attr,
      body[data-theme="light"] .hljs-selector-class,
      body[data-theme="light"] .hljs-selector-id {
        color: #005cc5;
      }

      body[data-theme="light"] .hljs-regexp,
      body[data-theme="light"] .hljs-string,
      body[data-theme="light"] .hljs-meta .hljs-string {
        color: #032f62;
      }

      body[data-theme="light"] .hljs-built_in,
      body[data-theme="light"] .hljs-symbol {
        color: #e36209;
      }

      body[data-theme="light"] .hljs-comment,
      body[data-theme="light"] .hljs-code,
      body[data-theme="light"] .hljs-formula {
        color: #6a737d;
        font-style: italic;
      }

      body[data-theme="light"] .hljs-name,
      body[data-theme="light"] .hljs-quote,
      body[data-theme="light"] .hljs-selector-tag,
      body[data-theme="light"] .hljs-selector-pseudo {
        color: #22863a;
      }

      body[data-theme="light"] .hljs-section {
        color: #005cc5;
        font-weight: 600;
      }

      body[data-theme="light"] .hljs-bullet {
        color: #735c0f;
      }

      body[data-theme="light"] .hljs-emphasis {
        color: #24292e;
        font-style: italic;
      }

      body[data-theme="light"] .hljs-strong {
        color: #24292e;
        font-weight: 600;
      }

      body[data-theme="light"] .hljs-addition {
        color: #22863a;
        background-color: #f0fff4;
      }

      body[data-theme="light"] .hljs-deletion {
        color: #b31d28;
        background-color: #ffeef0;
      }

      body[data-theme="dark"] .hljs {
        color: #c9d1d9;
        background: var(--code-bg);
      }

      body[data-theme="dark"] .hljs-doctag,
      body[data-theme="dark"] .hljs-keyword,
      body[data-theme="dark"] .hljs-meta .hljs-keyword,
      body[data-theme="dark"] .hljs-template-tag,
      body[data-theme="dark"] .hljs-template-variable,
      body[data-theme="dark"] .hljs-type,
      body[data-theme="dark"] .hljs-variable.language_ {
        color: #ff7b72;
      }

      body[data-theme="dark"] .hljs-title,
      body[data-theme="dark"] .hljs-title.class_,
      body[data-theme="dark"] .hljs-title.class_.inherited__,
      body[data-theme="dark"] .hljs-title.function_ {
        color: #d2a8ff;
      }

      body[data-theme="dark"] .hljs-attr,
      body[data-theme="dark"] .hljs-attribute,
      body[data-theme="dark"] .hljs-literal,
      body[data-theme="dark"] .hljs-meta,
      body[data-theme="dark"] .hljs-number,
      body[data-theme="dark"] .hljs-operator,
      body[data-theme="dark"] .hljs-variable,
      body[data-theme="dark"] .hljs-selector-attr,
      body[data-theme="dark"] .hljs-selector-class,
      body[data-theme="dark"] .hljs-selector-id {
        color: #79c0ff;
      }

      body[data-theme="dark"] .hljs-regexp,
      body[data-theme="dark"] .hljs-string,
      body[data-theme="dark"] .hljs-meta .hljs-string {
        color: #a5d6ff;
      }

      body[data-theme="dark"] .hljs-built_in,
      body[data-theme="dark"] .hljs-symbol {
        color: #ffa657;
      }

      body[data-theme="dark"] .hljs-comment,
      body[data-theme="dark"] .hljs-code,
      body[data-theme="dark"] .hljs-formula {
        color: #8b949e;
        font-style: italic;
      }

      body[data-theme="dark"] .hljs-name,
      body[data-theme="dark"] .hljs-quote,
      body[data-theme="dark"] .hljs-selector-tag,
      body[data-theme="dark"] .hljs-selector-pseudo {
        color: #7ee787;
      }

      body[data-theme="dark"] .hljs-section {
        color: #1f6feb;
        font-weight: 600;
      }

      body[data-theme="dark"] .hljs-bullet {
        color: #f2cc60;
      }

      body[data-theme="dark"] .hljs-emphasis {
        color: #c9d1d9;
        font-style: italic;
      }

      body[data-theme="dark"] .hljs-strong {
        color: #c9d1d9;
        font-weight: 600;
      }

      body[data-theme="dark"] .hljs-addition {
        color: #aff5b4;
        background-color: #033a16;
      }

      body[data-theme="dark"] .hljs-deletion {
        color: #ffdcd7;
        background-color: #67060c;
      }

      .markdown-body blockquote {
        margin: 0;
        padding: 0 1em;
        border-left: 0.25em solid var(--border-color);
        color: var(--muted-color);
      }

      .markdown-body table {
        border-collapse: collapse;
        border-spacing: 0;
        margin: 1.5rem 0;
        width: auto;
        max-width: 100%;
        overflow: auto;
        border: 1px solid var(--border-color);
        background: var(--table-bg, transparent);
      }

      .markdown-body table caption {
        caption-side: top;
        padding: 0.75rem 1rem;
        font-size: 0.9rem;
        color: var(--muted-color);
        text-align: left;
        font-style: italic;
      }

      .markdown-body table th,
      .markdown-body table td {
        padding: 0.55rem 0.9rem;
        border-bottom: 1px solid var(--border-color);
        border-right: 1px solid var(--border-color);
        vertical-align: top;
        font-size: 0.92rem;
      }

      .markdown-body table tbody tr:nth-child(2n) {
        background: var(--table-stripe);
      }

      .markdown-body ul,
      .markdown-body ol {
        padding-left: 1.5rem;
      }

      .markdown-body img {
        max-width: 100%;
      }

      .markdown-body details {
        margin: 1rem 0;
      }

      .markdown-body summary {
        cursor: pointer;
        outline: none;
        list-style: none;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-weight: 600;
        color: var(--text-color);
      }

      .markdown-body summary::-webkit-details-marker {
        display: none;
      }

      .markdown-body summary::before {
        content: "▸";
        font-size: 0.85em;
        transition: transform 0.15s ease-in-out;
        display: inline-block;
      }

      .markdown-body details[open] summary::before {
        transform: rotate(90deg);
      }

      .markdown-body details > *:not(summary) {
        margin-top: 0.5rem;
      }

      #app.is-error {
        border: 1px solid #f85149;
        background: rgba(248, 81, 73, 0.1);
        padding: 1rem;
        border-radius: 0.5rem;
      }

      .placeholder {
        color: var(--muted-color);
      }

      footer {
        margin-top: 2.5rem;
        color: var(--muted-color);
        font-size: 0.8rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
      }

      footer span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 720px) {
        main {
          padding: 1.5rem 1rem 3rem;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Previewing <code id="source-name">${escapeHtml(initialFileName)}</code></h1>
        <div>
          <button id="theme-toggle" type="button">Toggle theme</button>
        </div>
      </header>
      <p id="status" hidden>Watching for updates…</p>
      <article id="app" class="markdown-body">
        <p class="placeholder">Waiting for markdown…</p>
      </article>
      <footer>
        <span id="file-path" title="${escapeHtml(initialFileName)}">${escapeHtml(initialFileName)}</span>
        <span id="updated-at"></span>
      </footer>
    </main>
    <script type="module">
      const STORAGE_KEY = "md-preview-theme";
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
      const status = document.getElementById("status");
      const app = document.getElementById("app");
      const filePath = document.getElementById("file-path");
      const sourceName = document.getElementById("source-name");
      const updatedAt = document.getElementById("updated-at");
      const themeToggle = document.getElementById("theme-toggle");
      let mermaidModule;
      let mermaidLoadError;

      const writeToClipboard = async (text) => {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      };

      const COPY_SUCCESS_ICON =
        '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>';

      const setupCopyButton = (button, getText) => {
        if (!button || button.dataset.enhanced === "true") {
          return;
        }
        const initialIcon = button.innerHTML;
        button.dataset.enhanced = "true";
        button.addEventListener("click", async () => {
          const text = getText();
          try {
            await writeToClipboard(text);
            button.classList.add("is-copied");
            button.innerHTML = COPY_SUCCESS_ICON;
          } catch (error) {
            console.error("[md] Failed to copy text", error);
          }
          setTimeout(() => {
            button.classList.remove("is-copied");
            button.innerHTML = initialIcon;
          }, 1800);
        });
      };

      const enhanceCodeBlocks = (root) => {
        const blocks = root?.querySelectorAll?.(".code-block") ?? [];
        blocks.forEach((block) => {
          if (block.dataset.enhanced === "true") {
            return;
          }
          block.dataset.enhanced = "true";

          const codeElement = block.querySelector("code");
          if (!codeElement) {
            return;
          }

          const copyButton = block.querySelector(".code-copy");
          if (copyButton) {
            setupCopyButton(copyButton, () => codeElement.textContent ?? "");
          }
        });
      };

      const enhanceDiagrams = (root) => {
        const diagrams = root?.querySelectorAll?.("[data-diagram-kind]") ?? [];
        diagrams.forEach((diagram) => {
          if (diagram.dataset.diagramEnhanced === "true") {
            return;
          }
          diagram.dataset.diagramEnhanced = "true";

          const message = diagram.querySelector("[data-diagram-message]");
          if (message && !diagram.dataset.diagramMessageDefault) {
            diagram.dataset.diagramMessageDefault = message.textContent ?? "";
          }

          const copyButton = diagram.querySelector("[data-diagram-copy]");
          const source = diagram.querySelector("[data-diagram-source]");
          if (copyButton && source) {
            setupCopyButton(copyButton, () => source.textContent ?? "");
          }
        });
      };

      const resetDiagramMessage = (diagram) => {
        const message = diagram.querySelector("[data-diagram-message]");
        if (message) {
          message.textContent = diagram.dataset.diagramMessageDefault ?? "";
        }
      };

      const setDiagramMessage = (diagram, text) => {
        const message = diagram.querySelector("[data-diagram-message]");
        if (message) {
          message.textContent = text;
        }
      };

      const loadMermaid = async () => {
        if (mermaidModule) {
          return mermaidModule;
        }
        if (mermaidLoadError) {
          throw mermaidLoadError;
        }
        try {
          const mod = await import("/mermaid.js");
          mermaidModule = mod.default ?? mod;
          return mermaidModule;
        } catch (error) {
          mermaidLoadError = error instanceof Error ? error : new Error(String(error));
          throw mermaidLoadError;
        }
      };

      const renderMermaidDiagrams = async (root, { force = false } = {}) => {
        const diagrams = root?.querySelectorAll?.('[data-diagram-kind="mermaid"]') ?? [];
        if (diagrams.length === 0) {
          return;
        }

        let mermaid;
        try {
          mermaid = await loadMermaid();
        } catch (error) {
          console.error("[md] Failed to load Mermaid library", error);
          diagrams.forEach((diagram) => {
            diagram.dataset.diagramState = "error";
            setDiagramMessage(diagram, "Mermaid library failed to load.");
          });
          return;
        }

        const theme = document.body.dataset.theme === "dark" ? "dark" : "default";
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
        });

        for (const diagram of diagrams) {
          if (!force && diagram.dataset.diagramState === "rendered") {
            continue;
          }

          if (force && diagram.dataset.diagramState === "rendered") {
            diagram.dataset.diagramState = "pending";
          }

          const target = diagram.querySelector("[data-diagram-target]");
          const source = diagram.querySelector("[data-diagram-source]");
          if (!target || !source) {
            continue;
          }

          const definition = source.textContent ?? "";
          if (!definition.trim()) {
            diagram.dataset.diagramState = "error";
            setDiagramMessage(diagram, "Mermaid diagram is empty.");
            continue;
          }

          target.innerHTML = "";
          target.style.display = "block";
          target.style.visibility = "visible";
          diagram.dataset.diagramState = "rendering";
          resetDiagramMessage(diagram);

          const container = document.createElement("div");
          container.classList.add("mermaid");
          container.textContent = definition;
          target.appendChild(container);

          try {
            await mermaid.parse(definition);
          } catch (error) {
            diagram.dataset.diagramState = "error";
            setDiagramMessage(diagram, "Mermaid diagram could not be parsed.");
            console.error("[md] Mermaid syntax error", error);
            continue;
          }

          try {
            await mermaid.run({
              nodes: [container],
              suppressErrors: true,
            });

            const svgElement = target.querySelector("svg");
            if (!svgElement) {
              throw new Error("Mermaid did not produce an SVG element.");
            }

            svgElement.style.display = "block";
            svgElement.style.maxWidth = "100%";
            svgElement.style.height = "auto";
            svgElement.style.aspectRatio = "auto";
            svgElement.style.width = "100%";

            diagram.dataset.diagramState = "rendered";
            resetDiagramMessage(diagram);
            console.debug("[md] Mermaid diagram rendered", {
              hasSvg: true,
              targetHtml: target.innerHTML.slice(0, 1200),
              targetDisplay: target.style.display,
              targetVisibility: target.style.visibility,
              svgAttributes: {
                width: svgElement.getAttribute("width"),
                height: svgElement.getAttribute("height"),
                style: svgElement.getAttribute("style"),
              },
              svgStyles: {
                display: getComputedStyle(svgElement).display,
                width: getComputedStyle(svgElement).width,
                height: getComputedStyle(svgElement).height,
                visibility: getComputedStyle(svgElement).visibility,
              },
              containerStyles: {
                display: getComputedStyle(container).display,
                height: getComputedStyle(container).height,
                width: getComputedStyle(container).width,
              },
            });
          } catch (error) {
            diagram.dataset.diagramState = "error";
            setDiagramMessage(diagram, "Unable to render Mermaid diagram.");
            console.error("[md] Failed to render Mermaid diagram", error);
          }
        }
      };

      const renderDiagrams = (root, options) => {
        void renderMermaidDiagrams(root, options);
      };

      const getStoredTheme = () => window.localStorage.getItem(STORAGE_KEY);
      const setStoredTheme = (theme) => window.localStorage.setItem(STORAGE_KEY, theme);

      const applyTheme = (theme) => {
        document.body.dataset.theme = theme;
        themeToggle.textContent = theme === "dark" ? "Switch to light" : "Switch to dark";
      };

      const initialStored = getStoredTheme();
      if (initialStored) {
        applyTheme(initialStored);
      } else {
        applyTheme(prefersDark.matches ? "dark" : "light");
      }

      prefersDark.addEventListener("change", (event) => {
        if (!getStoredTheme()) {
          applyTheme(event.matches ? "dark" : "light");
          renderDiagrams(app, { force: true });
        }
      });

      themeToggle.addEventListener("click", () => {
        const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
        setStoredTheme(nextTheme);
        renderDiagrams(app, { force: true });
      });

      const eventSource = new EventSource("/events");

      eventSource.addEventListener("open", () => {
        status.hidden = true;
        status.classList.remove("is-error");
      });

      eventSource.addEventListener("error", () => {
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = "Reconnecting…";
      });

      eventSource.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data);
        if (payload.isError) {
          app.classList.add("is-error");
          status.hidden = false;
          status.classList.add("is-error");
          status.textContent = "Unable to read markdown";
        } else {
          app.classList.remove("is-error");
          status.hidden = true;
          status.classList.remove("is-error");
        }

        document.title = payload.title;
        sourceName.textContent = payload.fileName;
        filePath.textContent = payload.fullPath;
        filePath.title = payload.fullPath;
        updatedAt.textContent = new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        }).format(new Date(payload.updatedAt));
        app.innerHTML = payload.html;
        enhanceCodeBlocks(app);
        enhanceDiagrams(app);
        renderDiagrams(app);
      });

      enhanceCodeBlocks(app);
      enhanceDiagrams(app);
      renderDiagrams(app);
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
