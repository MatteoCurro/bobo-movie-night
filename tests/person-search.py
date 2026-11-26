#!/usr/bin/env python3
"""Offline regression for actor search and verified filmography associations."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
import build_person_search as search
from build_cinema import Shards, write

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    write(root / "data/movies.json", {"items": [
        {"tmdb_id": 11, "title": "Film Uno", "year": 1996, "vote": 8.5, "type": "movie"},
        {"tmdb_id": 12, "title": "Film Due", "year": 2001, "vote": 7.2, "type": "movie"},
    ]})
    write(root / "data/tv.json", {"items": [
        {"tmdb_id": 21, "title": "Serie Uno", "year": 2010, "vote": 7.7, "type": "tv"},
    ]})
    people = Shards(root, "people")
    people.put(22, 22, {"id": 22, "name": "Attore di prova",
                         "photo": "https://image.tmdb.org/t/p/w342/photo.jpg",
                         "known_for": [{"type": "tv", "tmdb_id": 21}],
                         "filmography": [{"type": "movie", "tmdb_id": 12}]})
    people.put(33, 33, {"id": 33, "name": "Regista di prova",
                         "known_for": []})
    people.put(44, 44, {"id": 44, "name": "Nessun credito",
                         "known_for": [{"type": "movie", "tmdb_id": 999}]})
    people.flush()
    credits = Shards(root, "credits")
    credits.put(11, "movie:11", {
        "cast": [{"id": 22, "name": "Attore di prova"}],
        "crew": [{"id": 33, "name": "Regista di prova", "job": "Director"}]})
    credits.put(12, "movie:12", {
        "cast": [],
        "crew": [{"id": 33, "job": "Producer"}]})
    credits.flush()
    result = search.build(root)
    assert result["schema"] == 1
    rows = {row[0]: row for row in result["people"]}
    assert set(rows) == {22, 33, 44}
    assert rows[22][1] == "Attore di prova"
    assert set(rows[22][3]) == {"movie:11", "movie:12", "tv:21"}
    assert rows[33][3] == ["movie:11"]  # Director yes, producer no.
    assert rows[44][3] == []
    assert (root / "data/cinema/person-search.json").exists()

home = Path("bobo-ui.js").read_text(encoding="utf-8")
assert "loadPeopleForSearch()" in home
assert "'data/cinema/person-search.json'" in home
assert "participating.has(item.type + ':' + item.tmdb_id)" in home
assert "person.html?id=" in home
assert "decade:" in home and "Math.floor(year / 10) * 10" in home
assert "renderDecadeShortcuts" not in home
assert 'Cerca un film, una serie o un attore' in home
assert 'for="filter-year">Periodo</label>' in Path("index.html").read_text(encoding="utf-8")

print("Person discovery: verified credits, director, period filter and lazy search OK")
