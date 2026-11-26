#!/usr/bin/env python3
"""Incrementally translate cached English TMDB biographies into Italian.

Runs in GitHub Actions, never in the visitor's browser. It uses the no-key
MyMemory public translation API with a conservative daily input quota and
persists a single shared counter across the twice-daily jobs. If unavailable,
profiles keep their source data but the frontend never displays English bios.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from build_cinema import Shards, load, write

TODAY = dt.date.today().isoformat()
MAX_PERSON_BYTES = max(400, min(3500, int(os.environ.get("BOBO_BIO_TRANSLATE_MAX_BYTES", "1600"))))
DAILY_BUDGET = max(0, min(4900, int(os.environ.get("BOBO_BIO_TRANSLATE_DAILY_BUDGET", "4400"))))
BATCH = max(1, min(10, int(os.environ.get("BOBO_BIO_TRANSLATE_BATCH", "4"))))
ENDPOINT = "https://api.mymemory.translated.net/get"


def summary_excerpt(text: str, limit=MAX_PERSON_BYTES) -> str:
    """Keep complete sentences and avoid exceeding provider input quota."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text.encode("utf-8")) <= limit:
        return text
    words, taken = [], 0
    for word in text.split():
        next_bytes = len((" " if words else "").encode()) + len(word.encode("utf-8"))
        if taken + next_bytes > limit:
            break
        words.append(word)
        taken += next_bytes
    partial = " ".join(words)
    # Finish at the last complete sentence, when possible.
    ends = [m.end() for m in re.finditer(r"[.!?](?:\s|$)", partial)]
    if ends and ends[-1] >= min(140, int(len(partial) * .4)):
        return partial[:ends[-1]].strip()
    return partial.strip()


def chunks(text: str, limit=420) -> list[str]:
    """Split by words into MyMemory-compatible requests (max 500 UTF-8 bytes)."""
    result, current = [], []
    for word in text.split():
        if len(word.encode("utf-8")) > limit:
            raise ValueError("An unusually long token cannot be translated safely")
        attempt = " ".join(current + [word])
        if len(attempt.encode("utf-8")) > limit and current:
            result.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        result.append(" ".join(current))
    return result


def translate_chunk(text: str) -> str:
    query = urllib.parse.urlencode({"q": text, "langpair": "en|it"})
    req = urllib.request.Request(
        ENDPOINT + "?" + query,
        headers={"Accept": "application/json", "User-Agent": "BoboMovieNight/2.1 (person localization)"},
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        data = json.load(response)
    if int(data.get("responseStatus", 0)) != 200:
        raise ValueError("Translation provider returned a non-success status")
    output = html.unescape(str((data.get("responseData") or {}).get("translatedText") or "")).strip()
    if not output or output.casefold() == text.casefold() or "MYMEMORY WARNING" in output.upper():
        raise ValueError("No usable Italian translation")
    return output


def localize(root=Path("."), translate=translate_chunk, today=TODAY, limit=BATCH):
    status_path = root / "data/cinema/translation-status.json"
    status = load(status_path, {})
    if status.get("day") != today:
        status = {"day": today, "used_bytes": 0}
    if status.get("failed_on") == today or DAILY_BUDGET <= 0:
        return {"translated": 0, "used_bytes": status.get("used_bytes", 0), "skipped": "daily cooldown"}
    remaining = max(0, DAILY_BUDGET - int(status.get("used_bytes", 0)))
    if remaining <= 0:
        return {"translated": 0, "used_bytes": status.get("used_bytes", 0), "skipped": "daily quota"}

    people = Shards(root, "people")
    targets = []
    for path in sorted(people.root.glob("*.json")):
        if not re.fullmatch(r"[0-7][0-9a-f]\.json", path.name):
            continue
        for key, record in load(path, {"items": {}}).get("items", {}).items():
            if isinstance(record, dict) and record.get("biography_language") == "en" and record.get("biography"):
                targets.append((int(key), record))
    # Longer complete biographies first, stubs excluded. Retry failed entries on later days.
    targets.sort(key=lambda item: (-(len(item[1].get("known_for") or [])), item[0]))
    translated = 0
    for pid, profile in targets:
        if translated >= limit or remaining <= 0:
            break
        original = summary_excerpt(profile.get("biography"))
        parts = chunks(original) if original else []
        needed = sum(len(part.encode("utf-8")) for part in parts)
        if not parts or needed > remaining:
            continue
        outputs = []
        try:
            for part in parts:
                # Charge even on a failed request: do not exceed a free external API quota.
                used = len(part.encode("utf-8"))
                status["used_bytes"] = int(status.get("used_bytes", 0)) + used
                remaining -= used
                outputs.append(translate(part))
            output = " ".join(outputs).strip()
            if not output:
                raise ValueError("Empty translation")
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError, OSError) as exc:
            status["failed_on"] = today
            print(f"::warning::Italian biography translation paused for today: {type(exc).__name__}")
            break
        updated = dict(profile)
        updated.update({
            "biography": output[:3600],
            "biography_language": "it",
            "biography_translation": "automatic",
            "biography_source": "tmdb",
            "biography_translation_source": "mymemory",
            "biography_translated_at": today,
        })
        people.put(pid, pid, updated)
        translated += 1
    people.flush()
    write(status_path, status)
    result = {"translated": translated, "used_bytes": status.get("used_bytes", 0), "total_english_candidates": len(targets)}
    print("Italian biographies:", json.dumps(result))
    return result


if __name__ == "__main__":
    localize()
