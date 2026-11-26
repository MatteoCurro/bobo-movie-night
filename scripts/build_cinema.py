#!/usr/bin/env python3
"""Populate compact credits, people, and verified award metadata incrementally.

Only TMDB credentials already stored in GitHub Actions are used. Person and film
identifiers are TMDB ids; awards come from Wikidata and retain their provenance.
The full 20k-title catalog is never expanded with redundant cast payloads.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

TODAY = dt.date.today().isoformat()
TOKEN = (os.environ.get("TMDB_ACCESS_TOKEN") or "").strip()
BASE = "https://api.themoviedb.org/3"
CREDITS_LIMIT = max(1, min(80, int(os.environ.get("BOBO_CREDITS_BATCH", "32"))))
PEOPLE_LIMIT = max(1, min(35, int(os.environ.get("BOBO_PEOPLE_BATCH", "12"))))
AWARDS_LIMIT = max(1, min(50, int(os.environ.get("BOBO_AWARDS_BATCH", "24"))))
IMAGE_RE = re.compile(r"^/[A-Za-z0-9_-]{5,180}\.(?:jpg|jpeg|png|webp)$")
AWARD_RE = re.compile(r"oscar|academy award|accademia.*cinematograf|palme d.or|palma d.oro|festival de cannes|festival di cannes|cannes film festival", re.I)


def load(path: Path, default=None):
    if not path.is_file():
        return {} if default is None else default
    with path.open(encoding="utf-8-sig") as f:
        return json.load(f)


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != serialized:
        path.write_text(serialized, encoding="utf-8")


def bucket(value: int):
    return format(int(value) % 128, "02x")


def media_key(kind: str, mid: int):
    return f"{kind}:{int(mid)}"


def portrait(path):
    return "https://image.tmdb.org/t/p/w342" + path if isinstance(path, str) and IMAGE_RE.fullmatch(path) else ""


def tmdb(path: str, params=None):
    if not TOKEN:
        raise RuntimeError("TMDB credentials missing")
    query = dict(params or {})
    headers = {"Accept": "application/json", "User-Agent": "BoboMovieNight/2.1 (metadata sync)"}
    if TOKEN.startswith("eyJ") or TOKEN.startswith("Bearer "):
        headers["Authorization"] = "Bearer " + TOKEN.removeprefix("Bearer ").strip()
    else:
        query["api_key"] = TOKEN
    url = BASE + path + "?" + urllib.parse.urlencode(query)
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        return json.load(response)


def expires(date, days):
    try:
        return (dt.date.today() - dt.date.fromisoformat(date)).days >= days
    except (ValueError, TypeError):
        return True


class Shards:
    def __init__(self, root, folder):
        self.root = root / "data" / "cinema" / folder
        self.memory = {}
        self.dirty = set()

    def group(self, value):
        b = bucket(value)
        if b not in self.memory:
            doc = load(self.root / (b + ".json"), {"schema": 1, "items": {}})
            self.memory[b] = doc.get("items", {}) if doc.get("schema") == 1 else {}
        return b, self.memory[b]

    def get(self, value, key):
        return self.group(value)[1].get(str(key))

    def put(self, value, key, data):
        b, rows = self.group(value)
        if rows.get(str(key)) != data:
            rows[str(key)] = data
            self.dirty.add(b)

    def flush(self):
        for b in sorted(self.dirty):
            write(self.root / (b + ".json"), {"schema": 1, "items": self.memory[b]})


def catalog(root):
    by_key = {}
    for kind, filename in (("movie", "movies.json"), ("tv", "tv.json")):
        for row in load(root / "data" / filename).get("items", []):
            if not isinstance(row, dict):
                continue
            try:
                mid = int(row["tmdb_id"])
            except (ValueError, KeyError, TypeError):
                continue
            if mid > 0:
                by_key[media_key(kind, mid)] = {**row, "type": kind}
    return by_key


def priority_keys(root, titles):
    ranked, seen = [], set()

    def add(row):
        if isinstance(row, dict) and row.get("type") in ("movie", "tv"):
            try:
                key = media_key(row["type"], row["tmdb_id"])
            except (KeyError, ValueError, TypeError):
                return
            if key in titles and key not in seen:
                ranked.append(key)
                seen.add(key)

    def walk(node, depth=0):
        if depth > 6:
            return
        if isinstance(node, list):
            for item in node:
                walk(item, depth + 1)
        elif isinstance(node, dict):
            add(node)
            for key, value in node.items():
                if key not in ("related", "overview", "description", "review", "history"):
                    if isinstance(value, (list, dict)):
                        walk(value, depth + 1)

    walk(load(root / "data" / "discovery.json"))
    walk(load(root / "data" / "editorial.json"))
    # Stable fallback, then older/less visible titles once priority rows are complete.
    fallback = sorted(titles, key=lambda key: (-float(titles[key].get("vote") or 0), key))
    ranked.extend(k for k in fallback if k not in seen)
    return ranked


def extract_credits(kind, mid, payload):
    source = payload.get("aggregate_credits", {}) if kind == "tv" else payload.get("credits", {})
    cast, crew = [], []
    for row in source.get("cast") or []:
        try:
            person_id = int(row.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if person_id <= 0 or not row.get("name"):
            continue
        roles = row.get("roles") or []
        character = roles[0].get("character", "") if kind == "tv" and roles else row.get("character", "")
        cast.append({"id": person_id, "name": str(row["name"])[:140],
                     "character": str(character or "")[:180], "photo": portrait(row.get("profile_path"))})
        if len(cast) >= 16:
            break
    for row in source.get("crew") or []:
        jobs = [x.get("job") for x in row.get("jobs") or []] if kind == "tv" else [row.get("job")]
        if not any(j in ("Director", "Creator", "Writer", "Screenplay") for j in jobs):
            continue
        try:
            person_id = int(row.get("id") or 0)
        except (ValueError, TypeError):
            continue
        if person_id <= 0 or not row.get("name"):
            continue
        job = next((j for j in jobs if j in ("Director", "Creator", "Writer", "Screenplay")), "")
        if any(x["id"] == person_id and x["job"] == job for x in crew):
            continue
        crew.append({"id": person_id, "name": str(row["name"])[:140], "job": job})
        if len(crew) >= 8:
            break
    return {"source": "tmdb", "checked_at": TODAY, "cast": cast, "crew": crew,
            "tagline": str(payload.get("tagline") or "")[:250]}


def stub_person(person, known):
    return {"id": person["id"], "name": person["name"], "photo": person.get("photo", ""),
            "known_for": [known], "source": "tmdb"}


def hydrate_person(person_id, base, titles, response):
    credits = response.get("combined_credits") or {}
    works, seen = [], set()
    for row in credits.get("cast") or []:
        kind = row.get("media_type")
        if kind not in ("movie", "tv"):
            continue
        try:
            key = media_key(kind, row["id"])
        except (ValueError, TypeError, KeyError):
            continue
        if key in seen or key not in titles:
            continue
        seen.add(key)
        item = titles[key]
        works.append({"type": kind, "tmdb_id": item["tmdb_id"], "title": item["title"],
                      "year": item.get("year"), "poster": item.get("poster", ""),
                      "character": str(row.get("character") or "")[:120]})
    works.sort(key=lambda x: (-(int(x.get("year") or 0)), x["title"]))
    output = dict(base)
    output.update({"name": str(response.get("name") or base["name"])[:140],
                   "photo": portrait(response.get("profile_path")) or base.get("photo", ""),
                   "birthday": str(response.get("birthday") or "")[:10],
                   "deathday": str(response.get("deathday") or "")[:10],
                   "place_of_birth": str(response.get("place_of_birth") or "")[:220],
                   "biography": str(response.get("biography") or "")[:6000],
                   "filmography": works[:60], "checked_at": TODAY, "source": "tmdb"})
    return output


def award_entries(bindings, ids):
    found = {str(x): [] for x in ids}
    seen = set()
    for row in bindings:
        tmdb_id = (row.get("tmdb") or {}).get("value", "")
        name = (row.get("awardLabel") or {}).get("value", "")
        if tmdb_id not in found or not AWARD_RE.search(name):
            continue
        result = (row.get("result") or {}).get("value", "")
        if result not in ("won", "nominated"):
            continue
        value = (row.get("award") or {}).get("value", "")
        qid = value.rsplit("/", 1)[-1]
        if not re.fullmatch(r"Q\d+", qid):
            continue
        raw_year = (row.get("date") or {}).get("value", "")
        year = int(raw_year[:4]) if re.match(r"^\d{4}-", raw_year) else None
        event = "Oscar" if re.search(r"oscar|academy award|accademia.*cinematograf", name, re.I) else "Cannes"
        fingerprint = (tmdb_id, qid, result, year)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        found[tmdb_id].append({"event": event, "category": name[:180],
                               "outcome": result, "year": year, "source": "wikidata",
                               "source_url": "https://www.wikidata.org/wiki/" + qid})
    # Wikidata may record a win as both nominated (P1411) and received
    # (P166). Keep the win rather than displaying contradictory badges.
    for tmdb_id, records in found.items():
        wins = {(a["source_url"], a["year"]) for a in records if a["outcome"] == "won"}
        found[tmdb_id] = [a for a in records
                          if a["outcome"] == "won" or
                          (a["source_url"], a["year"]) not in wins]
    return found


def wikidata_awards(ids):
    # Two distinct statement properties: received award P166 and nomination P1411.
    # Attribution of acting awards to individual cast members is a later stage.
    values = " ".join(json.dumps(str(x)) for x in ids)
    query = (
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/> "
        "PREFIX p: <http://www.wikidata.org/prop/> "
        "PREFIX ps: <http://www.wikidata.org/prop/statement/> "
        "PREFIX pq: <http://www.wikidata.org/prop/qualifier/> "
        "PREFIX wikibase: <http://wikiba.se/ontology#> "
        "PREFIX bd: <http://www.bigdata.com/rdf#> "
        "SELECT ?tmdb ?award ?awardLabel ?result ?date WHERE { "
        f"VALUES ?tmdb {{ {values} }} ?work wdt:P4947 ?tmdb . "
        "{ ?work p:P166 ?stmt . ?stmt ps:P166 ?award . BIND(\"won\" AS ?result) } "
        "UNION { ?work p:P1411 ?stmt . ?stmt ps:P1411 ?award . BIND(\"nominated\" AS ?result) } "
        "OPTIONAL { ?stmt pq:P585 ?date } "
        'SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". } '
        "} LIMIT 300"
    )
    uri = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query, "format": "json"})
    headers = {"User-Agent": "BoboMovieNight/2.1 (incremental awards indexing; contact via GitHub MatteoCurro/bobo-movie-night)",
               "Accept": "application/sparql-results+json"}
    with urllib.request.urlopen(urllib.request.Request(uri, headers=headers), timeout=30) as response:
        rows = json.load(response).get("results", {}).get("bindings", [])
    return award_entries(rows, ids)


def sync(root=Path(".")):
    if not TOKEN:
        print("::notice::TMDB secret absent: cached cinema data preserved, no API calls")
        return {"credits": 0, "people": 0, "awards_checked": 0}
    titles = catalog(root)
    if not titles:
        raise ValueError("Bobo catalog is empty; refusing to overwrite existing indexes")
    priority = priority_keys(root, titles)
    credits = Shards(root, "credits")
    people = Shards(root, "people")
    processed = failed = 0
    for key in priority:
        if processed >= CREDITS_LIMIT or failed >= 8:
            break
        kind, midstr = key.split(":")
        mid = int(midstr)
        existing = credits.get(mid, key)
        if existing and not expires(existing.get("checked_at"), 365):
            continue
        try:
            payload = tmdb(f"/{kind}/{mid}", {"language": "it-IT",
                           "append_to_response": "aggregate_credits" if kind == "tv" else "credits"})
            entry = extract_credits(kind, mid, payload)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
            failed += 1
            print(f"::warning::Credits {key}: {exc}")
            continue
        if existing:
            for key_to_keep in ("awards", "awards_checked_at"):
                if key_to_keep in existing:
                    entry[key_to_keep] = existing[key_to_keep]
        credits.put(mid, key, entry)
        work = {"type": kind, "tmdb_id": mid, "title": titles[key]["title"],
                "year": titles[key].get("year"), "poster": titles[key].get("poster", "")}
        for actor in entry["cast"] + entry["crew"]:
            pid = actor["id"]
            saved = people.get(pid, pid)
            if not saved:
                people.put(pid, pid, stub_person(actor, work))
            elif not any(w.get("type") == kind and str(w.get("tmdb_id")) == str(mid)
                         for w in saved.get("known_for", [])):
                updated = dict(saved)
                updated["known_for"] = (list(saved.get("known_for") or []) + [work])[:50]
                people.put(pid, pid, updated)
        processed += 1
    full_people = 0
    # Hydrate a bounded number of newly known people, prioritizing cast order.
    all_people = []
    for data in people.memory.values():
        all_people.extend(data.values())
    # Include existing shard entries, even when no new title was processed.
    for path in sorted(people.root.glob("*.json")):
        b = path.stem
        if b not in people.memory:
            people.memory[b] = load(path, {"items": {}}).get("items", {})
            all_people.extend(people.memory[b].values())
    all_people.sort(key=lambda row: (bool(row.get("checked_at")), -len(row.get("known_for") or []), row.get("id", 0)))
    for base in all_people:
        if full_people >= PEOPLE_LIMIT or failed >= 8:
            break
        if not expires(base.get("checked_at"), 180):
            continue
        pid = int(base["id"])
        try:
            response = tmdb(f"/person/{pid}", {"language": "it-IT", "append_to_response": "combined_credits"})
            hydrated = hydrate_person(pid, base, titles, response)
            if not hydrated.get("biography"):
                english = tmdb(f"/person/{pid}", {"language": "en-US"})
                hydrated["biography"] = str(english.get("biography") or "")[:6000]
                hydrated["biography_language"] = "en"
            people.put(pid, pid, hydrated)
            full_people += 1
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
            failed += 1
            print(f"::warning::Person {pid}: {exc}")
    awards_target = []
    for key in priority:
        if len(awards_target) >= AWARDS_LIMIT:
            break
        if not key.startswith("movie:"):
            continue
        mid = int(key.split(":")[1])
        saved = credits.get(mid, key)
        if saved and expires(saved.get("awards_checked_at"), 180):
            awards_target.append(mid)
    award_checked = 0
    wikidata_status_path = root / "data/cinema/wikidata-status.json"
    wikidata_status = load(wikidata_status_path, {})
    # Avoid hitting a slow public SPARQL endpoint twice on the same day.
    if awards_target and not expires(wikidata_status.get("last_failure"), 1):
        print("::notice::Wikidata cooldown active; Oscar archive remains available")
        awards_target = []
    if awards_target:
        try:
            entries = wikidata_awards(awards_target)
            for mid in awards_target:
                key = media_key("movie", mid)
                prior = credits.get(mid, key)
                updated = dict(prior)
                # Never replace independent licensed Oscar records with a sparse
                # Wikidata result. Both providers can coexist with provenance.
                external = [a for a in prior.get("awards", [])
                            if a.get("source") != "wikidata"]
                incoming = entries.get(str(mid), [])
                if prior.get("oscar_index") == "2023":
                    # Oscar entries through the historical dataset are sourced
                    # consistently from the same index, not duplicated.
                    incoming = [a for a in incoming if a.get("event") != "Oscar"]
                updated["awards"] = external + incoming
                updated["awards_checked_at"] = TODAY
                credits.put(mid, key, updated)
                award_checked += 1
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as exc:
            write(wikidata_status_path, {"last_failure": TODAY})
            print(f"::warning::Wikidata unavailable; awards retained for retry: {exc}")
    credits.flush()
    people.flush()
    status = {"credits": processed, "people": full_people, "awards_checked": award_checked, "failed_tmdb": failed}
    print("Cinema incremental sync:", json.dumps(status))
    return status


if __name__ == "__main__":
    sync()
