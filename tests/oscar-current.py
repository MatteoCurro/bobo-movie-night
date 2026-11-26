#!/usr/bin/env python3
"""Offline Oscar source, TMDB matching, provenance and idempotence checks."""
import csv
import io
import json
import sys
import tempfile
import datetime as dt
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
import build_oscar_current as osc

assert osc.category({"CanonicalCategory":"ACTOR IN A LEADING ROLE"}) == "Best Actor"
assert osc.category({"CanonicalCategory":"CASTING"}) == "Best Casting"
now = dt.date(2026, 11, 26)
fields = ["Ceremony", "Year", "Class", "CanonicalCategory", "Category", "Film",
          "FilmId", "Name", "Nominees", "NomineeIds", "Winner", "Detail", "Note", "Citation"]
buf = io.StringIO()
writer = csv.DictWriter(buf, fieldnames=fields)
writer.writeheader()
writer.writerow({"Ceremony": 98, "Year": "2025", "CanonicalCategory": "BEST PICTURE",
                 "FilmId": "tt0114709", "Nominees": "A producer", "Winner": "True"})
writer.writerow({"Ceremony": 98, "Year": "2025", "CanonicalCategory": "ACTOR IN A LEADING ROLE",
                 "FilmId": "tt0114709", "Nominees": "An actor", "Winner": "False"})
writer.writerow({"Ceremony": 98, "Year": "2025", "CanonicalCategory": "ACTOR IN A LEADING ROLE",
                 "FilmId": "?", "Nominees": "Unknown", "Winner": "True"})
writer.writerow({"Ceremony": 95, "Year": "2022", "CanonicalCategory": "BEST PICTURE",
                 "FilmId": "tt0114709", "Winner": "True"})
for index in range(70):
    writer.writerow({"Ceremony": 98, "Year": "2025", "CanonicalCategory": "BEST PICTURE",
                     "FilmId": f"tt{index+1:07d}", "Winner": "False"})
raw = buf.getvalue()
parsed = osc.parse_csv(raw, today=now)
assert len(parsed) == 71
assert len(parsed["tt0114709"]) == 2
assert next(a for a in parsed["tt0114709"] if a["category"]=="Best Picture")["outcome"] == "won"

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / "data/cinema").mkdir(parents=True)
    (root / "data/movies.json").write_text(json.dumps(
        {"items":[{"tmdb_id":129,"title":"Film","year":2025,"vote":8.0}]}))
    (root / "data/tv.json").write_text('{"items":[]}')
    from build_cinema import Shards
    store = Shards(root, "credits")
    historical = {"oscar_index": "2023", "awards":[
        {"event":"Oscar","category":"Best Actor","year":"1996","outcome":"won","source":"json-nominations"},
        {"event":"Oscar","category":"Best Picture","year":2026,"outcome":"nominated","source":"wikidata"},
        {"event":"Cannes","category":"Palme d'or","year":2025,"outcome":"won","source":"wikidata"}]}
    store.put(129, "movie:129", historical)
    store.flush()
    osc.TOKEN = "test-only"  # Inject a local fake resolver; never makes a remote request.
    finder = lambda imdb: 129 if imdb=="tt0114709" else 0
    result = osc.build(root,today=now,fetcher=lambda:raw,finder=finder,limit=3)
    assert result["matched"] == 1
    stored = Shards(root,"credits").get(129,"movie:129")
    assert len(stored["awards"]) == 4, stored["awards"]
    assert sum(a["source"]=="oscar_data" for a in stored["awards"]) == 2
    assert all(a.get("source")!="wikidata" or a["event"]!="Oscar" for a in stored["awards"])
    assert stored["imdb_id"]=="tt0114709"
    second = osc.build(root,today=now,fetcher=lambda: (_ for _ in ()).throw(
        AssertionError("Should reuse fresh Oscar snapshot")),finder=finder,limit=3)
    assert second["matched"] == 0
    assert osc.stale(now.isoformat(),today=now) is False
    assert osc.stale("2025-01-01",today=now) is True
print("Recent Oscars: ceremony year, winner status, source cache, merge and idempotence OK")
