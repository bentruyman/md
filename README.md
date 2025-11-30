# :fire: md

Live-reloading Markdown previewer with GitHub Flavored Markdown support and
automatic light/dark theming.

## Features

- Live preview that reloads as you save your Markdown.
- Full GitHub Flavored Markdown support for tables, tasks, and strike-through.
- Emoji shortcodes expand outside code blocks.
- GitHub-style callouts, tables, details, and themed code blocks with copy
  buttons.
- Mermaid diagrams render inline with copy buttons and adapt to your selected
  theme.
- Built-in preview server with light/dark theming and a `README.md` default.

## Usage

```console
md [file]
```

## Diagram Support

### Mermaid

Code fences annotated with `mermaid` render directly inside the preview. The
output respects your light/dark preference, keeps the original definition
available for copying, and falls back to the source text if rendering fails.

## License

MIT
