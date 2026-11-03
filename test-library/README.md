# GPDT test library

Synthetic photo library for live-testing the Google Photos Delete Tool (GPDT) on a **disposable** Google account. Everything is generated: no real photos, no people.

Moved here from the standalone `SylphxAI/gpdt-test-library` repository (archived; its v1 release below stays downloadable).

Legacy download: [gpdt-test-library-v1.zip](https://github.com/SylphxAI/gpdt-test-library/releases/download/v1/gpdt-test-library-v1.zip) (SHA-256 is in the [release notes](https://github.com/SylphxAI/gpdt-test-library/releases/tag/v1)). This archived release is not rebuilt by dependency updates here; regenerate below to test the current revision. Its historical hash need not match a newly generated archive.

## What is inside (60 files)

| Kind | Count | Details |
| --- | --- | --- |
| Distinct photos | 40 | `GPDT_001.jpg` to `GPDT_040.jpg`, JPEG 1600x1200, big number label, EXIF Make/Model `GPDT Test` |
| Near-duplicate variants | 12 | `_half` (800x600, Lanczos), `_q60` (1600x1200, JPEG quality 60), `_crop` (1568x1176, 1% removed from each edge); same camera EXIF and capture date as the original |
| Screenshots | 6 | `Screenshot_2024-03-01.png` to `-06.png`, PNG 1170x2532, no camera EXIF |
| Videos | 2 | `GPDT_clip_1.mp4` (SMPTE bars), `GPDT_clip_2.mp4` (test pattern), H.264/yuv420p 640x360, 25 fps, 75 frames/3 s; creation_time 2021-06-11 and 2021-07-12 at 10:00 UTC |

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

Originals and half/crop variants use JPEG quality 92. JPEG EXIF includes Make/Model `GPDT Test` and matching DateTime, DateTimeOriginal and DateTimeDigitized. File modified times are set to the capture date **in UTC**, independent of the host timezone; screenshots use 12:00 UTC on the date in the filename.

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

Generation and verification are entirely local/offline after installing dependencies: they do not sign in, upload anything, run GPDT, or establish Google Photos selector/release health.

Requirements:

- **Python 3.11 or newer** (Pillow 13 dropped Python 3.10; verified with Python 3.13.5).
- **Pillow==13.0.0**, pinned in `requirements.txt`.
- `ffmpeg` with the **libx264** encoder on `PATH`. Verification also needs `ffprobe` (normally included with ffmpeg).
- **DejaVu Sans Bold** at `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` or `/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf`. No substitute font is used.

For example, on Debian/Ubuntu, install the system dependencies with `sudo apt-get install python3-venv ffmpeg fonts-dejavu-core` (and a supported Python interpreter). From the repository root:

```sh
cd test-library
python3 --version                            # must be >= 3.11
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt     # Pillow==13.0.0
python generate.py                           # replaces out/ and gpdt-test-library-v1.zip
```

The command succeeds only for the complete library, including both videos. Missing ffmpeg/libx264 or the required font fails before replacing existing outputs; videos are never silently skipped. A later encoding or filesystem failure also exits nonzero and must not be treated as a usable library.

Output is seeded and reproducible **in the same environment**: use the same Python, Pillow, JPEG/zlib/FreeType libraries, DejaVu font bytes, and ffmpeg/libx264 build. This is not a promise of byte identity across different builds or with the legacy release. ZIP entries are sorted, uncompressed, and use fixed timestamps and permissions; the archive contains exactly the 60 files under `out/`.

## Verify the current revision

With the environment above activated, still in `test-library/`:

```sh
python verify.py --receipt /tmp/gpdt-fixture-receipt.json
```

This replaces the outputs with **two clean regenerations** using `python generate.py` and fails unless all 60 file hashes and the ZIP hash match. It checks the exact filenames/counts, image formats/dimensions/JPEG quality, camera EXIF, year distribution and all eight duplicate dates/family relationships (including pixel similarity), UTC modified times, decodable video streams/duration/creation metadata, and ZIP entries/bytes/metadata. Missing ffmpeg, libx264 and font are also tested to fail without destroying previous output. It does not access Google Photos.

The JSON receipt (also printed to stdout) records the checkout revision and tracked-worktree state, environment/font versions and hash, commands and exit codes, per-file SHA-256 hashes, ZIP SHA-256, capture stamps and category counts. `manifest_sha256` hashes the UTF-8 bytes of Python's `json.dumps(file_sha256, sort_keys=True)`; it is a digest of the file-hash mapping, not the ZIP. Run this check whenever the generator or its dependencies change and keep the receipt with your test results; the repository's JavaScript CI does not run this verifier, and a passing JavaScript build alone does not verify this library.
