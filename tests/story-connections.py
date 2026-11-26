#!/usr/bin/env python3
"""Offline proof that connected stories and trivia are grounded in actual credits."""
from __future__ import annotations
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path("scripts").resolve()))
from build_cinema import Shards, write, load
import build_story_connections as graph

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    def movie(mid, year, vote=7.8):
        return {"tmdb_id":mid, "title":"Film "+str(mid), "year":year, "vote":vote,
                "poster":"https://image.tmdb.org/t/p/w342/Poster123.jpg",
                "genres":["Avventura","Dramma"]}
    write(root/"data/movies.json",{"items":[movie(10,1999),movie(11,2004),
                                          movie(12,2010),movie(13,2017),
                                          movie(14,2001),movie(15,2014)]})
    write(root/"data/tv.json",{"items":[]})
    credits=Shards(root,"credits")
    def cast(*ids):
        return [{"id":n,"name":"Attore "+str(n)} for n in ids]
    def crew(director):
        return [{"id":director,"name":"Regista "+str(director),"job":"Director"}]
    credits.put(10,"movie:10",{
        "cast":cast(1,2,3),"crew":crew(20),
        "awards":[{"event":"Oscar","category":"Best Picture","outcome":"won","year":"1999"}]})
    credits.put(11,"movie:11",{
        "cast":cast(1,2,4),"crew":crew(20),
        "awards":[]})
    credits.put(12,"movie:12",{
        "cast":cast(1,5),"crew":crew(20),"awards":[]})
    credits.put(13,"movie:13",{
        "cast":cast(6,7),"crew":crew(21),
        "awards":[{"event":"Oscar","category":"Oscar al miglior film","outcome":"won","year":"2017"}]})
    credits.put(14,"movie:14",{
        "cast":cast(1,8),"crew":crew(22),"awards":[]})
    credits.put(15,"movie:15",{
        "cast":cast(1,9),"crew":crew(23),"awards":[]})
    credits.flush()
    result=graph.build(root)
    assert result["titles"]==6 and result["with_cast_reunions"]>=2,result
    one=load(root/"data/cinema/connections/0a.json")["items"]["movie:10"]
    assert one["together"] and one["together"][0]["work"]["tmdb_id"]==11,one
    assert {p["id"] for p in one["together"][0]["people"]}=={1,2}
    links={x["tmdb_id"]:x for x in one["connections"]}
    assert 11 in links and "interpreti" in links[11]["reason"]
    assert 12 in links and "regia" in links[12]["reason"]
    assert 13 in links and "Premiato" in links[13]["reason"]
    assert one["fact"]=="Attore 1 compare in 5 titoli già collegati nel catalogo Bobo."
    assert all(x["tmdb_id"] != 10 for x in one["connections"])
    assert all(x["poster"].startswith("https://image.tmdb.org/") for x in one["connections"])
    # No credits / no fabricated related movies.
    assert not (root/"data/cinema/connections/0e.json").exists() or "movie:14" in \
        load(root/"data/cinema/connections/0e.json")["items"]

home=Path("bobo-ui.js").read_text(encoding="utf-8")
assert home.count("data-bobo-surprise")>=2
assert "pickUnique=items" in home and "already.add" in home
assert "Viaggia nel tempo" not in home
assert "weekly-movies" not in home and "anime-new" not in home
assert "genre-" in home and "week=Math.floor" in home
related=Path("bobo-related.js").read_text(encoding="utf-8")
assert "data/cinema/connections/" in related
assert "data/related/" in related
assert "watch-together" in related and "watch-cinema-fact" in related
assert "Stessa regia" in Path("scripts/build_story_connections.py").read_text(encoding="utf-8")
assert "watch-related-section" in Path("watch.html").read_text(encoding="utf-8")
person=Path("bobo-cinema.js").read_text(encoding="utf-8")
assert "renderCareer(person, stats)" in person
assert "first_directed" in person and "most_appreciated" in person
assert "bobo-awards-digest" in person
print("Stories: real actor reunions, director and Oscar links, UI fallback and nonrepeating home OK")
