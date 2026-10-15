# Pro — Local License Verification (zero-server)

Pro unlocks the convenience layer: type and date filters, saved presets,
duplicate keep rules, auto-accept and CSV export. The feature list lives only in
[README.md#pro](../README.md#pro). The delete engine, dry run, duplicate
finding and empty trash are free forever.

The license is an Ed25519-signed token verified entirely in the user's
browser (WebCrypto `SubtleCrypto`). There is **no account, no backend, no
telemetry**. The token is never sent to us. The extension keeps it in
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
  shape is what the Money licence capability issues. The verifier ignores
  `order` and accepts older tokens that lack it.
- The signature is Ed25519 over the payload bytes, made with the seller's
  private key.
- Verification (see `src/core/license.ts`) checks format, plan, and
  signature with the embedded public keys. Bad signature / wrong plan /
  malformed → rejected, never crashed.

## Seller tooling

```bash
# 1. Generate a keypair (creates ~/.gpdt/gpdt-license-private.pem, mode 600)
bun run license:keygen

# 2. Issue a Pro token for a buyer (email required; add the Stripe id)
bun run license:issue --email=buyer@example.com --order=cs_live_...

# 3. Verify a token against the embedded keys
bun run license:verify <token>
```

`$GPDT_PRO_PRIVATE_KEY` may be either a path to the key file or the key
content itself (PEM or base64url PKCS8). If the value names an existing file it
is read; otherwise it is used as content. `keygen` and `issue` follow the same
rule, and the key is never printed.

## Key custody

- The private key stays outside this repository, in 1Password: item
  "GPDT Pro license private key" in the Sylphx vault.
- Two public keys are accepted, listed in `PRO_PUBLIC_KEYS_BASE64URL`
  (`src/core/license.ts`), and a token is valid if either verifies it:
  1. the original key, whose private half was lost. It stays so every token
     ever issued under it keeps working;
  2. the current key (`-LFAzRTKamgPJ57qEW8-XdOpzFZ50JhT6b7thTQe8GQ`), which
     signs all new tokens.
- Rotation: generate a new pair, append its public key, release. Never remove
  a key that has issued tokens, because that invalidates them.
- There is no revocation server by design, and tokens carry no expiry.

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

## Paid-ads tracking

Google Ads cannot measure a click that lands straight on the Chrome Web Store,
so ads point at the landing page (`site/`, published by
`.github/workflows/pages.yml` at
<https://sylphxai.github.io/Google-Photos-Delete-Tool/>). It uses gtag.js
(GA4 plus Google Ads) with Consent Mode v2: analytics and ad storage, user data
and personalization are denied by default in the EEA, UK and CH and granted
elsewhere, and a small banner updates them. No email, name or other personal
data is sent.

- **Purchase event:** `thanks.html?session_id=cs_...` fires `purchase` once. It
  only counts when the checkout success flow sends the buyer to that page with
  the Checkout Session id; confirm on the first live order.
- **`site/config.json`:** `ga4MeasurementId` (`G-...`), `adsConversionId`
  (`AW-...`), `addToChromeSendTo` and `purchaseSendTo` (each `AW-.../label`, one
  Ads conversion action per event). While any value is a placeholder
  (`XXXX`), no tag loads at all.
- **Flow:** ad click, then landing page (`page_view`, UTM kept); the
  **Add to Chrome** click fires `add_to_chrome_click` (Ads micro conversion)
  and opens the store listing with the same UTM; after payment the checkout
  sends the buyer to `thanks.html`, which fires `purchase` (US$9.99) once, with the
  Checkout Session id as `transaction_id` so a reload is not counted twice.
- **Public statistics:** users and rating come only from `site/stats.json`;
  update it with its source and date.
- **Test:** `tests/site.test.ts`.

## Self-serve checkout and sales

Pro is bought instantly at <https://buy.sylphx.com/buy/gpdt>: Money mints the
offline licence (payload `plan: "pro"`, `email`, `issuedAt`, `product: "gpdt"`,
`order`, `grant`), the success page shows the token and an emailed signed link
repeats it. Activation is unchanged: paste the token. Both switches are on:

- `SELF_SERVE_CHECKOUT` in `src/core/pro-moments.ts` (every extension and
  userscript Buy link, via `proUrl()`; the static popup links already point at
  the checkout).
- `selfServeCheckout` in `site/config.json` (the landing page Pro button, and
  it reveals the "Lost your licence?" link to
  <https://buy.sylphx.com/recover?product=gpdt>).

Verifier: a token with `product` `gpdt` verifies, as does one with no product
(seller CLI) and one with the legacy slug `gpdt-pro` (kept so no issued token
can stop working); any other product is `wrong-plan`. The signature is always
required.

1. **Product:** Pro is US$9.99, one-time and lifetime, a convenience unlock for
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
   It checks the signature against the embedded keys, `plan` and `product`
   (`gpdt`), and prints only a verdict: `new` (signed by the current key, product
   `gpdt`: a token from the self-serve checkout), `existing` (valid, but from the
   original key or with no product) or `invalid`; exit code 1 only for `invalid`.
   The email is optional because Money puts it in the token only when the buyer
   is identified by an email address: with `--email` it must match when the token
   has one, and a token without one prints `email: not in token (check the buyer
   in Money)`. The token is never echoed.

## Chrome Web Store compliance

The extension is free and its core (batch delete, dry run, empty trash) is
fully free. Pro adds convenience features through a token sold outside the
store, the standard compliant shape for the Chrome Web
Store: no in-extension payment and no paywalled core. The store listing
discloses the paid Pro layer.
