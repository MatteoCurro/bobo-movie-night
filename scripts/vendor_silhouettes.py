#!/usr/bin/env python3
"""One-time vendoring of two verified public-domain silhouettes.

Source pages:
- https://www.svgrepo.com/svg/166696/climbing-silhouette (CC0)
- https://www.svgrepo.com/svg/21797/border-collie (CC0)

The downloaded glyphs are sanitized and repainted with the same single ink.
No background, gradients, labels or external references. If a provider becomes
unavailable, preserve the existing asset rather than causing a broken website.
"""
from __future__ import annotations
import copy
import re
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
FILES = [
    ("assets/bobo-climb.svg", "https://www.svgrepo.com/download/166696/climbing-silhouette.svg"),
    ("assets/bobo-faiva.svg", "https://www.svgrepo.com/download/21797/border-collie.svg"),
]
KEEP = {"g", "path", "polygon", "polyline", "line", "circle", "ellipse", "rect"}
ATTRS = {"d", "points", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height",
         "x1", "x2", "y1", "y2", "transform", "fill-rule", "clip-rule", "stroke-width"}
INK = "#cad6d3"

def repaint(node):
    tag = node.tag.rsplit("}", 1)[-1]
    if tag not in KEEP:
        return None
    output = ET.Element(f"{{{NS}}}{tag}")
    for key, value in node.attrib.items():
        attr = key.rsplit("}", 1)[-1]
        if attr in ATTRS and not re.search(r"url\(|javascript:|http", value, re.I):
            output.set(attr, value)
    if tag not in ("g",):
        output.set("fill", INK)
    else:
        output.set("fill", INK)
    for child in node:
        normalized = repaint(child)
        if normalized is not None:
            output.append(normalized)
    return output

def main():
    for name, url in FILES:
        path = Path(name)
        if path.exists() and 'data-bobo-silhouette="v1"' in path.read_text(encoding="utf-8"):
            print(f"CC0 silhouette already present: {name}")
            continue
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BoboMovieNight/1.0"})
            with urllib.request.urlopen(request, timeout=18) as response:
                raw = response.read(250_000)
            if len(raw) >= 250_000 or b"<svg" not in raw[:1500]:
                raise ValueError("Missing or oversized SVG response")
            source = ET.fromstring(raw)
            if source.tag.rsplit("}", 1)[-1] != "svg":
                raise ValueError("Downloaded document is not SVG")
            viewbox = source.get("viewBox")
            if not viewbox:
                w, h = source.get("width", "512"), source.get("height", "512")
                if not w.isdigit() or not h.isdigit():
                    raise ValueError("SVG has no usable viewBox")
                viewbox = f"0 0 {w} {h}"
            root = ET.Element(f"{{{NS}}}svg", {
                "viewBox": viewbox, "role": "img",
                "aria-hidden": "true", "data-bobo-silhouette": "v1"
            })
            for child in source:
                out = repaint(child)
                if out is not None:
                    root.append(out)
            if len(root) < 1:
                raise ValueError("No visible vector primitives")
            rendered = ET.tostring(root, encoding="unicode")
            if len(rendered) > 120_000:
                raise ValueError("Unoptimized source vector")
            path.write_text(rendered + "\n", encoding="utf-8")
            print(f"Downloaded CC0 silhouette: {name} ({len(rendered)} bytes, {len(root)} nodes)")
        except Exception as exc:
            print(f"Source icon unavailable for {name}: {type(exc).__name__}: {str(exc)[:200]}")
            if not path.exists():
                raise

if __name__ == "__main__":
    main()
