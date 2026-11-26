#!/usr/bin/env python3
"""Build Bobo's *verified* home discovery lists from TMDB, intersected with Vix catalog.

This script runs in GitHub Actions. It deliberately never puts API credentials in
published HTML/JS and never claims a title was added to a platform today: TMDB's
watch-provider data records availability in Italy, not addition timestamps.

Without a configured token it emits a small, deterministic 'catalog-only' file;
the frontend still renders its genre, year, duration and rating shelves.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://api.themoviedb.org/3"
OUT = Path("data/discovery.json")
CATALOG_PATHS = {"movie": Path("data/movies.json"), "tv": Path("data/tv.json")}
PROVIDERS = [
    {"id": "netflix", "label": "Netflix", "names": ("netflix",), "fallback": 8},
    {"id": "prime", "label": "Prime Video", "names": ("amazon prime video", "prime video"), "fallback": 119},
    {"id": "disney", "label": "Disney+", "names": ("disney plus", "disney+"), "fallback": 337},
    {"id": "apple", "label": "Apple TV+", "names": ("apple tv plus", "apple tv+"), "fallback": 350},
    {"id": "paramount", "label": "Paramount+", "names": ("paramount plus", "paramount+"), "fallback": 531},
    {"id": "skygo", "label": "Sky Go", "names": ("sky go",), "fallback": 29},
    {"id": "now", "label": "NOW", "names": ("now tv", "now"), "fallback": 39},
    {"id": "hbo", "label": "HBO Max", "names": ("hbo max", "max"), "fallback": 1899},
    {"id": "rai", "label": "RaiPlay", "names": ("rai play", "raiplay"), "fallback": 222},
    {"id": "mediaset", "label": "Mediaset Infinity", "names": ("mediaset infinity",), "fallback": 359},
    {"id": "crunchyroll", "label": "Crunchyroll", "names": ("crunchyroll",), "fallback": 283},
]
TOKEN = os.environ.get("TMDB_ACCESS_TOKEN", "").strip()
TODAY = dt.date.today()


def get_api(path: str, params: dict | None = None) -> dict:
    query = dict(params or {})
    headers = {"Accept": "application/json", "User-Agent": "BoboMovieNight/1.0 (static-curation)"}
    if TOKEN.startswith("eyJ") or TOKEN.startswith("Bearer "):
        headers["Authorization"] = "Bearer " + TOKEN.removeprefix("Bearer ").strip()
    else:
        query["api_key"] = TOKEN
    url = BASE + path + "?" + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response:
        data = json.load(response)
    if not isinstance(data, dict):
        raise ValueError("Unexpected TMDB response")
    return data


_providers_cache: dict[str,list[dict] | None] = {}

def lookup_provider_id(kind: str, provider: dict) -> int:
    names = provider["names"]
    if kind not in _providers_cache:
        try:
            data = get_api("/watch/providers/" + kind, {"watch_region": "IT", "language": "it-IT"})
            rows = data.get("results")
            if not isinstance(rows, list):
                raise ValueError("Missing provider list")
            _providers_cache[kind] = rows
        except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as exc:
            print(f"Provider directory unavailable for {kind}: {type(exc).__name__}")
            _providers_cache[kind] = None
    rows = _providers_cache[kind]
    if rows is None:
        # Use the last-known TMDB ID only on a complete directory outage.
        return int(provider["fallback"])
    for wanted in names:
        for row in rows:
            if str(row.get("provider_name", "")).strip().casefold() == wanted:
                return int(row["provider_id"])
    # Never silently assign a different platform when the live directory
    # doesn't contain this name (renames/region removals are possible).
    return 0


def recent_enough(d: str | None, years: int) -> bool:
    try:
        return bool(d and TODAY.replace(year=TODAY.year-years) <= dt.date.fromisoformat(d) <= TODAY)
    except (ValueError, TypeError):
        return False


def search_provider(kind: str, provider_id: int, catalog: set[int]) -> list[dict]:
    results: list[dict] = []
    seen = set()
    if not provider_id: return results
    params = {
        "watch_region": "IT",
        "with_watch_providers": str(provider_id),
        "with_watch_monetization_types": "flatrate",
        "sort_by": "popularity.desc",
        "language": "it-IT",
        "include_adult": "false",
        "vote_count.gte": "10",
    }
    # These are relatively recent *original* release dates, NOT dates added to a service.
    limit_years = 4 if kind == "tv" else 3
    for page in range(1, 3):
        params["page"] = str(page)
        batch = get_api("/discover/" + kind, params).get("results", [])
        for item in batch:
            tid = item.get("id")
            released = item.get("first_air_date") if kind == "tv" else item.get("release_date")
            if not isinstance(tid, int) or tid not in catalog or tid in seen:
                continue
            if not recent_enough(released, limit_years):
                continue
            seen.add(tid)
            results.append({"type": kind, "tmdb_id": tid})
            if len(results) >= 18:
                return results
        if len(batch) < 20:
            break
    return results


def build() -> dict:
    existing = {}
    for kind, path in CATALOG_PATHS.items():
        data = json.loads(path.read_text(encoding="utf-8"))
        existing[kind] = {int(row["tmdb_id"]) for row in data.get("items", []) if row.get("tmdb_id") is not None}
    payload = {
        "schema": 1,
        "region": "IT",
        "source": "catalog-only",
        "updated_at": None,
        "platforms": [],
        "trending": [],
        "anime": [],
        "note": "Provider availability is not a platform addition date.",
    }
    if not TOKEN:
        print("TMDB_ACCESS_TOKEN not configured: only existing curated catalog shelves will be shown.")
        return payload

    payload["source"] = "TMDB+JustWatch"
    payload["updated_at"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    try:
        for page in (1, 2):
            data = get_api("/trending/all/week", {"language": "it-IT", "page": page})
            for row in data.get("results", []):
                kind = row.get("media_type")
                tid = row.get("id")
                if kind in existing and tid in existing[kind]:
                    descriptor = {"type": kind, "tmdb_id": tid}
                    if descriptor not in payload["trending"]:
                        payload["trending"].append(descriptor)
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as exc:
        print(f"Weekly trending unavailable: {type(exc).__name__}")

    # Japanese animation sourced from TMDB genre 16 and original language ja:
    # this identifies titles, NOT whether Italian dubbing or subtitles exist.
    seen_anime = set()
    for kind in ("tv", "movie"):
        for page in range(1, 5):
            try:
                data = get_api("/discover/" + kind, {
                    "language": "it-IT", "include_adult": "false",
                    "with_genres": "16", "with_original_language": "ja",
                    "sort_by": "popularity.desc", "page": str(page),
                    "vote_count.gte": "30",
                })
            except (urllib.error.URLError, ValueError, KeyError, TimeoutError):
                break
            for row in data.get("results", []):
                tid = row.get("id")
                if isinstance(tid, int) and tid in existing[kind] and (kind, tid) not in seen_anime:
                    seen_anime.add((kind, tid))
                    payload["anime"].append({"type": kind, "tmdb_id": tid})
                if len(payload["anime"]) >= 36:
                    break
            if len(payload["anime"]) >= 36:
                break
        if len(payload["anime"]) >= 36:
            break

    for provider in PROVIDERS:
        found: list[dict] = []
        try:
            for kind in ("movie", "tv"):
                pid = lookup_provider_id(kind, provider)
                found.extend(search_provider(kind, pid, existing[kind]))
                time.sleep(0.2)
        except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as exc:
            print(f"Platform {provider['id']} query unavailable: {type(exc).__name__}")
        if len(found) >= 4:
            payload["platforms"].append({"id": provider["id"], "label": provider["label"], "items": found[:28]})
            print(f"TMDB discovery {provider['id']}: {len(found)} matching titles")
    return payload


def main() -> None:
    payload = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == serialized:
        print("Discovery unchanged.")
        return
    OUT.write_text(serialized, encoding="utf-8")
    print(f"Discovery updated: {len(payload['platforms'])} provider shelves, {len(payload['trending'])} trending titles.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        print("Fatal discovery catalog error:", str(exc), file=sys.stderr)
        sys.exit(1)
