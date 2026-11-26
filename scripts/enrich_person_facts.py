#!/usr/bin/env python3
"""Optional Wikidata height enrichment for people with complete Bobo profiles.

Only explicitly asserted P2048 values linked by P4985 (person identifier).
Bounded to 12 profiles per day, cached in local JSON shards. No guessing,
shoe sizes or inferences about living people's bodies.
"""
from __future__ import annotations
import datetime as dt
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from build_cinema import Shards, load, write, expires, TODAY

DAILY_BATCH = 12
ENDPOINT = "https://query.wikidata.org/sparql"
UNITS = {"Q11573": 100.0, "Q174728": 1.0, "Q3710": 30.48, "Q218593": 2.54}


def query_heights(ids):
    ids = [int(i) for i in ids if 0 < int(i) < 1000000000][:DAILY_BATCH]
    if not ids:
        return {}
    values = " ".join('"' + str(pid) + '"' for pid in ids)
    sparql = (
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/> "
        "PREFIX p: <http://www.wikidata.org/prop/> "
        "PREFIX psv: <http://www.wikidata.org/prop/statement/value/> "
        "PREFIX wikibase: <http://wikiba.se/ontology#> "
        "SELECT ?id ?amount ?unit WHERE { "
        f"VALUES ?id {{ {values} }} "
        "?person wdt:P4985 ?id; p:P2048/psv:P2048 ?value . "
        "?value wikibase:quantityAmount ?amount; wikibase:quantityUnit ?unit . } LIMIT 50"
    )
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": sparql, "format": "json"})
    request = urllib.request.Request(
        url, headers={"User-Agent": "BoboMovieNight/2.1 (small daily structured person facts)",
                      "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(request, timeout=17) as response:
        rows = json.load(response).get("results", {}).get("bindings", [])
    return parse_heights(rows, ids)


def parse_heights(rows, ids):
    valid = set(int(x) for x in ids)
    found = {}
    for row in rows:
        try:
            pid = int(row["id"]["value"])
            value = float(row["amount"]["value"])
            unit = row["unit"]["value"].rsplit("/", 1)[-1]
        except (KeyError, ValueError, TypeError):
            continue
        cm = value * UNITS.get(unit, 0)
        if pid in valid and 120 <= cm <= 230:
            found[pid] = round(cm)
    return found


def sync(root=Path("."), find=query_heights, today=TODAY):
    status_file = root / "data/cinema/height-status.json"
    status = load(status_file, {})
    if status.get("last_failed") == today or status.get("last_run") == today:
        print("Person height enrichment: daily cooldown")
        return {"updated": 0, "skipped": "daily cooldown"}
    store = Shards(root, "people")
    candidates = []
    for path in sorted(store.root.glob("*.json")):
        for pid, person in load(path, {"items": {}}).get("items", {}).items():
            if not person.get("checked_at") or not expires(person.get("height_checked_at"), 365):
                continue
            candidates.append((int(pid), person))
    # Prefer well-populated biographies, no systematic repeated sparse queries.
    candidates.sort(key=lambda item: (-(len(item[1].get("filmography") or [])), item[0]))
    targets = candidates[:DAILY_BATCH]
    if not targets:
        return {"updated": 0, "checked": 0}
    try:
        found = find([pid for pid, _ in targets])
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError) as exc:
        write(status_file, {"last_failed": today})
        print("::warning::Optional structured person facts unavailable:", type(exc).__name__)
        return {"updated": 0, "checked": 0, "unavailable": True}
    for pid, person in targets:
        item = dict(person, height_checked_at=today)
        if pid in found and 120 <= int(found[pid]) <= 230:
            item.update(height_cm=int(found[pid]), height_source="wikidata")
        store.put(pid, pid, item)
    store.flush()
    write(status_file, {"last_run": today, "checked": len(targets), "found": len(found)})
    outcome = {"updated": len(found), "checked": len(targets)}
    print("Person heights:", json.dumps(outcome))
    return outcome


if __name__ == "__main__":
    sync()
