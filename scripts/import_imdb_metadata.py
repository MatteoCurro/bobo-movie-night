#!/usr/bin/env python3
"""Opt-in adapter for licensed IMDb CSV exports (Scraping-IMDB schema).

The scraper code is MIT, but IMDb's *data* is not. This importer NEVER scrapes
IMDb, downloads the third-party 642 MB archive, or runs without an explicit
publication-rights opt-in and a local CSV directory. Prefer TMDB for normal
public site metadata and the existing licensed ratings provider.
"""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path

from build_cinema import Shards, catalog, load

BATCH = max(1, min(900, int(os.getenv("BOBO_IMDB_BATCH", "240"))))
YEAR_BATCH = max(1, min(12, int(os.getenv("BOBO_IMDB_YEAR_BATCH", "3"))))
LIMITED = ("directors", "writers", "composers", "cinematographers",
           "editors", "casting_directors", "production_designers",
           "costume_designers", "filming_locations", "interests")


def text(value, limit=220):
    return str(value or "").strip()[:limit]


def number(value, maximum=10**12, decimal=False):
    if value in (None, ""):
        return None
    try:
        out = float(value) if decimal else int(value)
        if 0 <= out <= maximum:
            return out
    except (ValueError, TypeError, OverflowError):
        pass
    return None


def json_array(value, max_items=8):
    if not value:
        return []
    try:
        entries = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(entries, list):
        return []
    values = []
    for item in entries:
        if isinstance(item, str) and item.strip():
            values.append(text(item, 120))
        elif isinstance(item, dict) and item.get("name"):
            values.append(text(item["name"], 120))
        if len(values) >= max_items:
            break
    return values


def normalize(row):
    """Whitelist useful facts rather than republishing a third-party row."""
    result = {"source": "imdb-licensed", "scraped_at": text(row.get("scraped_at"), 26)}
    metrics = {
        "rating": number(row.get("imdb_rating"), 10, True),
        "votes": number(row.get("imdb_votes")),
        "metascore": number(row.get("metascore"), 100),
        "rank": number(row.get("top_rated_rank"), 250),
        "user_reviews": number(row.get("user_reviews_count")),
        "critic_reviews": number(row.get("critic_reviews_count")),
        "award_wins": number(row.get("award_wins")),
        "award_nominations": number(row.get("award_nominations")),
    }
    result.update({k: v for k, v in metrics.items() if v is not None})
    for key in LIMITED:
        names = json_array(row.get(key))
        if names:
            result[key] = names
    severity = {}
    for code in ("sex_nudity", "violence_gore", "profanity",
                 "alcohol_drugs_smoking", "frightening_intense_scenes"):
        val = text(row.get(code + "_severity"), 10).lower()
        if val in ("none", "mild", "moderate", "severe"):
            severity[code] = val
    if severity:
        result["parental_guide"] = severity
    return result


def import_rows(rows, targets, store, maximum=BATCH):
    updated = 0
    for row in rows:
        imdb_id = text(row.get("imdb_id"), 16)
        mid = targets.get(imdb_id)
        if not mid:
            continue
        key = "movie:" + str(mid)
        previous = store.get(mid, key) or {}
        facts = normalize(row)
        if len(facts) <= 2:
            continue
        if previous.get("imdb_metadata") == facts:
            continue
        entry = dict(previous)
        entry["imdb_id"] = imdb_id
        entry["imdb_metadata"] = facts
        store.put(mid, key, entry)
        updated += 1
        if updated >= maximum:
            break
    return updated


def build(root=Path("."), directory=None, authorized=None, maximum=BATCH):
    directory = directory if directory is not None else os.getenv("BOBO_IMDB_LICENSED_CSV_DIR", "")
    authorized = authorized if authorized is not None else os.getenv("BOBO_IMDB_PUBLISH_AUTHORIZED") == "yes"
    if not authorized or not directory:
        print("IMDb licensed CSV import disabled: publishing rights and local CSV path required")
        return 0
    source = Path(directory)
    if not source.is_dir():
        raise ValueError("Licensed IMDb CSV directory not found")
    titles = catalog(root)
    if not titles:
        raise ValueError("Catalog unavailable; refusing to import IMDb metadata")
    store = Shards(root, "credits")
    targets = {}
    years = {}
    for path in store.root.glob("*.json"):
        for key, row in load(path, {"items": {}}).get("items", {}).items():
            imdb_id = str(row.get("imdb_id") or "") if isinstance(row, dict) else ""
            if key.startswith("movie:") and imdb_id.startswith("tt") and key in titles:
                targets[imdb_id] = int(key.partition(":")[2])
                year = int(titles[key].get("year") or 0)
                years[year] = years.get(year, 0) + 1
    sources = {}
    for path in source.glob("**/merged_movies_data_*.csv"):
        try:
            year = int(path.stem.rsplit("_", 1)[-1])
        except ValueError:
            continue
        if years.get(year):
            sources[year] = path
    updated = 0
    selected = sorted(sources, key=lambda y: (-years[y], -y))[:YEAR_BATCH]
    for year in selected:
        with sources[year].open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            updated += import_rows(reader, targets, store, maximum - updated)
        if updated >= maximum:
            break
    store.flush()
    print(f"IMDb (licensed): {updated} updated titles; "
          f"{len(targets)} identity-matched titles; {len(selected)} CSV years scanned")
    return updated


if __name__ == "__main__":
    build()
