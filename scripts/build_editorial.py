#!/usr/bin/env python3
"""Persistent, catalog-only editorial discovery. No external API calls or secrets."""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import json
import math

ROOT=Path("data")
OUT=ROOT/"editorial.json"
HISTORY=ROOT/"editorial-history.json"
NOW=datetime.now(timezone.utc)
WEEK=int(NOW.strftime("%G%V"))
GENRES={
 "thriller":("thriller","mistero","crime","giallo"),
 "comedy":("commedia",),
 "scifi":("fantascienza","science fiction","fantasy"),
}
def read(path, default):
 try: return json.loads(path.read_text(encoding="utf-8"))
 except (OSError,ValueError): return default

def key(item): return str(item["type"])+":"+str(item["tmdb_id"])
def score(item):
 vote=float(item.get("vote") or 0)
 count=float(item.get("vote_count") or 0)
 # Bayesian smoothing prevents tiny samples from dominating if counts exist.
 confidence=min(1.0,math.log1p(max(0,count))/math.log1p(500)) if count else .65
 return round((vote-5.5)*confidence*2 + min(max(0,int(item.get("year") or 0)-1990),36)*.018,3)
def fit(item):
 return item.get("poster") and item.get("overview") and 1900<=int(item.get("year") or 0)<=NOW.year and 6.6<=float(item.get("vote") or 0)<=10
def short(item):
 return {"type":item["type"],"tmdb_id":int(item["tmdb_id"]),"title":str(item.get("title") or "")[:160],
 "year":int(item.get("year") or 0),"vote":float(item.get("vote") or 0),
 "poster":item.get("poster"),"overview":str(item.get("overview") or "")[:280],
 "genres":list(item.get("genres") or [])[:7],"runtime":int(item.get("runtime") or 0)}
def main():
 items={}
 for kind in ("movie","tv"):
  for entry in read(ROOT/(("movies" if kind=="movie" else "tv")+".json"),{}).get("items",[]):
   if entry.get("tmdb_id") and entry.get("title"):
    item=dict(entry,type=kind);items[key(item)]=item
 discovery=read(ROOT/"discovery.json",{})
 stream=discovery.get("streaming") or {}
 trending={str(x.get("type"))+":"+str(x.get("tmdb_id")) for x in discovery.get("trending",[])}
 arrivals={str(x.get("type"))+":"+str(x.get("tmdb_id")) for x in stream.get("items",[])}
 for provider in stream.get("platforms",[]):
  arrivals.update(str(x.get("type"))+":"+str(x.get("tmdb_id")) for x in provider.get("items",[]))
 archive=read(HISTORY,{"schema":1,"titles":{},"issues":[]})
 known=archive.get("titles",{})
 previous={k for issue in archive.get("issues",[])[-4:] for k in issue.get("ids",[])}
 eligible=[x for x in items.values() if fit(x)]
 def order(rows,penalty=True):
  return sorted(rows,key=lambda x:(score(x)+(0.8 if key(x) in trending else 0)-(.95 if penalty and key(x) in previous else 0),key(x)),reverse=True)
 used=set()
 sections=[]
 def add(name,title,subtitle,rows,limit=12):
  choice=[]
  for item in order(rows):
   k=key(item)
   if k in used:continue
   used.add(k);choice.append(short(item))
   if len(choice)>=limit:break
  if len(choice)>=4:sections.append({"id":name,"title":title,"subtitle":subtitle,"items":choice})
 recent=[x for x in eligible if int(x.get("year") or 0)>=NOW.year-3]
 # Prefer one-off stories, not old long-running TV shows with newly added episodes.
 add("week","Da vedere questa settimana","Film e serie selezionati per qualità",recent,10)
 add("hidden","Gemme nascoste","Film apprezzati che meritano più attenzione",
     [x for x in eligible if x["type"]=="movie" and 1995<=int(x.get("year") or 0)<=NOW.year-2],12)
 add("mini","Serie da divorare","Serie di qualità, da scoprire o recuperare",
     [x for x in eligible if x["type"]=="tv" and 2010<=int(x.get("year") or 0)],12)
 add("cinephiles","Consigliati dai cinefili","Storie memorabili oltre le classifiche",
     [x for x in eligible if float(x.get("vote") or 0)>=7.7],12)
 add("classics","Grandi film da recuperare","Ottimi film che vale la pena (ri)vedere",
     [x for x in eligible if x["type"]=="movie" and 1970<=int(x.get("year") or 0)<=2014],12)
 add("new","Novità interessanti","Titoli recenti, filtrati per qualità",
     [x for x in recent if key(x) in arrivals or key(x) in trending],10)
 # Persist selection provenance even when a title falls out of the current shelves.
 for section in sections:
  for entry in section["items"]:
   k=key(entry);row=known.setdefault(k,{"first_seen":NOW.date().isoformat(),"sources":[],"categories":[]})
   row["last_seen"]=NOW.date().isoformat()
   if section["id"] not in row["categories"]:row["categories"].append(section["id"])
   for source in (["tmdb-trending"] if k in trending else [])+(["streaming-observation"] if k in arrivals else [])+["bobo-editorial"]:
    if source not in row["sources"]:row["sources"].append(source)
 # Recent editorial overlap gives a small explainable related-title graph.
 bykey={key(x):x for x in eligible}
 selected={key(x) for s in sections for x in s["items"]}
 relations={}
 for k in selected:
  origin=bykey.get(k)
  if not origin:continue
  og=set(str(g).lower() for g in origin.get("genres") or [])
  ranked=[]
  for other in eligible:
   otherkey=key(other)
   if k==otherkey:continue
   shared=len(og & set(str(g).lower() for g in other.get("genres") or []))
   if not shared:continue
   weight=shared*2+max(0,4-abs(int(other.get("year") or 0)-int(origin.get("year") or 0)))*.15+max(0,float(other.get("vote") or 0)-7)*.3
   if otherkey in selected:weight+=.5
   ranked.append((weight,otherkey))
  relations[k]=[{"type":bykey[k2]["type"],"tmdb_id":int(bykey[k2]["tmdb_id"])} for _,k2 in sorted(ranked,reverse=True)[:8]]
 issue={"week":NOW.strftime("%G-W%V"),"ids":[key(x) for s in sections for x in s["items"]]}
 issues=[x for x in archive.get("issues",[]) if x.get("week")!=issue["week"]][-51:]+[issue]
 payload={"schema":1,"generated_at":NOW.replace(microsecond=0).isoformat(),"region":"IT","sections":sections,"related":relations,
 "method":"Selezione automatica dai metadati TMDB del catalogo Bobo; non equivale a recensioni editoriali esterne."}
 OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 HISTORY.write_text(json.dumps({"schema":1,"titles":known,"issues":issues},ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 print("Editorial sections:",len(sections),"archived titles:",len(known))
if __name__=="__main__":main()
