#!/usr/bin/env python3
"""Compact, persistent TMDB ID ledger; never duplicates the ~13MB catalog.

First/last observed date are when *Bobo* saw the title, not a movie release
date nor a claim about availability on any streaming service.
"""
from __future__ import annotations
import datetime as dt
import json
from pathlib import Path

TARGET = Path("data/catalog-ledger.json")
TODAY = dt.date.today().isoformat()
KINDS = {"movie":"data/movies.json", "tv":"data/tv.json"}
MAX_PER_KIND = 90000


def main() -> None:
    try:
        ledger = json.loads(TARGET.read_text(encoding="utf-8"))
        if ledger.get("schema") != 1:
            raise ValueError("Unknown ledger format")
    except FileNotFoundError:
        ledger = {"schema":1, "first_indexed_at":TODAY, "items":{"movie":{}, "tv":{}}}
    for kind, filename in KINDS.items():
        data = json.loads(Path(filename).read_text(encoding="utf-8"))
        old = ledger["items"].setdefault(kind,{})
        count_new = 0
        for row in data.get("items",[]):
            tid = row.get("tmdb_id")
            if tid is None:
                continue
            ident = str(tid)
            if ident not in old:
                old[ident] = [TODAY,TODAY]
                count_new += 1
            else:
                old[ident][1] = TODAY
        # Only limit extreme historical growth, never prune current identifiers.
        if len(old) > MAX_PER_KIND:
            current = {str(x["tmdb_id"]) for x in data.get("items",[]) if x.get("tmdb_id") is not None}
            expired = [(id,dates) for id,dates in old.items() if id not in current]
            expired.sort(key=lambda x:x[1][1])
            for key,_ in expired[:len(old)-MAX_PER_KIND]:
                old.pop(key,None)
        print(f"Catalog ledger {kind}: {len(old)} IDs, {count_new} first seen today")
    serialized = json.dumps(ledger,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n"
    if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != serialized:
        TARGET.write_text(serialized,encoding="utf-8")


if __name__ == "__main__":
    main()
