# GPDT test library

Synthetic photo library for live-testing the Google Photos Delete Tool (GPDT) on a **disposable** Google account. Everything is generated: no real photos, no people.

Moved here from the standalone `SylphxAI/gpdt-test-library` repository (archived; its v1 release below stays downloadable).

Download: [gpdt-test-library-v1.zip](https://github.com/SylphxAI/gpdt-test-library/releases/download/v1/gpdt-test-library-v1.zip) (SHA-256 is in the [release notes](https://github.com/SylphxAI/gpdt-test-library/releases/tag/v1)).

## What is inside (60 files)

| Kind | Count | Details |
| --- | --- | --- |
| Distinct photos | 40 | `GPDT_001.jpg` to `GPDT_040.jpg`, JPEG 1600x1200, big number label, EXIF Make/Model `GPDT Test` |
| Near-duplicate variants | 12 | `_half` (50% size), `_q60` (JPEG quality 60), `_crop` (2% crop); same EXIF date as the original |
| Screenshots | 6 | `Screenshot_2024-03-01.png` to `-06.png`, PNG 1170x2532, no camera EXIF |
| Videos | 2 | `GPDT_clip_1.mp4`, `GPDT_clip_2.mp4`, 3 s colour bars, creation_time in 2021 |

Items per capture year (originals + variants + others):

| Year | Photos | Variants | Videos | Screenshots | Total |
| --- | --- | --- | --- | --- | --- |
| 2019 | 14 | 5 | 0 | 0 | **19** |
| 2021 | 13 | 3 | 2 | 0 | **18** |
| 2024 | 13 | 4 | 0 | 6 | **23** |

Duplicate groups (8; original plus variants):

| Group | Original (EXIF date) | Variants |
| --- | --- | --- |
| 1 | `GPDT_003` (2019-11-04) | `_half`, `_q60` |
| 2 | `GPDT_008` (2019-12-31) | `_crop` |
| 3 | `GPDT_013` (2019-12-30) | `_half`, `_q60` |
| 4 | `GPDT_018` (2021-07-10) | `_crop` |
| 5 | `GPDT_023` (2021-01-14) | `_half`, `_q60` |
| 6 | `GPDT_028` (2024-04-10) | `_crop` |
| 7 | `GPDT_033` (2024-09-08) | `_half`, `_q60` |
| 8 | `GPDT_038` (2024-09-17) | `_crop` |

File modified times are also set to the capture date.

## How to use

1. Create or pick a **disposable** Google account (never a real library).
2. Unzip the archive and upload the whole `out/` folder at <https://photos.google.com>.
3. Wait for Google Photos to finish processing (counts and duplicate grouping settle after a while).
4. Run GPDT against it. Expected results:
   - Dry run with "before 2021-01-01" matches the 2019 items (19).
   - Find duplicates finds the 8 groups above.
   - The type filter finds the 6 screenshots.

Caveat: Google decides what counts as a "screenshot" or a video itself, and how it dates items, so these counts are expectations, not guarantees.

## Regenerate

```
python3 -m pip install -r requirements.txt   # Pillow==12.3.0
python3 generate.py                          # writes out/ and gpdt-test-library-v1.zip
```

Output is seeded and deterministic: the same Pillow and ffmpeg produce identical files. The videos need `ffmpeg` (libx264) on PATH; without it they are skipped.
