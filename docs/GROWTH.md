# Growth and distribution

Goal: more users, reviews, stars and Pro orders for the least effort per
channel. Stars follow real users, so the loop to grow is:

```
store listing -> installs -> reviews -> store ranking -> more installs
      ^                                        ^
   content (Reddit / HN / YouTube / ...)   GitHub stars follow real users
```

## Discoverability

- GitHub topics (`google-photos`, `chrome-extension`, `firefox-extension`,
  `userscript`, `tampermonkey`, `violentmonkey`, `delete-photos`,
  `photo-management`, `privacy`, `open-source`, `typescript`), a keyword-rich
  description, and the Chrome Web Store listing as homepage.
- Store copy is written once in `storefront/listing.json` and pushed with
  `gh workflow run "Update CWS Listing (manual)"`. Screenshots follow
  [storefront/README.md](../storefront/README.md).
- Store coverage and automation: [STORE_AUTOMATION.md](STORE_AUTOMATION.md).

## Content

Value first, promotion second: about 10% self-promotion on Reddit, Show HN only
for a product the submitter uses, no astroturfing. Drafts live in
`storefront/posts/`.

1. **Reddit:** `r/googlephotos` walkthroughs and answers to "how do I delete
   everything?"; `r/privacy` and `r/degoogle` (consent-gated, zero-server, local
   Pro verification); `r/DataHoarder` (bulk reclaiming of storage).
2. **Show HN:** Tuesday 9am ET or a US Saturday, with an author comment on why
   it exists, how it stays safe and what the release gate measures.
3. **Product Hunt:** one launch, "Delete 10,000 Google Photos in minutes,
   safely", with Pro as the monetization tie-in.
4. **dev.to and #buildinpublic:** the fail-closed DOM automation story, with
   screenshots and real numbers.
5. **YouTube / Shorts:** a 30 to 60 second demo (dry run, run, trash), the
   highest-reach channel for a consumer tool.
6. **Q&A answers:** "How do I delete all photos from Google Photos?" answered
   helpfully with the tool as part of the answer; compounds through search.

## Compounding

- Awesome lists (`awesome-chrome-extensions`, `awesome-userscripts`,
  `awesome-privacy`, photo-management lists): each is a permanent backlink.
- Answer every store review; reviews and install velocity drive ranking.
- GitHub Trending follows star velocity, driven by real Reddit, HN and X posts.
- Newsletters (Hacker Newsletter, JavaScript Weekly, extension roundups) once
  the HN and dev.to posts exist.
- Pro is mentioned only as a feature ("delete only screenshots"), never as the
  pitch; the purchase flow is in [PRO.md](PRO.md).

## Metrics

| Signal | Where | Target |
|---|---|---|
| Installs and velocity | store dashboards | week-over-week growth after each channel |
| Store reviews | Chrome Web Store | 100% answered, rating 4.5 or higher |
| GitHub stars | repository | velocity spikes after posts |
| Pro orders | Stripe Checkout at buy.sylphx.com (Money) | first 10 orders |
| Referral sources | store and repository traffic | double down on the best channel |

Optimize the loop, not the star count: an install with a review is the loop.

### Reading Pro orders

Orders come from the Money/Stripe checkout at <https://buy.sylphx.com/buy/gpdt>
(self-serve, see [PRO.md](PRO.md#self-serve-checkout-and-sales)). Every Buy link
carries `utm_source=extension`, `utm_medium`
(the moment) and `utm_content` (paywall copy variant `a` or `b`). Export
Checkout sessions from the Stripe dashboard as CSV, then:

```
bun run growth:readout checkout_sessions.csv
```

It prints paid sessions, total sessions and revenue per
`utm_source` / `utm_medium` / `utm_content`. It reads that one file: no secrets
and no API calls. The CSV needs a Status or Payment Status column and the UTM
values as columns (`utm_source`, `metadata[utm_source]` or
`utm_source (metadata)`); sessions without UTM show as `(none)`. Divide by
installs as described in [PRO.md](PRO.md#conversion-test).
