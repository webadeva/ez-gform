# TODO

Consolidated bug and follow-up list from the 2026-10 test rebuild.

## Deferred by decision (2026-10-09)

- CLI split: `packages/cli/src/cli.ts` runs `main()` at import, so split it into an importable module plus a bin entry so the fetch/exit paths get in-process tests and coverage (today cli has 0% v8 coverage because it is only tested via subprocesses).

## From Phase A (core, types)

- Possible type gap: `Question.time.isDuration` has no matching value type; `TimeValue` is `{hour, minute}` with no seconds. Comment at packages/types/src/tests/types.test.ts:157. Not checked against google-forms-internals.md.

## From Phase B (codegen, cli)

- `toPascalCase("2024 Booking")` returns "2024Booking", not a valid identifier; names.ts has no leading-digit guard while `toIdentifier` prefixes "_". Comment at packages/codegen/src/tests/names.test.ts:95.
- `toIdentifier("eval")` / `("arguments")` return unchanged; both are illegal strict-mode binding names and missing from RESERVED_WORDS. Comment at names.test.ts:159.
- generate-html multi-page output sends only `fbzx` (generate-html.ts:127-132); core `buildSubmitBody` (submit.ts:41-47) also sends `pageHistory` and `partialResponse`. Comments at generate-html.test.ts:414 and generate-html.integration.test.ts:298.
- generate-html emits `required` only for short_answer, paragraph and dropdown (generate-html.ts:58-83); required choice, scale and grid questions show " *" but are not enforced. Comment at generate-html.test.ts:166.
- generate-html never renders question or form descriptions. Comment at generate-html.test.ts:241.
- generate-html hour/minute inputs are not zero-padded ("7" vs core "07"). Comment at generate-html.integration.test.ts:325. Also: an optional dropdown has no blank option so it always submits its first choice (not pinned).
- generate-react `renderDate` (generate-react.ts:197-209) ignores `date.includeYear` / `includeTime`: "Date without year" still sends `_year`, "...and time" never sends `_hour/_minute`. Comments at generate-react.test.ts:293 and generate-react.render.test.tsx:175.
- generate-react `renderTime` (generate-react.ts:211-223) ignores `time.isDuration`. Comment at generate-react.test.ts:317.
- generate-react: ticking "Other" calls `setValue(entryId, {other})`, replacing the whole checkbox selection (Cat + Other loses Cat). Comment at generate-react.render.test.tsx:99. Not pinned by a test.
- generate-react dead code: `usesOther`, `hasOtherOption`, `void usesOther` (generate-react.ts:30-36, 298-303, 318); this is why codegen lines sit at 98.66% / functions 94.33%. Comment at generate-react.test.ts:492.
- cli.ts:76 has no timeout on the schema fetch; a hanging server hangs the CLI. Comment at packages/cli/src/tests/cli.test.ts:573.
- CLI paths untestable until `main()` is split from an importable module (cli.ts:274-279 runs main at import; fetch and process.exit cannot be injected). Listed at cli.test.ts:568-572: network error → "Failed to fetch <url>: <cause>" exit 2 (cli.ts:76-83); 401 / accounts.google.com redirect → sign-in error exit 2 (:85-87); non-ok status exit 2 (:89-93); unparsable fetched HTML → "Failed to parse form HTML" exit 2 (:96-102); successful submit prints JSON and exits 0, or 2 on error (:249-252); the fetch timeout above. CLI coverage reads 0% for the same reason.
- `loadFixtureSchema` (`packages/codegen/src/__test-utils__/fixtures.ts`) fails under jsdom because `import.meta.url` is not a `file:` URL there; the HTML integration test carries a local copy.
- codegen `testTimeout` raised to 120000 because `ts.createProgram` type-check tests took 23-53s under parallel turbo load.

## From Phase C (react, docs)

## From Phase C (react, docs), remaining

- By design, not changed: a new `initialValues` identity is only picked up by `reset`; the "validating" status is never observable (validation is synchronous); encoded key order follows fill order.
- jest-dom (6.10 and 7.0.1 alike) augments the one-parameter `Assertion<T>` while vitest 5.0.1 declares `Assertion<R, T>`, so docs test-setup.ts keeps a `declare module "vitest"` bridge until upstream ships vitest 5 typings. The 6.10.0 pin in the lockfile is deprecated on npm ("incorrect minor"); 6.9.1 is the suggested replacement.
- `PlaygroundClient.tsx:150` has an `if (!next) return` that only satisfies `noUncheckedIndexedAccess` and can never run; it is why docs branch coverage is below 100.

## Found while fixing (2026-10-10)

- Core's required check passes a partially filled date or time: `validateValues` treats only a key-less object as empty (packages/core/src/encode.ts:200-211), so `{month: 3}` with no day satisfies a required date. Fix in core together with the duration-seconds change.

## Found in phase D (e2e, coverage, CI)

- `packages/cli/src/cli.ts:150-153`: the generate command requires a `<form-url-or-id>` positional even when `--json-input` is given, and then ignores it. The e2e passes a dummy `unused`. Make the positional optional with `--json-input`.
- Codegen output is not reproducible across fetches: `generateTypes`, `generateReactComponent` and `generateHtmlForm` embed the per-request `fbzx` token (it can be negative). The live-cli e2e masks it. Consider whether generated code should carry `fbzx` at all.
- `TimeValue` has no seconds field, so a Duration answer can only be sent as hours and minutes; the response sheet renders it as `h:mm:00`. Document the limitation or add seconds (`entry.N_second`).
- Codegen function coverage is 94.33% against a 94% threshold, so almost any new uncovered function fails `pnpm test`. Removing the dead code in `generate-react.ts` (see Phase B) would give headroom.
- cli (subprocess-tested, 0% v8 coverage) and types (type-only) have no coverage thresholds until the CLI split above lands.
- The packed-install e2e relies on npm 7+ auto-installing the `react` peer dependency of `@ez-gform/react` from the registry, so it needs registry access as well as Google.
- Response sheet rendering (pinned in `packages/e2e/src/helpers/submit-values.ts`): Timestamp `M/D/YYYY H:MM:SS` in the sheet timezone; checkboxes and checkbox-grid cells joined with `, ` (an Other text containing a comma is indistinguishable from two options); Radio-with-Other shows the raw other text; date with year `M/D/YYYY`; date+time with year `M/D/YYYY H:MM:SS`; date without year `M/D`; date+time without year `M/D H:MM` (no seconds); time of day `h:mm:ss AM/PM`; duration `h:mm:ss`. A Google change to any of these breaks the live-submit e2e, not the library.
