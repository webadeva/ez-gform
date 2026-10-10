# TODO

Consolidated bug and follow-up list from the 2026-10 test rebuild.

## Deferred by decision (2026-10-09)

## From Phase A (core, types)

- Possible type gap: `Question.time.isDuration` has no matching value type; `TimeValue` is `{hour, minute}` with no seconds. Comment at packages/types/src/tests/types.test.ts:157. Not checked against google-forms-internals.md.

## From Phase B (codegen, cli)

- generate-react `renderTime` (generate-react.ts:211-223) ignores `time.isDuration`. Comment at generate-react.test.ts:317.

## From Phase C (react, docs), remaining

- By design, not changed: a new `initialValues` identity is only picked up by `reset`; the "validating" status is never observable (validation is synchronous); encoded key order follows fill order.
- jest-dom (6.10 and 7.0.1 alike) augments the one-parameter `Assertion<T>` while vitest 5.0.1 declares `Assertion<R, T>`, so docs test-setup.ts keeps a `declare module "vitest"` bridge until upstream ships vitest 5 typings. The 6.10.0 pin in the lockfile is deprecated on npm ("incorrect minor"); 6.9.1 is the suggested replacement.
- `PlaygroundClient.tsx:150` has an `if (!next) return` that only satisfies `noUncheckedIndexedAccess` and can never run; it is why docs branch coverage is below 100.

## Found while fixing (2026-10-10)

- CLI: `--timeout -5` (space-separated, dash-leading value) is reported by Node's `parseArgs` as ambiguous and ends as stack + exit 2; `--timeout=-5` gives the proper message. Catching `parseArgs` errors would change existing behaviour.
- cli branch coverage is 96.51%: three defensive fallbacks in main.ts (`pkg.version ?? "0.0.0"`, `formArg ?? ""`, `String(error)` in the --data reader) are unreachable by input.
- HTML cannot express "at least one" for checkboxes and checkbox grids, so required ones only show the asterisk; an untouched optional dropdown posts `entry.N=` (empty), which Google ignores.
- Core's required check passes a partially filled date or time: `validateValues` treats only a key-less object as empty (packages/core/src/encode.ts:200-211), so `{month: 3}` with no day satisfies a required date. Fix in core together with the duration-seconds change.

## Found in phase D (e2e, coverage, CI)

- `TimeValue` has no seconds field, so a Duration answer can only be sent as hours and minutes; the response sheet renders it as `h:mm:00`. Document the limitation or add seconds (`entry.N_second`).
- The packed-install e2e relies on npm 7+ auto-installing the `react` peer dependency of `@ez-gform/react` from the registry, so it needs registry access as well as Google.
- Response sheet rendering (pinned in `packages/e2e/src/helpers/submit-values.ts`): Timestamp `M/D/YYYY H:MM:SS` in the sheet timezone; checkboxes and checkbox-grid cells joined with `, ` (an Other text containing a comma is indistinguishable from two options); Radio-with-Other shows the raw other text; date with year `M/D/YYYY`; date+time with year `M/D/YYYY H:MM:SS`; date without year `M/D`; date+time without year `M/D H:MM` (no seconds); time of day `h:mm:ss AM/PM`; duration `h:mm:ss`. A Google change to any of these breaks the live-submit e2e, not the library.
