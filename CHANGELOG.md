# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [3.6.1] - 2026-10-03

### Changed
- Pro is now bought at a self-serve checkout: the token is shown right after
  payment and emailed, and a lost token can be recovered online. The Buy links
  in the extension, userscript and site go to the checkout.

## [3.6.0] - 2026-10-02

### Fixed
- Deleting now finishes completely even when Google Photos loads slowly. After
  each batch the tool waits for the page to settle, goes again from the top and
  reports "done" only after a full pass that found nothing left to delete.
- "Done" means verified done: photos are tracked by identity, so a run that
  stops making progress ends with an error instead of a false "done".
- Duplicate burst photos (several near-identical shots in a row) are handled
  safely and counted correctly.
- A busy page (background changes while it loads) no longer makes a dry run
  under-count.
- On a slow gallery, photos already moved to Trash can linger on screen for a
  moment. The tool now waits for them to disappear, instead of stopping with a
  false "photos are still in the gallery; run again" message.
- A run that ended with nothing selected or moved to Trash no longer says a
  plain "Done". It says nothing was selected, that the page may have changed,
  and points to Report issue (all 9 languages).
- A Pro licence key that is malformed in an unusual way (for example valid
  JSON that is not a licence) is now rejected as invalid instead of causing an
  error.

### Changed
- Your Pro licence now follows your browser sign-in: it is also kept in Chrome
  sync, so it appears on your other browsers and survives a reinstall. If sync
  is off, Pro keeps working from the copy on this device.
- A short welcome page opens once after a fresh install, and a short feedback
  page opens when the extension is uninstalled. Neither page address carries
  anything about you beyond the extension version on uninstall.
- Pro licence wording is more precise: the key is verified on your device and
  never sent to us. The Pro licence box also accepts keys issued by the new
  checkout (self-serve purchase is not switched on in this release).
- Dry runs and deletes are faster: the tool reacts to the page going quiet
  instead of always waiting a fixed 1.5 seconds between scrolls.
- The store name and description appear in your language (de, es, fr, it, nl,
  pt-BR, zh-CN, zh-TW, ja). This was prepared as 3.5.2, which was never
  published on its own and ships here.

### Added
- `bun run bench:engine`: a mock Google Photos grid that measures photos per
  minute and memory for dry and delete runs (developer tool, not shipped in
  the extension).

## [3.5.2] - 2026-10-01

### Changed
- Store name and description now appear in your language (de, es, fr, it, nl, pt-BR, zh-CN, zh-TW, ja).

## [3.5.1] - 2026-10-01

### Changed
- Pro and paywall copy is translated in German, Spanish, French, Italian,
  Dutch, Portuguese, Chinese and Japanese: the Get Pro labels, date filter,
  saved presets, the dry-run teaser (both A/B copy variants), the post-run
  card and the duplicate-review Pro tools. These strings were English in the
  non-English locales. The in-page cards use the language picked in the popup
  (else the browser language). The userscript panel stays English.
- With auto-accept on, the duplicate review shows "N groups auto-accepted
  (show)" so it is clear those groups are included in "Move N to Trash".

### Fixed
- After the similarity slider regroups, the selected keep rule (Newest,
  Oldest, Best copy) is applied to the new groups, so the dropdown and the
  selection agree. Each group still keeps exactly one photo.
- The GitHub release now attaches the Edge package next to the Chrome and
  Firefox zips.
- The "auto-accepted" count reads "1 group" instead of "1 groups"; the Japanese
  "Pro をアンロック" replaces "Pro を解除", which could read as cancelling Pro.

### Added
- A test that fails when a non-English locale's Pro key still holds the
  English text (explicit exceptions for brand terms and same-spelling words).

## [3.5.0] - 2026-10-01

### Added
- `scripts/license.ts verify-buyer <token> --email=<expected>`: first-purchase
  readback (valid, embedded key old/new, plan, email match, issuedAt as ISO);
  exit 0 only for a valid pro token with a matching email. Never prints the
  token. Documented in docs/PRO.md.
- `listing:check` now enforces the required store fields: support and privacy
  URLs, Edge search terms and 250-character minimum description, AMO
  categories, tags and licence. The AMO bootstrap reads categories and licence
  from `storefront/listing.json`.
