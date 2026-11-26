#!/usr/bin/env python3
"""Incremental TMDB user-review references; stores only tiny attributed previews.

No scraping, translated reviews, or third-party full-text copies. Reviews remain
on TMDB and are linked individually. All keys are existing TMDB IDs.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

TOKEN=os.environ.get("TMDB_ACCESS_TOKEN","").strip()
TODAY=dt.date.today()
TARGET=Path("data/reviews.json")
MAX_PER_RUN=60
RECHECK_DAYS=60

def read(path:Path, default=None):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,ValueError):return default if default is not None else {}

def api(kind:str,tid:int)->dict:
    path=f"/{kind}/{tid}/reviews"
    query={"language":"it-IT","page":1}
    headers={"Accept":"application/json","User-Agent":"BoboMovieClub/1.0 (editorial-review-links)"}
    if TOKEN.startswith("eyJ") or TOKEN.startswith("Bearer "):
        headers["Authorization"]="Bearer "+TOKEN.removeprefix("Bearer ").strip()
    else: query["api_key"]=TOKEN
    url="https://api.themoviedb.org/3"+path+"?"+urllib.parse.urlencode(query)
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=15) as response:
        return json.load(response)

def extract(review:dict)->dict|None:
    if not isinstance(review,dict):return None
    rid=str(review.get("id") or "")
    if not re.fullmatch(r"[a-f0-9]{20,40}",rid,re.I):return None
    content=re.sub(r"\s+"," ",str(review.get("content") or "")).strip()
    if len(content)<35:return None
    # Short, source-attributed previews, limited to 18 words and 135 chars.
    snippet=" ".join(content[:800].split()[:18])
    if len(snippet)>135:
        snippet=snippet[:135].rsplit(" ",1)[0]
    if snippet != content: snippet=snippet.rstrip(" ,.;:")+"…"
    author=re.sub(r"[\r\n\t]+"," ",str(review.get("author") or "Utente TMDB")).strip()[:64]
    details=review.get("author_details") or {}
    rating=details.get("rating")
    if not isinstance(rating,(int,float)) or isinstance(rating,bool) or not 0<=rating<=10:
        rating=None
    created=str(review.get("created_at") or "")[:10]
    if created and not re.fullmatch(r"\d{4}-\d{2}-\d{2}",created):created=""
    return {"id":rid,"author":author or "Utente TMDB","rating":rating,
            "created_at":created,"language":"it","excerpt":snippet,
            "url":"https://www.themoviedb.org/review/"+rid}

def candidate_ids(root:Path)->list[tuple[str,int]]:
    discovery=read(root/"data/discovery.json")
    editorial=read(root/"data/editorial.json")
    sources=[]
    for section in editorial.get("sections",[]):
        sources.extend(section.get("items",[]))
    sources.extend(discovery.get("trending",[]))
    sources.extend(discovery.get("anime",[]))
    sources.extend((discovery.get("streaming") or {}).get("items",[]))
    for group in [(discovery.get("streaming") or {}).get("platforms",[]),discovery.get("platforms",[])]:
        for section in group:
            sources.extend(section.get("items",[])[:5])
    results=[];seen=set()
    for item in sources:
        kind=item.get("type");raw=item.get("tmdb_id")
        try:tid=int(raw)
        except (ValueError,TypeError):continue
        k=(kind,tid)
        if kind not in ("tv","movie") or tid<=0 or k in seen:continue
        seen.add(k);results.append(k)
    return results

def build(root:Path,fetch=api,limit:int=MAX_PER_RUN):
    path=root/"data/reviews.json"
    store=read(path,{"schema":1,"source":"TMDB","items":{}})
    if store.get("schema")!=1 or not isinstance(store.get("items"),dict):
        raise ValueError("Unexpected review archive schema")
    results=store["items"]
    work=[]
    for kind,tid in candidate_ids(root):
        old=results.get(kind+":"+str(tid),{})
        checked=old.get("checked_at")
        try:due=(TODAY-dt.date.fromisoformat(checked)).days>=RECHECK_DAYS
        except (ValueError,TypeError):due=True
        if due:work.append((kind,tid))
    checked=0;collected=0
    for kind,tid in work[:limit]:
        try:
            payload=fetch(kind,tid)
            if not isinstance(payload.get("results"),list):continue
            rows=[]
            for record in payload["results"]:
                parsed=extract(record)
                if parsed and all(x["id"]!=parsed["id"] for x in rows):
                    rows.append(parsed)
                if len(rows)>=3:break
            key=kind+":"+str(tid)
            old=results.get(key,{})
            # Do not delete previously collected reviews because a temporary
            # API filtering issue returned none. Record a fresh checked date.
            results[key]={"checked_at":TODAY.isoformat(),
                          "reviews":rows if rows else old.get("reviews",[])}
            checked+=1
            collected+=len(rows)
        except (OSError,TimeoutError,ValueError,KeyError) as err:
            print("Reviews unavailable for",kind,tid,type(err).__name__)
    payload={"schema":1,"source":"TMDB","language":"it","items":results,
             "updated_at":dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()}
    if checked:
        path.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Review enrichment: checked={checked}, Italian review previews={collected}, previously cached={len(results)}")
    return checked,collected

def main():
    if not TOKEN:
        print("Reviews skipped: no TMDB token; existing archive unchanged")
        return
    build(Path("."))

if __name__=="__main__":
    main()
