#!/usr/bin/env python3
"""Offline smoke tests for the newsletter magazine selector and its weekly freeze."""
from __future__ import annotations
import datetime as dt
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
spec = importlib.util.spec_from_file_location(
    "bobo_newsletter_magazine",
    Path(__file__).resolve().parents[1] / "scripts" / "build_newsletter_digest.py",
)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def save(root, path, value):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    rows = []
    for i in range(1, 25):
        rows.append({
            "tmdb_id": i, "title": f"Titolo {i}", "poster": "/abcde12345.jpg",
            "overview": f"Una trama documentata per il titolo {i}.",
            "year": 2012 + (i % 13), "vote": 7.3 + (i % 3) * .2,
            "vote_count": 350 + 20 * i, "genres": ["Dramma"],
        })
    save(root, "data/movies.json", {"items": rows[:15]})
    save(root, "data/tv.json", {"items": rows[15:]})
    def entry(i, kind="movie"):
        return {"type": kind, "tmdb_id": i, "title": f"Titolo {i}"}
    save(root, "data/editorial.json", {"sections": [
        {"id": "week", "items": [entry(i) for i in range(1, 9)]},
        {"id": "hidden", "items": [entry(i) for i in range(9, 15)]},
        {"id": "mini", "items": [entry(i, "tv") for i in range(16, 24)]},
    ]})
    save(root, "data/editorial-evidence.json", {"titles": {
        **{f"movie:{i}": {"vote_average": 7.4, "vote_count": 360 + i} for i in range(1, 16)},
        **{f"tv:{i}": {"vote_average": 7.6, "vote_count": 370 + i} for i in range(16, 25)},
    }})
    save(root, "data/cinema/theme-index.json", {"items": {
        f"movie:{i}": {"topics": ["space sci fi"], "keywords": []}
        for i in range(1, 10)
    }})
    save(root, "data/seasonal.json", {"seasons": [
        {"id": "christmas", "items": [entry(i) for i in range(1, 10)]},
        {"id": "halloween", "items": [entry(i) for i in range(1, 7)]},
        {"id": "easter", "items": [entry(i) for i in range(1, 7)]},
    ]})
    save(root, "data/cinema/film-quotes.json", {"quotes": {
        "movie:1": {"text": "Una breve frase verificata.", "reviewed": True,
                    "speaker": "Protagonista", "context": "Un commento originale.",
                    "source_url": "https://it.wikiquote.org/wiki/Titolo_1"},
        "movie:2": {"text": "<script>falsa citazione</script>", "reviewed": False,
                    "source_url": "https://example.org/unknown"},
    }})
    module.ROOT = root
    first = module.build(dt.date(2026, 12, 3))
    assert first["schema"] == 1 and first["magazine_schema"] == 2
    assert first["edition"]["theme"] == "special-christmas"
    assert len(first["sections"]) >= 2
    assert first["quote"]["text"] == "Una breve frase verificata."
    ids = [module.ident(first["lead"])] + [
        module.ident(row) for section in first["sections"] for row in section["items"]
    ]
    assert len(set(ids)) == len(ids), ids
    frozen = module.build(dt.date(2026, 12, 4))
    assert frozen == first, "Edition must stay stable during the same week"
    newer = module.build(dt.date(2026, 12, 11))
    assert newer["edition"]["id"] != first["edition"]["id"]
    history = json.loads((root / "data/newsletter-history.json").read_text())
    assert len(history["issues"]) == 2
    assert module.active_event(dt.date(2026, 11, 26)) == "christmas"
    assert module.active_event(dt.date(2026, 10, 31)) == "halloween"
    print("OK: weekly editorial rotation, history, verified quotes and seasonal issue")