- `verify` now checks the Edge package (manifest v3, permissions, background,
  icons) and fails any extension build that assigns `innerHTML`/`outerHTML`.
- Pro saved cleanup presets: save the current filter setup (type, date mode,
  dates and an optional note of the view URL) under a name, up to 20, then
  apply, rename or delete it, in the popup and the userscript panel. Applying
  only fills the controls; the run, the dry run and the consent step are
  unchanged, and presets never run on their own (no timers or background
  runs). A saved view that differs from the current page is shown as a hint
  and never opened. Free users see the row disabled with a Get Pro link
  (`utm_medium=presets`). Stored in `chrome.storage.local` (extension) or
  `localStorage` (userscript); corrupt data is ignored.
- Pro duplicate review tools: a keep rule for all groups at once (newest or
  oldest; groups without the needed data or with a tie
  keep the default pick), auto-accept for groups at 98% or more similarity with
  one combined review list for the rest, and a CSV export of the groups
  (`group_id,item_id,decision,similarity`, local download). Free users see the
  controls disabled with a Get Pro link (`utm_medium=dupes`) and keep today's
  review unchanged. Every group still keeps at least one photo and nothing
  moves without your confirmation. No network calls, no telemetry.
- Pro paywall copy A/B test, measured without telemetry: each install picks
  variant "a" or "b" once at random (local storage only, "a" if storage fails)
  and every Pro link carries `utm_content=<variant>` next to the existing UTM
  parameters. Variant "b" words the dry-run teaser and the Get Pro button
  value-first. `PRO_URL` stays the single place the target URL lives. See the
  "Conversion test" section of docs/PRO.md.

### Changed
- Firefox package passes `web-ext lint` with 0 warnings (was 5): popup markup
  is inserted through DOMParser instead of `innerHTML`, and the minimum
  Firefox version is 140 (Android 142), the first releases that understand
  `data_collection_permissions`. The add-on id is unchanged.

## [3.4.0] - 2026-10-01

### Added
- Pro date filter: delete only items before a date, after a date, or between
  two dates (end days included, local calendar days), combined with the type
  filter when one is chosen. Controls sit next to the type filter in the popup
  and the userscript panel; free users see them disabled with a Get Pro link
  (`utm_medium=date_filter`).
- Dates are read from the tile labels the scan already uses ("2 Jan 2020",
  "10 mars 2012", "Mar 3, 2024", "2020-01-01"). A tile whose date cannot be
  read is never selected, and a date-filtered dry run reports matched,
  skipped and total counts ("N items skipped: date not readable").
- README notes that albums work by opening the album.

### Release notes
- Live gate waived for this release (CEO 2026-10-01): selection is extended only
  through the existing filter path; unreadable dates are never selected, the dry
  run shows matched and skipped counts first, and deletions go to Trash for 60
  days. Unit and build checks only; a live dry run and small date-filtered
  delete on a disposable account follow before 2026-10-10.
- Nothing free changes: batch bounds, consent, postconditions and the dry run
  are as before.

## [3.3.0] - 2026-10-01

### Added
- Dry-run teaser for free users: after a dry run the popup and userscript
  panel show the per-type counts the scan already saw ("This view has 12
  screenshots, 40 videos.") with one line about Pro and a dismissable Get
  Pro link. Pro users do not see it, and a real run never does.
- "Get Pro" button on the one-time post-run rate/share card, free users
  only. The card still shows once with the same rules.
- Both links open the README `#pro` section with UTM parameters
  (`utm_medium=dryrun_teaser` / `post_run`). No network call, no telemetry;
  deleting, dry run, duplicates and empty trash stay free.

## [3.2.1] - 2026-10-01

### Added
- "Get Pro - US$9.99 once" link next to the Pro license box in the popup and
  the userscript panel. It opens the README `#pro` section in a new tab, so
  the purchase link can change without a store release; no network call.
- README "Pro" section: what Pro unlocks, price, how the token arrives and
  where to paste it.

### Changed
- Pro licence verification accepts two public keys: the original and a new
  one. Tokens issued under the original key stay valid.

### Fixed
- `GPDT_PRO_PRIVATE_KEY` now means the same for `license:keygen` and
  `license:issue`: a path to a key file, or the key content itself.

## [3.2.0] - 2026-10-01

### Changed
- Product name is now "Google Photos Delete Tool – Duplicate Finder & Bulk
  Delete" (Chrome manifest, popup and panel headings, README, Chrome Web
  Store title), with `short_name` "Photo Delete". The Firefox and Edge builds
  keep the original name because AMO limits names to 50 characters and Edge
  to 45; Edge now ships its own package, `google-photos-delete-tool-edge.zip`. Install identities
  (Firefox add-on id, userscript `@namespace`/`@name`, store ids, file names)
  are unchanged.
