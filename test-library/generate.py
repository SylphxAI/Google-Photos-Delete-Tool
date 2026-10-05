#!/usr/bin/env python3
"""Deterministic synthetic photo library for GPDT live tests. Writes out/ and the zip."""
import os, random, shutil, subprocess, zipfile, calendar
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
ZIP = ROOT / "gpdt-test-library-v1.zip"
W, H = 1600, 1200
YEARS = [2019] * 14 + [2021] * 13 + [2024] * 13  # 40 photos
DUP_SOURCES = [2, 7, 12, 17, 22, 27, 32, 37]      # 8 groups
rng = random.Random(20261001)


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def color():
    return tuple(rng.randint(30, 235) for _ in range(3))


def scene(n):
    top, bot = color(), color()
    img = Image.new("RGB", (W, H))
    px = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        px.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(14):
        x, y, s = rng.randint(0, W), rng.randint(0, H), rng.randint(80, 380)
        c = color() + (rng.randint(110, 220),)
        kind = rng.choice(("ellipse", "rect", "poly"))
        if kind == "ellipse":
            d.ellipse([x, y, x + s, y + int(s * rng.uniform(.5, 1.3))], fill=c)
        elif kind == "rect":
            d.rectangle([x, y, x + s, y + int(s * rng.uniform(.5, 1.3))], fill=c)
        else:
            d.polygon([(x, y), (x + s, y + rng.randint(0, s)), (x + rng.randint(0, s), y + s)], fill=c)
    f = font(560)
    label = f"{n:02d}"
    bb = d.textbbox((0, 0), label, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    pos = ((W - tw) // 2 - bb[0], (H - th) // 2 - bb[1])
    d.text((pos[0] + 8, pos[1] + 8), label, font=f, fill=(0, 0, 0, 120))
    d.text(pos, label, font=f, fill=(255, 255, 255, 255))
    return img


def exif(dt):
    ex = Image.Exif()
    ex[0x010F] = "GPDT Test"
    ex[0x0110] = "GPDT Test"
    stamp = dt.strftime("%Y:%m:%d %H:%M:%S")
    ex[0x0132] = stamp
    sub = ex.get_ifd(0x8769)
    sub[0x9003] = stamp
    sub[0x9004] = stamp
    return ex


def touch(path, dt):
    ts = dt.timestamp()
    os.utime(path, (ts, ts))


def save_jpeg(img, name, dt, quality=92):
    p = OUT / name
    img.save(p, "JPEG", quality=quality, exif=exif(dt), optimize=False)
    touch(p, dt)


def main():
    from datetime import datetime
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for i, year in enumerate(YEARS):
        n = i + 1
        month = rng.randint(1, 12)
        day = rng.randint(1, calendar.monthrange(year, month)[1])
        dt = datetime(year, month, day, rng.randint(8, 19), rng.randint(0, 59), rng.randint(0, 59))
        img = scene(n)
        base = f"GPDT_{n:03d}"
        save_jpeg(img, base + ".jpg", dt)
        if i in DUP_SOURCES:
            k = DUP_SOURCES.index(i)
            variants = ["half", "q60", "crop"] if False else (["half", "q60"] if k % 2 == 0 else ["crop"])
            for v in variants:
                if v == "half":
                    save_jpeg(img.resize((W // 2, H // 2), Image.LANCZOS), f"{base}_half.jpg", dt)
                elif v == "q60":
                    save_jpeg(img, f"{base}_q60.jpg", dt, quality=60)
                else:
                    mx, my = int(W * .01), int(H * .01)
                    save_jpeg(img.crop((mx, my, W - mx, H - my)), f"{base}_crop.jpg", dt)
    # screenshots: PNG, no EXIF
    for n in range(1, 7):
        img = Image.new("RGB", (1170, 2532), (245, 246, 250))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, 1170, 140], fill=(30, 40, 60))
        d.text((60, 40), f"9:4{n}", font=font(60), fill="white")
        d.rectangle([0, 140, 1170, 330], fill=color())
        d.text((60, 200), f"Screenshot {n}", font=font(80), fill="white")
        y = 380
        for _ in range(7):
            h = rng.randint(180, 280)
            d.rounded_rectangle([50, y, 1120, y + h], 36, fill=color())
            d.rounded_rectangle([90, y + 40, 90 + rng.randint(300, 800), y + 80], 12, fill=(255, 255, 255))
            d.rounded_rectangle([90, y + 110, 90 + rng.randint(200, 600), y + 140], 12, fill=(235, 235, 235))
            y += h + 40
        d.rounded_rectangle([385, 2440, 785, 2460], 10, fill=(40, 40, 40))
        p = OUT / f"Screenshot_2024-03-0{n}.png"
        img.save(p, "PNG")
        touch(p, datetime(2024, 3, n, 12, 0, 0))
    # videos
    if shutil.which("ffmpeg"):
        for n, src in ((1, "smptebars"), (2, "testsrc2")):
            p = OUT / f"GPDT_clip_{n}.mp4"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                            "-i", f"{src}=size=640x360:rate=25:duration=3",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1",
                            "-fflags", "+bitexact", "-flags:v", "+bitexact",
                            "-metadata", f"creation_time=2021-0{5 + n}-1{n}T10:00:00Z",
                            "-movflags", "+faststart", str(p)], check=True)
            touch(p, datetime(2021, 5 + n, 10 + n, 10, 0, 0))
    else:
        print("ffmpeg not found: videos skipped")
    # zip, sorted, fixed timestamps
    if ZIP.exists():
        ZIP.unlink()
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_STORED) as z:
        for f in sorted(OUT.iterdir()):
            zi = zipfile.ZipInfo(f"out/{f.name}", (2024, 1, 1, 0, 0, 0))
            zi.external_attr = 0o644 << 16
            z.writestr(zi, f.read_bytes())
    print(len(list(OUT.iterdir())), "files in", OUT)


main()
