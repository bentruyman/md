import fs from "node:fs/promises";
import path from "node:path";

export const PREVIEW_INTERNAL_PREFIX = "/__md";
export const PREVIEW_EVENTS_ROUTE = `${PREVIEW_INTERNAL_PREFIX}/events`;
export const PREVIEW_MERMAID_ASSET_PREFIX = `${PREVIEW_INTERNAL_PREFIX}/mermaid/`;
export const PREVIEW_MERMAID_ROUTE = `${PREVIEW_MERMAID_ASSET_PREFIX}mermaid.js`;

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export type PreviewRouteResolution =
  | {
      kind: "markdown";
      fullPath: string;
      sourcePath: string;
    }
  | {
      kind: "static";
      fullPath: string;
    };

export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function createPreviewSourcePath(
  filePath: string,
  previewRootPath: string,
): string {
  return toPreviewPath(path.relative(previewRootPath, filePath));
}

export function createPreviewRoutePath(
  filePath: string,
  previewRootPath: string,
): string {
  const sourcePath = createPreviewSourcePath(filePath, previewRootPath);
  const encoded = sourcePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/${encoded}`;
}

export async function resolvePreviewRequestPath(
  requestPathname: string,
  previewRootPath: string,
): Promise<PreviewRouteResolution | undefined> {
  const relativePath = decodePreviewPathname(requestPathname);
  if (relativePath === undefined || hasBlockedSegment(relativePath)) {
    return undefined;
  }

  const resolvedPath = path.resolve(previewRootPath, relativePath);
  if (!isWithinRoot(resolvedPath, previewRootPath)) {
    return undefined;
  }

  const filePath = await resolveFilePath(resolvedPath);
  if (!filePath) {
    return undefined;
  }

  if (isMarkdownPath(filePath)) {
    return {
      kind: "markdown",
      fullPath: filePath,
      sourcePath: createPreviewSourcePath(filePath, previewRootPath),
    };
  }

  return {
    kind: "static",
    fullPath: filePath,
  };
}

async function resolveFilePath(filePath: string): Promise<string | undefined> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return undefined;
  }

  if (stat.isFile()) {
    return filePath;
  }

  if (!stat.isDirectory()) {
    return undefined;
  }

  for (const fileName of ["README.md", "README.markdown"]) {
    const candidate = path.join(filePath, fileName);
    try {
      const candidateStat = await fs.stat(candidate);
      if (candidateStat.isFile()) {
        return candidate;
      }
    } catch {
      // Keep looking for supported directory index files.
    }
  }

  return undefined;
}

function decodePreviewPathname(pathname: string): string | undefined {
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes("\0")) {
      return undefined;
    }

    return decoded.replace(/^\/+/, "");
  } catch {
    return undefined;
  }
}

function hasBlockedSegment(relativePath: string): boolean {
  return relativePath.split("/").includes(".git");
}

function isWithinRoot(filePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, filePath);
  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function toPreviewPath(value: string): string {
  return value.split(path.sep).join("/");
}
