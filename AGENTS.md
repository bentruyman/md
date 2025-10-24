# Repository Guidelines

## Project Structure & Module Organization

- `src/` hosts the TypeScript entrypoint (`index.ts`) and reusable helpers
  (`utils.ts`). Add new modules beside related code and re-export through
  `index.ts` when they form part of the public API.
- `test/` mirrors the source tree with Bun test specs such as `util.test.ts`.
  Keep fixture data inline or under `test/fixtures/` if it grows to multiple
  files.
- Build output is written to `dist/` by unbuild; do not check in generated
  files. Tooling config lives at the repo root (`build.config.ts`,
  `tsconfig.json`, lint configs) and should be updated in lockstep with code
  changes.

## Build, Test, and Development Commands

- `bun install` (or `npm install` if Bun is unavailable) synchronizes
  dependencies using the existing lockfile.
- `bun run dev` executes `tsx watch src/index.ts` for rapid feedback during
  local development.
- `bun run build` bundles the package with unbuild/mkdist, emitting ESM
  JavaScript into `dist/`.
- `bun run start` runs the built entrypoint from `dist/index.js`; use this to
  validate production output.
- `bun run lint` applies ESLint and Prettier autofixes across the repo. Run it
  before every PR to avoid CI noise.
- `bun run test` launches the Bun test suite; append `--watch` or `--coverage`
  for interactive runs and coverage reports.

## Coding Style & Naming Conventions

- Code is TypeScript-first, using ES modules and named exports. Prefer
  `camelCase` for functions/variables, `PascalCase` for types and classes, and
  kebab-case for filenames.
- Formatting is enforced by Prettier (default 2-space indent, single quotes in
  TS) and `eslint-config-unjs`. Do not hand-format—run the linters instead.
- Avoid implicit any, prefer explicit return types on exported functions, and
  keep utilities pure when possible.

## Testing Guidelines

- Place new tests under `test/` with filenames ending in `.test.ts`. Co-locate
  mocks or sample data near the test file.
- Aim to exercise both success and failure paths; leverage Bun snapshots
  sparingly to avoid brittle assertions.
- Run `bun test --coverage` before releasing significant changes and keep
  uncovered branches minimal.

## Commit & Pull Request Guidelines

- Use Conventional Commit prefixes (`feat:`, `fix:`, `chore:`, etc.) with
  imperative, present-tense subjects under 72 chars. Include context in the body
  when the why is not obvious.
- Each PR should include a concise summary, testing notes, and references to
  issues or discussions. Add screenshots or terminal output when behavior
  changes.
- Keep PRs scoped: prefer a focused change with thorough tests and documentation
  updates over broad refactors.
