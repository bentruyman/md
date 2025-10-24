# :fire: md

Live-reloading Markdown previewer with GitHub Flavored Markdown support and
automatic light/dark theming.

## Features

- Live preview that reloads as you save your Markdown.
- Full GitHub Flavored Markdown support for tables, tasks, and strike-through.
- Emoji shortcodes expand outside code blocks.
- GitHub-style callouts, tables, details, and themed code blocks with copy
  buttons.
- Built-in preview server with light/dark theming and a `README.md` default.

## Usage

```console
md [file]
```

## Releasing

- Ensure changes follow Conventional Commits so `release-it` can build clean
  changelog entries.
- Run `bun run release` locally with `GITHUB_TOKEN` and `NPM_TOKEN` in the
  environment to tag, publish to npm, and update `CHANGELOG.md`, or trigger the
  **Release** workflow from GitHub Actions with a version input.
- Use the **Changelog Preview** workflow to generate release notes for review
  without publishing.

## License

MIT
