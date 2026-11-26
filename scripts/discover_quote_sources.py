#!/usr/bin/env python3
"""Discover *links* to Italian film quote pages, not copyrighted dialogue.

MediaWiki query action / prop=templates is used to verify that a page is
transcluding Template:Film. Exact title matches only, ambiguous remakes skipped.
A hit is a research source, not an automatically verified quote.
"""
from __future__ import annotations

import collections
import datetime as dt
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from build_cinema import catalog, load, priority_keys, write

API = "https://it.wikiquote.org/w/api.php"
BATCH = max(10, min(240, int(os.environ.get("BOBO_QUOTE_SOURCES_BATCH", "120"))))
GROUP = 12


def norm(title):
    return re.sub(r"\s+", " ", str(title or "").replace("_", " ").strip()).casefold()


def fetch_pages(titles):
    params = {
        "action": "query",
        "prop": "templates",
        "tltemplates": "Template:Film",
        "titles": "|".join(titles),
        "redirects": "1",
        "format": "json",
        "formatversion": "2",
    }
    uri = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(uri, headers={
        "User-Agent": "BoboMovieNight/2.2 (film-quote-source references; GitHub MatteoCurro/bobo-movie-night)",
        "Accept": "application/json"
    })
    with urllib.request.urlopen(request, timeout=17) as response:
        data = json.load(response)
    return data.get("query", {}).get("pages", [])


def valid_page(page):
    """No guessing: only film-templates and real, direct page titles."""
    if not isinstance(page, dict) or page.get("missing") or page.get("ns") != 0:
        return False
    return any(norm(x.get("title")) == norm("Template:Film")
               for x in page.get("templates") or [])


def build(root=Path("."), finder=fetch_pages, limit=BATCH, today=None):
    today = today or dt.date.today().isoformat()
    path = root / "data/cinema/quote-sources.json"
    saved = load(path, {"schema": 1, "items": {}, "checked": []})
    checked = set(saved.get("checked") or [])
    items = dict(saved.get("items") or {})
    all_titles = catalog(root)
    # Avoid accidental cross-linking of remakes and films sharing an Italian
    # title. Exact title is insufficient evidence in those cases.
    counts = collections.Counter(norm(title.get("title")) for key, title in all_titles.items()
                                 if key.startswith("movie:"))
    pending = []
    for key in priority_keys(root, all_titles):
        if key in checked or not key.startswith("movie:"):
            continue
        film = all_titles[key]
        name = str(film.get("title") or "").strip()
        if len(name) < 3 or len(name) > 100 or counts[norm(name)] != 1:
            continue
        pending.append((key, name))
        if len(pending) >= limit:
            break

    done = matched = errors = 0
    for start in range(0, len(pending), GROUP):
        part = pending[start:start+GROUP]
        distinct = [title for _, title in part]
        try:
            pages = finder(distinct)
        except (OSError, TimeoutError, ValueError, urllib.error.URLError) as exc:
            errors += 1
            print(f"::warning::Wikiquote source lookup paused: {type(exc).__name__}")
            if errors >= 2:
                break
            continue

        candidates = {norm(page.get("title")): page for page in pages if valid_page(page)}
        for key, title in part:
            checked.add(key)
            done += 1
            candidate = candidates.get(norm(title))
            if not candidate:
                continue
            canonical = str(candidate["title"])
            if len(canonical) > 150:
                continue
            uri = "https://it.wikiquote.org/wiki/" + urllib.parse.quote(
                canonical.replace(" ", "_"), safe="()_'-")
            items[key] = {"source": "wikiquote-it", "url": uri, "title": canonical}
            matched += 1

    write(path, {
        "schema": 1,
        "updated_at": today,
        "checked": sorted(checked),
        "items": dict(sorted(items.items())),
        "status": {"checked_this_run": done, "matched_this_run": matched,
                   "total_matched": len(items), "total_checked": len(checked)}
    })
    print("Movie quote sources (links only):", {"checked": done, "new_sources": matched,
                                              "total_sources": len(items)})
    return {"checked": done, "matched": matched, "total": len(items)}


if __name__ == "__main__":
    build()
