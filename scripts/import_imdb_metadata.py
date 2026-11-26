#!/usr/bin/env python3
"""Incrementally ingest Scraping-IMDB's published movie-year CSV snapshots.

This is a background build job, not browser scraping. It downloads at most
BOBO_IMDB_YEAR_BATCH year CSVs per run, only for years with TMDB-identified
films in the Bobo catalog. No Selenium/Edge runtime, full 642 MB mirror,
API key, proxy, login or scraping from the end user's browser is required.
The imported compact fields preserve the existing film shards and IDs.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

from build_cinema import Shards, catalog, load, write

BATCH = max(1, min(900, int(os.getenv("BOBO_IMDB_BATCH", "280"))))
YEAR_BATCH = max(1, min(6, int(os.getenv("BOBO_IMDB_YEAR_BATCH", "3"))))
MAX_BYTES = 14_000_000
STATUS = "data/cinema/imdb-import-status.json"
SOURCE = "https://raw.githubusercontent.com/RaedAddala/Scraping-IMDB/master/Data"
SOURCE_PAGE = "https://github.com/RaedAddala/Scraping-IMDB"
IMDB_ID = re.compile(r"^tt[0-9]{7,10}$")
CURRENCY = re.compile(r"^[A-Z]{3}$")
LIMITED = ("directors", "writers", "composers", "cinematographers",
           "editors", "casting_directors", "production_designers",
           "costume_designers", "filming_locations", "interests",
           "keywords", "production_companies", "countries_of_origin",
           "languages")
SEVERITIES = ("sex_nudity", "violence_gore", "profanity",
              "alcohol_drugs_smoking", "frightening_intense_scenes")


def short(value, limit=220):
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
    except (TypeError, ValueError):
        return []
    if not isinstance(entries, list):
        return []
    values = []
    for item in entries:
        if isinstance(item, str) and item.strip():
            values.append(short(item, 120))
        elif isinstance(item, dict):
            value = item.get("name") or item.get("location") or item.get("title")
            if isinstance(value, str) and value.strip():
                values.append(short(value, 120))
        if len(values) >= max_items:
            break
    return values


def monetary(row, prefix):
    amount = number(row.get(prefix + "_amount"))
    currency = short(row.get(prefix + "_currency"), 3).upper()
    if amount and CURRENCY.fullmatch(currency):
        return {"amount": amount, "currency": currency}
    return None


def normalize(row):
    """Keep selected useful fields, not a copy of the source's full 98 columns."""
    result = {"source": "imdb-scraping-repository",
              "scraped_at": short(row.get("scraped_at"), 26),
              "source_url": SOURCE_PAGE}
    metrics = {
        "rating": number(row.get("imdb_rating"), 10, True),
        "votes": number(row.get("imdb_votes")),
        "metascore": number(row.get("metascore"), 100),
        "rank": number(row.get("top_rated_rank"), 250),
        "user_reviews": number(row.get("user_reviews_count")),
        "critic_reviews": number(row.get("critic_reviews_count")),
        "award_wins": number(row.get("award_wins")),
        "award_nominations": number(row.get("award_nominations")),
        "cast_total": number(row.get("cast_total")),
        "runtime_minutes": number(row.get("runtime_minutes"), 500),
    }
    result.update({k: v for k, v in metrics.items() if v is not None})
    for key in LIMITED:
        names = json_array(row.get(key), 6 if key == "keywords" else 8)
        if names:
            result[key] = names
    for key in ("original_title", "certificate", "production_status", "first_release_date"):
        value = short(row.get(key), 170)
        if value:
            result[key] = value
    for prefix in ("budget", "gross_worldwide", "gross_us_canada"):
        value = monetary(row, prefix)
        if value:
            result[prefix] = value
    severity = {}
    for code in SEVERITIES:
        value = short(row.get(code + "_severity"), 10).lower()
        if value in ("none", "mild", "moderate", "severe"):
            severity[code] = value
    if severity:
        result["parental_guide"] = severity
    return result


def download_year(year):
    url = f"{SOURCE}/{year}/merged_movies_data_{year}.csv"
    req = urllib.request.Request(url, headers={
        "Accept": "text/csv", "User-Agent": "BoboMovieNight/2.2 (incremental catalog research)"})
    with urllib.request.urlopen(req, timeout=40) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError(f"IMDb CSV {year} exceeds {MAX_BYTES} byte safeguard")
    return io.StringIO(raw.decode("utf-8-sig"))