- Store descriptions end with the Google LLC trademark attribution and
  "by Sylphx · https://sylphx.com".

### Added
- A one-time prompt after a successful real run (at least one item observed
  deleted; never after a dry run, failure, stop or zero deleted) offering
  "Rate on Chrome Web Store" (hidden in Firefox and Edge) and "Share" with the
  real count. It is dismissable, shown once per install, and makes no network
  call; its links carry UTM parameters that the Chrome Web Store developer
  dashboard reports.

## [3.1.1] - 2026-09-28

### Fixed
- Photo selection (issue #20): checkboxes are now clicked with the full
  pointer sequence (pointer/mouse down, up, click) instead of a bare
  synthetic click, and selector pack v5 recognises a selected checkbox by
  ARIA state (`aria-checked`, `aria-pressed`, `aria-selected`) on
  `role="checkbox"` elements, so a Google Photos class-name change no longer hides a selection.
- A run that clicked photo checkboxes but never saw Google Photos report a
  single one of them as selected used to finish with "Done. 0 photos moved
  to Trash." — indistinguishable from an empty gallery, and a false success
  for a destructive tool. It now ends with an error saying that nothing was
  deleted, and the Report issue diagnostics carry how many checkboxes were
  clicked.

## [3.1.0] - 2026-09-26

### Added
- **Find duplicates.** Scan the current Google Photos view (library, album,
  or search), group look-alike photos by perceptual hash with an adjustable
  similarity (default 95%), review which copy to keep (best copy chosen by
  size when known, then age; every group keeps at least one), and move the
  rest to Trash through the existing consent-gated, dry-run-capable delete
  flow. Opens from the popup (extension) or the floating panel (userscript).
- pHash and grouping ported from SylphxAI/photo-dedup and checked against
  its golden vectors; an exact multi-band prefilter keeps grouping fast at
  any threshold, and all work runs in short slices with progress and Cancel.
- Delete engine id filter: selects only tiles whose Google Photos id was
  chosen, starts from the top, and stops scrolling once all are selected.
- Selector pack v4: pack-owned media-link and thumbnail selectors.

### Privacy
- Find duplicates fetches small thumbnails only from Google's own image
  servers, keeps in-memory fingerprints only, and uploads nothing. No new
  extension permission.

## [3.0.0] - 2026-08-09

### Clean break (v3)

A clean-break rewrite: no backward compatibility, no residual legacy
behavior, no dual paths. One engine, one control panel, two surfaces
(extension + userscript), zero servers.

### Added
- Engine on an injected DOM adapter — the FULL run loop is now
  unit-testable (select → cap-flush → scroll → end-of-list →
  flush-last → stop/pause/error), selector/label/keyword coverage, i18n completeness.
- Abort-aware Stop: a stopped run resolves to `idle`, never `error`.
- Wave-based checkbox selection that can never re-click already-selected
  tiles (the old "checkbox flap" bug) plus counter-regression tracking.
- Counter fallback: when the selected-count element is missing or stale,
  the engine falls back to the rendered checked-tile count.
- Versioned, data-driven selector pack (`src/selector-packs/`) — a UI
  drift fix is a data patch, not code surgery.
- Self-diagnosing **Report issue** — a structured diagnostic blob (pack
  version, selector matches, counter fallback, flap recoveries, label
  samples) pre-fills a GitHub issue.
- **Consent gate** for every real (non-dry) run, enforced in the popup,
  panel, and content script.
- **Empty-trash with postcondition proof** — `done` only after the empty
  state is verified; already-empty trash resolves to done instead of error.
- Unified in-page runner + ONE shared floating panel for userscript and
  standalone (identical behavior, tested once). Honest stats: no
  fabricated progress %, no unmeasured ETA (ETA only after a dry-run
  total).
- **Pro** analysis layer: type filters (photo/video/screenshot/animation/
  collage) and dry-run report/CSV export via a locally-verified Ed25519
  license token (zero server, no account).
- Firefox MV3 extension variant (background.scripts, gecko id) derived
  from the same source manifest; Chrome/Firefox-safe API wrapper layer
  (`src/extension/api.ts`).
- Artifact verification gate (`bun run verify`): manifest/package version
  consistency, Firefox manifest shape, IIFE self-containment, no raw
  async `chrome.*` leaks in built extension code, userscript header, pack
  integrity. Unified zip for both stores.
- Live-run release gate protocol (`docs/RELEASE_GATE.md`).
- Popup rewrite: consent-first flow, Pro license field, type filter,
  utility actions (copy summary / CSV export / report issue), i18n across
  9 locales.

### Changed
- Extension permissions narrowed to `["storage"]` (`activeTab` removed).
- Content-script lifecycle fixed: Stop followed by eager Start can no
  longer create a second engine mid-click; cached progress hydrates a
  re-opened popup.
- README/PRIVACY/CHANGELOG rewritten with measured, truthful claims.

### Removed
- Bookmarklet and DevTools-console as product surfaces (their docs
  referenced `window.__gpdt_pause/resume/stop()` globals that did not
  exist in the code).
- Dead code: `Config.timeout`, `retryWithBackoff`,
  `DeletionLog.estimateRemaining`, `abort()` alias, `$`/`$$`, the
  unreachable dry-run branch in `deleteSelected`, the `toggle` message
  action, `vite.inject.config.ts`, `scripts/preview.ts`, legacy
  `images/`, the `docs/screenshot.png` reference.
- Misleading claims: "25× faster", "200–500/min", "maxCount default
  10,000".

### Security
- Every destructive action requires a positive multilingual label match
  (fail closed); confirm buttons are never guessed.
- Pending empty-trash flag: 3-minute TTL, always cleared on first sight,
  path-gated to `/trash`.
- Pro license keypair: the private key never enters the repository;
  verification is local Ed25519.

### Notes
- Chrome Web Store listing is live at v2.0.5; publishing v3 is a
  storefront handoff (`docs/CHROME_WEB_STORE_SETUP.md`).
- Firefox AMO listing and the Pro checkout are user-authority handoffs
  (`docs/PRO.md`).
- Live-run gate protocol: `docs/RELEASE_GATE.md`.

## [2.0.5] - 2026-06-17

### Fixed
- Pin Chrome Web Store release workflow to the compatible upload CLI after the latest CLI introduced a publisher ID requirement.

## [2.0.4] - 2026-06-17

### Fixed
- Update Chrome Web Store release workflow for the current upload CLI credential environment variables.

## [2.0.3] - 2026-06-17

### Fixed
- Prevent empty-trash follow-up when the delete run errors, stops, or deletes zero photos.
- Fix locale/diacritics normalization for multilingual Google Photos labels.
- Make destructive confirmation detection fail closed instead of guessing non-cancel buttons.
- Avoid contextual non-trash remove actions when finding the Google Photos delete toolbar button.

### Added
- Regression tests for destructive-action selector safety.

## [1.1.0] - 2026-02-14

### Added
- Chrome extension popup UI with progress bar and controls
- Userscript support (Tampermonkey/Violentmonkey/Greasemonkey)
- Bookmarklet support — one-click bookmark to start deletion
- TypeScript rewrite with shared core engine
- CI/CD: auto-publish to Chrome Web Store on release
- Proper icon sizes (16, 32, 48, 128)
- Badge shows deletion count in real-time
- Floating control panel for userscript with start/stop, stats, minimize

### Changed
- Migrated from raw JavaScript to TypeScript
- Unified core logic between all distribution formats
- Build system: Vite + custom build script
- All builds now run from a single `bun run build` command

### Fixed
- Content script now self-contained (no ES module imports that break in MV3)

## [1.0.0] - Initial Release

### Added
- Bulk delete photos from Google Photos via script injection
- Smart selector-based awaiting (no unreliable timers)
- Auto-scrolling through photo library
- Configurable batch size (up to 10,000 photos)
- Console-based progress reporting
