# Photo recovery limits

## Current public guidance

Restoration is possible only while photos or videos remain in Google Photos
Trash and Google's current retention policy allows it. This tool does not
provide or extend a recovery window. To restore eligible items on a computer,
open Google Photos, open **Trash**, select the items and choose **Restore**.
**Empty Trash and any permanent deletion cannot be undone.** If Trash is full,
Google may offer permanent deletion instead; do not approve it if you need
the option to restore. Keep independent backups before deleting.

Official Google Photos Help, desktop version, checked **2026-10-29**:

- [Delete photos & videos](https://support.google.com/photos/answer/6128858?hl=en&co=GENIE.Platform%3DDesktop)
  returned HTTP 200 at 09:53:00 UTC. It stated that deleted photos and videos
  stay in Trash for 30 days, permanently deleted items cannot be restored,
  and a full Trash can produce a permanent-delete prompt. Emptying Trash
  permanently deletes its contents.
- [Restore recently deleted photos & videos](https://support.google.com/photos/answer/9343482?hl=en&co=GENIE.Platform%3DDesktop)
  returned HTTP 200 at 09:53:00 UTC. It described the current retention policy
  and required the items to remain in Trash, to have been moved there less
  than 30 days ago, and not to have been emptied or permanently deleted. It
  also notes that inactivity for two years or more may lead to content
  deletion and that backup settings matter when finding missing items.

Those are dated observations, **not a new fixed recovery guarantee**. Follow
Google's linked current policy and the state of the person's Trash. Do not
infer eligibility from elapsed time alone, promise support can recover a
permanently deleted item, or recommend emptying Trash as a recovery step.
The public landing pages deliberately do not substitute a different fixed
number for the old unsupported guarantee.

## Delivery boundaries

This correction covers the ten public landing-page languages (English,
German, Spanish, French, Italian, Japanese, Dutch, Brazilian Portuguese,
Simplified Chinese and Traditional Chinese), their metadata and structured
data, public terms, README and support reply guidance. `/recover` recovers a
**Pro licence**, not deleted photos; its checkout and licence workflow is
unchanged.

The already published extension and store listing are **outside this
website-only delivery**. Remaining conflicting recovery wording is present
in the extension locale descriptions (`_locales/*/messages.json`), extension
UI (`src/ui/panel/panel.ts`, `src/ui/dupes/finder.ts`) and store listing source
(`storefront/listing.json`). These files and their published counterparts
were not updated or submitted here; they still need a separately authorized
copy/release correction. Do not claim this website deployment fixes them.

No extension or live Google Photos run, Google account/library/session,
package release, store submission, checkout, merchant or licence mutation,
or new spending is part of this work. Store identity/URLs, the public
US$9.99 offer, Free/Pro behavior, consent and destructive safeguards stay
unchanged. Licence-error locale work, CI concurrency work and the synthetic
library dependency work are not touched.
