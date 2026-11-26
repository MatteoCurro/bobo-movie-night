#!/usr/bin/env python3
"""Offline mock responses for licensed independent critic and audience ratings."""
import importlib.util
import json
import tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("multi",Path("scripts/build_multi_ratings.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
example={"id":550,"imdb":{"value":8.8,"votes":4000},
         "metacritic":{"value":67,"votes":None},
         "rotten_tomatoes":{"value":81,"votes":None},
         "tmdb":{"value":7.1,"votes":3000}}
scores=m.normalize_response(example)
assert sorted(scores)==["imdb","metacritic","rotten_tomatoes"]
assert scores["imdb"]["value"]==8.8 and scores["imdb"]["scale"]==10
assert scores["rotten_tomatoes"]["scale"]==100
assert m.normalize_response({"imdb":{"value":1000},"metacritic":{"value":-7},"rotten_tomatoes":None})=={}
with tempfile.TemporaryDirectory() as t:
    root=Path(t);(root/"data").mkdir()
    (root/"data/editorial.json").write_text(json.dumps({"sections":[{"items":[{"type":"movie","tmdb_id":550},
        {"type":"tv","tmdb_id":123}]}]}))
    (root/"data/critic-reviews.json").write_text(json.dumps({"items":{"movie:550":[{"source":"movieplayer"}]}}))
    (root/"data/reviews.json").write_text(json.dumps({"items":{"tv:123":{"reviews":[]}}}))
    (root/"data/multi-ratings.json").write_text(json.dumps({"schema":1,"source":"amodb","items":{}}))
    calls=[]
    def fetch(kind,id):
        calls.append((kind,id))
        return example
    assert m.build(root,reader=fetch,limit=2)==2
    data=json.loads((root/"data/multi-ratings.json").read_text())
    assert set(data["items"])=={"movie:550","tv:123"}
    assert data["items"]["tv:123"]["scores"]["imdb"]["value"]==8.8
    assert len(calls)==2
    assert m.build(root,reader=fetch,limit=2)==0
    assert len(calls)==2,"Respect TTL and do not re-query cached scores"
print("Independent ratings: optional credentials, per-title scores, scale validation, missing-value safety and cache TTL OK")
