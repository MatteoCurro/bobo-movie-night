#!/usr/bin/env python3
"""Optional licensed multi-source scores, keyed by existing TMDB ID.

The provider amodb has a documented paid endpoint for IMDb / Rotten Tomatoes /
Metacritic scores. No API calls are made until a private AMODB_KEY is configured.
Never scrape IMDb/Rotten Tomatoes/Metacritic or invent missing scores.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import urllib.request
import urllib.error

KEY=os.environ.get("AMODB_KEY","").strip()
TODAY=dt.date.today()
LIMIT=12
DAYS=120
SOURCES={"imdb":10,"metacritic":100,"rotten_tomatoes":100}

def read(path,default=None):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,ValueError):return default if default is not None else {}

def fetch(kind,tid):
    url="https://api.amodb.dev/3/"+kind+"/"+str(tid)+"/ratings"
    request=urllib.request.Request(url,headers={
        "Accept":"application/json","Authorization":"Bearer "+KEY,
        "User-Agent":"BoboMovieClub/1.0 (licensed title-specific ratings integration)"})
    with urllib.request.urlopen(request,timeout=12) as response:return json.load(response)

def normalize_response(data):
    if not isinstance(data,dict):return {}
    scores={}
    for name,scale in SOURCES.items():
        node=data.get(name)
        if not isinstance(node,dict):continue
        value=node.get("value")
        if not isinstance(value,(int,float)) or isinstance(value,bool) or not 0<=value<=scale:continue
        votes=node.get("votes")
        if not isinstance(votes,int) or votes<0:votes=None
        scores[name]={"value":round(float(value),1),"scale":scale,"votes":votes}
    return scores

def candidates(root):
    editorial=read(root/"data/editorial.json")
    related=read(root/"data/critic-reviews.json")
    reviews=read(root/"data/reviews.json")
    work=[];seen=set()
    for section in editorial.get("sections",[]):
        for item in section.get("items",[]):
            key=item.get("type","")+":"+str(item.get("tmdb_id",""))
            if key not in seen:seen.add(key);work.append(key)
    for list_ in (related.get("items",{}),reviews.get("items",{})):
        for k in list_:
            if k not in seen:seen.add(k);work.append(k)
    for k in work:
        kind,sep,tid=k.partition(":")
        if sep and kind in ("movie","tv") and tid.isdigit() and int(tid)>0:yield kind,int(tid)

def build(root:Path,reader=fetch,limit=LIMIT):
    path=root/"data/multi-ratings.json"
    doc=read(path,{"schema":1,"source":"amodb","items":{}})
    if doc.get("schema")!=1 or not isinstance(doc.get("items"),dict):
        raise ValueError("Unsupported ratings index")
    if not KEY and reader is fetch:
        print("Independent ratings skipped: AMODB_KEY is not configured; no unlicensed imports")
        return 0
    done=0
    for kind,tid in candidates(root):
        key=kind+":"+str(tid)
        old=doc["items"].get(key,{})
        try:age=(TODAY-dt.date.fromisoformat(old.get("checked_at"))).days
        except (TypeError,ValueError):age=DAYS
        if age<DAYS:continue
        if done>=limit:break
        try:
            payload=reader(kind,tid)
            if not isinstance(payload,dict):continue
            scores=normalize_response(payload)
            doc["items"][key]={"checked_at":TODAY.isoformat(),
                               "scores":scores or old.get("scores",{})}
            done+=1
        except (OSError,urllib.error.URLError,TimeoutError,ValueError):
            continue
    if done:
        doc["updated_at"]=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
        doc["source"]="amodb"
        path.write_text(json.dumps(doc,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print("Independent score enrichment:",done,"titles checked, retained",len(doc["items"]))
    return done

if __name__=="__main__":build(Path("."))