def target_catalog(root, titles, store):
    targets = {}
    by_year = defaultdict(set)
    already = set()
    for path in sorted(store.root.glob("*.json")):
        data = load(path, {"items": {}})
        for key, row in data.get("items", {}).items():
            if key not in titles or not key.startswith("movie:") or not isinstance(row, dict):
                continue
            imdb_id = str(row.get("imdb_id") or "")
            if not IMDB_ID.fullmatch(imdb_id):
                continue
            mid = int(key.partition(":")[2])
            year = int(titles[key].get("year") or 0)
            if year < 1920 or year > dt.date.today().year:
                continue
            targets[imdb_id] = mid
            by_year[year].add(imdb_id)
            if isinstance(row.get("imdb_metadata"), dict):
                already.add(imdb_id)
    return targets, by_year, already


def import_rows(rows, targets, store, maximum=BATCH):
    updated = 0
    for row in rows:
        imdb_id = short(row.get("imdb_id"), 16)
        mid = targets.get(imdb_id)
        if not mid:
            continue
        key = "movie:" + str(mid)
        previous = store.get(mid, key) or {}
        facts = normalize(row)
        if len(facts) <= 3:
            continue
        older = (previous.get("imdb_metadata") or {})
        if older.get("scraped_at") and facts.get("scraped_at") and (
            older["scraped_at"] > facts["scraped_at"]):
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


def should_scan(year, missing, status, today, total=None):
    info = status.get(str(year), {})
    date = info.get("checked_at", "")
    try:
        age = (today - dt.date.fromisoformat(date)).days
    except (ValueError, TypeError):
        return True
    if missing:
        # Refresh immediately only after new IDs appeared. Movies not included
        # in IMDb's top-1000 archive must not cause three downloads every day.
        if total is not None and total > int(info.get("known_titles") or 0):
            return True
        return age >= 21
    return age >= (30 if year >= today.year - 2 else 180)


def build(root=Path("."), directory=None, maximum=BATCH, downloader=download_year,
          today=None, years_per_run=YEAR_BATCH):
    today = today or dt.date.today()
    titles = catalog(root)
    if not titles:
        raise ValueError("Catalog unavailable; retaining previously imported metadata")
    store = Shards(root, "credits")
    targets, by_year, already = target_catalog(root, titles, store)
    if not targets:
        print("IMDb import: waiting for TMDB IMDb-ID matches in cinema credits")
        return 0
    status_path = root / STATUS
    status = load(status_path, {"schema": 1, "years": {}})
    if status.get("schema") != 1:
        status = {"schema": 1, "years": {}}
    year_status = status.setdefault("years", {})
    choices = []
    for year, ids in by_year.items():
        missing = len(ids - already)
        if should_scan(year, missing, year_status, today, len(ids)):
            # Import missing matches first, then revisit current titles.
            choices.append((missing, year, len(ids)))
    choices.sort(key=lambda item: (-item[0], -int(item[1] >= today.year - 2),
                                   -item[2], -item[1]))
    updated = scanned = errors = 0
    for missing, year, count in choices[:years_per_run]:
        try:
            if directory:
                path = Path(directory) / str(year) / f"merged_movies_data_{year}.csv"
                if not path.is_file():
                    continue
                with path.open(encoding="utf-8-sig", newline="") as handle:
                    changed = import_rows(csv.DictReader(handle), targets, store, maximum-updated)
            else:
                handle = downloader(year)
                changed = import_rows(csv.DictReader(handle), targets, store, maximum-updated)
            updated += changed
            scanned += 1
            year_status[str(year)] = {"checked_at": today.isoformat(), "updated": changed,
                                      "known_titles": count}
        except (OSError, UnicodeError, ValueError, TimeoutError,
                urllib.error.URLError, csv.Error) as exc:
            errors += 1
            print(f"::warning::IMDb CSV for {year} skipped, archive preserved: {str(exc)[:120]}")
        if updated >= maximum:
            break
    store.flush()
    write(status_path, status)
    print(f"IMDb scraped CSV: {updated} film metadata records refreshed; "
          f"{scanned} years scanned; {len(targets)} IMDb IDs known; {errors} errors")
    return updated


if __name__ == "__main__":
    build()
