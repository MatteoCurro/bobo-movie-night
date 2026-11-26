#!/usr/bin/env python3
"""Offline checks for incremental cast, person pages and award normalization."""
import importlib.util
import json
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("bobo_cinema", Path("scripts/build_cinema.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

movie = {"credits": {"cast": [
    {"id": 42, "name": "Persona Uno", "character": "Protagonista",
     "profile_path": "/abcdefgh.jpg"},
    {"id": 12, "name": "Persona Due", "character": "Amica", "profile_path": None}],
    "crew": [{"id": 7, "name": "Regista", "job": "Director"}]},
    "tagline": "Sottotitolo breve"}
result = mod.extract_credits("movie", 1, movie)
assert len(result["cast"]) == 2 and result["cast"][0]["id"] == 42
assert result["cast"][0]["photo"].startswith("https://image.tmdb.org/")
assert len(result["crew"]) == 1 and result["crew"][0]["job"] == "Director"
assert result["tagline"] == "Sottotitolo breve"
assert mod.portrait("javascript:alert(1)") == ""
assert mod.bucket(128) == "00" and mod.bucket(129) == "01"

series = {"aggregate_credits": {"cast": [
    {"id": 77, "name": "Interprete", "roles": [{"character": "Personaggio"}],
     "profile_path": None}], "crew": []}}
assert mod.extract_credits("tv", 2, series)["cast"][0]["character"] == "Personaggio"

titles = {"movie:1": {"tmdb_id": 1, "title": "Film A", "year": 2022, "poster": "poster.jpg"},
          "tv:2": {"tmdb_id": 2, "title": "Serie B", "year": 2024}}
profile = mod.hydrate_person(42, {"id": 42, "name": "Persona Uno", "known_for": []},
                             titles, {"name": "Persona Uno", "biography": "Biografia",
                                      "combined_credits": {"cast": [
                                          {"media_type": "movie", "id": 1, "character": "Protagonista"},
                                          {"media_type": "movie", "id": 1},
                                          {"media_type": "movie", "id": 999}]}})
assert profile["biography"] == "Biografia"
assert len(profile["filmography"]) == 1 and profile["filmography"][0]["title"] == "Film A"

rows = [{"tmdb": {"value": "1"}, "awardLabel": {"value": "Premio Oscar al miglior film"},
         "award": {"value": "http://www.wikidata.org/entity/Q555"},
         "result": {"value": "won"}, "date": {"value": "2024-01-01T00:00:00Z"}},
        {"tmdb": {"value": "1"}, "awardLabel": {"value": "Premio Oscar al miglior film"},
         "award": {"value": "http://www.wikidata.org/entity/Q555"},
         "result": {"value": "won"}, "date": {"value": "2024-01-01T00:00:00Z"}},
        {"tmdb": {"value": "1"}, "awardLabel": {"value": "Un premio non pertinente"},
         "award": {"value": "http://www.wikidata.org/entity/Q444"},
         "result": {"value": "won"}}]
awards = mod.award_entries(rows, [1, 2])
assert len(awards["1"]) == 1 and awards["1"][0]["event"] == "Oscar"
assert awards["2"] == []

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    store = mod.Shards(root, "credits")
    store.put(1, "movie:1", result)
    store.flush()
    saved = json.loads((root / "data/cinema/credits/01.json").read_text())
    assert saved["schema"] == 1 and "movie:1" in saved["items"]
    assert mod.Shards(root, "credits").get(1, "movie:1")["source"] == "tmdb"

print("Cinema: credits, TV roles, identity, awards, provenance, shards OK")
