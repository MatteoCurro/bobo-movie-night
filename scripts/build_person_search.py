#!/usr/bin/env python3
"""Static compact person-name search with verified local catalogue associations.

Generated during the existing catalogue workflow. No extra TMDB requests.
The browser fetches this index only when someone searches for people.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from build_cinema import catalog, load, write

MAX_WORKS = 100


def build(root=Path(".")):
    titles = catalog(root)
    if not titles:
        raise ValueError("Missing local catalogue: refusing to write an empty people index")
    people_root = root / "data/cinema/people"
    credit_root = root / "data/cinema/credits"
    people = {}
    associations = defaultdict(set)
    for path in sorted(people_root.glob("*.json")):
        if len(path.stem) != 2:
            continue
        for key, record in load(path, {"items": {}}).get("items", {}).items():
            if not isinstance(record, dict):
                continue
            try:
                pid = int(key)
            except (TypeError, ValueError):
                continue
            if pid <= 0 or not record.get("name"):
                continue
            people[pid] = record
            for work in (record.get("filmography") or []) + (record.get("known_for") or []):
                kind, mid = work.get("type"), work.get("tmdb_id")
                if kind in ("movie", "tv"):
                    try:
                        item_key = f"{kind}:{int(mid)}"
                        if item_key in titles:
                            associations[pid].add(item_key)
                    except (ValueError, TypeError):
                        pass
    # Credits and biographies are synchronized separately. Reading both means
    # even profiles that are just stubs can be searched by their real credits.
    for path in sorted(credit_root.glob("*.json")):
        if len(path.stem) != 2:
            continue
        for key, record in load(path, {"items": {}}).get("items", {}).items():
            if key not in titles or not isinstance(record, dict):
                continue
            for person in record.get("cast") or []:
                try:
                    pid = int(person["id"])
                except (KeyError, TypeError, ValueError):
                    continue
                if pid in people:
                    associations[pid].add(key)
            for person in record.get("crew") or []:
                if person.get("job") not in ("Director", "Creator", "Writer"):
                    continue
                try:
                    pid = int(person["id"])
                except (KeyError, TypeError, ValueError):
                    continue
                if pid in people:
                    associations[pid].add(key)

    def popularity(key):
        title = titles[key]
        return (float(title.get("vote") or 0), int(title.get("year") or 0))

    rows = []
    for pid, person in sorted(people.items(), key=lambda p: p[1]["name"].casefold()):
        works = sorted(associations[pid], key=popularity, reverse=True)[:MAX_WORKS]
        photo = person.get("photo") or ""
        if not isinstance(photo, str) or not photo.startswith("https://image.tmdb.org/t/p/"):
            photo = ""
        rows.append([pid, str(person["name"])[:140], photo, works])
    result = {"schema": 1, "source": "tmdb-credits", "people": rows}
    destination = root / "data/cinema/person-search.json"
    write(destination, result)
    print("Person search index:", json.dumps({
        "people": len(rows),
        "with_works": sum(1 for row in rows if row[3]),
        "bytes": destination.stat().st_size,
    }))
    return result


if __name__ == "__main__":
    build()
