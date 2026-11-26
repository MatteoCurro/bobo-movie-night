#!/usr/bin/env python3
"""Incrementally build explainable related titles with IMDb/TMDB themes.

Source facts stay in cinema credits and the thematic index. Previously saved
related rows are preserved; a rotating refresh revisits historical titles as
new metadata arrives, without expanding browser payloads or API requests.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from collections import defaultdict
from pathlib import Path

SHARDS = 64
LIMIT = 520
IMG = re.compile(r"^https://image\.tmdb\.org/t/p/(?:w\d+|original)/([a-zA-Z0-9_-]{4,200}\.(?:jpg|jpeg|png|webp))$")


def read(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {} if default is None else default


def write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != content:
        path.write_text(content, encoding="utf-8")


def shard(tid: int) -> str:
    return f"{tid % SHARDS:02x}"


def key(row):
    return row["type"] + ":" + str(row["tmdb_id"])


def candidates(root):
    thematic = read(root / "data/cinema/theme-index.json", {"items": {}}).get("items") or {}
    rows = []
    for kind, file in (("movie", "movies.json"), ("tv", "tv.json")):
        data = read(root / "data" / file)
        for raw in data.get("items", []):
            if not isinstance(raw, dict) or not raw.get("tmdb_id") or not raw.get("title"):
                continue
            image = IMG.fullmatch(raw.get("poster") or "")
            if not image:
                continue
            try:
                tid, year = int(raw["tmdb_id"]), int(raw.get("year") or 0)
                vote = float(raw.get("vote") or 0)
            except (ValueError, TypeError):
                continue
            if tid <= 0:
                continue
            t = thematic.get(kind + ":" + str(tid)) or {}
            rows.append({"type": kind, "tmdb_id": tid,
                         "title": str(raw["title"])[:110],
                         "poster": image.group(1), "year": year, "vote": vote,
                         "genres": frozenset(str(g).casefold() for g in raw.get("genres", []) if g),
                         "topics": frozenset(t.get("topics") or []),
                         "keywords": frozenset(t.get("keywords") or []),
                         "original_language": raw.get("original_language") or ""})
    return rows


def compute(rows, targets):
    # Inverted indexes constrain comparisons to real overlaps.
    by_genre, by_topic, by_keyword = defaultdict(set), defaultdict(set), defaultdict(set)
    for i, row in enumerate(rows):
        for value in row["genres"]:
            by_genre[value].add(i)
        for value in row["topics"]:
            by_topic[value].add(i)
        for value in row["keywords"]:
            by_keyword[value].add(i)

    def score(origin, other):
        genres = origin["genres"] & other["genres"]
        topics = origin["topics"] & other["topics"]
        keywords = origin["keywords"] & other["keywords"]
        # A lone generic plot keyword does not establish a genuine similarity.
        if not genres and not topics and len(keywords) < 2:
            return None
        years = abs(origin["year"] - other["year"]) if origin["year"] and other["year"] else 30
        language = .7 if origin["original_language"] and origin["original_language"] == other["original_language"] else 0
        weight = len(genres)*3 + min(len(topics), 3)*7 + min(len(keywords), 5)*2.8
        weight += max(0, 5-years)*.24 + min(other["vote"], 9)*.22 + language
        weight += .45 if origin["type"] == other["type"] else 0
        if topics:
            reason = "Temi in comune · " + sorted(topics)[0].capitalize()
        elif len(keywords) >= 2:
            reason = "Storie affini · " + sorted(keywords)[0].capitalize()
        else:
            reason = ""
        return weight, reason

    for origin in rows:
        if key(origin) not in targets:
            continue
        pool = set()
        for value in origin["genres"]:
            pool.update(by_genre.get(value, ()))
        for value in origin["topics"]:
            pool.update(by_topic.get(value, ()))
        for value in origin["keywords"]:
            pool.update(by_keyword.get(value, ()))
        ranked = []
        for idx in pool:
            other = rows[idx]
            if key(other) == key(origin) or other["vote"] < 4.5:
                continue
            result = score(origin, other)
            if result is None:
                continue
            weight, reason = result
            ranked.append((weight, other["vote"], other["year"], key(other), other, reason))
        ranked.sort(reverse=True, key=lambda value: value[:4])
        picked = []
        for _, _, _, _, other, reason in ranked[:8]:
            item = [other["type"], other["tmdb_id"], other["title"],
                    other["year"], other["poster"]]
            if reason:
                item.append(reason)
            picked.append(item)
        yield key(origin), shard(origin["tmdb_id"]), picked


def build(root: Path, limit: int = LIMIT):
    folder = root / "data" / "related"
    folder.mkdir(parents=True, exist_ok=True)
    loaded = {}
    for path in folder.glob("[0-3][0-9a-f].json"):
        content = read(path, {"schema": 1, "items": {}})
        if content.get("schema") == 1 and isinstance(content.get("items"), dict):
            loaded[path.stem] = content["items"]
    indexed = {k for entries in loaded.values() for k in entries}
    rows = candidates(root)
    eligible = {key(row) for row in rows}
    editorial = read(root / "data/editorial.json")
    featured = {key(item) for section in editorial.get("sections", [])
                for item in section.get("items", [])
                if item.get("type") in ("movie", "tv") and item.get("tmdb_id")}
    new = [row for row in rows if key(row) not in indexed]
    new.sort(key=lambda row: (key(row) in featured,
                              row["year"] >= dt.date.today().year-4,
                              row["vote"], row["year"], key(row)), reverse=True)
    # Reserve capacity for re-scoring existing entries as new topics arrive.
    new_budget = min(len(new), limit if len(indexed) < limit*2 else max(1, (limit*3)//4))
    targets = {key(row) for row in new[:new_budget]}
    refresh_capacity = max(0, limit-len(targets))
    old = sorted(eligible & indexed)
    previous = read(folder / "status.json", {})
    cursor = int(previous.get("refresh_cursor") or 0)
    refreshed = 0
    if old and refresh_capacity:
        for i in range(min(refresh_capacity, len(old))):
            targets.add(old[(cursor+i) % len(old)])
            refreshed += 1
    next_cursor = (cursor+refreshed) % len(old) if old else 0

    touched = set()
    for k, bucket, picks in compute(rows, targets):
        if loaded.setdefault(bucket, {}).get(k) != picks:
            loaded[bucket][k] = picks
            touched.add(bucket)
    for bucket in touched:
        write(folder / (bucket + ".json"), {"schema": 1, "items": loaded[bucket]})
    added = len(targets - indexed)
    status = {"schema": 1, "source": "Bobo-local-metadata+thematic-index",
              "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
              "indexed": len(indexed) + added, "eligible": len(rows),
              "added": added, "refreshed": refreshed, "refresh_cursor": next_cursor,
              "remaining": max(0, len(rows)-len(indexed)-added)}
    write(folder / "status.json", status)
    print("Bobo incremental related:", status)
    return status


if __name__ == "__main__":
    build(Path("."))
