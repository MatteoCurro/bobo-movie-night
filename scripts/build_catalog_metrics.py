#!/usr/bin/env python3
"""Daily, small, durable progress report for the Bobo-owned archive."""
from __future__ import annotations
from datetime import datetime, timezone
import json
from pathlib import Path

def read(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default if default is not None else {}

def build(root: Path) -> dict:
    status=read(root/"data/catalog-status.json")
    if not status or status.get("schema")!=1:
        raise ValueError("Catalog status missing")
    ledger=read(root/"data/catalog-ledger.json")
    enrichment=read(root/"data/enrichment.json")
    reviews=read(root/"data/reviews.json",{"items":{}})
    episodes=root/"data/episodes"
    indexed=0
    season_count=0
    episode_entries=0
    stills=0
    episode_titles=0
    seen=set()
    for path in episodes.glob("*.json"):
        data=read(path)
        if data.get("type")!="tv" or not str(data.get("tmdb_id","")).isdigit():
            continue
        seasons=(data.get("episode_images") or {}).get("seasons") or {}
        if not seasons:
            continue
        seen.add(str(data["tmdb_id"]))
        indexed+=1
        season_count+=len(seasons)
        for eps in seasons.values():
            if not isinstance(eps,dict):
                continue
            for episode in eps.values():
                if not isinstance(episode,dict):
                    continue
                episode_entries+=1
                if episode.get("image"): stills+=1
                if episode.get("name"): episode_titles+=1
    availability=enrichment.get("items",{})
    checked=sum(1 for row in availability.values() if isinstance(row,dict) and "providers_it" in row)
    with_platform=sum(1 for row in availability.values()
                      if isinstance(row,dict) and (row.get("providers_it") or {}).get("flatrate"))
    providers={}
    for titles in (ledger.get("items") or {}).values():
        for values in titles.values():
            if isinstance(values,list) and len(values)>2 and isinstance(values[2],dict):
                for key in values[2]:
                    providers[key]=providers.get(key,0)+1
    movies=int(status["catalog"]["movie"]["total"])
    tv=int(status["catalog"]["tv"]["total"])
    reviews_data=reviews.get("items") or {}
    critics=read(root/"data/critic-reviews.json")
    critics_items=critics.get("items") or {}
    ratings=read(root/"data/multi-ratings.json")
    ratings_items=ratings.get("items") or {}
    related=read(root/"data/related/status.json")
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    snapshot={
        "updated_at":now,
        "movies":movies, "series":tv, "total_titles":movies+tv,
        "new_movies_last_run":int(status["catalog"]["movie"]["added"]),
        "new_series_last_run":int(status["catalog"]["tv"]["added"]),
        "updated_movies_last_run":int(status["catalog"]["movie"]["changed"]),
        "updated_series_last_run":int(status["catalog"]["tv"]["changed"]),
        "series_with_episode_data":indexed,
        "series_remaining":max(0,tv-indexed),
        "seasons_with_details":season_count,
        "episode_records":episode_entries,
        "episodes_with_stills":stills,
        "episodes_with_titles":episode_titles,
        "titles_with_platform_check":checked,
        "titles_with_platform":with_platform,
        "platform_archive_counts":providers,
        "related_titles":int(related.get("indexed") or 0),
        "related_remaining":int(related.get("remaining") or 0),
        "related_added_last_run":int(related.get("added") or 0),
        "reviewed_titles":sum(1 for x in reviews_data.values() if x.get("reviews")),
        "review_refs":sum(len(x.get("reviews",[])) for x in reviews_data.values()),
        "independent_critic_titles":sum(bool(x) for x in critics_items.values()),
        "independent_critic_links":sum(len(x) for x in critics_items.values()),
        "independent_rating_titles":sum(bool(x.get("scores")) for x in ratings_items.values()),
        "reviews_checked":sum(1 for x in reviews_data.values() if x.get("checked_at"))
    }
    destination=root/"data/catalog-metrics.json"
    prior=read(destination)
    history=prior.get("history",[])
    day=now[:10]
    history=[x for x in history if str(x.get("updated_at",""))[:10]!=day]
    history.append(snapshot)
    return {"schema":1,"source":"Bobo-owned-catalog","updated_at":now,
            "current":snapshot,"history":history[-45:]}

def main() -> None:
    target=Path("data/catalog-metrics.json")
    payload=build(Path("."))
    serialized=json.dumps(payload,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n"
    if not target.exists() or target.read_text(encoding="utf-8")!=serialized:
        target.write_text(serialized,encoding="utf-8")
    print("Bobo permanent archive metrics:",json.dumps(payload["current"],ensure_ascii=False))

if __name__=="__main__":
    main()
