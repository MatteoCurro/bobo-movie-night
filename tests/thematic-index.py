#!/usr/bin/env python3
"""Offline proof of permanent per-title themes and honest seasonal selections."""
import datetime as dt
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
from build_cinema import Shards, extract_credits, load, write
import build_thematic_index as thematic
import build_related_index as related

assert thematic.easter(2026) == dt.date(2026, 4, 5)
assert thematic.easter(2027) == dt.date(2027, 3, 28)
assert thematic.active_season(dt.date(2026, 12, 15)) == "christmas"
assert thematic.active_season(dt.date(2026, 10, 20)) == "halloween"
assert thematic.active_season(dt.date(2027, 3, 28)) == "easter"
assert thematic.active_season(dt.date(2026, 11, 26)) is None

sample = extract_credits("tv", 200, {
    "aggregate_credits": {"cast": [], "crew": []},
    "keywords": {"results": [{"id": 1, "name": "Christmas"},
                             {"id": 2, "name": "Family"}]},
})
assert sample["tmdb_keywords"] == ["Christmas", "Family"]
assert sample["keywords_checked_at"]

def movie(mid, title, genres, overview=""):
    return {"tmdb_id": mid, "title": title, "year": 2024, "vote": 7.2,
            "poster": "https://image.tmdb.org/t/p/w342/Poster123.jpg",
            "genres": genres, "overview": overview}

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    write(root / "data/movies.json", {"items": [
        movie(100, "The Christmas Story", ["Commedia"]),
        movie(101, "Winter Tales", ["Dramma"]),
        movie(103, "Resurrection Sunday", ["Dramma"]),
        movie(104, "Generic Horror", ["Horror"], "Un mostro spaventa tutti."),
        movie(105, "A Time of Miracles", ["Avventura"], "Un Easter egg nascosto nel videogame."),
    ]})
    write(root / "data/tv.json", {"items": [
        movie(102, "Night of Masks", ["Fantasy"], "Una festa di Halloween."),
    ]})
    store = Shards(root, "credits")
    store.put(100, "movie:100", {
        "imdb_metadata": {"interests": ["Holiday Fantasy", "Christmas Comedy"],
                          "keywords": ["Santa Claus", "family tradition"]}})
    store.put(101, "movie:101", {
        "imdb_metadata": {"interests": ["Holiday Fantasy"],
                          "keywords": ["Christmas", "Christmas Eve"]}})
    store.put(102, "tv:102", {"tmdb_keywords": ["halloween", "trick or treat"]})
    store.put(103, "movie:103", {"tmdb_keywords": ["Easter Sunday"]})
    store.flush()

    result = thematic.build(root, today=dt.date(2026, 12, 15))
    assert result["topics_indexed"] >= 4, result
    saved = load(root / "data/cinema/theme-index.json")
    assert saved["items"]["movie:100"]["topics"] == ["holiday fantasy", "christmas comedy"]
    assert "christmas" in saved["items"]["movie:100"]["seasons"]
    assert "halloween" in saved["items"]["tv:102"]["seasons"]
    assert "easter" in saved["items"]["movie:103"]["seasons"]
    assert "easter" not in saved["items"].get("movie:105", {}).get("seasons", [])
    assert "halloween" not in saved["items"].get("movie:104", {}).get("seasons", [])

    season = load(root / "data/seasonal.json")
    assert season["active"] == "christmas"
    assert {x["id"] for x in season["seasons"]} == {"christmas", "easter", "halloween"}
    assert {x["type"] for x in next(x for x in season["seasons"]
                                  if x["id"] == "halloween")["items"]} == {"tv"}

    rows = related.candidates(root)
    # Same specific story theme outweighs the completely different genres.
    peers = [p for key, _, p in related.compute(rows, {"movie:100"})][0]
    assert peers[0][1] == 101, peers
    assert "Temi in comune" in peers[0][5], peers

    first = related.build(root, limit=3)
    assert first["added"] == 3
    second = related.build(root, limit=3)
    assert second["indexed"] >= 5 and second["added"] >= 2
    assert load(root / "data/cinema/credits/64.json")["items"]["movie:100"]["imdb_metadata"]
    assert not load(root / "data/cinema/credits/66.json")["items"]["tv:102"].get("imdb_metadata")

print("Themes: raw IMDb facts preserved, TV keywords, calendar windows, honest tags, cross-genre related and refresh OK")
