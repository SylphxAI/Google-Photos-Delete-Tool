# Architecture — Google Photos Delete Tool

## Shape

The least system that does the job: **one engine, one control panel,
two surfaces (extension + userscript), zero servers**, with trust
(fail-closed destructive matching, consent, verified postconditions) as
the moat and selector drift handled as data patches, not incidents.

## Runtime boundaries

```
                 ┌─────────────────────────────────────────────┐
                 │ src/core/  (pure TS, NO DOM, NO chrome.*)    │
                 │  DeleteEngine · empty-trash · page-runner    │
                 │  selectors (pack) · license · diagnostics    │
                 └──────────────┬──────────────────────────────┘
                                │ EngineDom (adapter contract)
                 ┌──────────────▼──────────────────────────────┐
                 │ browserDom  (src/core/browser-dom.ts)        │
                 │  — the ONLY place DOM meets the engine       │
                 └──────────────┬──────────────────────────────┘
            ┌───────────────────┼───────────────────────┐
            ▼                   ▼                       ▼
   src/extension/        src/ui/panel/           src/userscript/ + standalone/
   content.ts            mountPanel()            thin mounts of the panel
   popup (i18n)          (floating panel)         + PageRunner
   background (badge)
```

- **Engine** runs on an injected `EngineDom`. Tests script a fake DOM and
  drive the FULL loop: select → cap-flush → scroll → end-of-list →
  flush-last → stop/pause/error. See `tests/delete-engine.test.ts`.
- **Status model** is one union (`src/core/status.ts`) shared by the
  engine, content orchestration, popup, and panel — no drifting
  per-surface unions.
- **Empty-trash** has a verified postcondition: `done` is emitted only
  after the empty button disappears / the empty state appears. The pending
  flag (storage baton) targets exactly the next `/trash` load, expires in
  3 minutes, and is always cleared on first sight.
- **Selectors & keywords** ship as a versioned JSON pack
  (`src/selector-packs/pack-v1.json`). Every query records its outcome
  (primary/fallback/none) into the bounded diagnostics collector.
- **Consent** gates every real run (panel, popup, and content-script
  layers all enforce it); dry runs never need it.
- **Pro** is a locally-verified Ed25519 token; the public key is embedded,
  the private key lives only with the seller.

## Failure philosophy

- Fail closed: unknown UI → stop + descriptive error, never a guessed
  click.
- Stop is abort-aware: a stopped run resolves `idle`, never `error`.
- "Done" is proven (postconditions), never assumed. If the run clicked
  checkboxes and the page never reported a single one as selected, the run
  ends as an error, not as an empty success.
- Speed/ETA numbers are shown only when a total is known (dry-run) or
  measured (release gate).

## Build / release

`scripts/build.ts` derives the Chrome + Firefox manifests from one source
manifest; `scripts/verify.ts` smoke-checks the artifacts (manifest
version, IIFE self-containment, no raw `chrome.*` leaks, userscript
header, pack integrity); `scripts/zip.ts` produces the two zips;
`.github/workflows/release.yml` runs typecheck → lint → test → build →
verify → zip → GitHub release → CWS publish.

Every release also passes the live run in `docs/RELEASE_GATE.md`.

## CI gate

`.github/workflows/ci.yml` is the one required check: `ci-ok` aggregates every
lane, so a red lane is a red merge. It runs the `check` lane (typecheck → lint
→ test → build → verify → zip → size) and `chat-senders`, which fails a change
that adds a direct Telegram, Slack or Discord chat-API host outside the
allow-list owned by `SylphxAI/.github` — chat messages go through Notify, and
the tool makes no such call. Both jobs are listed in `ci-ok`'s `needs:`, so a
run that finishes after `ci-ok` can never be admitted unseen.
