#!/usr/bin/env python3
"""Incremental recommendations for the complete Bobo catalog.

All recommendations are derived from the existing TMDB catalog (genre, year,
rating, original language). Small modulo shards keep each watch-page request
lightweight. Never replace historical entries when a source is unavailable.
"""
from __future__ import annotations
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path
import re

SHARDS=64
LIMIT=140
IMG=re.compile(r"^https://image\.tmdb\.org/t/p/(?:w\d+|original)/([a-zA-Z0-9_-]{4,200}\.(?:jpg|jpeg|png|webp))$")
def read(path,default=None):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,ValueError):return {} if default is None else default
def write(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    content=json.dumps(payload,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n"
    if not path.exists() or path.read_text(encoding="utf-8")!=content:
        path.write_text(content,encoding="utf-8")
def shard(tid:int)->str:return f"{tid%SHARDS:02x}"
def key(row):return row["type"]+":"+str(row["tmdb_id"])
def candidates(root):
    rows=[]
    for kind,file in (("movie","movies.json"),("tv","tv.json")):
        data=read(root/"data"/file)
        for raw in data.get("items",[]):
            if not isinstance(raw,dict) or not raw.get("tmdb_id") or not raw.get("title"):continue
            image=IMG.fullmatch(raw.get("poster") or "")
            if not image:continue
            genres=frozenset(str(g).casefold() for g in raw.get("genres",[]) if g)
            try:
                tid=int(raw["tmdb_id"])
                year=int(raw.get("year") or 0)
                vote=float(raw.get("vote") or 0)
            except (ValueError,TypeError):continue
            if tid<=0:continue
            rows.append({"type":kind,"tmdb_id":tid,"title":str(raw["title"])[:110],
                         "poster":image.group(1),"year":year,"vote":vote,"genres":genres,
                         "original_language":raw.get("original_language") or ""})
    return rows
def compute(rows,limit):
    # genre index avoids comparing each of the ~20k titles to every other title.
    by_genre=defaultdict(set)
    for i,row in enumerate(rows):
        for genre in row["genres"]:by_genre[genre].add(i)
    def score(origin,other):
        common=len(origin["genres"] & other["genres"])
        if not common:return -1
        years=abs(origin["year"]-other["year"]) if origin["year"] and other["year"] else 30
        lang=0.8 if origin["original_language"] and origin["original_language"]==other["original_language"] else 0
        same_type=0.45 if origin["type"]==other["type"] else 0
        return common*4 + max(0,5-years)*.28 + min(other["vote"],9)*.21 + lang + same_type
    for origin in rows:
        pool=set()
        for genre in origin["genres"]:pool.update(by_genre.get(genre,()))
        scored=[]
        for idx in pool:
            other=rows[idx]
            if key(other)==key(origin) or other["vote"]<4.5:continue
            weight=score(origin,other)
            if weight<0:continue
            scored.append((weight,other["vote"],other["year"],key(other),other))
        scored.sort(reverse=True,key=lambda z:z[:4])
        picked=[[r["type"],r["tmdb_id"],r["title"],r["year"],r["poster"]] for *_,r in scored[:8]]
        yield key(origin),shard(origin["tmdb_id"]),picked

def build(root:Path,limit:int=LIMIT):
    folder=root/"data"/"related"
    folder.mkdir(parents=True,exist_ok=True)
    loaded={}
    for path in folder.glob("[0-3][0-9a-f].json"):
        if path.stem=="status":continue
        content=read(path,{"schema":1,"items":{}})
        if content.get("schema")==1 and isinstance(content.get("items"),dict):
            loaded[path.stem]=content["items"]
    indexed=set(k for entries in loaded.values() for k in entries)
    rows=candidates(root)
    # Prioritize editorial selections and high-quality recent titles in the first
    # few runs, then continue the full stable catalog without discarding entries.
    editorial=read(root/"data/editorial.json")
    featured=set()
    for section in editorial.get("sections",[]):
        for item in section.get("items",[]):
            if item.get("type") in ("movie","tv") and item.get("tmdb_id"):featured.add(key(item))
    due=[r for r in rows if key(r) not in indexed]
    due.sort(key=lambda r:(key(r) in featured,r["year"]>=dt.date.today().year-4,
                           r["vote"],r["year"],key(r)),reverse=True)
    if not due:return {"indexed":len(indexed),"eligible":len(rows),"added":0,"remaining":max(0,len(rows)-len(indexed))}
    # Compute a limited batch using the whole catalog as the recommendation pool.
    targets=set(key(r) for r in due[:limit])
    touched=set()
    added=0
    for k,bucket,picks in compute(rows,limit):
        if k not in targets:continue
        loaded.setdefault(bucket,{})[k]=picks
        touched.add(bucket)
        added+=1
    for bucket in touched:
        write(folder/(bucket+".json"),{"schema":1,"items":loaded[bucket]})
    status={"schema":1,"source":"Bobo-local-metadata",
            "updated_at":dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "indexed":len(indexed)+added,"eligible":len(rows),
            "added":added,"remaining":max(0,len(rows)-len(indexed)-added)}
    write(folder/"status.json",status)
    print("Bobo incremental related:",status)
    return status
if __name__=="__main__":build(Path("."))
