# Duplicate grouping responsiveness

Grouping yields during index construction, candidate traversal and group
materialization using the existing 12 ms work slice. Cancellation is checked
before item access and at each checkpoint. Band extraction uses shifts and masks;
group membership, similarity order and best-item choice retain the same rules.

Run the read-only browser benchmark from the repository root:

```sh
bun scripts/bench/grouping.ts --out grouping.json
# Compare another revision's group.ts and its adjacent phash.ts:
bun scripts/bench/grouping.ts --source /path/to/group.ts --out before.json
# Run the built userscript on generated local images, including consent refusal:
bun run build
node scripts/dupes-demo.mjs --read-only-check --no-screenshot
```

All browser requests in the grouping benchmark are blocked. The userscript check
intercepts the Google Photos page and image requests locally and blocks all other
hosts. It scans, displays review, and attempts the consent refusal with the box
unchecked; it never selects or moves an item. `--check` is a separate synthetic
fixture mode and cannot be combined with `--read-only-check`.

## Measurement on 2026-10-30

Chromium 156.0.8078.47 on the shared development host; three fresh-page trials per
fixture at the default 95% threshold. Baseline is master
`58bc21db67828ca2d8cac46c46a19de48baffee8`. Before and after runs completed at
08:51:41Z and 08:52:10Z. These are synthetic measurements, not customer usage or
real-device/RUM evidence. Production library sizes and usage remain unknown.

Medians in milliseconds:

| Fixture | Items | First yield before → after | Longest slice before → after | Stop before → after | Total before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random | 3,000 | sometimes finished first → 12.3 | 25.4 → 12.3 | 11.9 → 12.1 | 32.6 → 15.9 |
| Random | 30,000 | 79.6 → 16.1 | 79.6 → 16.1 | 48.2 → 16.8 | 162.2 → 124.0 |
| Random | 300,000 | 359.0 → 12.3 | 359.0 → 17.1 | 270.8 → 15.9 | 2,450.5 → 2,817.8 |
| Shared hash bands | 5,000 | 38.9 → 12.3 | 42.4 → 12.6 | 35.5 → 16.0 | 657.1 → 605.5 |
| One identical group | 300,000 | 262.3 → 11.8 | 262.3 → 15.9 | 263.4 → 16.6 | 274.1 → 137.3 |

The maximum after-change slice across all 15 trials was 22.8 ms. Yielding adds
scheduling overhead: the largest random fixture took 15% longer overall while
returning control and honoring Stop much sooner. Shared-host timings and garbage
collection vary; 12 ms is a work-slice target, not a hard real-time guarantee.
The large native sort remains synchronous, and memory still grows with the
number of items and hash bands. No peak-memory reduction is claimed.

Group summaries matched before/after for all benchmark trials. Tests additionally
compare full group membership/order to brute force for all 65 Hamming-distance
cutoffs, retain the original golden fixtures, and exercise cancellation during
index construction and inside a dense candidate bucket. The actual built
userscript fixture found eight candidates and refused the unchecked-consent
attempt, leaving all 36 tiles present, none selected and none moved.
