# Privacy Policy — Google Photos Delete Tool

**Last updated:** 2026-11-14 (policy version 2026-11-14)

## Overview

Google Photos Delete Tool is a browser extension and userscript that helps
you find duplicate photos, spot blurry or low-resolution shots and bulk-delete
photos in Google Photos. Your privacy is the product's core promise:
**scanning and deleting run 100% locally in your browser, with zero photo
uploads**. Bulk Delete, Find duplicates and the Blurry / Low-Res detector never
send a photo, thumbnail, fingerprint or library detail anywhere.

The one exception is optional and per photo: **AI 4K Restore** sends a single
photo, only after you click it on that photo and confirm the transfer notice.
See [AI 4K Restore](#ai-4k-restore-optional) below.

The tool stores the preferences and licence you choose to save, as described below;
there is no analytics, telemetry or remote licence check in the client.

## Data Collection

We do not collect your library information. Specifically:

- No personally identifiable information is collected
- No photo leaves your browser unless you confirm AI 4K Restore for that one photo
- No analytics or tracking is used in the extension or userscript
- Scanning, duplicate finding, blur detection and deleting send nothing to any server
- No cookies are set
- Pro license verification happens **locally** (Ed25519 signature check in
  your browser), using a public-key snapshot shipped with the package.
  Activation and reload work offline and make no JWKS/entitlement request.
  The build maintainer refreshes that snapshot from the target environment’s
  public Money JWKS using anonymous GETs with no token, claim or library data.
  A new signing key requires a client update. The token is never sent to us. If you use your browser's sync account, the
  browser itself copies the token to your other signed-in devices, like any
  extension setting

## How It Works

The tool operates entirely within your browser. It interacts with the
Google Photos web interface the same way a human would: selecting photos,
clicking "Move to trash", and confirming dialogs. In dry-run mode it reads
the `aria-label` timestamp on each visible tile to count photos — again
entirely in your browser.

### Find duplicates

When you click **Scan this view**, the tool reads each tile's address and
thumbnail link from the Google Photos page, then downloads small (64 px)
thumbnails **only from Google's own image servers**
(`*.googleusercontent.com` / `*.usercontent.google.com`, the same servers
the page already loads them from). Each thumbnail is reduced in memory to a
64-bit fingerprint (a perceptual hash) and the pixels are discarded. The
fingerprints and groups live only in the open tab and are gone when you
close the review or the tab. They are never saved and never sent to us or
anyone else.

### Blurry / Low-Res detector

The **Blurry / Low-Res** tab measures sharpness (Laplacian variance) and
pixel size of the same thumbnails, in memory, on your computer. Scores live
only in the open tab and are never saved or sent. Nothing is marked for Trash
until you choose it.

### AI 4K Restore (optional)

AI 4K Restore is the only feature that sends a photo off your device, and it
sends exactly one photo per request:

1. You click **AI 4K Restore** on one photo.
2. A transfer notice names the photo and says what will happen. Nothing is
   sent until you press **Send 1 photo and restore**.
3. That single photo is sent over HTTPS to Sylphx AI (`sylphx.ai`). Sylphx
   servers process it **ephemerally in memory, with zero persistent storage or
   retention**: no copy is kept after the 4K result is returned.
4. To render the 4K image, Sylphx passes the photo to a paid third-party AI
   inference API whose terms for this request **exclude training AI models on
   it** (`trains: false`). Any short-term processing on the provider's side
   is governed by its API terms.
5. The restored image comes back to your browser, lives in memory as a
   temporary object, and is released when you close the studio. It is saved
   only if you press **Download 4K Photo**.

When the studio opens, the tool also asks Sylphx for your credit balance
using the wallet token stored on your device. That request carries no photo
or library data. Credits are bought on the Sylphx pricing page; payment
details go to the payment provider, never through the extension.

Before your first purchase, Pro activation or restore, and again whenever
these terms change, the tool asks you to agree to the Terms of Service and
this policy. The acceptance record (a random local id, the two version dates,
the time and the surface) stays in `chrome.storage.local` or `localStorage`
and is not sent.

On your request, the tool stores **locally**:

- Your preferences (batch size, dry-run, empty-trash, filter) in
  `chrome.storage.local` / `localStorage`
- Your Pro token in `chrome.storage.local` and `chrome.storage.sync`, so Pro
  follows your browser sign-in (the browser's own sync, under your Google
  account's sync settings; we never receive it)
- Your Terms/Privacy acceptance record (`gpdt_policy_consent`) and, if you
  connect one, your Sylphx wallet token
- A short-lived "pending empty-trash" flag after a run that chose to
  continue to `/trash` (expires after 3 minutes and is always cleared on
  first sight)

None of this is transmitted to us or anyone else by the tool, except the
wallet token, which is sent to Sylphx only to check your balance and pay for a
restore you confirmed.

On install the browser opens our landing page's how-to section in a tab, and on
uninstall it opens a short "why did you leave" page. These are ordinary pages
opened by the browser, not network calls by the tool. The uninstall address
carries only the extension version, and the site measures visits only after you
accept its cookie banner.

## Permissions

- **`storage`** — saves your preferences, the Pro token and the transient
  empty-trash flag (local and browser sync storage).
- **Host access to `https://photos.google.com/*`** — required to interact
  with the Google Photos interface. The tool only runs on this domain.
  Find duplicates fetches thumbnails from Google's image servers with the
  page's own access rules; it needs no extra permission. AI 4K Restore adds
  no permission either.

The content script is declared directly for the single supported domain.

## Effects on Your Google Photos Account

The tool deletes photos from your account on your behalf. Deleted photos
move to the Google Photos **Trash**, where they remain for 60 days before
permanent deletion (Google's standard policy). You can restore anything
from the trash during that window.

If you enable **"Empty trash"**, the tool navigates to
`photos.google.com/trash` after the main run and clicks "Empty trash" +
confirms — photos cleared this way are permanently gone with no recovery
window. This option is opt-in, requires your consent, and is only reported
complete after the empty state is verified. Use it with caution.

## Third-Party Services

Scanning, duplicate finding, blur detection and deleting use no third-party
service. No analytics, no telemetry, no remote logging. The only service the
tool contacts is Sylphx AI, and only for AI 4K Restore as described above
(with its paid, no-training inference provider). The **Report
issue** button opens GitHub's issue page with a diagnostic description
that you choose to submit.

## Children's Privacy

The tool is not directed at children under 13 and does not knowingly
collect personal information from anyone under 13.

## Changes to This Policy

If this policy changes, we will update it here with a new "Last updated"
date.

## Contact

For questions, open an issue at
<https://github.com/SylphxAI/Google-Photos-Delete-Tool/issues> or email
<hi@sylphx.com>. Security reports go through the repository's
[security advisories](https://github.com/SylphxAI/Google-Photos-Delete-Tool/security/advisories/new).

The website and Pro purchases are covered by the site privacy notice: https://sylphxai.github.io/Google-Photos-Delete-Tool/privacy.html
