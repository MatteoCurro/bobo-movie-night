#!/usr/bin/env python3
"""Make Flaticon animated GIF previews transparent + monochrome at BUILD time.

A CSS brightness() filter recolors opaque GIF backgrounds too, producing a
square. We remove the corner-colored matte in every frame before recoloring.
Any ambiguous frame/asset is omitted instead of publishing a solid square.

All source credits and item links remain in the manifest. No paid APIs.
"""
from __future__ import annotations
import json
from pathlib import Path
from statistics import median

from PIL import Image, ImageSequence

ROOT = Path("assets/flaticon")
MANIFEST = ROOT / "manifest.json"
INK = (191, 219, 215)
MAX_FRAMES = 350
SIZE = 128


def background_color(rgba):
    w, h = rgba.size
    sample = [
        rgba.getpixel((0, 0)), rgba.getpixel((w-1, 0)),
        rgba.getpixel((0, h-1)), rgba.getpixel((w-1, h-1)),
    ]
    return tuple(int(median([v[i] for v in sample])) for i in range(4))


def mono_frame(frame):
    image = frame.convert("RGBA")
    image.thumbnail((SIZE, SIZE), Image.Resampling.LANCZOS)
    bg = background_color(image)
    pixels = list(image.getdata())
    # GIF palette transparency is frequently missing or inconsistent; infer a
    # matte from the four corners and preserve genuine transparency if present.
    indices = []
    solid = 0
    for r, g, b, a in pixels:
        diff = max(abs(r-bg[0]), abs(g-bg[1]), abs(b-bg[2]))
        opaque = a > 75 and (diff > 45 if bg[3] > 75 else a > 75)
        indices.append(1 if opaque else 0)
        solid += int(opaque)
    ratio = solid / max(1, len(indices))
    if not 0.002 < ratio < 0.68:
        raise ValueError(f"Ambiguous icon (solid coverage {ratio:.1%})")
    pal = Image.new("P", image.size)
    palette = [0, 0, 0, *INK] + [0]* (256*3-6)
    pal.putpalette(palette)
    pal.putdata(indices)
    pal.info["transparency"] = 0
    return pal


def build_one(src, dst):
    with Image.open(src) as original:
        duration = []
        frames = []
        for count, frame in enumerate(ImageSequence.Iterator(original)):
            if count >= MAX_FRAMES:
                break
            duration.append(max(40, int(frame.info.get("duration", original.info.get("duration", 100)) or 100)))
            frames.append(mono_frame(frame))
        if len(frames) < 2:
            raise ValueError("Not an animated GIF")
        dst.parent.mkdir(parents=True, exist_ok=True)
        frames[0].save(
            dst, save_all=True, append_images=frames[1:], loop=0,
            duration=duration, transparency=0, disposal=2, optimize=False,
        )
    with Image.open(dst) as check:
        assert getattr(check, "n_frames", 1) > 1, "Animation lost"
        rgba=check.convert("RGBA")
        assert rgba.getpixel((0,0))[3] == 0, "Background not transparent"
        assert sum(p[3]>0 for p in rgba.getdata())>0, "Empty output"


def main():
    manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
    accepted=[]
    for icon in manifest.get("icons", []):
        name=icon.get("name","")
        raw=ROOT/f"{name}.gif"
        target=ROOT/"mono"/f"{name}.gif"
        if not raw.exists():
            print(f"Skip {name}: no original")
            continue
        try:
            build_one(raw,target)
            icon["file"]="assets/flaticon/mono/"+name+".gif"
            accepted.append(icon)
            print(f"Transparent mono animation: {name} ({target.stat().st_size} bytes)")
        except Exception as error:
            print(f"Skip {name}: {type(error).__name__}: {str(error)[:130]}")
            target.unlink(missing_ok=True)
    manifest["icons"]=accepted
    if len(accepted) < 2:
        raise RuntimeError("Too few valid transparent animated previews")
    MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(f"Transparent Flaticon GIFs ready: {len(accepted)}")


if __name__=="__main__":
    main()
