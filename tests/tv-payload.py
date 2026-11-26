#!/usr/bin/env python3
"""Regression tests for small startup feeds and sharded TV detail records."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_tv_payload import build


def dump(root, name, payload):
    path = root / "data" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


with tempfile.TemporaryDirectory() as d:
    root = Path(d)
    movies = [
        {"tmdb_id": n, "title": "Film " + str(n), "year": 2020 + n,
         "vote": 7.2, "poster": "https://image.tmdb.org/t/p/w342/abcdef12345.jpg",
         "backdrop": "https://image.tmdb.org/t/p/w1280/abcdef12345.jpg",
         "overview": "Trama di prova", "genres": ["Dramma"], "runtime": 100}
        for n in range(1, 10)
    ]
    series = [
        {"tmdb_id": n, "title": "Serie " + str(n), "year": 2021,
         "vote": 7.6, "poster": "https://image.tmdb.org/t/p/w342/zyxwv98765.jpg",
         "seasons": [{"n": 1, "episodes": 8}], "overview": "Serie test"}
        for n in range(1, 6)
    ]
    dump(root, "movies.json", {"items": movies})
    dump(root, "tv.json", {"items": series})
    dump(root, "catalog-status.json", {"updated_at": "2026-11-26"})
    dump(root, "editorial-evidence.json", {"titles": {"movie:1": {"vote_count": 2100}}})
    dump(root, "editorial.json", {"sections": [
        {"id": "week", "title": "Settimana", "items": [
            {"type": "movie", "tmdb_id": x["tmdb_id"]} for x in movies]}
    ]})
    dump(root, "discovery.json", {"trending": [
        {"type": "tv", "tmdb_id": x["tmdb_id"]} for x in series]})
    dump(root, "seasonal.json", {"active": None})
    stats = build(root)
    assert stats["titles"] == 14
    lite = json.loads((root / "data/tv-lite.json").read_text())
    assert len(lite["items"]) == 14
    assert len(lite["items"][0]) == 8
    assert "Dramma" in lite["genres"]
    assert any(len(x[6]) for x in lite["items"])
    assert any(x[0] == "movie" and x[1] == 1 and x[7] == 2100 for x in lite["items"])
    assert lite["items"][0][5].startswith("/")
    home = json.loads((root / "data/tv-home.json").read_text())
    assert home["featured"]["overview"] == "Trama di prova"
    assert home["sections"] and len(home["sections"][0]["items"]) >= 4
    for group in home["sections"]:
        assert len(group["items"]) <= 14
    shard = json.loads((root / "data/tv-detail/01.json").read_text())
    assert shard["items"]["movie:1"]["runtime"] == 100
    assert len(list((root / "data/tv-detail").glob("*.json"))) == 64
    before = (root / "data/tv-home.json").read_bytes()
    assert build(root) == stats
    assert before == (root / "data/tv-home.json").read_bytes()
print("TV compact feeds passed.")
