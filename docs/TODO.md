# TODO

Consolidated bug and follow-up list from the 2026-10 test rebuild.

## Deferred by decision (2026-10-09)

- No source fixes in this round: bugs found by the new tests are recorded here and pinned in tests with `// TODO(bug)` comments, not fixed.
- CLI split: `packages/cli/src/cli.ts` runs `main()` at import, so split it into an importable module plus a bin entry so the fetch/exit paths get in-process tests and coverage (today cli has 0% v8 coverage because it is only tested via subprocesses).

## From Phase A (core, types)

- `VERSION` in packages/core/src/index.ts:1 is "0.1.0"; package.json is 0.1.4. Pinned at packages/core/src/tests/index.test.ts:52.
- `submitForm` rejects on an invalid formId instead of resolving `{status:"error"}`: `formUrls`/`buildSubmitBody` run before the `try` (submit.ts:84-85). Comment at submit.test.ts:277.
- `validateValues` accepts `{other:""}` as a filled required answer (encode.ts:183-185). Comment at encode.test.ts:702.
- `encodeValues` emits `__other_option__` for `{other:""}` with no `.other_option_response` (encode.ts:62-63). Comment at encode.test.ts:276.
- `validateValues` only checks top-level `values[rowId]` for grids (encode.ts:170-175), so a nested `{[q.entryId]: {rowA, rowB}}` map that `encodeValues` accepts reports rows missing. Comment at encode.test.ts:704. No pin test.
- `ParseError` drops the JSON.parse error as `cause` (errors.ts:5-8, extract.ts:48-52). Comment at extract.test.ts:65.
- Possible type gap: `Question.time.isDuration` has no matching value type; `TimeValue` is `{hour, minute}` with no seconds. Comment at packages/types/src/tests/types.test.ts:157. Not checked against google-forms-internals.md.
- Linear scale with no options parses to NaN min/max (parse.ts ~215-219). Low priority, not pinned.
- Unreachable/uncovered: extract.ts:50 `String(cause)` arm; parse.ts:152 non-string entry[1]; parse.ts:274 `formId ?? ""`.

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
- generate-react: a required file_upload renders only a note, so the generated form can never pass validation. Comment at generate-react.render.test.tsx:273.
- generate-react dead code: `usesOther`, `hasOtherOption`, `void usesOther` (generate-react.ts:30-36, 298-303, 318); this is why codegen lines sit at 98.66% / functions 94.33%. Comment at generate-react.test.ts:492.
- cli.ts:76 has no timeout on the schema fetch; a hanging server hangs the CLI. Comment at packages/cli/src/tests/cli.test.ts:573.
- CLI paths untestable until `main()` is split from an importable module (cli.ts:274-279 runs main at import; fetch and process.exit cannot be injected). Listed at cli.test.ts:568-572: network error → "Failed to fetch <url>: <cause>" exit 2 (cli.ts:76-83); 401 / accounts.google.com redirect → sign-in error exit 2 (:85-87); non-ok status exit 2 (:89-93); unparsable fetched HTML → "Failed to parse form HTML" exit 2 (:96-102); successful submit prints JSON and exits 0, or 2 on error (:249-252); the fetch timeout above. CLI coverage reads 0% for the same reason.
- `loadFixtureSchema` (`packages/codegen/src/__test-utils__/fixtures.ts`) fails under jsdom because `import.meta.url` is not a `file:` URL there; the HTML integration test carries a local copy.
- codegen `testTimeout` raised to 120000 because `ts.createProgram` type-check tests took 23-53s under parallel turbo load.

## From Phase C (react, docs)

