<div align="center">
  <h1>md</h1>
  <sup>Preview Markdown in your browser with live reload, GitHub-flavored
  rendering, Mermaid support, and automatic light/dark theming.</sup>
</div>

`md` is a small CLI for previewing Markdown locally. Point it at a file, save as
you work, and the browser stays in sync.

## Install

```console
npm install -g @truyman/md
```

For local development and releases, this repo follows the Bun CLI template
conventions while still publishing a standard npm package.

## Features

- Live preview that reloads as you save your Markdown.
- GitHub Flavored Markdown support for tables, task lists, and strikethrough.
- Emoji shortcodes expand outside code blocks.
- GitHub-style callouts, tables, details, and themed code blocks with copy
  buttons.
- Mermaid diagrams render inline, include copy buttons, and adapt to the active
  theme.
- Built-in preview server with automatic light/dark theming.
- Defaults to `README.md` when no file path is provided.

## Usage

Preview `README.md` in the current directory:

```console
md
```

Preview a specific file:

```console
md OVERVIEW.md
```

When you run `md`, it will:

1. Start a local preview server on an available port.
2. Open your browser automatically.
3. Re-render the page whenever the target file changes.

## Development

Install dependencies with Bun:

```console
bun install
```

Common scripts:

- `bun run format` formats the repo with `oxfmt` and applies `oxlint --fix`.
- `bun run lint` checks formatting and lint rules without rewriting files.
- `bun run typecheck` runs TypeScript in Bun-oriented no-emit mode.
- `bun test` runs the Bun test suite.
- `bun run build` bundles the CLI to `dist/`.
- `bun run verify` runs lint, typecheck, tests, and build.
- `bun run release` runs the release-it workflow and keeps `CHANGELOG.md`
  updated.

## License

MIT
