#!/usr/bin/env python3
"""Offline regression tests for admin analytics and enrichment progression."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("bobo_admin_analytics",ROOT/"scripts/build_admin_analytics.py")
analytics=importlib.util.module_from_spec(spec)
spec.loader.exec_module(analytics)


def save(path, payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    save(root/"data/movies.json",{"items":[
        {"tmdb_id":11,"title":"Prova A","year":1998,"genres":["Azione"],
         "original_language":"it","vote":8.2,"poster":"https://image.tmdb.org/a.jpg"},
        {"tmdb_id":12,"title":"Prova B","year":2024,"genres":["Dramma"],
         "original_language":"en","vote":7.2,"overview":"Trama"}
    ]})
    save(root/"data/tv.json",{"items":[
        {"tmdb_id":22,"title":"Prova Serie","year":2023,"genres":["Dramma"],"vote":8.1}
    ]})
    save(root/"data/cinema/credits/0b.json",{"schema":1,"items":{
        "movie:11":{"checked_at":"2026-11-26","cast":[{"id":3,"name":"Attore A"}],
           "crew":[{"id":7,"name":"Regista A","job":"Director"}],
           "imdb_id":"tt1234","imdb_metadata":{"keywords":["prova"]},
           "tmdb_keywords":["avventura"],
           "facts":{"budget_usd":1000000,"revenue_usd":5000000},
           "awards":[{"event":"Oscar","category":"Miglior film",
                      "year":1999,"outcome":"won","recipient":"X"}]},
        "movie:12":{"checked_at":"2026-11-26","cast":[{"id":3,"name":"Attore A"}]},
        "tv:22":{"cast":[{"id":3,"name":"Attore A"}],"crew":[{"id":7,"name":"Regista A","job":"Creator"}]},
        "movie:99999":{"cast":[{"id":3,"name":"Non nel catalogo"}]}
    }})
    save(root/"data/cinema/people/03.json",{"schema":1,"items":{
        "3":{"name":"Attore A","photo":"https://image.tmdb.org/a.jpg",
            "biography":"Bio","biography_language":"it","filmography":[{"tmdb_id":11}]},
        "7":{"name":"Regista A"}
    }})
    save(root/"data/cinema/theme-index.json",{"items":{
        "movie:11":{"keywords":["prova"],"topics":["azione"],"seasons":[]},
        "movie:12":{"keywords":[],"topics":[],"seasons":["christmas"]}
    }})
    save(root/"data/cinema/quote-sources.json",{"checked":["movie:11"],"items":{"movie:11":{"quotes":["ciao"]}}})
    save(root/"data/cinema/connections-status.json",{"titles":3,"enriched":2})
    save(root/"data/related/status.json",{"indexed":1,"remaining":2,"added":1})
    save(root/"data/reviews.json",{"items":{"movie:11":{"checked_at":"2026-11-26","reviews":[{"excerpt":"X"}]}}})
    save(root/"data/catalog-metrics.json",{"current":{"series_with_episode_data":1,"reviewed_titles":1},
         "history":[{"updated_at":"2026-11-26T01:01:01Z","movies":2,"series":1,"total_titles":3}],
         "runs":[{"updated_at":"2026-11-26T01:01:01Z","new_movies_last_run":2}]})
    data=analytics.build(root)
    assert data["catalog"]["total"]==3
    assert data["catalog"]["movies"]==2 and data["catalog"]["series"]==1
    assert data["finances"]["with_revenue"]==1
    assert data["finances"]["total_known_revenue_usd"]==5000000
    assert data["finances"]["top_ratio"][0]["ratio"]==5
    assert data["people"]["actors"][0]["works"]==3
    assert data["enrichment"]["credits_checked"]==2
    assert data["enrichment"]["imdb_metadata"]==1
    assert data["enrichment"]["people_biographies_it"]==1
    assert data["enrichment"]["keyword_titles"]==1
    assert data["enrichment"]["related_remaining"]==2
    assert len(data["growth"]["runs"])==1
    assert data["enrichment_history"][-1]["imdb_metadata"]==1
    save(root/"data/admin-analytics.json",data)
    second=analytics.build(root)
    assert second["enrichment_delta_last_run"]["imdb_metadata"]==0
    assert len(second["enrichment_history"])==1
    assert len(second["enrichment_runs"])==2
    doc=root/"data/admin-analytics.json"
    save(doc,second)
    save(root/"data/cinema/credits/0b.json",{"schema":1,"items":{
        **json.loads((root/"data/cinema/credits/0b.json").read_text())["items"],
        "movie:22":{"checked_at":"2026-11-26","imdb_metadata":{}}
    }})
    # Only catalog titles count toward quality coverage.
    assert analytics.build(root)["enrichment"]["imdb_metadata"]==1

print("Admin analytics: catalogue, people, finance, coverage and history OK")
