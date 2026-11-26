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
KNOWN_PROVIDERS = {"netflix","prime","disney","apple","paramount","skygo","now",
                   "hbo","rai","mediaset","crunchyroll"}


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
    # Keep historical, date-stamped provider observations indefinitely.
    # Frontend hides stale facts after 90 days to avoid misleading availability.
    def record(kind: str, ident: object, provider: str, observed: str = TODAY) -> None:
        if kind not in KINDS or provider not in KNOWN_PROVIDERS:
            return
        try:
            observed_date = dt.date.fromisoformat(observed)
            if observed_date > dt.date.today():
                return
        except (ValueError,TypeError):
            return
        title = ledger["items"].get(kind,{}).get(str(ident))
        if title is None:
            return
        if len(title) < 3:
            title.append({})
        if not isinstance(title[2],dict):
            title[2] = {}
        if title[2].get(provider,"") < observed:
            title[2][provider] = observed

    try:
        feed = json.loads(Path("data/discovery.json").read_text(encoding="utf-8"))
        monthly = (feed.get("streaming") or {}).get("platforms",[])
        availability = feed.get("platforms",[])
        for platform in monthly + availability:
            name = str(platform.get("id",""))
            if name not in KNOWN_PROVIDERS:
                continue
            for title in platform.get("items",[]):
                record(title.get("type"),title.get("tmdb_id"),name)
    except (OSError,ValueError,TypeError,AttributeError):
        pass

    # A TMDB watch-provider observation is explicitly associated with its
    # title even when absent from current monthly platform highlights.
    try:
        enrichment = json.loads(Path("data/enrichment.json").read_text(encoding="utf-8"))
        for key,details in enrichment.get("items",{}).items():
            kind, _, ident = key.partition(":")
            prov = details.get("providers_it") if isinstance(details,dict) else None
            if not isinstance(prov,dict) or prov.get("region") != "IT":
                continue
            observed = prov.get("observed_at")
            for name in prov.get("flatrate",[]):
                record(kind,ident,name,observed)
    except (OSError,ValueError,TypeError,AttributeError):
        pass
    serialized = json.dumps(ledger,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n"
    if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != serialized:
        TARGET.write_text(serialized,encoding="utf-8")


if __name__ == "__main__":
    main()
