#!/usr/bin/env python3
"""Bobo's self-owned incremental movie/TV catalog and source-labelled enrichments.

Keeps the existing CasaFlix-seeded catalog for compatibility but NEVER reads
CasaFlix or another project's repository. Uses TMDB via a server-side Actions
secret; absent credentials cannot destroy or silently replace cached data.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://api.themoviedb.org/3"
TOKEN = os.environ.get("TMDB_ACCESS_TOKEN", "").strip()
DATE = dt.date.today().isoformat()
KINDS = ("movie", "tv")
MIN_ITEMS = 100
IMG = re.compile(r"^/[a-zA-Z0-9_-]{5,180}\.(?:jpg|jpeg|png|webp)$")
PROVIDERS = {8:"netflix", 119:"prime", 337:"disney", 350:"apple"}

def api(path: str, params: dict | None = None) -> dict:
    query = dict(params or {})
    headers = {"Accept":"application/json", "User-Agent":"BoboMovieNight/2.0 (private-club)"}
    if TOKEN.startswith("eyJ") or TOKEN.startswith("Bearer "):
        headers["Authorization"] = "Bearer " + TOKEN.removeprefix("Bearer ").strip()
    else:
        query["api_key"] = TOKEN
    url = BASE + path + "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=18) as response:
        result = json.load(response)
    if not isinstance(result, dict):
        raise ValueError("Unexpected TMDB response")
    return result

def safe_image(raw: object) -> str:
    return "https://image.tmdb.org/t/p/w342" + raw if isinstance(raw,str) and IMG.fullmatch(raw) else ""

def load_json(path: Path, fallback: dict | None = None) -> dict:
    if not path.exists():
        if fallback is not None:return fallback
        raise ValueError("Missing catalog " + str(path))
    result = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(result,dict):raise ValueError("Invalid file " + str(path))
    return result

def save_json(path: Path, payload: dict) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",",":"), sort_keys=True) + "\n"
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists() or path.read_text(encoding="utf-8") != serialized:
        temp=path.with_suffix(path.suffix+".tmp")
        temp.write_text(serialized, encoding="utf-8")
        temp.replace(path)

def candidate(kind: str, source: dict, genres: dict[int,str], extra: dict | None = None) -> dict | None:
    try: tid=int(source.get("id") or 0)
    except (ValueError,TypeError):return None
    if tid<1 or source.get("adult",False):return None
    title=str((source.get("title") if kind=="movie" else source.get("name")) or "").strip()
    if not title:return None
    date=str(source.get("release_date") if kind=="movie" else source.get("first_air_date") or "")
    year=int(date[:4]) if re.match(r"^(19|20)\d{2}-",date) else None
    row={"tmdb_id":tid,"title":title}
    if year:row["year"]=year
    for key,tmdb_key in (("poster","poster_path"),("backdrop","backdrop_path")):
        image=safe_image(source.get(tmdb_key))
        if image:row[key]=image
    overview=str(source.get("overview") or "").strip()
    if overview:row["overview"]=overview[:2200]
    vote=source.get("vote_average")
    if isinstance(vote,(int,float)) and vote>0:row["vote"]=round(float(vote),1)
    names=[genres.get(x) for x in source.get("genre_ids",[]) if isinstance(x,int)]
    names=[x for x in names if x]
    if names:row["genres"]=names
    if kind=="tv" and isinstance(extra,dict):
        seasons=[{"n":int(s["season_number"]),"episodes":int(s["episode_count"])}
                 for s in extra.get("seasons",[]) if isinstance(s,dict)
                 and isinstance(s.get("season_number"),int)
                 and isinstance(s.get("episode_count"),int) and s["episode_count"]>0]
        if seasons:row["seasons"]=seasons
    if kind=="movie" and isinstance(extra,dict):
        runtime=extra.get("runtime")
        if isinstance(runtime,int) and runtime>0:row["runtime"]=runtime
    return row

def provider_facts(payload: dict) -> dict:
    it=(payload.get("results") or {}).get("IT") or {}
    included=[]
    for row in it.get("flatrate",[]) or []:
        provider=PROVIDERS.get(row.get("provider_id"))
        if provider and provider not in included:included.append(provider)
    return {"source":"tmdb-watch-providers","observed_at":DATE,"region":"IT","flatrate":included}

def episode_facts(payload: dict) -> dict:
    result={}
    for row in payload.get("episodes",[]) or []:
        number=row.get("episode_number")
        if not isinstance(number,int) or number<1:continue
        image=safe_image(row.get("still_path"))
        name=str(row.get("name") or "").strip()[:160]
        # Episode names remain useful even when TMDB has no specific still.
        if not image and not name:continue
        data={"source":"tmdb","observed_at":DATE}
        if name:data["name"]=name
        if image:data["image"]=image
        result[str(number)]=data
    return result

def update(root:Path, fetch=api, limit:int=120) -> dict:
    catalog={}; previous={}; counts={}
    for kind,name in (("movie","movies.json"),("tv","tv.json")):
        path=root/"data"/name
        document=load_json(path)
        items=document.get("items")
        if not isinstance(items,list) or len(items)<MIN_ITEMS:
            raise ValueError("Catalog missing or abnormally small: "+name)
        catalog[kind]=document
        previous[kind]={str(x["tmdb_id"]):x for x in items
                        if isinstance(x,dict) and str(x.get("tmdb_id","")).isdigit()}
    enrichment=load_json(root/"data"/"enrichment.json",{"schema":1,"items":{}})
    if enrichment.get("schema")!=1 or not isinstance(enrichment.get("items"),dict):
        raise ValueError("Unsupported enrichment schema")
    if not TOKEN and fetch is api:
        print("::warning::TMDB_READ_ACCESS_TOKEN missing: retained catalogs, NO fresh acquisitions")
        return {"status":"credential_required", "note":"Set GitHub TMDB_READ_ACCESS_TOKEN"}
    genres={}
    for kind in KINDS:
        try:
            g=fetch("/genre/"+kind+"/list",{"language":"it-IT"})
            genres[kind]={x["id"]:x["name"] for x in g.get("genres",[]) if isinstance(x.get("id"),int)}
        except (ValueError,KeyError,urllib.error.URLError) as exc:
            print("::warning::Genre lookup unavailable:",kind,type(exc).__name__)
            genres[kind]={}
    entries=[];seen=set();success=0
    for kind,path in (("movie","/trending/movie/week"),("tv","/trending/tv/week"),
                      ("movie","/movie/now_playing"),("tv","/tv/on_the_air")):
        for page in (1,2):
            try:
                data=fetch(path,{"language":"it-IT","region":"IT","page":page})
                if not isinstance(data.get("results"),list):raise ValueError("Missing results")
                success+=1
            except (ValueError,urllib.error.URLError,TimeoutError) as exc:
                print("::warning::Catalog source unavailable:",path,type(exc).__name__)
                continue
            for value in data["results"]:
                if not isinstance(value,dict):continue
                ident=value.get("id")
                if not isinstance(ident,int) or ident<1 or (kind,ident) in seen:continue
                seen.add((kind,ident));entries.append((kind,ident,value))
    if success==0:raise RuntimeError("No TMDB discovery endpoint succeeded; retained Bobo catalog")
    added={"movie":[],"tv":[]};changed={"movie":0,"tv":0}; touched=[]
    for kind,tid,value in entries[:limit]:
        ident=str(tid);old=previous[kind].get(ident)
        extra=None
        if kind=="tv" and (old is None or not old.get("seasons")):
            try:extra=fetch("/tv/"+ident,{"language":"it-IT"})
            except (ValueError,urllib.error.URLError,TimeoutError):pass
        row=candidate(kind,value,genres[kind],extra)
        if row is None or (old is None and not row.get("poster")) or (kind=="tv" and old is None and not row.get("seasons")):
            continue
        if old is None:
            added[kind].append(row);previous[kind][ident]=row
        else:
            merged={**old,**row}
            if merged!=old:
                old.update(row);changed[kind]+=1
        touched.append((kind,tid,extra))
    for kind in KINDS:
        if added[kind]:catalog[kind]["items"]=added[kind]+catalog[kind]["items"]
        counts[kind]={"added":len(added[kind]),"changed":changed[kind],"total":len(catalog[kind]["items"])}
    # These optional source adapters update only their own enrichment keys.
    facts=enrichment["items"]
    selected=sorted(touched,key=lambda x:(
        bool(facts.get(x[0]+":"+str(x[1]),{}).get("providers_it")),x[0],x[1]))
    providers_checked=0;episodes_checked=0
    for kind,tid,_ in selected[:24]:
        try:res=fetch("/"+kind+"/"+str(tid)+"/watch/providers")
        except (ValueError,urllib.error.URLError,TimeoutError):continue
        facts.setdefault(kind+":"+str(tid),{})["providers_it"]=provider_facts(res)
        providers_checked+=1
    for kind,tid,extra in selected:
        if kind!="tv" or episodes_checked>=8:continue
        key="tv:"+str(tid);record=facts.setdefault(key,{})
        old_images=record.get("episode_images") or {}
        last_seen=old_images.get("observed_at", "")
        images=dict(old_images.get("seasons") or {})
        info=extra
        if info is None:
            try:info=fetch("/tv/"+str(tid),{"language":"it-IT"})
            except (ValueError,urllib.error.URLError,TimeoutError):continue
        numbers=sorted({s.get("season_number") for s in info.get("seasons",[])
                        if isinstance(s,dict) and isinstance(s.get("season_number"),int)
                        and s.get("episode_count",0)>0 and s["season_number"]>=0})
        if not numbers:continue
        # Fill unvisited seasons first, at most two per title/run.
        # Previously first+last were repeatedly fetched and middle seasons never filled.
        missing=[n for n in numbers if str(n) not in images]
        if not missing and last_seen:
            try:
                if (dt.date.today()-dt.date.fromisoformat(last_seen)).days < 14:continue
            except ValueError:pass
        chosen=missing[:2] if missing else sorted(set(numbers[:1]+numbers[-1:]))
        for season in chosen:
            try:response=fetch(f"/tv/{tid}/season/{season}",{"language":"it-IT"})
            except (ValueError,urllib.error.URLError,TimeoutError):continue
            found=episode_facts(response)
            if found:images[str(season)]={**images.get(str(season),{}),**found}
        if images:
            record["episode_images"]={"source":"tmdb","observed_at":DATE,"seasons":images}
            episodes_checked+=1
    for kind,name in (("movie","movies.json"),("tv","tv.json")):
        save_json(root/"data"/name,catalog[kind])
    save_json(root/"data"/"enrichment.json",enrichment)
    status={"schema":1,"source":"TMDB","updated_at":dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "catalog":counts,"provider_titles_checked":providers_checked,"episode_titles_checked":episodes_checked,
            "discovery_pages_ok":success}
    save_json(root/"data"/"catalog-status.json",status)
    print("Bobo catalog autonomous sync:",json.dumps(status,ensure_ascii=False))
    return status

if __name__=="__main__":
    update(Path("."))