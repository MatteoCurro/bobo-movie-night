#!/usr/bin/env python3
"""Offline rights gate and CSV normalization checks for IMDb adapter."""
import csv
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
import import_imdb_metadata as mod
from build_cinema import Shards

row = {
    "imdb_id":"tt0114709", "scraped_at":"2026-11-11T08:00:00Z",
    "imdb_rating":"8.3", "imdb_votes":"100034",
    "metascore":"95", "award_wins":"10", "award_nominations":"3",
    "filming_locations":'["California", "London"]',
    "composers":'["A Composer"]', "interests":'["Family", "Animation"]',
    "violence_gore_severity":"mild",
}
parsed = mod.normalize(row)
assert parsed["rating"] == 8.3 and parsed["votes"] == 100034
assert parsed["filming_locations"] == ["California", "London"]
assert parsed["parental_guide"]["violence_gore"] == "mild"
assert mod.normalize({"imdb_rating":"-90", "filming_locations":"not json"}) == {
    "source":"imdb-licensed", "scraped_at":""}
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    (root/"data").mkdir()
    (root/"data/movies.json").write_text(json.dumps(
        {"items":[{"tmdb_id":129,"title":"Test movie","year":2025}]}))
    (root/"data/tv.json").write_text('{"items":[]}')
    store=Shards(root,"credits")
    store.put(129,"movie:129",{"imdb_id":"tt0114709","awards":[{"event":"Oscar"}]})
    store.flush()
    csv_dir=root/"licensed"
    year_dir=csv_dir/"2025"
    year_dir.mkdir(parents=True)
    with (year_dir/"merged_movies_data_2025.csv").open("w",newline="") as handle:
        writer=csv.DictWriter(handle,fieldnames=row.keys())
        writer.writeheader()
        writer.writerow(row)
    assert mod.build(root,directory=csv_dir,authorized=False)==0
    assert mod.build(root,directory=csv_dir,authorized=True)==1
    entry=Shards(root,"credits").get(129,"movie:129")
    assert entry["imdb_metadata"]["rating"]==8.3
    assert entry["awards"] == [{"event":"Oscar"}]
    assert mod.build(root,directory=csv_dir,authorized=True)==0
print("IMDb metadata: explicit permission gate, whitelisted schema, and idempotence OK")
