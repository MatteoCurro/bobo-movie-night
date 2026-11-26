#!/usr/bin/env python3
"""Offline integration tests for the MIT-licensed Oscar index and bounded backfill."""
import json
import shutil
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path("scripts").resolve()))
import build_oscar_backfill as oscar

base = Path("data/cinema/oscar-index.json")
source = json.loads(base.read_text(encoding="utf-8"))
assert source["schema"] == 1 and source["source_last_year"] == "2023"
assert len(source["items"]) >= 5000
assert any(r[0] == "Best Animated Feature" and r[2] == 1 for r in source["items"]["129"])

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    (root / "data/cinema").mkdir(parents=True)
    shutil.copyfile(base, root / "data/cinema/oscar-index.json")
    (root / "data/movies.json").write_text(json.dumps({"items":[{"tmdb_id":129,"title":"La città incantata","year":2001,"vote":8.5}]}))
    (root / "data/tv.json").write_text('{"items":[]}')
    assert oscar.backfill(root, maximum=1) == 1
    doc = json.loads((root / "data/cinema/credits/01.json").read_text())
    record = doc["items"]["movie:129"]
    assert any(a["outcome"]=="won" and a["category"]=="Best Animated Feature" for a in record["awards"])
    assert record["oscar_index"] == "2023"
    assert oscar.backfill(root, maximum=1) == 0
    record = {**record, "cast":[{"id":10,"name":"Actor"}],
              "awards":[
                  {"event":"Cannes","category":"Palme d'or","outcome":"won",
                   "source":"wikidata"},
                  {"event":"Oscar","category":"Oscar al miglior film d'animazione",
                   "outcome":"won","year":2003,"source":"wikidata"},
                  {"event":"Oscar","category":"Oscar al miglior film d'animazione",
                   "outcome":"nominated","year":2003,"source":"wikidata"},
                  {"event":"Oscar","category":"Nuova categoria",
                   "outcome":"won","year":2025,"source":"wikidata"}
              ] + record["awards"]}
    from build_cinema import Shards
    store = Shards(root, "credits")
    store.put(129, "movie:129", record)
    store.flush()
    assert oscar.backfill(root, maximum=1) == 1
    preserved = Shards(root, "credits").get(129, "movie:129")
    assert len(preserved["awards"])>=3
    assert len([x for x in preserved["awards"] if x["event"]=="Oscar" and
                x.get("source")=="wikidata" and x.get("year")==2003])==0
    assert len([x for x in preserved["awards"] if x["event"]=="Oscar" and
                x.get("source")=="wikidata" and x.get("year")==2025])==1
    assert oscar.backfill(root, maximum=1)==0
print("Oscar: MIT dataset, TMDB identity, won/nominated, incremental idempotence, coexistence OK")
