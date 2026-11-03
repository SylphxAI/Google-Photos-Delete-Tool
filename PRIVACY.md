# Privacy Policy — Google Photos Delete Tool

**Last updated:** 2026-10-29

## Overview

Google Photos Delete Tool is a browser extension and userscript that helps
you find duplicate photos and bulk-delete photos in Google Photos. Your privacy is the product's
core promise: **photo and library information stays on your device**.
The tool stores the preferences and licence you choose to save, as described below;
there is no analytics, telemetry or remote licence check in the client.

## Data Collection

We do not collect your photo/library information or send it to our servers. Specifically:

- No personally identifiable information is collected
- No photo data leaves your browser
- No analytics or tracking is used
- No data is sent to external servers
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
anyone else. The tool contacts no other server.

On your request, the tool stores **locally**:

- Your preferences (batch size, dry-run, empty-trash, filter) in
  `chrome.storage.local` / `localStorage`
- Your Pro token in `chrome.storage.local` and `chrome.storage.sync`, so Pro
  follows your browser sign-in (the browser's own sync, under your Google
  account's sync settings; we never receive it)
- A short-lived "pending empty-trash" flag after a run that chose to
  continue to `/trash` (expires after 3 minutes and is always cleared on
  first sight)

None of this is transmitted to us or anyone else by the tool.

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
  page's own access rules; it needs no extra permission.

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

This tool does not integrate with or send data to any third-party
services. No analytics, no telemetry, no remote logging. The **Report
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
