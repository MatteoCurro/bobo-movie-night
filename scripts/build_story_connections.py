#!/usr/bin/env python3
"""Verified Bobo connections between films, series, actors, directors and awards.

Offline, incremental-site companion index: reads already persisted title credits,
film metadata and winner records. Never invents quotations or inferred film roles.
Generated alongside the existing related-title archive, not a second UI carousel.
"""
from __future__ import annotations

from collections import defaultdict
from itertools import combinations
from pathlib import Path

from build_cinema import catalog, load, write
from build_cinema_explore import category_name

MAX_CAST = 12
MAX_PEERS = 2
MAX_LINKS = 6


def movie_key(row):
    return f'{row["type"]}:{int(row["tmdb_id"])}'


def card(item):
    return {"type": item["type"], "tmdb_id": int(item["tmdb_id"]),
            "title": str(item.get("title") or "")[:150],
            "year": int(item.get("year") or 0),
            "vote": float(item.get("vote") or 0),
            "poster": str(item.get("poster") or "")}


def build(root=Path(".")):
    titles = catalog(root)
    credits = {}
    casts = {}
    directors = {}
    actors_by_work = defaultdict(set)
    work_by_actor = defaultdict(set)
    work_by_director = defaultdict(set)
    winners_by_award = defaultdict(set)
    winners_for_title = defaultdict(set)
    for path in sorted((root / "data/cinema/credits").glob("*.json")):
        for key, data in load(path, {"items": {}}).get("items", {}).items():
            if key not in titles or not isinstance(data, dict):
                continue
            credits[key] = data
            cast = {}
            for row in (data.get("cast") or [])[:MAX_CAST]:
                try:
                    pid = int(row["id"])
                except (KeyError, ValueError, TypeError):
                    continue
                if pid > 0 and row.get("name"):
                    cast[pid] = str(row["name"])[:90]
                    work_by_actor[pid].add(key)
                    actors_by_work[key].add(pid)
            casts[key] = cast
            dirs = {}
            for row in data.get("crew") or []:
                if row.get("job") != "Director":
                    continue
                try:
                    pid = int(row["id"])
                except (KeyError, ValueError, TypeError):
                    continue
                if pid > 0 and row.get("name"):
                    dirs[pid] = str(row["name"])[:90]
                    work_by_director[pid].add(key)
            directors[key] = dirs
            for award in data.get("awards") or []:
                if award.get("outcome") != "won" or award.get("event") not in ("Oscar", "Cannes"):
                    continue
                event = award["event"]
                label = category_name(event, award.get("category"))
                if label:
                    identifier = (event, label)
                    winners_by_award[identifier].add(key)
                    winners_for_title[key].add(identifier)

    def score(other_key):
        row = titles[other_key]
        return (float(row.get("vote") or 0), int(row.get("year") or 0), other_key)

    buckets = defaultdict(dict)
    interesting = 0
    for key, entry in credits.items():
        current_cast = casts[key]
        current_directors = directors[key]
        associated = defaultdict(set)
        for pid in current_cast:
            for other in work_by_actor[pid]:
                if other != key and other in titles and titles[other].get("poster"):
                    associated[other].add(pid)
        # Real overlaps: two cast members appear in this title AND another title.
        together = []
        for other, pids in associated.items():
            if len(pids) < 2:
                continue
            shared = sorted(pids, key=lambda pid: list(current_cast).index(pid))
            together.append((len(shared), score(other), other, shared))
        together.sort(key=lambda row: (row[0], row[1]), reverse=True)
        pairs = [
            {"work": card(titles[other]),
             "people": [{"id": pid, "name": current_cast[pid]} for pid in shared[:3]]}
            for _, _, other, shared in together[:MAX_PEERS]
        ]

        # A single set of recommendations with explicit, human-readable reasons.
        # The older genre-based related index is used only to fill the remaining slots.
        proposals = {}
        def offer(other, priority, reason):
            if other == key or other not in titles or not titles[other].get("poster"):
                return
            if float(titles[other].get("vote") or 0) < 4:
                return
            if other not in proposals or proposals[other][0] < priority:
                proposals[other] = (priority, reason)

        for pid, director_name in current_directors.items():
            for other in work_by_director[pid]:
                offer(other, 32, "Stessa regia · " + director_name)
        for other, pids in associated.items():
            if len(pids) > 1:
                offer(other, 30 + min(len(pids), 4), f"{len(pids)} interpreti in comune")
            elif len(pids) == 1:
                pid = next(iter(pids))
                offer(other, 14, "Con " + current_cast[pid])
        for event, category in winners_for_title[key]:
            for other in winners_by_award[(event, category)]:
                offer(other, 23, "Premiato · " + category)

        ranked = sorted(proposals.items(),
                        key=lambda row: (row[1][0], score(row[0])), reverse=True)
        links = [dict(card(titles[k]), reason=reason)
                 for k, (_, reason) in ranked[:MAX_LINKS]]

        fact = ""
        # Count only works with already verified credits; never claim a career-wide count.
        for pid in current_cast:
            count = len(work_by_actor[pid])
            if count >= 4:
                fact = f"{current_cast[pid]} compare in {count} titoli già collegati nel catalogo Bobo."
                break
        if not fact:
            for pid, name in current_directors.items():
                count = len(work_by_director[pid])
                if count >= 2:
                    fact = f"Tra i titoli indicizzati, {name} firma la regia di {count} opere."
                    break
        if not fact and pairs:
            shared_names = [p["name"] for p in pairs[0]["people"][:2]]
            fact = (" e ".join(shared_names) + " recitano insieme anche in " +
                    pairs[0]["work"]["title"] + ".")

        bucket = f'{int(key.split(":", 1)[1]) % 128:02x}'
        buckets[bucket][key] = {"together": pairs, "connections": links, "fact": fact}
        if pairs or links or fact:
            interesting += 1

    folder = root / "data/cinema/connections"
    for bucket, items in sorted(buckets.items()):
        write(folder / (bucket + ".json"), {"schema": 1, "items": items})
    status = {"schema": 1, "titles": len(credits), "enriched": interesting,
              "with_cast_reunions": sum(1 for items in buckets.values()
                                          for x in items.values() if x["together"])}
    write(root / "data/cinema/connections-status.json", status)
    print("Story connections:", status)
    return status


if __name__ == "__main__":
    build()
