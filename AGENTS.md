# Google Photos Delete Tool

A Chrome/Firefox extension and userscript that finds duplicate photos and
bulk-deletes photos in Google Photos, entirely in the user's browser. Google
Photos has no delete API, so the tool drives the page like a person would. Its
value is trust: a destructive tool people run on their own library must never
guess. Product destination: [docs/vision.md](docs/vision.md); capabilities and
their code: [docs/capabilities.md](docs/capabilities.md).

Company standards: <https://github.com/SylphxAI/owner/blob/main/standards/docs.md>.

## Hard lines

- Destructive controls (delete, confirm, empty trash) are matched only by a
  pack-owned selector or a positive accessible label, because a wrong click
  deletes a stranger's photos; an unknown DOM stops the run with an error.
- A real run needs the local consent acknowledgement, and empty trash is opt-in,
  because trash emptying is the one unrecoverable action.
- `done` is reported only after the page shows the postcondition (counter back
  to zero, empty state), because a click alone proves nothing.
- No server, telemetry or network call other than Google's own image hosts,
  because the privacy promise in [PRIVACY.md](PRIVACY.md) is the product.
- The Firefox add-on id and the userscript `@namespace` in `scripts/build.ts`
  stay as they are, because changing them breaks updates for installed users.
- Google UI drift is fixed as a data patch to `src/selector-packs/pack-v1.json`
  with a version bump, not as engine code.

## Layout

`src/core/` is DOM-free engine and domain code (the delete engine runs on an
injected `EngineDom`); `src/ui/`, `src/extension/`, `src/userscript/` are thin
surfaces. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Pro licence
tooling: [docs/PRO.md](docs/PRO.md). Store publishing:
[docs/STORE_AUTOMATION.md](docs/STORE_AUTOMATION.md). Store listing copy lives
only in `storefront/listing.json`.

## Judged by

CI (`.github/workflows/ci.yml`) runs `bun run typecheck`, `bun run lint`,
`bun run test`, `bun run build`, `node scripts/dupes-demo.mjs --check
--no-screenshot`, `bun run listing:check`, `bun run verify`, `bun run zip` and `bun run size:check`
(`dist/extension/content.js` and the store zip may not exceed `budgets/size.json`
by more than 5%). It also runs `chat-senders` in fail mode
(`SylphxAI/.github` action pinned by commit, full-history checkout), which fails
a change that adds a direct Telegram, Slack or Discord chat-API host: the tool
sends chat through Notify, and `ci-ok` needs both jobs, so a red lane is a red
merge.
`bun run bench:engine` (PR job `bench-engine.yml`, paths `src/`) measures photos per minute and heap on a mock grid and fails only beyond 2x of `bench/engine-baseline.json`; N=5000 is measured in CI only. A release also carries the disposable-account live run in
[docs/RELEASE_GATE.md](docs/RELEASE_GATE.md); green CI proves the source, only
that run proves the product against live Google Photos.
