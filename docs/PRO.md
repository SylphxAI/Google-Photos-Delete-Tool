# Pro — Local, offline licence verification

Pro unlocks the convenience layer: type and date filters, saved presets,
duplicate keep rules, auto-accept and CSV export. The feature list lives only in
[README.md#pro](../README.md#pro). The delete engine, dry run, duplicate
finding and empty trash are free forever.

The license is an Ed25519-signed token verified entirely in the user's
browser (WebCrypto `SubtleCrypto`). Activation needs **no account, network connection or telemetry**. Money handles
checkout and issuance, but verification is local: the token is never sent to us. The extension keeps it in
`chrome.storage.local` and `chrome.storage.sync` (read sync first, then local,
migrating local to sync), so it follows the user's Chrome sign-in; the
userscript keeps it in `localStorage` only.

## Token format

```
${base64url(payload)}.${base64url(signature)}
```

where `payload` is JSON:

```json
{ "plan": "pro", "email": "buyer@example.com", "issuedAt": 1786300000000, "order": "cs_live_..." }
```

- `email` and `order` bind the token to the purchaser record: `email` is the
  address the buyer paid with, `order` the Stripe payment or session id. The
  issuer (`bun run license:issue`) refuses to run without `--email`, and takes
  `--order=<id>`; always pass both. The same `{plan, email, issuedAt, order}`
  shape remains supported for legacy licences. Money tokens may instead omit
  email/issuedAt and carry `product: "gpdt"`, `grant`, `seats` and `expiresAt`.
  Money owns the native 100-calendar-year term; the client does not rewrite it.
  A Money-signed token must carry a finite numeric `expiresAt` in milliseconds.
  The client accepts it strictly before that instant and rejects it at or after
  that instant using the local device clock, even if `issuedAt` is also present.
  A historical seller-signed token without `expiresAt` remains perpetual; if a
  seller token carries an explicit expiry, that signed timestamp is honoured too.
  The verifier ignores `order` and accepts older tokens that lack it.
- The signature is Ed25519 over the payload bytes, made with the seller's
  private key.
- Verification (see `src/core/license.ts`) checks format and signature using
  the target environment’s published Money JWKS snapshot before trusting plan,
  product or expiry claims.
  Production also accepts both historical seller keys. Bad signature / wrong
  product / wrong plan / malformed / expired → rejected, never crashed. An environment
  is selected by the package or CLI, never by token contents.

## Seller tooling

```bash
# 1. Generate a keypair (creates ~/.gpdt/gpdt-license-private.pem, mode 600)
bun run license:keygen

# 2. Issue a Pro token for a buyer (email required; add the Stripe id)
bun run license:issue --email=buyer@example.com --order=cs_live_...

# 3. Verify locally without placing the token in argv or printing claims
bun run license:verify --token-file=/private/path/to/token
# Or pipe the token on stdin. Default trust is production.
bun run license:verify --environment=preview < /private/path/to/test-token
```

`$GPDT_PRO_PRIVATE_KEY` may be either a path to the key file or the key
content itself (PEM or base64url PKCS8). If the value names an existing file it
is read; otherwise it is used as content. `keygen` and `issue` follow the same
rule, and the key is never printed.

## Key custody

- The private key stays outside this repository, in 1Password: item
  "GPDT Pro license private key" in the Sylphx vault.
- Product-owned Money trust is captured in `config/licence-trust/production.json`
  and `preview.json`. Each file records the exact public JWKS URL and capture
  time. `bun run license:trust:refresh` makes anonymous GETs to those URLs,
  validates public Ed25519 keys and refuses to remove an existing key. No
  token, claim, account credential or photo information is an input to a JWKS
  request. The snapshots are source-reviewed and shipped with the client.
- Production retains the two historical keys in `PRO_PUBLIC_KEYS_BASE64URL`
  (`src/core/license.ts`), including the original whose private half was lost.
  Existing valid production licences remain valid. A preview package accepts
  only preview Money keys, not production or legacy production keys.
- **Offline means offline:** neither activation nor reload calls a key or
  entitlement server. The client verifies with its packaged trust snapshot.
  A newly introduced signing key requires a client update carrying the refreshed
  published JWKS; it cannot be learned from an untrusted token or page storage.
  Retired signing keys must remain published for verification and retained in
  client snapshots. There is no online revocation check.
- Normal builds and unbundled `verifyLicense(token)` use production. Test Mode
  is explicit: `bun run build --environment=preview`, followed by
  `bun run verify --environment=preview` and `bun run zip --environment=preview`.
  Those outputs live in `dist-preview/` and `*-preview.zip`; the popup labels
  them **Preview build — Test Mode licences only**. Do not install a preview
  package for a production purchase. The regular store/web packages stay
  production-only.
- Every extension ZIP includes `build-info.json` (source commit, version,
  target environment and public JWKS provenance). Public web releases carry
  separate production and preview ZIPs plus SHA-256 checksums. ZIP timestamps
  are fixed so the downloaded bytes can be compared to the tested package.

## Testing

`tests/license.test.ts` verifies the full sign→verify cycle with a
throwaway keypair plus the embedded-key list, and
`tests/license-scripts.test.ts` checks that the path and content forms of
`$GPDT_PRO_PRIVATE_KEY` both issue verifiable tokens, without the seller key.
`tests/license-buyer.test.ts` covers `verify-buyer` (a token without email,
email match and mismatch, tampered and foreign tokens, argv refused, the token
never printed) with throwaway keys.

## Conversion test

The Pro paywall copy is A/B tested without telemetry. Each install picks
variant `a` (original wording) or `b` (value-first wording, "Unlock Pro") once
at random and keeps it in local storage (`chrome.storage.local` in the
extension, `localStorage` in the userscript); if storage fails it uses `a`.
Nothing is sent anywhere. The variant only appears as `utm_content=a|b` on the
Pro link a user chooses to click, next to `utm_source=extension`,
`utm_medium` (`dryrun_teaser`, `post_run`, `date_filter`, `license_box`) and
`utm_campaign=pro`. All links are built from `PRO_URL` in
`src/core/pro-moments.ts`; `SELF_SERVE_CHECKOUT_URL` is the live target, and the UTM parameters
ride on it.

Reading results:

- **Stripe:** checkout sessions (Payments, then Checkout sessions, or the
  Payment Link's detail page) show the URL parameters each session started with;
  count paid sessions per `utm_content` (and per `utm_medium` for the moment).
  Compare against clicks only if the link is served from a page that counts
  them; Stripe alone gives purchases, not impressions.
- **Chrome Web Store dashboard:** installs and uninstalls per period give the
  denominator. Installs are not split by variant, so divide paid sessions of
  each variant by half the installs (the split is random and even), and run
  the test over whole weeks before comparing.
- Keep both variants until the gap is larger than noise at the observed
  purchase counts; then set the winner as the only copy and drop the other.

## Website measurement

`site/config.json` supplies GA4 `G-BQ1GKMWND2`. Ads destinations are unset;
no Google Ads conversion or purchase event is emitted. `site/tracking.js` uses
global opt-in: no Google script, request or queued event before Accept all or
Analytics only. Reject is the default everywhere, including on return pages.
Cookie settings can withdraw consent; collection is disabled, analytics cookies
are cleared and the page reloads to unload the tag. The saved rejection survives
reload. Storage changes revoke collection in other open tabs too.

GA4 page measurement and consented `add_to_chrome_click` / `pro_click` events are
measured on pages using `tracking.js`. Measurement removes URL query/hash and
referrer values. The pinned Keel pricing/recovery runtime is not instrumented by
this website script. Checkout and recovery remain independent of analytics.

A `session_id`, entitlement, access token or visit to `thanks.html` is not proof
of payment. Purchase reporting requires a verified paid-order receipt with its
actual transaction ID, amount and currency; none is fabricated here. The public
Money catalogue remains authoritative for checkout prices. No charged prices,
entitlements or store-package bytes are changed by website tracking.

## Self-serve checkout and sales

Pro is bought instantly at <https://sylphxai.github.io/Google-Photos-Delete-Tool/pricing>: Money mints the
offline licence (including `plan: "pro"`, `product: "gpdt"`, `order`,
`grant`, `seats` and the native `expiresAt`; email and issuedAt may be absent), the success page shows the token and an emailed signed link
repeats it. The installed extension verifies and saves the signed token automatically on
the product-owned pricing/recovery page. Manual paste remains available, and
is the userscript activation path. No photo controls run during activation. Both switches are on:

- `SELF_SERVE_CHECKOUT` in `src/core/pro-moments.ts` (every extension and
  userscript Buy link, via `proUrl()`; the static popup links already point at
  the checkout).
- `selfServeCheckout` in `site/config.json` (the landing page Pro button, and
  it reveals the "Lost your licence?" link to
  <https://sylphxai.github.io/Google-Photos-Delete-Tool/recover>).

Verifier: a token with `product` `gpdt` verifies, as does one with no product
(seller CLI) and one with the legacy slug `gpdt-pro` (kept so no issued token
can stop working); any other product is `wrong-plan`. The signature is verified before any product, plan or expiry decision. Money
authority requires the current `gpdt` product and a finite signed expiration;
legacy product compatibility applies only to seller tokens.

1. **Product:** Pro is one-time: Personal US$19 (1 seat), Family US$29.97
   (3 seats), Team US$49 (10 seats). These amounts are the existing checkout totals; the catalogue stores per-seat amounts for Family and Team. Signed seats are the checkout
   line quantity; each tier price is a per-seat amount, not the pack total.
   Seat scope is informational: no account fingerprint or online seat lock.
   Existing licences remain unrestricted. Pro is a convenience unlock for
   power users of a free tool. The README `#pro` section carries the buy link.
2. **Issuance is automatic.** Money fulfils the payment and the licence service
   signs the token from Money's grant; the buyer sees it on the success page
   and by email, and `/recover` re-issues it. `bun run license:issue`
   remains the seller CLI for comps and manual reissue (always pass `--email`
   and `--order`); the seller key stays in 1Password.
3. **Support:** the order record (email, date, id) lives in Money and Stripe;
   a lost token is recovered at `/recover?product=gpdt`, and manual reissue
   uses `--email` and the same `--order` after checking both match the payment.
4. **Refunds:** Pro is digital content supplied at the buyer's express
   request at checkout, so the 14-day right to cancel ends on delivery. Beyond
   that we only offer the legal minimum: if Pro does not work as described and
   cannot be fixed, we put it right or refund. The wording lives in
   `site/terms.html`; keep this section pointing there instead of copying it.
5. **First-purchase readback:** after the first paid order, check the token
   without printing it back. The token goes on stdin (or `--token-file=<path>`),
   never on the command line, where it would land in shell history and process
   lists; a token passed as an argument is refused:
   `read -rs T; printf %s "$T" | bun run scripts/license.ts verify-buyer [--email=<buyer email>]`.
   It uses the same target-environment verifier as the popup and checks `plan`
   and `product` (`gpdt`). It prints only a verdict: `new` (signed by Money’s
   published key for that environment, product `gpdt`), `existing` (valid, but
   signed by a production legacy key or without the current product) or `invalid`; exit code 1 only for `invalid`.
   The email is optional because Money puts it in the token only when the buyer
   is identified by an email address: with `--email` it must match when the token
   has one, and a token without one prints `email: not in token (check the buyer
   in Money)`. Neither the token nor its claims are echoed. Add `--environment=preview` for
   an existing Test Mode token; production is the default, and an invalid
   environment is refused.

## Chrome Web Store compliance

The extension is free and its core (batch delete, dry run, empty trash) is
fully free. Pro adds convenience features through a token sold outside the
store, the standard compliant shape for the Chrome Web
Store: no in-extension payment and no paywalled core. The store listing
discloses the paid Pro layer.

### Conversion verification

Automatic activation uses Chrome `externally_connectable` messaging, not a
content script, so the extension asks for no host access beyond Google Photos
and an update shows no new permission warning. The storefront build adds
`site/activate.js` to the pricing and recovery pages; it sends the token Keel
shows to the Chrome Web Store extension id and never stores it in the page.
The service worker (`src/extension/external-activation.ts`) accepts the message
only when the browser-reported sender URL is an owned pricing/recovery path
(`isActivationUrl`) and `verifyLicense` succeeds; a rejected or invalid token
never replaces a saved licence. Without the extension, in Firefox and in the
userscript, the token stays on the page for manual paste.
`tests/external-activation.test.ts` covers sender and token rejection,
`tests/site-activate.test.ts` the page handoff and manual fallback, and
`tests/manifest-permissions.test.ts` plus `bun run verify` fail any package
that adds a permission, host or content-script origin.
Storage Saver fills filters only; it starts no run. Google Photos grid tiles do
not provide original sizes, so GB freed is explicitly unavailable, not inferred
from thumbnail bytes. The dry run still provides matching item counts.

The conversion release records new size baselines: content 121,583 bytes and
Chrome zip 104,417 bytes, covering Storage Saver, duplicate selection UI and
activation in the service worker with the existing offline Ed25519 verifier; no
new runtime dependency or remote verification was added.
