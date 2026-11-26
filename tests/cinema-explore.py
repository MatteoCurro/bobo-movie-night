#!/usr/bin/env python3
"""Offline tests for rotating cinema curation and Wikidata-safe heights."""
import datetime as dt
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
from build_cinema import Shards, write
import build_cinema_explore as explore
import enrich_person_facts as facts

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    movies = [{"tmdb_id": 1, "title": "Film Uno", "poster": "poster1",
               "year": 2001, "vote": 8.5},
              {"tmdb_id": 2, "title": "Film Due", "poster": "poster2",
               "year": 1995, "vote": 7.5}]
    series = [{"tmdb_id": 3, "title": "Serie Tre", "poster": "poster3",
               "year": 2011, "vote": 8.9}]
    write(root / "data/movies.json", {"items": movies})
    write(root / "data/tv.json", {"items": series})
    people = Shards(root, "people")
    people.put(101, 101, {
        "name": "Interprete Uno", "id": 101,
        "photo": "https://image.tmdb.org/t/p/w342/test.jpg",
        "birthday": "1970-01-02", "checked_at": "2026-11-20",
        "filmography": [{"type":"movie","tmdb_id":1},
                        {"type":"movie","tmdb_id":2},
                        {"type":"tv","tmdb_id":3}],
    })
    people.put(102, 102, {
        "name":"Regista Due","id":102,"photo":"https://image.tmdb.org/t/p/w342/test.jpg",
        "checked_at":"2026-11-20",
        "filmography":[{"type":"movie","tmdb_id":1,"role":"Regia"}],
    })
    people.flush()
    credits = Shards(root, "credits")
    credits.put(1, "movie:1", {
        "cast": [{"id":101,"name":"Interprete Uno"}],
        "crew": [{"id":102,"name":"Regista Due","job":"Director"}],
        "awards": [
            {"event":"Oscar","category":"Best Picture","outcome":"won","year":"2001"},
            {"event":"Oscar","category":"Best Actor","outcome":"nominated"},
            {"event":"Cannes","category":"Palme d'Or","outcome":"won"},
        ],
    })
    credits.put(2, "movie:2", {
        "cast": [{"id":101,"name":"Interprete Uno"}],
        "crew": [],
        "awards": [{"event":"Oscar","category":"Best Animated Feature","outcome":"won"}],
    })
    credits.put(3, "tv:3", {"cast":[{"id":101,"name":"Interprete Uno"}],"crew":[]})
    credits.flush()
    index = explore.build(root, today=dt.date(2026,11,26))
    assert index["schema"]==1
    assert index["counts"]["award_winner_films"]==2
    assert len(index["featured"]["actors"])==1
    assert index["featured"]["actors"][0]["name"]=="Interprete Uno"
    assert len(index["featured"]["directors"])==1
    assert index["featured"]["directors"][0]["name"]=="Regista Due"
    assert {"Oscar","Cannes"} <= set(g["event"] for g in index["awards"])
    oscar = next(g for g in index["awards"] if g["category"]=="Miglior film")
    assert oscar["films"][0]["title"]=="Film Uno"
    assert "Miglior film" == explore.category_name("Oscar","Best Picture")
    assert "Palma d'oro" == explore.category_name("Cannes","Palme d'Or")
    stats = Shards(root,"people").get(101,101)["stats"]
    assert stats["works"]==3 and stats["first_year"]==1995
    assert stats["first_indexed"]["id"]==2
    assert stats["most_appreciated"]["id"]==3
    director_stats=Shards(root,"people").get(102,102)["stats"]
    assert director_stats["first_directed"]["id"]==1
    assert director_stats["best_directed"]["id"]==1
    assert Shards(root,"people").get(102,102)["stats"]["directing"]==1
    assert explore.build(root,today=dt.date(2026,11,26))["week"]==index["week"]
    good = facts.parse_heights([
        {"id":{"value":"101"},"amount":{"value":"1.78"},"unit":{"value":"http://www.wikidata.org/entity/Q11573"}},
        {"id":{"value":"102"},"amount":{"value":"70"},"unit":{"value":"http://www.wikidata.org/entity/Q218593"}},
        {"id":{"value":"333"},"amount":{"value":"4"},"unit":{"value":"http://www.wikidata.org/entity/Q11573"}},
    ],[101,102])
    assert good=={101:178,102:178}
    got = facts.sync(root,find=lambda ids: {101:178}, today="2026-11-26")
    assert got["checked"]==2 and got["updated"]==1
    assert Shards(root,"people").get(101,101)["height_cm"]==178
    assert facts.sync(root,find=lambda ids: {},today="2026-11-26")["skipped"]=="daily cooldown"

js=Path("bobo-cinema.js").read_text()
assert "director.html?id=" in js and "ageAt(" in js
assert "height_cm" in js and "renderDirectory" in js
assert "Fonte: Wikidata" not in js and "json-nominations" not in js
assert "awards.html?event=" in js
assert "bobo-person-hero" in Path("person.html").read_text()
assert "data-person-mode=\"director\"" in Path("director.html").read_text()
discover=Path("bobo-discover.js").read_text()
assert "peopleSelections" in discover and "awardsSelections" in discover
assert "data/cinema/explore.json" in discover
assert explore.category_name("Oscar", "Oscar al miglior film") == "Miglior film"
assert explore.category_name("Oscar", "Best Sound Mixing") == "Miglior sonoro"
assert explore.category_name("Oscar", "Best Original Musical/Secondary Score Category") == "Miglior colonna sonora"
assert "vincitori di Cannes sono in fase di verifica" in Path("bobo-awards.js").read_text()
print("Cinema exploration: people, directors, winning awards, height and integrated pages OK")
