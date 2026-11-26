#!/usr/bin/env python3
"""Offline regression: platform coverage, safe watch-provider IDs and anime source metadata."""
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,ROOT/"scripts"/filename)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
feed=load("bobo_feed","build_streaming_feed.py")
discovery=load("bobo_discovery","build_discovery.py")
catalog=load("bobo_catalog","sync_tmdb_catalog.py")
feeds={key:(label,url) for key,label,url in feed.PLATFORM_FEEDS}
providers={row["id"]:row for row in discovery.PROVIDERS}
for key in ("netflix","prime","disney","apple","paramount","skygo","now","hbo","rai","mediaset"):
    assert key in feeds and key in providers,(key,"platform missing")
    assert feeds[key][1].startswith("https://streamingfilter.com/it/novita-"),feeds[key]
assert len({row[1] for row in feeds.values()})==len(feeds),"Duplicate platform URLs"
assert "crunchyroll" in providers,"Anime platform discovery absent"
assert catalog.PROVIDERS[531]=="paramount"
assert catalog.PROVIDERS[29]=="skygo"
assert catalog.PROVIDERS[39]=="now"
# Country and animation genre do not prove audio dubbing.
anime=catalog.candidate("movie",{"id":42,"title":"Test anime",
   "release_date":"2026-11-15","original_language":"ja","genre_ids":[16]},
   {16:"Animazione"})
assert anime["original_language"]=="ja" and "Animazione" in anime["genres"]
# Accurate lookups must avoid applying a wrong fallback when the live provider
# directory is available but lacks a requested provider.
discovery._providers_cache["movie"]=[{"provider_id":531,"provider_name":"Paramount Plus"},
                                      {"provider_id":29,"provider_name":"Sky Go"}]
assert discovery.lookup_provider_id("movie",providers["paramount"])==531
assert discovery.lookup_provider_id("movie",providers["skygo"])==29
assert discovery.lookup_provider_id("movie",providers["now"])==0
print("Platforms and anime: verified source mappings, dynamic IDs and Japanese animation metadata OK")
