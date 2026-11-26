#!/usr/bin/env python3
"""Offline regression: backfill all known director photos without TMDB calls."""
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path("scripts").resolve()))
from build_cinema import Shards, load
from backfill_cinema_portraits import backfill

with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)
    people=Shards(root,"people")
    people.put(8,8,{"id":8,"name":"Regista A",
                    "photo":"https://image.tmdb.org/t/p/w342/abcdef123.jpg"})
    people.put(9,9,{"id":9,"name":"Persona senza foto","photo":""})
    people.flush()
    credits=Shards(root,"credits")
    credits.put(10,"movie:10",{
      "crew":[{"id":8,"job":"Director","name":"Regista A"},
              {"id":9,"job":"Writer","name":"Persona senza foto"}],
      "cast":[{"id":10,"name":"Attore","photo":"https://image.tmdb.org/t/p/w342/actor123.jpg"}],
      "awards":[{"event":"Oscar","category":"Best Picture","outcome":"won"}]
    })
    credits.put(11,"movie:11",{
      "crew":[{"id":10,"job":"Director","name":"Attore"}],
      "cast":[{"id":8,"name":"Regista A","photo":""}]})
    credits.flush()
    result=backfill(root)
    assert result["portrait_links_added"]==3,result
    doc=Shards(root,"credits").get(10,"movie:10")
    assert doc["crew"][0]["photo"].endswith("abcdef123.jpg")
    assert doc["crew"][1].get("photo") is None
    assert doc["awards"][0]["outcome"]=="won"
    doc2=Shards(root,"credits").get(11,"movie:11")
    assert doc2["crew"][0]["photo"].endswith("actor123.jpg")
    assert doc2["cast"][0]["photo"].endswith("abcdef123.jpg")
    again=backfill(root)
    assert again["portrait_links_added"]==0 and again["files_updated"]==0
    status=load(root/"data/cinema/portrait-status.json")
    assert status["schema"]==1
print("Portraits: director/cast backfill, provenance and idempotency OK")
