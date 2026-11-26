#!/usr/bin/env python3
"""Offline checks for deterministic, incremental related-title backfill."""
from __future__ import annotations
import importlib.util
import json
import tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("bobo_rel",Path("scripts/build_related_index.py"))
rel=importlib.util.module_from_spec(spec);spec.loader.exec_module(rel)
def item(n,genre,kind="movie",year=2024):
    return {"tmdb_id":n,"title":"Titolo "+str(n),"genres":[genre],
            "year":year,"vote":7.5,"poster":"https://image.tmdb.org/t/p/w342/abcdefg"+str(n)+".jpg"}
with tempfile.TemporaryDirectory() as d:
    root=Path(d)
    (root/"data").mkdir()
    (root/"data/movies.json").write_text(json.dumps({"items":[item(i,"Azione") for i in range(1,30)]}))
    (root/"data/tv.json").write_text(json.dumps({"items":[item(i,"Dramma","tv") for i in range(31,45)]}))
    (root/"data/editorial.json").write_text(json.dumps({"sections":[{"id":"week","items":[{"type":"movie","tmdb_id":12}]}]}))
    first=rel.build(root,limit=5)
    assert first["added"]==5 and first["indexed"]==5 and first["eligible"]==43,first
    for bucket in (root/"data/related").glob("[0-3][0-9a-f].json"):
        payload=json.loads(bucket.read_text())
        assert payload["schema"]==1
        for key,entries in payload["items"].items():
            assert key!=str(12) and len(entries)<=8
            assert all(len(e)==5 and e[4].endswith(".jpg") for e in entries)
            assert all(e[1]!=int(key.split(':')[1]) or e[0]!=key.split(':')[0] for e in entries)
    assert (root/"data/related/"+rel.shard(12)+".json").is_file(),"Prioritize editorial titles"
    second=rel.build(root,limit=5)
    assert second["indexed"]==10 and second["added"]==5 and second["remaining"]==33,second
    new_keys=set()
    for bucket in (root/"data/related").glob("[0-3][0-9a-f].json"):
        new_keys.update(json.loads(bucket.read_text())["items"])
    assert len(new_keys)==10,"Related index must persist across builds"
print("Related: prioritized backfill, per-title poster refs, safe buckets, and durable progress OK")
