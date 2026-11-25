#!/usr/bin/env python3
"""Publish a small TMDB poster-path lookup for authorized account admin cards."""
from __future__ import annotations
import json
import re
from pathlib import Path

OUT=Path("data/poster-index.json")
KINDS={"movie":Path("data/movies.json"),"tv":Path("data/tv.json")}
PATH=re.compile(r"^/[A-Za-z0-9_-]{5,180}\.(?:jpg|jpeg|png|webp)$")
FULL=re.compile(r"^https://image\.tmdb\.org/t/p/(?:w[0-9]+|original)(/[A-Za-z0-9_-]{5,180}\.(?:jpg|jpeg|png|webp))$")
def poster(raw):
    value=str(raw or "")
    if PATH.fullmatch(value):return value
    matched=FULL.fullmatch(value)
    return matched.group(1) if matched else ""
def build():
    index={}
    for kind,path in KINDS.items():
        catalog=json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(catalog.get("items"),list) or not catalog["items"]:
            raise ValueError("Missing catalog items: "+str(path))
        result={}
        for item in catalog["items"]:
            try: ident=str(int(item.get("tmdb_id") or 0))
            except (TypeError,ValueError): continue
            if ident=="0":continue
            path=poster(item.get("poster") or item.get("poster_path"))
            if path:result[ident]=path
        index[kind]=result
    return {"schema":1,"items":index}
def main():
    document=build()
    content=json.dumps(document,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n"
    if not OUT.exists() or OUT.read_text(encoding="utf-8")!=content:
        OUT.write_text(content,encoding="utf-8")
    print("Poster index:",", ".join(f"{k} {len(v)}" for k,v in document["items"].items()))
if __name__=="__main__": main()