- `toggle_checkbox` reducer keeps only string items, so checking a plain option drops an existing `{other}` entry (packages/react/src/useGoogleForm.ts:100-104). Pinned at react useGoogleForm.register.test.tsx:242, docs SchemaForm.fields.test.tsx:259 and SchemaForm.submit.test.tsx:255.
- `submit()` in the same act as `setValue` sends stale values: `stateRef` syncs only in an effect (useGoogleForm.ts:160-162, 201). Pinned at useGoogleForm.submit.test.tsx:358.
- `resetOnSent` dispatch is not guarded by `mountedRef` (useGoogleForm.ts:235-237). Not verified by a test. Comment at useGoogleForm.submit.test.tsx:338.
- DateField seeds sibling parts with month 1 / day 1, so typing "3" into Month after Day yields month 13 (packages/docs/src/components/SchemaForm.tsx ~324-327). Pinned at SchemaForm.submit.test.tsx:296.
- `Code.tsx:14` has no `.catch` on `navigator.clipboard.writeText`; a denied clipboard is an unhandled rejection. Pinned at Code.test.tsx:74.
- Playground tablist handles only ArrowLeft/ArrowRight, no Home/End (PlaygroundClient.tsx:134-149). Comment at PlaygroundClient.test.tsx:333.
- Documented, not flagged: `setValue` does not clear that field's error; a new `initialValues` identity is only picked up by `reset`; the "validating" status is never observable; encoded key order follows fill order; SchemaForm option labels are sibling `<label>`s not associated with inputs.
- Unreachable without source change: useGoogleForm.ts:128 reducer `default` arm; PlaygroundClient.tsx:71 non-Error `String(cause)` fallback (lint rule prefer-promise-reject-errors blocks the test).
- jest-dom 6.10 `vitest.d.ts` augments one-parameter `Assertion<T>` but vitest 5.0.1 declares `Assertion<R, T>`; docs test-setup.ts carries a `declare module "vitest"` bridge. Re-check when bumping either.

## Found in phase D (e2e, coverage, CI)

- `packages/core/src/index.ts:1` exports `VERSION = "0.1.0"`, a hardcoded constant that no longer matches the package version (0.1.4). Derive it at build time or drop it. The packed-install e2e pins only the export name, not the value.
- `packages/cli/src/cli.ts:150-153`: the generate command requires a `<form-url-or-id>` positional even when `--json-input` is given, and then ignores it. The e2e passes a dummy `unused`. Make the positional optional with `--json-input`.
- Codegen output is not reproducible across fetches: `generateTypes`, `generateReactComponent` and `generateHtmlForm` embed the per-request `fbzx` token (it can be negative). The live-cli e2e masks it. Consider whether generated code should carry `fbzx` at all.
- `TimeValue` has no seconds field, so a Duration answer can only be sent as hours and minutes; the response sheet renders it as `h:mm:00`. Document the limitation or add seconds (`entry.N_second`).
- Local `pnpm format:check` fails on the untracked vitest output `packages/codegen/.vitest/json/output.json` (left by an earlier phase). CI is unaffected because the file is untracked. Add `.vitest/` to `.gitignore` and `.prettierignore` and delete the directory.
- Codegen function coverage is 94.33% against a 94% threshold, so almost any new uncovered function fails `pnpm test`. Removing the dead code in `generate-react.ts` (see Phase B) would give headroom.
- cli (subprocess-tested, 0% v8 coverage) and types (type-only) have no coverage thresholds until the CLI split above lands.
- The packed-install e2e relies on npm 7+ auto-installing the `react` peer dependency of `@ez-gform/react` from the registry, so it needs registry access as well as Google.
- Response sheet rendering (pinned in `packages/e2e/src/helpers/submit-values.ts`): Timestamp `M/D/YYYY H:MM:SS` in the sheet timezone; checkboxes and checkbox-grid cells joined with `, ` (an Other text containing a comma is indistinguishable from two options); Radio-with-Other shows the raw other text; date with year `M/D/YYYY`; date+time with year `M/D/YYYY H:MM:SS`; date without year `M/D`; date+time without year `M/D H:MM` (no seconds); time of day `h:mm:ss AM/PM`; duration `h:mm:ss`. A Google change to any of these breaks the live-submit e2e, not the library.
