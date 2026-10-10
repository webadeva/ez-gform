<!--
docs/status.md is the short current state. Rewrite stale lines in place; never append.
Keep the whole file under 40 lines. Timestamps: ISO 8601 with offset, from `date -Iseconds`.
-->

# Status

Updated: 2026-10-10T10:14:57+05:30

## Now

- Branch `s2oct-fixing-test-cases`, 16 commits ahead of `main`, not pushed. Working tree clean.
- Test rebuild done: 736 offline unit/integration tests across types, core, react, codegen, cli, docs (was 133); coverage thresholds enforced by `pnpm test` (core/codegen 100 on every metric, react 100/98, docs 100/96, cli 100/96).
- Live e2e in `packages/e2e` (`pnpm test:e2e`, 23 tests): live form parse, three real submissions verified in the response sheet, CLI against the live form, packed-tarball install, docs app via `next start`. Three rows land in the sheet per run.
- Every bug the tests found is fixed and committed (core, react/docs, codegen, cli split, Duration seconds). `docs/TODO.md` holds the five remaining open items.
- Husky + commitlint in place: `commit-msg` lints, `pre-push` refuses `main` and runs `pnpm test`. CI lints PR commits and runs the e2e job on pull requests; release stays offline.

## Blocked

- nothing

## Next up

1. Push the branch, open a PR to `main`, watch the first CI e2e run on GitHub (not yet verified on a runner).
2. Decide the open items in `docs/TODO.md` (jest-dom typing bridge, generated-form duration zero-fill, out-of-range seconds tests, `--timeout -5` parse quirk, unreachable guards).
3. Consider GitHub branch protection on `main` requiring the `ci` and `e2e` jobs; the pre-push hook only guards local pushes.

## Decisions taken without asking

| when                      | decision                                                                    | why                                                                 |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 2026-10-09T22:17:00+05:30 | e2e markers `e2e-core/-cli/-placeholder-fbzx <ISO> <id>` in the first field | so test rows are filterable in the sheet                            |
| 2026-10-10T08:21:00+05:30 | e2e runs on PRs only; release workflow re-runs the offline gate             | avoid duplicate sheet rows per merge                                |
| 2026-10-10T09:00:00+05:30 | generated types/React/HTML omit `fbzx`; multi-page HTML posts a placeholder | reproducible output; placeholder accepted by Google (verified live) |
| 2026-10-10T09:00:00+05:30 | `validateValues` skips `file_upload`; `{other:""}` counts as no answer      | uploads need sign-in; empty Other is not an answer                  |
| 2026-10-10T10:00:00+05:30 | Duration gets optional `second`; Time of day ignores it (verified live)     | sheet renders `h:mm:ss`                                             |

## Handoff

<!-- empty -->
