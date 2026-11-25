#!/usr/bin/env python3
"""Incrementally merge validated CasaFlix catalogs into Bobo's retained library.

New TMDB IDs are appended, known IDs receive upstream metadata updates, and IDs
temporarily missing upstream are preserved. Never merge an empty/corrupt source.
No external API calls: the GitHub workflow fetches the source repo.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

MINIMUM_ITEMS=100

def key(item):
    if not isinstance(item,dict):return None
    try:
        i=int(item.get("tmdb_id") or 0)
    except (TypeError,ValueError):return None
    return str(i) if i>0 else None

def load(path,require_items=True):
    value=json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(value,dict) or not isinstance(value.get("items"),list):
        raise ValueError(f"Invalid catalog shape: {path}")
    if require_items and len(value["items"])<MINIMUM_ITEMS:
        raise ValueError(f"Suspiciously small catalog: {path} ({len(value['items'])} items)")
    return value

def merge(previous,incoming):
    old={key(x):x for x in previous["items"] if key(x)}
    fresh={}
    for row in incoming["items"]:
        ident=key(row)
        if ident is None:continue
        if ident in fresh:
            raise ValueError(f"Duplicate upstream TMDB identifier {ident}")
        fresh[ident]=row
    if len(fresh)<MINIMUM_ITEMS:raise ValueError("Upstream contains too few unique IDs")
    retained=[row for ident,row in old.items() if ident not in fresh]
    merged={**incoming,"items":list(fresh.values())+retained}
    changes=sum(1 for ident,row in fresh.items() if ident in old and old[ident]!=row)
    return merged, {"previous":len(old),"upstream":len(fresh),"added":sum(1 for x in fresh if x not in old),
                    "updated":changes,"retained":len(retained),"total":len(merged["items"])}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--current",required=True)
    parser.add_argument("--upstream",required=True)
    parser.add_argument("--kind",choices=("movie","tv"),required=True)
    options=parser.parse_args()
    upstream=load(options.upstream)
    current_path=Path(options.current)
    old=load(current_path) if current_path.exists() else {"items":[]}
    merged,stats=merge(old,upstream)
    payload=json.dumps(merged,ensure_ascii=False,separators=(",",":"))+"\n"
    # Preserve the exact prior bytes when the catalog has not changed semantically.
    if not current_path.exists() or old!=merged:
        current_path.write_text(payload,encoding="utf-8")
    print("Incremental %s: %s" % (options.kind,", ".join(f"{k}={v}" for k,v in stats.items())))
if __name__=="__main__":main()
