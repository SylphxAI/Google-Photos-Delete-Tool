#!/usr/bin/env python3
"""Offline acceptance: regenerate twice, validate the contract, and emit a JSON receipt."""
import argparse
import hashlib
import io
import json
import platform
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import PIL
from PIL import Image, ImageChops, ImageStat, features

import generate

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
ZIP = ROOT / "gpdt-test-library-v1.zip"
# Independent of the generator's constants: changing it must not weaken this contract.
FAMILIES = {
    3: ("2019-11-04", ("half", "q60")),
    8: ("2019-12-31", ("crop",)),
    13: ("2019-12-30", ("half", "q60")),
    18: ("2021-07-10", ("crop",)),
    23: ("2021-01-14", ("half", "q60")),
    28: ("2024-04-10", ("crop",)),
    33: ("2024-09-08", ("half", "q60")),
    38: ("2024-09-17", ("crop",)),
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout


def check_mtime(path, dt):
    require(path.stat().st_mtime == dt.timestamp(), f"{path.name}: capture mtime must be UTC")


def quantization(quality):
    data = io.BytesIO()
    Image.new("RGB", (8, 8)).save(data, "JPEG", quality=quality)
    data.seek(0)
    with Image.open(data) as image:
        return image.quantization


def validate():
    originals = {f"GPDT_{n:03d}.jpg" for n in range(1, 41)}
    variants = {f"GPDT_{n:03d}_{v}.jpg" for n, (_, vs) in FAMILIES.items() for v in vs}
    screenshots = {f"Screenshot_2024-03-0{n}.png" for n in range(1, 7)}
    videos = {f"GPDT_clip_{n}.mp4" for n in (1, 2)}
    names = originals | variants | screenshots | videos
    require({p.name for p in OUT.iterdir()} == names, "expected exactly the documented 60 files")
    years = {kind: Counter() for kind in ("originals", "variants", "screenshots", "videos")}
    stamps = {}
    for name in sorted(originals | variants):
        p = OUT / name
        kind = name.removesuffix(".jpg").split("_")
        variant = kind[2] if len(kind) == 3 else None
        with Image.open(p) as image:
            image.load()
            size = {None: (1600, 1200), "half": (800, 600),
                    "q60": (1600, 1200), "crop": (1568, 1176)}[variant]
            require(image.format == "JPEG" and image.size == size, f"{name}: JPEG dimensions")
            require(image.quantization == quantization(60 if variant == "q60" else 92),
                    f"{name}: JPEG quality")
            exif = image.getexif()
            require(exif.get(0x010F) == exif.get(0x0110) == "GPDT Test", f"{name}: camera EXIF")
            stamp = exif.get_ifd(0x8769).get(0x9003)
            require(stamp and stamp == exif.get_ifd(0x8769).get(0x9004) == exif.get(0x0132),
                    f"{name}: original/digitized/modified EXIF dates")
            dt = datetime.strptime(stamp, "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
            stamps[name] = stamp
            check_mtime(p, dt)
            years["variants" if variant else "originals"][str(dt.year)] += 1
            if not variant:
                n = int(kind[1])
                require(dt.year == (2019 if n <= 14 else 2021 if n <= 27 else 2024),
                        f"{name}: original capture year")

    relationships = {}
    for n, (date, vs) in FAMILIES.items():
        base = f"GPDT_{n:03d}"
        stamp = stamps[base + ".jpg"]
        require(stamp[:10].replace(":", "-") == date, f"{base}: documented family date")
        with Image.open(OUT / (base + ".jpg")) as original:
            for variant in vs:
                name = f"{base}_{variant}.jpg"
                require(stamps[name] == stamp, f"{name}: must retain original capture date")
                expected = original
                if variant == "half":
                    expected = original.resize((800, 600), Image.Resampling.LANCZOS)
                elif variant == "crop":
                    expected = original.crop((16, 12, 1584, 1188))
                with Image.open(OUT / name) as image:
                    rms = ImageStat.Stat(ImageChops.difference(expected, image)).rms
                    # Both files are lossy JPEGs of the same pre-encoding scene.
                    require(max(rms) < 4, f"{name}: not a near-duplicate of {base}")
                    relationships[name] = {"original": base + ".jpg", "channel_rms": rms}

    for n in range(1, 7):
        p = OUT / f"Screenshot_2024-03-0{n}.png"
        with Image.open(p) as image:
            image.load()
            require(image.format == "PNG" and image.size == (1170, 2532), f"{p.name}: PNG dimensions")
            require(not image.getexif(), f"{p.name}: screenshots must not have EXIF")
        check_mtime(p, datetime(2024, 3, n, 12, tzinfo=timezone.utc))
        years["screenshots"]["2024"] += 1

    for n in (1, 2):
        p = OUT / f"GPDT_clip_{n}.mp4"
        info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                               "-of", "json", str(p)]))
        require(len(info["streams"]) == 1, f"{p.name}: expected one video stream")
        stream = info["streams"][0]
        require((stream["codec_name"], stream["width"], stream["height"], stream["pix_fmt"],
                 stream["avg_frame_rate"], stream["nb_frames"]) ==
                ("h264", 640, 360, "yuv420p", "25/1", "75"), f"{p.name}: video format")
        require(float(info["format"]["duration"]) == 3, f"{p.name}: video duration")
        dt = datetime(2021, 5 + n, 10 + n, 10, tzinfo=timezone.utc)
        for tags in (info["format"]["tags"], stream["tags"]):
            actual = datetime.fromisoformat(tags["creation_time"].replace("Z", "+00:00"))
            require(actual == dt, f"{p.name}: creation_time")
        check_mtime(p, dt)
        run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "null", "-"])
        years["videos"]["2021"] += 1

    require(years == {"originals": {"2019": 14, "2021": 13, "2024": 13},
                      "variants": {"2019": 5, "2021": 3, "2024": 4},
                      "screenshots": {"2024": 6}, "videos": {"2021": 2}}, "capture-year distribution")
    with zipfile.ZipFile(ZIP) as archive:
        require(archive.namelist() == ["out/" + n for n in sorted(names)], "ZIP entries and order")
        require(archive.testzip() is None, "ZIP CRC")
        for entry in archive.infolist():
            require(entry.date_time == (2024, 1, 1, 0, 0, 0) and
                    entry.compress_type == zipfile.ZIP_STORED and entry.create_system == 3 and
                    entry.external_attr == 0o644 << 16, f"{entry.filename}: ZIP metadata")
            require(archive.read(entry) == (OUT / Path(entry.filename).name).read_bytes(),
                    f"{entry.filename}: ZIP bytes")
    hashes = {name: sha256(OUT / name) for name in sorted(names)}
    require(len({hashes[n] for n in originals}) == 40, "40 distinct originals")
    require(len(set(hashes.values())) == 60, "no byte-identical files")
    return {"counts": {"originals": 40, "variants": 12, "screenshots": 6, "videos": 2, "total": 60},
            "capture_years": years, "capture_stamps": stamps, "duplicate_relationships": relationships,
            "file_sha256": hashes, "zip_sha256": sha256(ZIP),
            "manifest_sha256": hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()}


