#!/usr/bin/env python3
"""Optional tokenless Italian streaming-new-arrivals feed for Bobo.

Data source: https://streamingfilter.com/it/novita
Reads a publicly visible index at most twice per day, matching only public
movie/TV titles and years against the local CasaFlix catalogs. No API key.
Never claim a specific provider without independently verified data.
"""
from __future__ import annotations

from html.parser import HTMLParser
import datetime as dt
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

SOURCE = "https://streamingfilter.com/it/novita"
PLATFORM_FEEDS = (
    ("netflix", "Netflix", "https://streamingfilter.com/it/novita-netflix"),
    ("prime", "Prime Video", "https://streamingfilter.com/it/novita-prime-video"),
    ("disney", "Disney+", "https://streamingfilter.com/it/novita-disney-plus"),
    ("apple", "Apple TV+", "https://streamingfilter.com/it/novita-apple-tv"),
)
DISCOVERY = Path("data/discovery.json")
YEARS = re.compile(r"^(.+?)\s+((?:19|20)\d{2})(?:\s|$)")


def canonical(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value)).casefold()
    text = "".join(x for x in text if not unicodedata.combining(x))
    return re.sub(r"[^a-z0-9]", "", text)


class WeeklyLinks(HTMLParser):
    def __init__(self, mode: str = "weekly"):
        super().__init__()
        self.mode = mode
        self.section = False
        self.in_header = False
        self.header = ""
        self.in_anchor = False
        self.anchor = ""
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"h2", "h3"}:
            self.in_header = True
            self.header = ""
        if tag == "a" and self.section:
            self.in_anchor = True
            self.anchor = ""

    def handle_data(self, text):
        if self.in_header:
            self.header += text
        if self.in_anchor:
            self.anchor += text

    def handle_endtag(self, tag):
        if tag in {"h2", "h3"} and self.in_header:
            title = canonical(self.header)
            if (self.mode == "weekly" and "novitadellasettimana" in title) or (
                self.mode == "platform" and title.startswith("nuovisu")
            ):
                self.section = True
            elif self.section and title:
                self.section = False
            self.in_header = False
        if tag == "a" and self.in_anchor:
            value = re.sub(r"\s+", " ", self.anchor).strip()
            if value:
                self.links.append(value)
            self.in_anchor = False


def build_index():
    lookup: dict[tuple[str, int, str], list[dict]] = {}
    for kind, path in (("movie", "data/movies.json"), ("tv", "data/tv.json")):
        catalog = json.loads(Path(path).read_text(encoding="utf-8"))
        for item in catalog.get("items", []):
            name = canonical(item.get("title", ""))
            year = int(item.get("year") or 0)
            if not name or not year:
                continue
            key = name, year, kind
            lookup.setdefault(key, []).append({"type": kind, "tmdb_id": int(item["tmdb_id"])})
    return lookup


def extract_items(links: list[str], index: dict) -> list[dict]:
    found = []
    seen = set()
    for link in links:
        match = YEARS.match(link)
        if not match:
            continue
        title, year = match.group(1), int(match.group(2))
        is_series = bool(re.search(r"\bserie\b", link[match.end()-1:], flags=re.I))
        kind = "tv" if is_series else "movie"
        candidates = index.get((canonical(title),year,kind), [])
        if len(candidates) != 1:
            continue
        result = candidates[0]
        key = (result["type"],result["tmdb_id"])
        if key not in seen:
            seen.add(key)
            found.append(result)
    return found[:50]


def fetch_listing(url: str, mode: str) -> list[str]:
    request = urllib.request.Request(url, headers={
        "User-Agent": "BoboMovieNight/1.0 (noncommercial static editorial index)",
        "Accept": "text/html",
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        if int(response.headers.get("Content-Length") or 0) > 1_500_000:
            raise RuntimeError("Source is unexpectedly large")
        html = response.read(1_500_001).decode("utf-8", errors="replace")
        if len(html) > 1_500_000:
            raise RuntimeError("Source is unexpectedly large")
    parser = WeeklyLinks(mode=mode)
    parser.feed(html)
    if not parser.links:
        raise RuntimeError("Expected source section missing or empty")
    return parser.links


def main():
    feed = json.loads(DISCOVERY.read_text(encoding="utf-8"))
    try:
        index = build_index()
        weekly = fetch_listing(SOURCE, "weekly")
        items = extract_items(weekly,index)
        if not items:
            print("No unambiguous title matches; hiding optional weekly shelf.")
            feed.pop("streaming",None)
        else:
            feed["streaming"] = {
                "source": "Streamingfilter",
                "url": SOURCE,
                "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
                "items": items,
            }
            print(f"Weekly streaming feed: {len(items)} exact title/year matches out of {len(weekly)} links")
    except Exception as exc:
        print(f"Weekly feed unavailable: {type(exc).__name__}: {str(exc)[:150]}")
        # Do not overwrite with guesses or keep a potentially stale external list.
        feed.pop("streaming",None)
    # Pages dedicated to each provider identify additions during the current
    # calendar month, not the exact day of addition. Require an unambiguous
    # local catalog match on title + original year + movie/series kind.
    platform_rows = []
    for key, label, url in PLATFORM_FEEDS:
        try:
            links = fetch_listing(url, "platform")
            titles = extract_items(links, index if "index" in locals() else build_index())
            if len(titles) >= 4:
                platform_rows.append({
                    "id": key,
                    "label": label,
                    "url": url,
                    "period": "month",
                    "items": titles,
                })
                print(f"{label} this month: {len(titles)} matches in Bobo")
            else:
                print(f"{label}: insufficient exact matching titles ({len(titles)})")
        except Exception as exc:
            print(f"Provider {label} source unavailable: {type(exc).__name__}: {str(exc)[:120]}")
    if platform_rows:
        stream = feed.setdefault("streaming",{
            "source": "Streamingfilter",
            "url": SOURCE,
            "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "items": [],
        })
        stream["platforms"] = platform_rows
    DISCOVERY.write_text(json.dumps(feed,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")