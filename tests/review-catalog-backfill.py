#!/usr/bin/env python3
"""Ensure community review enrichment continues once editorial IDs are exhausted."""
import datetime as dt
import importlib.util
import tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("reviews",Path("scripts/build_reviews.py"))
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)
    mod.TODAY=dt.date(2026,11,26)
    def write(path,content):
        import json
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(content),encoding="utf-8")
    write(root/"data/editorial.json",{"sections":[{"items":[
        {"type":"movie","tmdb_id":10}]}]})
    write(root/"data/discovery.json",{})
    photo="https://image.tmdb.org/t/p/w342/P123abc.jpg"
    write(root/"data/movies.json",{"items":[
        {"tmdb_id":10,"vote":7.0,"vote_count":100,"poster":photo},
        {"tmdb_id":11,"vote":8.5,"vote_count":1900,"year":1982,"poster":photo},
        {"tmdb_id":12,"vote":8.9,"vote_count":3000,"year":1994,"poster":photo},
        {"tmdb_id":13,"vote":6.5,"vote_count":10,"poster":photo},
        {"tmdb_id":14,"vote":4.2,"vote_count":2300,"poster":photo},
        {"tmdb_id":15,"vote":7.9,"year":1999,"poster":photo},
        {"tmdb_id":16,"vote":7.4,"year":1997,"poster":photo}
    ]})
    write(root/"data/tv.json",{"items":[
        {"tmdb_id":31,"vote":7.0,"vote_count":1200,"year":2019,"poster":photo}
    ]})
    write(root/"data/editorial-evidence.json",{"schema":1,"titles":{
        "movie:15":{"vote_count":2200,"vote_average":7.9}
    }})
    write(root/"data/reviews.json",{"schema":1,"source":"TMDB",
      "items":{"movie:10":{"checked_at":"2026-11-26","reviews":[]}}})
    ids=mod.candidate_ids(root)
    assert ids[:6]==[("movie",10),("movie",12),("movie",15),
                     ("movie",11),("tv",31),("movie",16)],ids[:6]
    assert ("movie",13) not in ids and ("movie",14) not in ids
    calls=[]
    def fake(kind,tid):
        calls.append((kind,tid))
        return {"results":[]}
    checked,_=mod.build(root,fetch=fake,limit=2)
    assert checked==2 and calls==[("movie",12),("movie",15)],calls
    checked,_=mod.build(root,fetch=fake,limit=2)
    assert checked==2 and calls[-2:]==[("movie",11),("tv",31)]
    checked,_=mod.build(root,fetch=fake,limit=2)
    assert checked==1 and calls[-1]==("movie",16)
    assert mod.build(root,fetch=fake,limit=2)[0]==0
print("Reviews: full catalog fallback, prioritization and 60-day cache OK")
