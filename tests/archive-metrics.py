#!/usr/bin/env python3
"""Offline, deterministic tests for permanent platform, review and metrics archives."""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import tempfile

ROOT=Path(__file__).resolve().parents[1]
def module(filename,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/"scripts"/filename)
    out=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(out)
    return out

ledger=module("build_catalog_ledger.py","bobo_ledger")
reviews=module("build_reviews.py","bobo_reviews")
metrics=module("build_catalog_metrics.py","bobo_metrics")

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj),encoding="utf-8")

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);(root/"data/episodes").mkdir(parents=True)
    save(root/"data/movies.json",{"items":[{"tmdb_id":11,"title":"Example A"}]})
    save(root/"data/tv.json",{"items":[{"tmdb_id":22,"title":"Example B"}]})
    save(root/"data/discovery.json",{
       "schema":1,
       "streaming":{"platforms":[{"id":"paramount","items":[{"type":"movie","tmdb_id":11}]},
                                 {"id":"now","items":[{"type":"tv","tmdb_id":22}]},
                                 {"id":"skygo","items":[{"type":"tv","tmdb_id":22}]}]},
       "platforms":[{"id":"hbo","items":[{"type":"movie","tmdb_id":11}]},
                    {"id":"crunchyroll","items":[{"type":"tv","tmdb_id":22}]}]})
    save(root/"data/enrichment.json",{"schema":1,"items":{
        "movie:11":{"providers_it":{"region":"IT","observed_at":ledger.TODAY,
                              "flatrate":["paramount","rai"]}},
        "tv:22":{"providers_it":{"region":"IT","observed_at":ledger.TODAY,
                            "flatrate":["now","skygo","crunchyroll"]}}
    }})
    old=os.getcwd()
    try:
        os.chdir(root)
        ledger.main()
        data=json.loads((root/"data/catalog-ledger.json").read_text())
        for provider in ["paramount","hbo","rai"]:
            assert data["items"]["movie"]["11"][2][provider]==ledger.TODAY
        for provider in ["now","skygo","crunchyroll"]:
            assert data["items"]["tv"]["22"][2][provider]==ledger.TODAY
        # An unavailable provider must not erase its last positive observation.
        save(root/"data/discovery.json",{"schema":1,"streaming":{"platforms":[]},"platforms":[]})
        ledger.main()
        again=json.loads((root/"data/catalog-ledger.json").read_text())
        assert again["items"]["movie"]["11"][2]["paramount"]==ledger.TODAY
    finally:
        os.chdir(old)

    review_id="a"*24
    sample={"id":review_id,"author":"Recensore", "author_details":{"rating":8},
            "content":"Una recensione italiana piuttosto lunga che descrive il film con sufficiente dettaglio senza svelare nulla e contiene una valutazione positiva, ma chi legge può consultare la fonte ufficiale.",
            "created_at":"2026-11-20T12:00:00Z"}
    parsed=reviews.extract(sample)
    assert parsed["language"]=="it" and parsed["rating"]==8
    assert len(parsed["excerpt"].split())<=18
    assert parsed["url"]=="https://www.themoviedb.org/review/"+review_id
    save(root/"data/editorial.json",{"sections":[{"items":[{"type":"movie","tmdb_id":11}]}]})
    def stub(kind,tid):
        assert (kind,tid)==("movie",11)
        return {"results":[sample]}
    assert reviews.build(root,stub,limit=2)==(1,1)
    archive=json.loads((root/"data/reviews.json").read_text())
    assert archive["items"]["movie:11"]["reviews"][0]["rating"]==8
    assert reviews.build(root,stub,limit=2)==(0,0),"Reviews should not be repeatedly re-fetched"

    save(root/"data/catalog-status.json",{
        "schema":1,"catalog":{"movie":{"total":1,"added":1,"changed":0},
                              "tv":{"total":1,"added":1,"changed":0}}})
    save(root/"data/episodes/22.json",{"schema":1,"type":"tv","tmdb_id":22,
        "episode_images":{"seasons":{"1":{"1":{"name":"Pilot","image":"https://image.tmdb.org/a.jpg"},
                                        "2":{"name":"Secondo"}}}}})
    report=metrics.build(root)
    current=report["current"]
    assert current["total_titles"]==2
    assert current["series_with_episode_data"]==1
    assert current["episode_records"]==2
    assert current["episodes_with_stills"]==1
    assert current["episodes_with_titles"]==2
    assert current["titles_with_platform_check"]==2
    assert current["platform_archive_counts"]["paramount"]==1
    assert current["reviewed_titles"]==1
    assert current["review_refs"]==1
    assert len(report["history"])==1
    save(root/"data/catalog-metrics.json",report)
    assert len(metrics.build(root)["history"])==1,"Only one snapshot per date"

print("Permanent archive: Italian platforms, historical dates, reviews, daily episode metrics and idempotency OK")
