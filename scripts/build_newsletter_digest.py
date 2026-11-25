#!/usr/bin/env python3
"""Newsletter: a concise quality-first selection shared with Discover."""
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime,timezone

ROOT=Path("data")
OUT=ROOT/"newsletter.json"
def load(path):
 try:return json.loads(Path(path).read_text(encoding="utf-8"))
 except (OSError,ValueError):return {}
def item(row):
 poster=str(row.get("poster") or "")
 if poster.startswith("/"):poster="https://image.tmdb.org/t/p/w342"+poster
 if not poster.startswith("https://image.tmdb.org/t/p/"):poster=""
 return {"type":row["type"],"tmdb_id":int(row["tmdb_id"]),"title":str(row["title"])[:160],
         "year":int(row.get("year") or 0),"poster":poster[:350],
         "overview":str(row.get("overview") or "")[:220]}
def main():
 editorial=load(ROOT/"editorial.json")
 sections=editorial.get("sections",[])
 if not isinstance(sections,list) or not sections:
  raise SystemExit("No verified editorial selections: retaining old newsletter digest")
 seen=set()
 def choose(section,limit):
  output=[]
  for entry in section.get("items",[]):
   if not isinstance(entry,dict):continue
   if entry.get("type") not in ("movie","tv") or not entry.get("title") or not entry.get("tmdb_id"):continue
   k=(entry["type"],str(entry["tmdb_id"]))
   if k in seen:continue
   # Safety: an old-running show is not a new weekly feature.
   if entry["type"]=="tv" and int(entry.get("year") or 0)<2010:continue
   if float(entry.get("vote") or 0)<6.6:continue
   seen.add(k);output.append(item(entry))
   if len(output)>=limit:break
  return output
 byid={s.get("id"):s for s in sections if isinstance(s,dict)}
 feature=choose(byid.get("week",{}),3)
 extras=[]
 for key,title,cap in (("hidden","Gemme nascoste",2),("mini","La serie da recuperare",2)):
  rows=choose(byid.get(key,{}),cap)
  if rows:extras.append({"id":key,"title":title,"items":rows})
 if len(feature)<2 or sum(len(s["items"]) for s in extras)<2:
  raise SystemExit("Insufficient quality recommendations: retaining prior digest")
 payload={"schema":1,"updated_at":datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
   "weekly":feature,"sections":extras,"platforms":[],
   "disclaimer":"Selezioni di qualità dal catalogo Bobo; non sono classifiche delle nuove aggiunte alle piattaforme."}
 OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 print("Editorial newsletter:",len(feature),"lead recommendations and",len(extras),"other sections")
if __name__=="__main__":main()
