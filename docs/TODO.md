# TODO

Open follow-ups. Everything found by the 2026-10 test rebuild that was a bug
has been fixed on the branch; see `docs/development.md` ("Known behaviour and
limitations") for the behaviour that was pinned rather than changed.

## Open

- jest-dom (6.10 and 7.0.1 alike) augments the one-parameter `Assertion<T>`
  while vitest 5.0.1 declares `Assertion<R, T>`, so
  `packages/docs/src/test-setup.ts` keeps a `declare module "vitest"` bridge.
  Remove it once upstream ships vitest 5 typings. The `6.10.0` pin in the
  lockfile is deprecated on npm ("incorrect minor"); `6.9.1` is the suggested
  replacement.
- Generated React forms zero-fill the untouched parts of a Duration (typing
  only seconds sends `{hour: 0, minute: 0, second: 45}`), while the docs
  `TimeField` leaves untouched parts empty. Decide whether the generated form
  should match the docs behaviour.
- Not tested: out-of-range `_second` values (for example 75) and `_second`
  sent without hour and minute.
- CLI: `--timeout -5` (space-separated, dash-leading value) is reported by
  Node's `parseArgs` as ambiguous and ends as a stack trace with exit 2;
  `--timeout=-5` gives the proper message. Catching `parseArgs` errors would
  change existing behaviour.
- Unreachable defensive branches that keep docs and cli below 100% branch
  coverage: `PlaygroundClient.tsx` `if (!next) return` (exists only for
  `noUncheckedIndexedAccess`), and three fallbacks in `packages/cli/src/main.ts`
  (`pkg.version ?? "0.0.0"`, `formArg ?? ""`, `String(error)` in the `--data`
  reader).
