#!/usr/bin/env python3
"""Build a compact editorial digest, using only existing verified Bobo data.

The weekly feed lists recently reported streaming additions. Provider-specific
monthly lists are a separate scope and labeled as such in the newsletter.
No paid API, scraping in PHP, or API key is needed.
"""
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime,timezone

OUT=Path("data/newsletter.json")
def load(p): return json.loads(Path(p).read_text(encoding="utf-8"))
def main():
    index={}
    for kind,filename in (("movie","data/movies.json"),("tv","data/tv.json")):
        for item in load(filename).get("items",[]):
            if item.get("tmdb_id"):
                index[(kind,str(item["tmdb_id"]))]=item
    feed=load("data/discovery.json")
    streaming=feed.get("streaming",{})
    def resolve(rows,cap):
        found=set();result=[]
        for row in rows:
            kind=row.get("type")
            ident=str(row.get("tmdb_id",""))
            if kind not in ("movie","tv") or (kind,ident) in found:continue
            item=index.get((kind,ident))
            if not item or not item.get("title"):continue
            found.add((kind,ident))
            url=str(item.get("poster") or "")
            if url.startswith("/"):
                url="https://image.tmdb.org/t/p/w342"+url
            if not url.startswith("https://image.tmdb.org/t/p/"):url=""
            result.append({
                "type":kind,
                "tmdb_id":int(ident),
                "title":str(item["title"])[:180],
                "year":int(item.get("year") or 0),
                "poster":url[:350]
            })
            if len(result)>=cap:break
        return result
    weekly=resolve(streaming.get("items",[]),8)
    providers=[]
    allowed={"netflix":"Netflix","prime":"Prime Video","disney":"Disney+","apple":"Apple TV+"}
    for row in streaming.get("platforms",[]):
        key=row.get("id")
        if key not in allowed:continue
        items=resolve(row.get("items",[]),4)
        if items:providers.append({"id":key,"label":allowed[key],"period":"month","items":items})
    if not weekly and not providers:
        raise SystemExit("Newsletter digest empty: retaining prior published data")
    payload={"schema":1,
       "updated_at":datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
       "weekly":weekly,
       "platforms":providers,
       "disclaimer":"Provider lists are monthly additions reported for Italy; weekly section is separate."}
    text=json.dumps(payload,ensure_ascii=False,indent=2,sort_keys=True)+"\n"
    if not OUT.exists() or OUT.read_text(encoding="utf-8")!=text:
        OUT.write_text(text,encoding="utf-8")
    print(f"Newsletter digest: {len(weekly)} weekly titles, "+
          ", ".join(f"{p['label']} {len(p['items'])}" for p in providers))

if __name__=="__main__":main()
