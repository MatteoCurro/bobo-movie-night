#!/usr/bin/env python3
"""Backfill Academy Award categories from an MIT-licensed independent TMDB-linked archive.

No external API calls: 10,568 nominations are indexed locally by 5,131 TMDB
movie IDs. Award history through 2023 only; never present as authoritative
Academy data. Persist incrementally, without growing the main film catalog.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from build_cinema import Shards, catalog, priority_keys

LIMIT = max(1, min(600, int(os.environ.get("BOBO_OSCAR_BATCH", "240"))))
URL = "https://github.com/delventhalz/json-nominations"
SOURCE = "json-nominations"


def normalize(raw):
    results = []
    seen = set()
    for value in raw:
        if not isinstance(value, list) or len(value) != 4:
            continue
        category, year, won, recipient = value
        if not isinstance(category, str) or not category.strip():
            continue
        if not isinstance(year, str) or not year.strip():
            continue
        if not isinstance(recipient, str):
            recipient = ""
        entry = {"event": "Oscar", "category": category[:160], "year": year[:9],
                 "outcome": "won" if won else "nominated",
                 "recipient": recipient[:220], "source": SOURCE, "source_url": URL}
        identity = (entry["category"], entry["year"], entry["outcome"], entry["recipient"])
        if identity in seen:
            continue
        seen.add(identity)
        results.append(entry)
    return sorted(results, key=lambda r: (r["year"], r["category"]), reverse=True)


def apply_one(store: Shards, mid: int, raw):
    key = "movie:" + str(mid)
    cached = store.get(mid, key) or {}
    if cached.get("oscar_index") == "2023":
        return False
    awards = list(cached.get("awards") or [])
    # Retain Cannes and previous Wikidata results; authoritative source is stated on each record.
    awards = [a for a in awards if a.get("source") != SOURCE]
    awards.extend(normalize(raw))
    updated = dict(cached)
    updated["awards"] = awards
    updated["oscar_index"] = "2023"
    store.put(mid, key, updated)
    return True


def backfill(root=Path("."), maximum=LIMIT):
    path = root / "data/cinema/oscar-index.json"
    index = json.loads(path.read_text(encoding="utf-8-sig"))
    if index.get("schema") != 1 or index.get("source") != "delventhalz/json-nominations":
        raise ValueError("Unsupported Oscar archive schema")
    records = index.get("items") or {}
    if len(records) < 4000:
        raise ValueError("Refusing to use an incomplete Oscar archive")
    titles = catalog(root)
    if not titles:
        raise ValueError("Catalog unavailable")
    store = Shards(root, "credits")
    indexed = 0
    for key in priority_keys(root, titles):
        if indexed >= maximum:
            break
        if not key.startswith("movie:"):
            continue
        mid = int(key.partition(":")[2])
        raw = records.get(str(mid))
        if raw and apply_one(store, mid, raw):
            indexed += 1
    store.flush()
    print("Oscar archive: indexed", indexed, "film(s);", len(records), "possible TMDB matches; source through 2023")
    return indexed


if __name__ == "__main__":
    backfill()
