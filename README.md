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

### PlantUML

PlantUML diagrams remain as source for now so we never execute untrusted UML
payloads in the browser. To render them, run a PlantUML server (for example
`docker run --rm -p 8080:8080 plantuml/plantuml-server`) and pre-render SVG or
PNG assets that you link from Markdown. A future iteration can safely fetch from
a user-specified PlantUML server and inject the generated SVG once we add
sanitisation for that workflow.

## License

MIT
