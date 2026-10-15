# Selector-drift canary

A scheduled, read-only check that Google Photos still looks the way the
selector pack expects, so drift is found before a user files "Report issue".
It sends nothing anywhere: the only outputs are the run summary and one GitHub
issue.

## What it checks

`scripts/canary/run.ts` opens photos.google.com with a disposable account's
session and counts matches for every selector in the active pack
(`src/selector-packs/pack-v1.json`), primary first, then fallbacks.

| Stage | Checks |
|---|---|
| Grid | media tile link, thumbnail, photo container, scroll container, unchecked checkbox |
| After selecting one tile | checked checkbox, selection counter, toolbar trash button (presence only) |
| Not checked | confirm dialog and empty-trash button: they only appear after clicking delete or trash |

Verdicts: `ok` (primary matches), `fallback` (primary missed, a fallback
matches: the tool still works, the pack wants a refresh, the run passes),
`drift` (nothing matches: the run fails), `skipped`.

## It never deletes

The only click is one selection checkbox, then the same checkbox again to
deselect. The click goes through `assertSafeClick` (`scripts/canary/safety.ts`),
which refuses every pack-owned delete and empty-trash selector and any
selector naming delete, trash, empty, dialog or confirm. An in-page guard also
swallows any click that lands on a destructive control or inside a dialog, and
the run aborts if it ever fires. `tests/canary.test.ts` asserts all of this,
including that the runner has exactly one click site.

## Supplying the account

Use a disposable Google account that holds only the
[GPDT test library](../test-library/README.md) photos.
Sign in once in a browser, export the Playwright storage state (cookies and
local storage as JSON), and store it as the repo secret
`GPDT_CANARY_STORAGE_STATE`. Never commit it. While the secret is absent the
workflow (`.github/workflows/canary.yml`, daily plus manual) ends with a
notice and passes.

Locally: `GPDT_CANARY_STORAGE_STATE_FILE=/path/state.json bun run canary`
(or `GPDT_CANARY_STORAGE_STATE` with the JSON). Browser: `CHROMIUM_PATH`, else
`/usr/bin/google-chrome`.

Exit codes: 0 ok, 1 drift, 2 session expired (refresh the secret; not drift),
3 canary error or safety violation, 78 no session supplied.

## On drift

The workflow opens one issue titled "Selector drift detected", or comments on
the open one, with the drifted checks and the run link. Then:

1. Confirm in a browser on a real gallery; a layout test account can differ.
2. Patch `src/selector-packs/pack-v1.json` (data only, `patch` version bump) and
   update the pack test; the 48h clock in [vision.md](vision.md) runs from
   confirmation.
3. Re-run the [release gate](RELEASE_GATE.md) before publishing, and close the
   issue when the canary is green again.

A session-expired failure is not drift: refresh the secret.
