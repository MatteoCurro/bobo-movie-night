#!/usr/bin/env python3
"""Backfill director and cast portraits using Bobo's own verified person records.

No network fetch or token, no extra browser requests. The source credits are
kept intact; this only appends a safe, previously downloaded image.
"""
from __future__ import annotations
from pathlib import Path
from build_cinema import load, write

CDN = "https://image.tmdb.org/t/p/"


def valid_photo(value):
    return isinstance(value, str) and value.startswith(CDN) and len(value) <= 250 \
        and value.rsplit("/", 1)[-1].lower().endswith((".jpg", ".jpeg", ".webp", ".png"))


def backfill(root=Path(".")):
    root_dir = root / "data/cinema"
    portrait_by_id = {}
    for file in sorted((root_dir / "people").glob("??.json")):
        for record in load(file, {"items": {}}).get("items", {}).values():
            if not isinstance(record, dict):
                continue
            try:
                pid = int(record["id"])
            except (KeyError, TypeError, ValueError):
                continue
            if valid_photo(record.get("photo")):
                portrait_by_id[pid] = record["photo"]

    credit_files = sorted((root_dir / "credits").glob("??.json"))
    for file in credit_files:
        for entry in load(file, {"items": {}}).get("items", {}).values():
            if not isinstance(entry, dict):
                continue
            for role in ("cast", "crew"):
                for person in entry.get(role) or []:
                    try:
                        pid = int(person["id"])
                    except (KeyError, ValueError, TypeError):
                        continue
                    if pid not in portrait_by_id and valid_photo(person.get("photo")):
                        portrait_by_id[pid] = person["photo"]

    changed_credits = 0
    added_people = 0
    changed_titles = 0
    for file in credit_files:
        data = load(file, {"items": {}})
        dirty = False
        for entry in data.get("items", {}).values():
            if not isinstance(entry, dict):
                continue
            updated = False
            for role in ("crew", "cast"):
                for person in entry.get(role) or []:
                    if not isinstance(person, dict) or valid_photo(person.get("photo")):
                        continue
                    try:
                        img = portrait_by_id.get(int(person["id"]))
                    except (KeyError, TypeError, ValueError):
                        img = None
                    if img:
                        person["photo"] = img
                        updated = True
                        added_people += 1
            if updated:
                dirty = True
                changed_titles += 1
        if dirty:
            write(file, data)
            changed_credits += 1

    result = {"titles_updated": changed_titles,
              "portrait_links_added": added_people,
              "files_updated": changed_credits,
              "known_portraits": len(portrait_by_id)}
    write(root_dir / "portrait-status.json", {"schema": 1, **result})
    print("Cinema portrait backfill:", result)
    return result


if __name__ == "__main__":
    backfill()
