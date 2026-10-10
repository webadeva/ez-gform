# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`ez-gform` is a pnpm + Turborepo monorepo that lets developers submit their own custom form UI to a Google Form without a backend. It is a ground-up rebuild of `webadeva/use-easy-google-form`, its Chrome extension, and its example app. Rebuild plan and package responsibilities: @docs/ARCHITECTURE.md. What was wrong with the old code: @docs/research/gap-analysis.md.

Packages are all scoped `@ez-gform/*`, and all live under `packages/`: `types` (shared TypeScript types), `core` (framework-agnostic parser/encoder/submit), `react` (hook), `codegen` (pure code generators: JSON/types/React/HTML), `cli` (npx generator), `docs` (Next.js 16 App Router docs + playground), `tsconfig` (shared TS configs).

## Commands

- Root scripts all go through turbo: `pnpm build|test|lint|type-check`. Scope with `pnpm turbo run test --filter=@ez-gform/core`.
- Lint is ESLint flat config via `@kami-ui/eslint-config` (`base` for libraries/CLI, `react` for React packages, `next` for the docs app); Prettier is root-only, config in `.prettierrc`; lint runs per package because the config is type-aware and resolves tsconfig from cwd.
- Releases happen on every push to `main` via `.github/workflows/release.yml`: the commit prefix `major:`/`minor:` picks the version bump, anything else (including `patch:` or no prefix) is a patch; all publishable packages always share one version; publishing uses npm trusted publishing (OIDC), no tokens.
- `pnpm test:e2e` runs the live-network e2e suite (`packages/e2e`); it writes two rows per run to the project-owned form's response sheet.
- Shared deps use the pnpm catalog (`"react": "catalog:"`); workspace deps use `workspace:*`.

## Google Forms rules that are easy to get wrong

Invoke the `gform-internals` skill before touching encoding, parsing, or submit code. Key points: browser submissions are `fetch` with `mode: "no-cors"` so success is never observable (report "sent", not "succeeded"); date and time questions split into `entry.N_year/_month/_day` and `_hour/_minute`; checkbox repeats `entry.N`; "Other" uses `__other_option__` plus `entry.N.other_option_response`; question metadata must come from the `FB_PUBLIC_LOAD_DATA_` JSON, never from Google's obfuscated CSS classes. Source of truth: @docs/research/google-forms-internals.md. Test fixtures captured from live forms live in `packages/core/src/__fixtures__/`.

## Conventions

- Unit tests (`pnpm test`) must stay offline; network is allowed only in `packages/e2e`.
- TypeScript strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (from `@ez-gform/tsconfig`); use `import type`.
- Libraries build with tsup to ESM + CJS + d.ts; `@ez-gform/core` must stay zero-runtime-dependency and browser/Node neutral (no DOM access outside `packages/react`).
- Tests are Vitest, `*.test.ts(x)` in each package's `src/tests/` folder (not colocated with the source).
- Commits: Conventional Commits, single author, no `Co-Authored-By` trailers; the `major:`/`minor:`/`patch:` prefix also controls the release version bump (see Commands).
- Husky hooks: `commit-msg` runs commitlint (`commitlint.config.mjs`, 100-char header); `pre-push` refuses pushes to `main` and runs `pnpm test`. Changes reach `main` only through pull requests.
- Use the `new-package` skill to add a workspace package so it matches the existing layout.
