#!/usr/bin/env python3
"""Offline tests: never call external translation providers during CI."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))
import localize_cinema_people as mod
from build_cinema import Shards, load

assert mod.chunks("uno " * 200)
assert all(len(c.encode("utf-8")) <= 420 for c in mod.chunks("uno " * 200))
assert mod.summary_excerpt("First sentence. Second sentence. Third sentence.", 31) == "First sentence."

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    index = Shards(root, "people")
    index.put(40451, 40451, {"id": 40451, "name": "Actor One",
                               "biography": "He is an actor. He acted in several films.",
                               "biography_language": "en", "checked_at": "2026-11-26",
                               "known_for": [{"type": "movie", "tmdb_id": 42}]})
    index.put(40325, 40325, {"id": 40325, "name": "Actor Two",
                               "biography": "Biografia già in italiano.",
                               "biography_language": "it", "checked_at": "2026-11-26"})
    index.flush()
    calls = []
    def fake_translate(text):
        calls.append(text)
        return "Traduzione italiana verificabile per il test."
    result = mod.localize(root, translate=fake_translate, today="2026-11-26", limit=4)
    assert result["translated"] == 1
    entry = Shards(root, "people").get(40451, 40451)
    assert entry["biography_language"] == "it"
    assert entry["biography_translation"] == "automatic"
    assert entry["biography_translation_source"] == "mymemory"
    assert "Traduzione italiana" in entry["biography"]
    assert Shards(root, "people").get(40325, 40325)["biography"] == "Biografia già in italiano."
    assert len(calls) == 1
    status = load(root / "data/cinema/translation-status.json")
    assert status["day"] == "2026-11-26" and status["used_bytes"] > 0
    assert mod.localize(root, translate=fake_translate, today="2026-11-26")["translated"] == 0

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    index = Shards(root, "people")
    index.put(5, 5, {"id": 5, "name": "Person Five", "biography_language": "en",
                     "biography": "An English biography. Another sentence."})
    index.flush()
    def fail_translate(text):
        raise ValueError("provider unavailable")
    result = mod.localize(root, translate=fail_translate, today="2026-11-26")
    assert result["translated"] == 0
    entry = Shards(root, "people").get(5, 5)
    assert entry["biography_language"] == "en"
    status = load(root / "data/cinema/translation-status.json")
    assert status["failed_on"] == "2026-11-26"
    assert mod.localize(root, translate=fake_translate, today="2026-11-26")["skipped"] == "daily cooldown"

frontend = Path("bobo-cinema.js").read_text(encoding="utf-8")
assert "person.biography_language !== 'en'" in frontend
assert "person.biography_translation === 'automatic'" in frontend
print("Person biographies: Italian language, daily quota, backfill and offline fallback OK")