def check_preflight():
    """Missing dependencies fail closed, preserving any previous output and archive."""
    with tempfile.TemporaryDirectory() as tmp:
        out, archive = Path(tmp) / "out", Path(tmp) / "library.zip"
        out.mkdir()
        (out / "sentinel").write_bytes(b"previous complete library")
        archive.write_bytes(b"previous complete archive")
        failures = [
            ("ffmpeg", patch.object(generate.shutil, "which", return_value=None)),
            ("libx264", patch.object(generate.subprocess, "run", return_value=
                                     subprocess.CompletedProcess([], 0, stdout="no encoders"))),
            ("font", patch.object(generate, "FONT_PATHS", ())),
        ]
        with patch.object(generate, "OUT", out), patch.object(generate, "ZIP", archive):
            for label, dependency in failures:
                with dependency:
                    try:
                        generate.main()
                    except RuntimeError:
                        pass
                    else:
                        raise RuntimeError(f"missing {label} must fail")
                require(list(out.iterdir()) == [out / "sentinel"] and
                        (out / "sentinel").read_bytes() == b"previous complete library" and
                        archive.read_bytes() == b"previous complete archive", f"{label}: preserve outputs")
    return ["missing ffmpeg", "missing libx264", "missing font"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, help="also save the full JSON receipt to this path")
    args = parser.parse_args()
    require(sys.version_info >= (3, 11), "Pillow 13 requires Python 3.11 or newer")
    require("Pillow==" + PIL.__version__ == (ROOT / "requirements.txt").read_text().strip(),
            "install the pinned requirements.txt first")
    require(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg and ffprobe are required")
    negative_checks = check_preflight()
    runs, commands = [], []
    for _ in range(2):
        # Real documented command, in the checkout, with no previous artifacts.
        if OUT.exists():
            shutil.rmtree(OUT)
        ZIP.unlink(missing_ok=True)
        started = datetime.now(timezone.utc).isoformat()
        stdout = run([sys.executable, "generate.py"], cwd=ROOT)
        runs.append(validate())
        commands.append({"command": [sys.executable, "generate.py"], "cwd": str(ROOT),
                         "started_at": started, "exit_code": 0, "stdout": stdout.strip()})
    require(runs[0] == runs[1], "two clean runs differ")
    font = next(Path(p) for p in generate.FONT_PATHS if Path(p).exists())
    receipt = {"result": "pass", "completed_at": datetime.now(timezone.utc).isoformat(),
               "revision": run(["git", "rev-parse", "HEAD"], cwd=ROOT).strip(),
               "tracked_worktree_clean": not run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT).strip(),
               "environment": {"platform": platform.platform(), "python": sys.version,
                               "pillow": PIL.__version__, "jpeg": features.version("jpg"),
                               "libjpeg_turbo": features.version("libjpeg_turbo"),
                               "zlib": features.version("zlib"), "freetype": features.version("freetype2"),
                               "font": str(font), "font_sha256": sha256(font),
                               "ffmpeg": run(["ffmpeg", "-version"]).splitlines()[0],
                               "ffmpeg_build": run(["ffmpeg", "-version"]).strip(),
                               "ffprobe": run(["ffprobe", "-version"]).splitlines()[0]},
               "negative_checks": negative_checks, "commands": commands,
               "identical_clean_runs": 2, "artifacts": runs[0]}
    text = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if args.receipt:
        args.receipt.write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
