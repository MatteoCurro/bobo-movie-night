#!/usr/bin/env python3
"""Build editorial film-award explorer and rotating people, only from local credits.

No external HTTP requests. Data spans already-indexed Bobo titles, NOT every
Oscar/Cannes winner in cinema history. Refresh on each catalog sync.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from build_cinema import catalog, load, write, Shards

LABELS = {
    "Best Picture": "Miglior film",
    "Best Director": "Miglior regia",
    "Best Actor": "Miglior attore protagonista",
    "Best Actress": "Miglior attrice protagonista",
    "Best Supporting Actor": "Miglior attore non protagonista",
    "Best Supporting Actress": "Miglior attrice non protagonista",
    "Best Animated Feature": "Miglior film d'animazione",
    "Best International Feature Film": "Miglior film internazionale",
    "Best Foreign Language Film": "Miglior film internazionale",
    "Best Original Screenplay": "Miglior sceneggiatura originale",
    "Best Adapted Screenplay": "Miglior sceneggiatura non originale",
    "Best Cinematography": "Miglior fotografia",
    "Best Film Editing": "Miglior montaggio",
    "Best Visual Effects": "Migliori effetti visivi",
    "Best Original Score": "Miglior colonna sonora",
    "Best Original Song": "Miglior canzone originale",
    "Best Costume Design": "Migliori costumi",
    "Best Production Design": "Miglior scenografia",
    "Best Documentary Feature": "Miglior documentario",
}


def category_name(event, category):
    raw = str(category or "").strip()
    if not raw:
        return ""
    if event == "Cannes":
        if any(x in raw.lower() for x in ("palme", "palma d", "palma d'")):
            return "Palma d'oro"
        return raw[:95]
    return LABELS.get(raw, raw[:95])


def movie_card(movie):
    return {
        "id": int(movie["tmdb_id"]),
        "title": str(movie.get("title") or "")[:180],
        "poster": str(movie.get("poster") or ""),
        "year": int(movie.get("year") or 0),
        "vote": round(float(movie.get("vote") or 0), 1),
    }


def get_awards(root, titles):
    records = defaultdict(dict)
    for path in sorted((root / "data/cinema/credits").glob("*.json")):
        for key, row in load(path, {"items": {}}).get("items", {}).items():
            if not key.startswith("movie:") or key not in titles or not isinstance(row, dict):
                continue
            for award in row.get("awards") or []:
                if award.get("outcome") != "won" or award.get("event") not in ("Oscar", "Cannes"):
                    continue
                event = award["event"]
                category = category_name(event, award.get("category"))
                if not category:
                    continue
                group = (event, category)
                records[group][key] = movie_card(titles[key])
    groups = []
    for (event, category), films in records.items():
        ordered = sorted(films.values(), key=lambda item: (item["year"], item["vote"]), reverse=True)
        groups.append({"event": event, "category": category, "count": len(ordered), "films": ordered})
    groups.sort(key=lambda g: (0 if g["event"] == "Oscar" else 1, -g["count"], g["category"]))
    return groups


def week_number(date):
    return date.isocalendar().year, date.isocalendar().week


def rotating(people, week, size):
    """A stable weekly window within a ranked quality pool, not daily random."""
    if not people:
        return []
    pool = people[:48]
    start = (week * size) % len(pool)
    result = [pool[(start + i) % len(pool)] for i in range(min(size, len(pool)))]
    return result


def build(root=Path("."), today=None):
    today = today or dt.date.today()
    titles = catalog(root)
    people = {}
    store = Shards(root, "people")
    for path in sorted(store.root.glob("*.json")):
        for raw_id, item in load(path, {"items": {}}).get("items", {}).items():
            if not isinstance(item, dict) or not item.get("name"):
                continue
            try:
                people[int(raw_id)] = item
            except (TypeError, ValueError):
                pass
    # Count direct, verified credits independently of profile hydration.
    linked = defaultdict(set)
    acting = defaultdict(set)
    directing = defaultdict(set)
    writing = defaultdict(set)
    for path in sorted((root / "data/cinema/credits").glob("*.json")):
        for key, item in load(path, {"items": {}}).get("items", {}).items():
            if key not in titles or not isinstance(item, dict):
                continue
            for cast in item.get("cast") or []:
                try:
                    pid = int(cast["id"])
                except (KeyError, ValueError, TypeError):
                    continue
                linked[pid].add(key)
                acting[pid].add(key)
            for crew in item.get("crew") or []:
                try:
                    pid = int(crew["id"])
                except (KeyError, ValueError, TypeError):
                    continue
                role = crew.get("job")
                if role in ("Director", "Creator", "Writer"):
                    linked[pid].add(key)
                    if role == "Director":
                        directing[pid].add(key)
                    else:
                        writing[pid].add(key)
    featured_actors, featured_directors = [], []
    for pid, p in people.items():
        # More complete people profiles also have combined credits for Bobo titles.
        works = set(linked[pid])
        for row in (p.get("filmography") or []):
            try:
                key = str(row["type"]) + ":" + str(int(row["tmdb_id"]))
            except (KeyError, ValueError, TypeError):
                continue
            if key not in titles:
                continue
            works.add(key)
            if row.get("role") == "Regia":
                directing[pid].add(key)
            elif row.get("role") in ("Sceneggiatura", "Ideazione"):
                writing[pid].add(key)
            else:
                acting[pid].add(key)

        years = sorted({int(titles[key].get("year") or 0) for key in works
                        if 1880 <= int(titles[key].get("year") or 0) <= today.year})
        stats = {
            "works": len(works),
            "acting": len(acting[pid]),
            "directing": len(directing[pid]),
            "writing": len(writing[pid]),
            "first_year": years[0] if years else None,
            "last_year": years[-1] if years else None,
            "scope": "catalogue",
        }
        if p.get("stats") != stats:
            updated = dict(p, stats=stats)
            store.put(pid, pid, updated)
        if not p.get("photo") or not p.get("checked_at") or not works:
            continue
        representative = sorted(
            (titles[key] for key in works if titles[key].get("poster")),
            key=lambda item: (float(item.get("vote") or 0), int(item.get("year") or 0)), reverse=True,
        )[:3]
        row = {
            "id": pid, "name": p["name"], "photo": p["photo"],
            "works": len(works), "directed": len(directing[pid]),
            "role": "director" if directing[pid] else "actor",
            "films": [movie_card(item) | {"type": item.get("type", "movie")} for item in representative],
        }
        # Directors may act as well; show them in both groups only when relevant.
        if acting[pid] and len(works) >= 3:
            featured_actors.append(row)
        if directing[pid]:
            featured_directors.append(row)
    store.flush()
    featured_actors.sort(key=lambda row: (-row["works"], row["name"]))
    featured_directors.sort(key=lambda row: (-row["directed"], -row["works"], row["name"]))
    y, week = week_number(today)
    featured = {
        "actors": rotating(featured_actors, week, 4),
        "directors": rotating(featured_directors, week, 3),
    }
    groups = get_awards(root, titles)
    result = {
        "schema": 1,
        "generated": today.isoformat(),
        "week": f"{y}-W{week:02d}",
        "featured": featured,
        "awards": groups,
        "counts": {
            "people_indexed": len(people),
            "profiles": sum(1 for p in people.values() if p.get("checked_at")),
            "award_categories": len(groups),
            "award_winner_films": len({f["id"] for g in groups for f in g["films"]}),
        },
    }
    write(root / "data/cinema/explore.json", result)
    print("Cinema editorial explorer:", json.dumps(result["counts"]), "week", result["week"])
    return result


if __name__ == "__main__":
    build()
