# TODO

Open follow-ups. Everything found by the 2026-10 test rebuild that was a bug
has been fixed on the branch; see `docs/development.md` ("Known behaviour and
limitations") for the behaviour that was pinned rather than changed.

## Open

- jest-dom (6.9.1, 6.10 and 7.0.1 alike) augments the one-parameter
  `Assertion<T>` while vitest 5.0.1 declares `Assertion<R, T>`, so
  `packages/docs/src/test-setup.ts` keeps a `declare module "vitest"` bridge.
  Remove it once upstream ships vitest 5 typings.

## Accepted, not planned

- Four defensive branches that cannot be reached by input keep docs and cli
  below 100% branch coverage: `packages/docs/src/app/playground/PlaygroundClient.tsx:150`
  (`if (!next) return`, exists only for `noUncheckedIndexedAccess`) and
  `packages/cli/src/main.ts:71`, `:220`, `:298` (`pkg.version ?? "0.0.0"`,
  `formArg ?? ""`, `String(error)` in the `--data` reader).
