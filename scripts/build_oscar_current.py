#!/usr/bin/env python3
"""Incremental Oscar updates from the Academy-derived DLu/oscar_data archive.

The existing TMDB-keyed historical index remains intact (through 2023).
Only recent nominations are stored, by IMDb ID and then resolved via TMDB's
/find endpoint. Do not infer a winner from list order: use the source's Winner
column. oscar-noms inspired the per-ceremony refresh, but its scraper omits
winner status and can be blocked by Wikipedia; it is not run at page load.
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
from pathlib import Path

from build_cinema import Shards, TOKEN, catalog, load, tmdb, write

SOURCE_URL = "https://raw.githubusercontent.com/DLu/oscar_data/main/oscars.csv"
SOURCE_PAGE = "https://github.com/DLu/oscar_data"
SNAPSHOT = "data/cinema/oscar-current.json"
STATE = "data/cinema/oscar-current-status.json"
DAYS = 7
BATCH = max(1, min(320, int(os.getenv("BOBO_OSCAR_CURRENT_BATCH", "140"))))
CATEGORIES = {
    "BEST PICTURE": "Best Picture",
    "ACTOR IN A LEADING ROLE": "Best Actor",
    "ACTRESS IN A LEADING ROLE": "Best Actress",
    "ACTOR IN A SUPPORTING ROLE": "Best Supporting Actor",
    "ACTRESS IN A SUPPORTING ROLE": "Best Supporting Actress",
    "DIRECTING": "Best Director",
    "WRITING (ORIGINAL SCREENPLAY)": "Best Original Screenplay",
    "WRITING (ADAPTED SCREENPLAY)": "Best Adapted Screenplay",
    "ANIMATED FEATURE FILM": "Best Animated Feature",
    "INTERNATIONAL FEATURE FILM": "Best International Feature Film",
    "CINEMATOGRAPHY": "Best Cinematography",
    "FILM EDITING": "Best Film Editing",
    "VISUAL EFFECTS": "Best Visual Effects",
    "MUSIC (ORIGINAL SCORE)": "Best Original Score",
    "MUSIC (ORIGINAL SONG)": "Best Original Song",
    "PRODUCTION DESIGN": "Best Production Design",
    "COSTUME DESIGN": "Best Costume Design",
    "SOUND": "Best Sound",
    "MAKEUP AND HAIRSTYLING": "Best Makeup and Hairstyling",
    "CASTING": "Best Casting",
    "DOCUMENTARY FEATURE FILM": "Best Documentary Feature",
    "DOCUMENTARY SHORT FILM": "Best Documentary Short",
    "ANIMATED SHORT FILM": "Best Animated Short",
    "LIVE ACTION SHORT FILM": "Best Live Action Short",
}
IMDB_RE = re.compile(r"tt[0-9]{7,10}$")


def stale(date, days=DAYS, today=None):
    today = today or dt.date.today()
    try:
        return (today - dt.date.fromisoformat(date)).days >= days
    except (TypeError, ValueError):
        return True


def category(row):
    value = str(row.get("CanonicalCategory") or row.get("Category") or "").strip()
    return CATEGORIES.get(value.upper(), value.title())[:150]


def parse_csv(csv_text, today=None, minimum=60):
    """Index only recent ceremonies and explicitly identified IMDb title IDs."""
    today = today or dt.date.today()
    recent = max(2024, today.year - 3)
    grouped = {}
    seen = set()
    valid = 0
    for row in csv.DictReader(io.StringIO(csv_text)):
        try:
            ceremony = int(row.get("Ceremony") or 0) + 1928
        except (TypeError, ValueError):
            continue
        if ceremony < recent or ceremony > today.year:
            continue
        cat = category(row)
        if not cat:
            continue
        flag = str(row.get("Winner") or "").strip().lower()
        if flag not in ("true", "false", "1", "0", "yes", "no"):
            continue
        won = flag in ("true", "1", "yes")
        recipient = str(row.get("Nominees") or row.get("Name") or "").replace("|", ", ")[:220]
        for raw_id in str(row.get("FilmId") or "").split("|"):
            imdb_id = raw_id.strip()
            if not IMDB_RE.fullmatch(imdb_id):
                continue
            signature = (imdb_id, ceremony, cat, recipient, won)
            if signature in seen:
                continue
            seen.add(signature)
            grouped.setdefault(imdb_id, []).append({
                "event": "Oscar", "category": cat, "year": ceremony,
                "outcome": "won" if won else "nominated",
                "recipient": recipient, "source": "oscar_data",
                "source_url": f"https://www.oscars.org/oscars/ceremonies/{ceremony}",
            })
            valid += 1
    if valid < minimum:
        raise ValueError(f"Oscar source too small/incomplete: {valid} usable nominations")
    for awards in grouped.values():
        awards.sort(key=lambda a: (-a["year"], a["category"], a["recipient"]))
    return grouped


def download():
    req = urllib.request.Request(SOURCE_URL, headers={
        "User-Agent": "BoboMovieNight/2.2 (weekly Oscars metadata import)",
        "Accept": "text/csv"})
    with urllib.request.urlopen(req, timeout=35) as response:
        data = response.read(5_000_001)
    if len(data) > 5_000_000:
        raise ValueError("Oscar source exceeds expected size")
    return data.decode("utf-8-sig")


def existing_mapping(root):
    mapping = {}
    for path in sorted((root / "data/cinema/credits").glob("[0-7][0-9a-f].json")):
        for key, entry in load(path, {"items": {}}).get("items", {}).items():
            if key.startswith("movie:") and isinstance(entry, dict):
                imdb_id = str(entry.get("imdb_id") or "")
                if IMDB_RE.fullmatch(imdb_id):
                    mapping[imdb_id] = int(key.partition(":")[2])
    return mapping


def find_movie(imdb_id):
    payload = tmdb("/find/" + imdb_id, {"external_source": "imdb_id"})
    matches = payload.get("movie_results") or []
    for item in matches:
        if isinstance(item, dict) and isinstance(item.get("id"), int) and item["id"] > 0:
            return item["id"]
    return 0


def update_one(store, tmdb_id, imdb_id, awards):
    key = "movie:" + str(tmdb_id)
    previous = store.get(tmdb_id, key) or {}
    historical = [
        item for item in previous.get("awards", [])
        if not (item.get("event") == "Oscar" and item.get("source") == "oscar_data")
        and not (item.get("event") == "Oscar" and item.get("source") == "wikidata"
                 and str(item.get("year") or "").isdigit()
                 and int(item["year"]) >= 2024)
    ]
    # The independent historical archive (to 2023), Cannes and other entries
    # are preserved. Replace only current-year Oscar records from this source.
    combined = historical + awards
    updated = dict(previous)
    updated["awards"] = combined
    updated["imdb_id"] = imdb_id
    updated["oscar_current"] = max(x["year"] for x in awards)
    if updated == previous:
        return False
    store.put(tmdb_id, key, updated)
    return True


def build(root=Path("."), today=None, fetcher=download, finder=find_movie, limit=BATCH):
    today = today or dt.date.today()
    titles = catalog(root)
    if not titles:
        raise ValueError("Film catalog missing; retaining existing Oscar indexes")
    source_path = root / SNAPSHOT
    state_path = root / STATE
    snapshot = load(source_path, {})
    if snapshot.get("schema") != 1 or stale(snapshot.get("checked_at"), today=today):
        try:
            items = parse_csv(fetcher(), today=today)
            snapshot = {"schema": 1, "source": "DLu/oscar_data",
                        "checked_at": today.isoformat(), "items": items}
            write(source_path, snapshot)
        except (OSError, ValueError, UnicodeError, urllib.error.URLError) as exc:
            print("::warning::Recent Oscar source unavailable; keeping cached results:", exc)
            if snapshot.get("schema") != 1:
                return {"matched": 0, "requested": 0, "status": "no-source"}
    items = snapshot.get("items") or {}
    state = load(state_path, {"schema": 1, "matches": {}})
    if state.get("schema") != 1:
        state = {"schema": 1, "matches": {}}
    matches = state.setdefault("matches", {})
    local = existing_mapping(root)
    store = Shards(root, "credits")
    requested = indexed = 0
    # Populate winners and newer ceremonies before lower-value nominations.
    ordered = sorted(items, key=lambda key: (
        -int(any(a.get("outcome") == "won" for a in items[key])),
        -max(a["year"] for a in items[key]), key))
    for imdb_id in ordered:
        awards = items[imdb_id]
        matched = local.get(imdb_id)
        if matched is None:
            record = matches.get(imdb_id) or {}
            if record and (record.get("tmdb_id") or not stale(record.get("checked_at"), 60, today)):
                matched = int(record.get("tmdb_id") or 0)
            elif TOKEN and requested < limit:
                try:
                    matched = int(finder(imdb_id) or 0)
                    matches[imdb_id] = {"tmdb_id": matched, "checked_at": today.isoformat()}
                    requested += 1
                except (OSError, ValueError, TimeoutError, urllib.error.URLError) as exc:
                    print("::warning::Oscar ID resolution deferred", imdb_id, str(exc)[:100])
                    continue
        if not matched or "movie:" + str(matched) not in titles:
            continue
        if update_one(store, matched, imdb_id, awards):
            indexed += 1
    store.flush()
    write(state_path, state)
    print(f"Recent Oscars: {indexed} film records updated, {requested} IMDb IDs resolved; "
          f"{len(items)} distinct candidate films; source snapshot {snapshot.get('checked_at')}")
    return {"matched": indexed, "requested": requested, "candidates": len(items)}


if __name__ == "__main__":
    build()
