# TODO

Consolidated bug and follow-up list from the 2026-10 test rebuild.

## Deferred by decision (2026-10-09)

- CLI split: `packages/cli/src/cli.ts` runs `main()` at import, so split it into an importable module plus a bin entry so the fetch/exit paths get in-process tests and coverage (today cli has 0% v8 coverage because it is only tested via subprocesses).

## From Phase A (core, types)

- Possible type gap: `Question.time.isDuration` has no matching value type; `TimeValue` is `{hour, minute}` with no seconds. Comment at packages/types/src/tests/types.test.ts:157. Not checked against google-forms-internals.md.

## From Phase B (codegen, cli)

- generate-react `renderTime` (generate-react.ts:211-223) ignores `time.isDuration`. Comment at generate-react.test.ts:317.
- cli.ts:76 has no timeout on the schema fetch; a hanging server hangs the CLI. Comment at packages/cli/src/tests/cli.test.ts:573.
- CLI paths untestable until `main()` is split from an importable module (cli.ts:274-279 runs main at import; fetch and process.exit cannot be injected). Listed at cli.test.ts:568-572: network error → "Failed to fetch <url>: <cause>" exit 2 (cli.ts:76-83); 401 / accounts.google.com redirect → sign-in error exit 2 (:85-87); non-ok status exit 2 (:89-93); unparsable fetched HTML → "Failed to parse form HTML" exit 2 (:96-102); successful submit prints JSON and exits 0, or 2 on error (:249-252); the fetch timeout above. CLI coverage reads 0% for the same reason.

## From Phase C (react, docs), remaining

- By design, not changed: a new `initialValues` identity is only picked up by `reset`; the "validating" status is never observable (validation is synchronous); encoded key order follows fill order.
- jest-dom (6.10 and 7.0.1 alike) augments the one-parameter `Assertion<T>` while vitest 5.0.1 declares `Assertion<R, T>`, so docs test-setup.ts keeps a `declare module "vitest"` bridge until upstream ships vitest 5 typings. The 6.10.0 pin in the lockfile is deprecated on npm ("incorrect minor"); 6.9.1 is the suggested replacement.
- `PlaygroundClient.tsx:150` has an `if (!next) return` that only satisfies `noUncheckedIndexedAccess` and can never run; it is why docs branch coverage is below 100.

## Found while fixing (2026-10-10)

- Multi-page generated HTML forms post a constant placeholder `fbzx` (`PLACEHOLDER_FBZX` in generate-html.ts) with matching `partialResponse`; core likewise sends a random token when the schema has none. Neither is verified against a live multi-page submission yet; add a live e2e that submits with a placeholder token and checks the sheet row.
- HTML cannot express "at least one" for checkboxes and checkbox grids, so required ones only show the asterisk; an untouched optional dropdown posts `entry.N=` (empty), which Google ignores.
- Core's required check passes a partially filled date or time: `validateValues` treats only a key-less object as empty (packages/core/src/encode.ts:200-211), so `{month: 3}` with no day satisfies a required date. Fix in core together with the duration-seconds change.

## Found in phase D (e2e, coverage, CI)

- `packages/cli/src/cli.ts:150-153`: the generate command requires a `<form-url-or-id>` positional even when `--json-input` is given, and then ignores it. The e2e passes a dummy `unused`. Make the positional optional with `--json-input`.
- `TimeValue` has no seconds field, so a Duration answer can only be sent as hours and minutes; the response sheet renders it as `h:mm:00`. Document the limitation or add seconds (`entry.N_second`).
- cli (subprocess-tested, 0% v8 coverage) and types (type-only) have no coverage thresholds until the CLI split above lands.
- The packed-install e2e relies on npm 7+ auto-installing the `react` peer dependency of `@ez-gform/react` from the registry, so it needs registry access as well as Google.
- Response sheet rendering (pinned in `packages/e2e/src/helpers/submit-values.ts`): Timestamp `M/D/YYYY H:MM:SS` in the sheet timezone; checkboxes and checkbox-grid cells joined with `, ` (an Other text containing a comma is indistinguishable from two options); Radio-with-Other shows the raw other text; date with year `M/D/YYYY`; date+time with year `M/D/YYYY H:MM:SS`; date without year `M/D`; date+time without year `M/D H:MM` (no seconds); time of day `h:mm:ss AM/PM`; duration `h:mm:ss`. A Google change to any of these breaks the live-submit e2e, not the library.
