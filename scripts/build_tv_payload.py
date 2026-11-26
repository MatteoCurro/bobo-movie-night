#!/usr/bin/env python3
"""Produce compact, deterministic Android TV feeds from the existing Bobo catalog.

The WebView downloads a small TV home first, then a compact search index.
Detailed metadata is fetched by shard only when a title is opened.
This intentionally does not contact third-party services.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

SHARDS = 64
POSTER = re.compile(r"^(?:https://image\.tmdb\.org/t/p/(?:w\d+|original))?(/?[A-Za-z0-9_-]{5,200}\.(?:jpg|jpeg|png|webp))$", re.I)


def read(path: Path, fallback: dict | None = None) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else (fallback or {})
    except (OSError, ValueError):
        return fallback or {}


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != encoded:
        path.write_text(encoded, encoding="utf-8")


def poster(value: object) -> str:
    match = POSTER.fullmatch(str(value or "").strip())
    if not match:
        return ""
    return "/" + match.group(1).lstrip("/")


def safe_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return default


def safe_vote(value: object) -> float:
    try:
        return round(min(10.0, max(0.0, float(value))), 1)
    except (TypeError, ValueError, OverflowError):
        return 0.0


def small(raw: dict, kind: str) -> dict:
    return {
        "type": kind,
        "tmdb_id": safe_int(raw.get("tmdb_id")),
        "title": str(raw.get("title") or "")[:180],
        "year": safe_int(raw.get("year")),
        "vote": safe_vote(raw.get("vote")),
        "poster": poster(raw.get("poster")),
    }


def detail(raw: dict, kind: str) -> dict:
    result = small(raw, kind)
    result.update({
        "overview": str(raw.get("overview") or "")[:1600],
        "backdrop": poster(raw.get("backdrop")),
        "genres": [str(x)[:45] for x in (raw.get("genres") or []) if isinstance(x, str)][:5],
        "runtime": safe_int(raw.get("runtime")),
        "seasons": [
            {"n": safe_int(x.get("n")), "episodes": safe_int(x.get("episodes"))}
            for x in (raw.get("seasons") or []) if isinstance(x, dict)
        ][:80],
    })
    return result


def build(root: Path = Path(".")) -> dict:
    root = Path(root)
    all_rows: dict[str, dict] = {}
    shorts: dict[str, dict] = {}
    for kind, name in (("movie", "movies"), ("tv", "tv")):
        rows = read(root / "data" / (name + ".json")).get("items", [])
        if not isinstance(rows, list) or not rows:
            raise ValueError("Catalogo mancante: " + name)
        for raw in rows:
            if not isinstance(raw, dict):
                continue
            short = small(raw, kind)
            if not short["tmdb_id"] or not short["title"]:
                continue
            key = kind + ":" + str(short["tmdb_id"])
            shorts[key] = short
            all_rows[key] = detail(raw, kind)
    if not all_rows:
        raise ValueError("Catalogo TV vuoto")

    catalog_status = read(root / "data/catalog-status.json")
    updated = str(catalog_status.get("updated_at") or "")[:40]
    packed = sorted(shorts.values(), key=lambda i: (
        -i["year"], -i["vote"], i["title"].casefold(), i["type"], i["tmdb_id"]))
    slim = {
        "schema": 1,
        "updated_at": updated,
        "total": len(packed),
        "items": [[x["type"], x["tmdb_id"], x["title"], x["year"], x["vote"], x["poster"]] for x in packed],
    }
    write(root / "data/tv-lite.json", slim)

    buckets: list[dict[str, dict]] = [{} for _ in range(SHARDS)]
    for key, record in all_rows.items():
        buckets[record["tmdb_id"] % SHARDS][key] = record
    for index, rows in enumerate(buckets):
        write(root / f"data/tv-detail/{index:02x}.json", {"schema": 1, "items": rows})

    editorial = read(root / "data/editorial.json")
    discovery = read(root / "data/discovery.json")
    seasonal = read(root / "data/seasonal.json")
    sections: list[dict] = []
    used_sections: set[str] = set()

    def section(ident: str, title: str, note: str, candidates: list, provider: str = "") -> None:
        if ident in used_sections:
            return
        chosen, seen = [], set()
        for raw in candidates:
            if not isinstance(raw, dict):
                continue
            key = str(raw.get("type") or "") + ":" + str(raw.get("tmdb_id") or "")
            item = shorts.get(key)
            if not item or not item["poster"] or key in seen:
                continue
            seen.add(key)
            entry = dict(item)
            if provider:
                entry["provider"] = provider
            chosen.append(entry)
            if len(chosen) >= 14:
                break
        if len(chosen) >= 4:
            sections.append({"id": ident, "title": title, "note": note[:100], "items": chosen})
            used_sections.add(ident)

    if seasonal.get("active"):
        for group in seasonal.get("seasons") or []:
            if isinstance(group, dict) and group.get("id") == seasonal["active"]:
                section("seasonal", str(group.get("title") or "Per questa stagione"),
                        str(group.get("subtitle") or ""), group.get("items") or [])
                break

    editorial_ids = ("week", "hidden", "mini", "classics")
    for group in editorial.get("sections") or []:
        if isinstance(group, dict) and group.get("id") in editorial_ids:
            section(str(group["id"]), str(group.get("title") or "Da scoprire"),
                    str(group.get("subtitle") or ""), group.get("items") or [])

    section("trending", "Di tendenza", "Titoli molto cercati questa settimana",
            discovery.get("trending") or [])
    for platform in discovery.get("platforms") or []:
        if isinstance(platform, dict) and platform.get("id") == "netflix":
            section("platform", "Disponibili su Netflix", "Disponibilità indicativa in Italia",
                    platform.get("items") or [], "Netflix")
            break

    if len(sections) < 4:
        quality = sorted(shorts.values(), key=lambda x: (-x["vote"], -x["year"]))
        section("favorites-public", "I più apprezzati", "Una selezione dal catalogo",
                quality[:70])
        section("recent-movies", "Film recenti", "Da scoprire",
                [x for x in packed if x["type"] == "movie"][:70])
        section("recent-series", "Serie TV", "Da scoprire",
                [x for x in packed if x["type"] == "tv"][:70])
    sections = sections[:7]

    hero = next((all_rows[x["type"] + ":" + str(x["tmdb_id"])]
                 for s in sections for x in s["items"]
                 if (x["type"] + ":" + str(x["tmdb_id"])) in all_rows
                 and all_rows[x["type"] + ":" + str(x["tmdb_id"])]["backdrop"]
                 and all_rows[x["type"] + ":" + str(x["tmdb_id"])]["overview"]), None)
    if not hero:
        hero = next((x for x in all_rows.values() if x["backdrop"] and x["overview"]), None)
    if not hero:
        raise ValueError("Hero TV non disponibile")
    home = {"schema": 1, "updated_at": updated, "total": len(packed),
            "featured": hero, "sections": sections}
    write(root / "data/tv-home.json", home)
    return {"titles": len(packed), "sections": len(sections),
            "home_bytes": (root / "data/tv-home.json").stat().st_size,
            "index_bytes": (root / "data/tv-lite.json").stat().st_size}


if __name__ == "__main__":
    print("Bobo TV feeds:", build())
