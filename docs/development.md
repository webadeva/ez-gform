# Development

## Install

```bash
pnpm install
```

Requires Node 24 (see `.nvmrc`) and pnpm (pinned via `packageManager` in
`package.json`).

## Scripts

Every script is a Turborepo task, run from the repo root and fanned out to
each package:

```bash
pnpm build         # tsup builds ESM + CJS + .d.ts for every publishable package
pnpm dev           # watch mode across packages
pnpm test          # vitest run (--coverage where thresholds apply)
pnpm test:e2e      # live e2e, see Testing
pnpm lint          # eslint . (per package)
pnpm lint:fix      # eslint . --fix
pnpm format        # prettier --write . (root-only)
pnpm format:check  # prettier --check .
pnpm type-check    # tsc --noEmit
pnpm clean         # rm -rf dist
```

Scope any task to one package with `--filter`:

```bash
pnpm turbo run test --filter=@ez-gform/core
```

One package is commonly run standalone rather than through the full
`turbo` fan-out:

- `pnpm --filter @ez-gform/docs dev` — run the docs/playground site
  locally.

## Testing

Layers:

- Unit and integration tests live in each package's `src/tests/` folder and
  run with Vitest.
- End-to-end tests live in `packages/e2e` (`@ez-gform/e2e`, private).

Commands:

```bash
pnpm test                          # every package, offline, with coverage
pnpm --filter @ez-gform/core test  # one package
pnpm test:e2e                      # live network e2e (builds first via turbo)
```

`test` is `vitest run --coverage` in core, codegen, react and docs, so the
coverage thresholds in each `vitest.config.ts` fail the run when missed.

### Offline guard

`pnpm test` must not touch the network. `packages/react/src/test-setup.ts` and
`packages/docs/src/test-setup.ts` stub global `fetch` before each test with a
function that records the URL and rejects. After each test, any recorded call
makes the test fail with `network access is not allowed in unit tests`. Tests
that expect a submit override it with their own `vi.stubGlobal("fetch", ...)`.

### Coverage thresholds

Lines / branches / functions / statements, in percent:

| Package | Lines | Branches | Functions | Statements |
| ------- | ----- | -------- | --------- | ---------- |
| core    | 99    | 97       | 100       | 99         |
| codegen | 98    | 95       | 94        | 98         |
| react   | 98    | 95       | 100       | 98         |
| docs    | 98    | 94       | 100       | 98         |

`cli` is exempt: it is tested through subprocesses and v8 coverage cannot see
child processes, so it reads 0% until the CLI is split into importable
modules. `types` is exempt because it only contains types.

### Live e2e

`pnpm test:e2e` runs against a project-owned Google Form
(`https://docs.google.com/forms/d/e/1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw/viewform`).
It needs network access. Each run submits two responses (one via core
`submitForm` in `cors` mode, one via the built CLI `submit`) and verifies both
in the linked response sheet's anonymous CSV export, so two rows land in the
sheet every run. The "Short answer required" column carries a marker of the
form `e2e-core <ISO timestamp> <random id>` (core submission) or
`e2e-cli <ISO timestamp> <random id>` (CLI submission). It also packs and installs the five
publishable packages in a temp project and runs `next start` for the docs app
to check `/api/schema`, `/playground` and `/`. The turbo task depends on
`^build` and `build`, so a manual `pnpm turbo run build` first is not needed.

### Fixtures

Parser fixtures are live captures of project-owned forms. See
`packages/core/src/__fixtures__/README.md` for how to recapture them. The
live-parse e2e parses the real form and compares it with that fixture, so it
detects Google changing its page format.

## Lint and format

Lint is ESLint flat config, sourced from the shared `@kami-ui/eslint-config`
npm package (not a workspace package). Each package has its own
`eslint.config.mjs` that imports the matching entry point:

- `@kami-ui/eslint-config/base` — plain TypeScript libraries and the CLI.
- `@kami-ui/eslint-config/react` — React packages.
- `@kami-ui/eslint-config/next` — the docs app.

Lint always runs from inside the package directory (Turborepo does this by
default) because the config is type-aware: it sets
`parserOptions.projectService = true` with `tsconfigRootDir: process.cwd()`,
so it resolves each package's own `tsconfig.json`.

Prettier is configured once at the repo root (`.prettierrc`) and applies to
the whole workspace; there is no per-package Prettier config.

## Adding a package

Use the `new-package` skill (`.claude/skills/new-package/SKILL.md`), or by
hand:

1. `packages/<name>/` with a `package.json` (`@ez-gform/<name>`, uniform
   scripts), `tsconfig.json` extending `@ez-gform/tsconfig/<kind>.json`,
   `eslint.config.mjs`, and `tsup.config.ts`.
2. Add the package to the root `tsconfig.json` `references` array.
3. `pnpm turbo run build test lint type-check --filter=@ez-gform/<name>`.
