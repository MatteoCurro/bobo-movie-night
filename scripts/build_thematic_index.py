#!/usr/bin/env python3
"""Durable thematic index and date-aware editorial shelves for Bobo.

Uses only catalog records and already archived TMDB/IMDb facts. The index is
additive: raw per-title source keywords remain in the cinema credit shards.
Calendar suggestions require explicit semantic evidence, never genre alone.
"""
from __future__ import annotations

import datetime as dt
import re
import unicodedata
from pathlib import Path

from build_cinema import catalog, load, write

INDEX = "data/cinema/theme-index.json"
SEASONAL = "data/seasonal.json"
SEASONS = {
    "christmas": {
        "title": "Storie di Natale",
        "subtitle": "Film e serie con il Natale al centro della storia",
        "patterns": (r"\bchristmas\b", r"\bxmas\b", r"\bnatale\b",
                     r"\bnatalizi?\b", r"\bnatalizie\b", r"\bbabbo natale\b",
                     r"\bsanta claus\b", r"\bsanta clause\b", r"\bnoel\b",
                     r"\bchristmas eve\b"),
    },
    "halloween": {
        "title": "Una notte da brividi",
        "subtitle": "Halloween tra streghe, scherzi e storie inquietanti",
        "patterns": (r"\bhalloween\b", r"\btrick or treat\b",
                     r"\bdolcetto o scherzetto\b", r"\ball hallows eve\b",
                     r"\bnotte delle streghe\b"),
    },
    "easter": {
        "title": "Storie di Pasqua",
        "subtitle": "Film e serie legati alla Pasqua, senza confonderla con la primavera",
        "patterns": (r"\bpasqua\b", r"\bpasquale\b", r"\beaster sunday\b",
                     r"\beaster bunny\b", r"\beaster holiday\b",
                     r"\beaster egg hunt\b", r"\bresurrection sunday\b"),
    },
}
BLOCKED = {"movie", "film", "based on book", "based on novel", "love",
           "friendship", "man", "woman", "family", "action", "drama"}


def normalize(value):
    value = unicodedata.normalize("NFKD", str(value or "").casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()


def terms(values, limit=18):
    if not isinstance(values, list):
        return []
    seen = set()
    output = []
    for value in values:
        if not isinstance(value, str):
            continue
        term = normalize(value[:120])
        if len(term) < 3 or term in seen or term in BLOCKED:
            continue
        seen.add(term)
        output.append(term)
        if len(output) >= limit:
            break
    return output


def evidence(season, values):
    patterns = SEASONS[season]["patterns"]
    return any(re.search(pattern, text) for text in values for pattern in patterns)


def explicit_seasons(topics, keywords, title, overview):
    result = []
    # A title or plot synopsis alone is useful, but not enough to infer a
    # whole theme from generic genre labels (horror != Halloween).
    candidates = topics + keywords + [normalize(title), normalize(overview)]
    for ident in SEASONS:
        if evidence(ident, candidates):
            result.append(ident)
    return result


def easter(year):
    """Gregorian Easter Sunday (Anonymous Gregorian algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return dt.date(year, month, day + 1)


def active_season(today):
    if (today.month == 12 or (today.month == 1 and today.day <= 6)):
        return "christmas"
    if (today.month == 10 and today.day >= 10) or (
            today.month == 11 and today.day <= 2):
        return "halloween"
    sunday = easter(today.year)
    if sunday - dt.timedelta(days=14) <= today <= sunday + dt.timedelta(days=7):
        return "easter"
    return None


def build(root=Path("."), today=None):
    today = today or dt.date.today()
    titles = catalog(root)
    if not titles:
        raise ValueError("Catalog missing: keeping prior thematic data")
    credits = {}
    for path in sorted((root / "data/cinema/credits").glob("[0-7][0-9a-f].json")):
        rows = load(path, {"items": {}}).get("items", {})
        if isinstance(rows, dict):
            credits.update({k: v for k, v in rows.items() if k in titles and isinstance(v, dict)})

    index = {}
    calendar = {name: [] for name in SEASONS}
    for key, item in titles.items():
        entry = credits.get(key, {})
        imdb = entry.get("imdb_metadata") or {}
        topics = terms(imdb.get("interests"), 14)
        keywords = terms((imdb.get("keywords") or []) + (entry.get("tmdb_keywords") or []), 24)
        seasons = explicit_seasons(topics, keywords, item.get("title", ""),
                                   item.get("overview", ""))
        if topics or keywords or seasons:
            index[key] = {"topics": topics, "keywords": keywords, "seasons": seasons}
        if not seasons or not item.get("poster") or float(item.get("vote") or 0) < 5.5:
            continue
        for season in seasons:
            thematic = evidence(season, topics + keywords)
            title_match = evidence(season, [normalize(item.get("title"))])
            # A direct thematic match outranks passing mentions in synopsis.
            weight = (8 if thematic else 0) + (5 if title_match else 0)
            weight += min(9, float(item.get("vote") or 0)) * .45
            weight += (1 if item.get("type") == "tv" else 0)
            calendar[season].append((weight, key, item))

    shelves = []
    for ident, config in SEASONS.items():
        ranked = sorted(calendar[ident], key=lambda x: (x[0], x[1]), reverse=True)
        results = []
        for _, key, item in ranked[:20]:
            results.append({
                "type": item["type"], "tmdb_id": int(item["tmdb_id"]),
                "title": str(item.get("title") or "")[:140],
                "year": int(item.get("year") or 0),
                "poster": item.get("poster", ""),
                "vote": round(float(item.get("vote") or 0), 1),
            })
        shelves.append({"id": ident, "title": config["title"],
                        "subtitle": config["subtitle"], "items": results})

    write(root / INDEX, {"schema": 1, "source": "IMDb+TMDB+catalog",
                         "items": index})
    write(root / SEASONAL, {
        "schema": 1, "generated_at": today.isoformat(),
        "active": active_season(today), "seasons": shelves,
    })
    outcome = {"topics_indexed": len(index), "calendar_matches":
               {name: len(calendar[name]) for name in SEASONS},
               "active": active_season(today)}
    print("Bobo themes and seasonal selections:", outcome)
    return outcome


if __name__ == "__main__":
    build()
