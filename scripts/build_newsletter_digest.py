#!/usr/bin/env python3
"""Build a deterministic weekly Bobo film magazine from archived, sourced facts.

No live API calls, invented quotes, unsupported streaming claims or LLM runtime.
The edition remains stable across daily syncs within its ISO week.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

from build_cinema import catalog, load, write

ROOT = Path(".")
OUT = Path("data/newsletter.json")
HISTORY = Path("data/newsletter-history.json")
THEMES = (
    ("space", "A un passo dalle stelle", "Altri mondi, viaggi impossibili e grandi domande",
     ("space sci fi", "space travel", "alien invasion", "outer space", "interstellar")),
    ("mystery", "Il piacere del mistero", "Storie da decifrare, un indizio alla volta",
     ("murder mystery", "whodunit", "detective", "mystery thriller", "investigation")),
    ("time", "Quando il tempo si piega", "Ritorni, paradossi e seconde possibilità",
     ("time travel", "time loop", "alternate timeline", "parallel universe")),
    ("music", "Cinema da ascoltare", "Tra palcoscenici, canzoni e vite in musica",
     ("music", "musician", "musical", "band", "singer", "rock music")),
    ("heist", "Il piano perfetto. O quasi.", "Rapine, truffe e colpi di scena",
     ("heist", "bank robbery", "con artist", "con game", "robbery")),
    ("growing", "Diventare grandi", "Scelte, amicizie e passaggi di vita",
     ("coming of age", "teen coming of age", "growing up", "adolescence")),
    ("journeys", "Il viaggio cambia tutto", "Incontri inattesi e strade che lasciano il segno",
     ("road trip", "road movie", "travel adventure", "journey of self discovery")),
    ("worlds", "Realtà alternative", "Mondi immaginati e regole tutte da riscrivere",
     ("dystopia", "dystopian", "alternate reality", "magical realism", "fantasy adventure")),
)
SEASON_NAMES = {
    "christmas": ("Natale, storie da condividere", "Un po' di magia, senza rinunciare alle sorprese"),
    "halloween": ("La notte ha le sue storie", "Misteri, brividi e film perfetti per la stagione"),
    "easter": ("Storie di Pasqua", "Una selezione legata davvero alla ricorrenza"),
}
IMG = re.compile(r"^https://image\.tmdb\.org/t/p/(?:w\d+|original)/[A-Za-z0-9_/.-]{3,200}$")


def get(path, default=None):
    try:
        return load(ROOT / path, {} if default is None else default)
    except (OSError, ValueError, TypeError):
        return {} if default is None else default


def ident(row):
    try:
        kind = str(row["type"])
        mid = int(row["tmdb_id"])
        if kind in ("movie", "tv") and mid > 0:
            return f"{kind}:{mid}"
    except (KeyError, ValueError, TypeError):
        pass
    return ""


def poster(raw):
    raw = str(raw or "")
    if raw.startswith("/"):
        raw = "https://image.tmdb.org/t/p/w342" + raw
    return raw if IMG.fullmatch(raw) else ""


def active_event(today):
    if dt.date(today.year, 11, 22) <= today <= dt.date(today.year, 12, 26):
        return "christmas"
    if dt.date(today.year, 10, 12) <= today <= dt.date(today.year, 11, 2):
        return "halloween"
    from build_thematic_index import easter
    if easter(today.year) - dt.timedelta(days=18) <= today <= easter(today.year) + dt.timedelta(days=3):
        return "easter"
    return ""


def headline_card(row, reason=""):
    overview = str(row.get("overview") or "").strip()
    return {
        "type": row["type"], "tmdb_id": int(row["tmdb_id"]),
        "title": str(row.get("title") or "")[:150],
        "year": int(row.get("year") or 0),
        "poster": poster(row.get("poster")),
        "overview": overview[:300],
        "reason": reason[:145],
    }


def build(today=None):
    today = today or dt.date.today()
    week = f"{today.isocalendar().year}-W{today.isocalendar().week:02d}"
    prior = get("data/newsletter.json")
    if prior.get("magazine_schema") == 2 and prior.get("edition", {}).get("id") == week:
        print("Newsletter magazine: this week's edition is already frozen", week)
        return prior
    titles = catalog(ROOT)
    editorial = get("data/editorial.json")
    proof = get("data/editorial-evidence.json").get("titles") or {}
    themed = get("data/cinema/theme-index.json").get("items") or {}
    seasonal = get("data/seasonal.json").get("seasons") or []
    quotes = get("data/cinema/film-quotes.json").get("quotes") or {}
    history = get("data/newsletter-history.json", {"schema": 1, "issues": []})
    issues = [x for x in history.get("issues", []) if isinstance(x, dict) and x.get("week") != week][-24:]
    recent = {k for x in issues[-4:] for k in x.get("ids", [])}
    previous_leads = {x.get("lead") for x in issues[-7:]}

    verified = {}
    for key, item in titles.items():
        if not item.get("title") or not poster(item.get("poster")) or not item.get("overview"):
            continue
        year = int(item.get("year") or 0)
        if year < 1920 or year > today.year or (item.get("type") == "tv" and year < 2010):
            continue
        # Do not promote a film that is explicitly dated after this edition.
        release = str(item.get("release_date") or item.get("first_air_date") or "")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", release) and release > today.isoformat():
            continue
        p = proof.get(key) or {}
        count = max(int(item.get("vote_count") or 0), int(p.get("vote_count") or 0))
        rating = float(p.get("vote_average") or item.get("vote") or 0)
        if count < 200 or not (6.7 <= rating <= 10):
            continue
        verified[key] = dict(item, vote=rating, vote_count=count)

    if len(verified) < 8:
        raise SystemExit("Insufficient verified catalog: preserving previous newsletter")
    candidates = {}
    byid = {}
    for section in editorial.get("sections") or []:
        byid[section.get("id")] = section
        for row in section.get("items") or []:
            k = ident(row)
            if k in verified:
                candidates[k] = verified[k]
    for section in seasonal:
        for row in section.get("items") or []:
            k = ident(row)
            if k in verified:
                candidates[k] = verified[k]
    # Include well-rated topic-matched titles, even if not in a Discover shelf.
    if len(verified) < 25000:
        candidates.update(verified)

    def score(key, context=""):
        r = candidates[key]
        count = int(r.get("vote_count") or 0)
        rating = float(r.get("vote") or 0)
        bayes = (rating * count + 6.8 * 800) / (count + 800)
        mix = int(hashlib.sha256(f"{week}|{context}|{key}".encode()).hexdigest()[:6], 16) / 0xFFFFFF
        return bayes + min(0.65, math.log10(count + 1) * .13) + mix * .65 - (
            2 if key in recent else 0) - (2.5 if key in previous_leads else 0)

    def pick(keys, n, excluded, context):
        choices = [key for key in set(keys) if key in candidates and key not in excluded]
        choices.sort(key=lambda k: (score(k, context), k), reverse=True)
        fresh = [k for k in choices if k not in recent]
        result = (fresh + [k for k in choices if k in recent])[:n]
        excluded.update(result)
        return result

    category = active_event(today)
    tag = None
    focus = []
    if category:
        section = next((s for s in seasonal if s.get("id") == category), {})
        focus = [ident(x) for x in section.get("items") or []]
        from build_thematic_index import evidence, normalize
        # Avoid seasonal false positives caused by a passing mention in a plot.
        focus = [
            k for k in focus if k in candidates and evidence(
                category, [normalize(candidates[k].get("title"))] +
                [str(v) for v in (themed.get(k) or {}).get("topics", []) +
                 (themed.get(k) or {}).get("keywords", [])])
        ]
        if len(focus) >= 3:
            tag = ("special-" + category, *SEASON_NAMES[category])
    if not tag:
        start = today.isocalendar().week % len(THEMES)
        for offset in range(len(THEMES)):
            theme = THEMES[(start + offset) % len(THEMES)]
            phrases = set(theme[3])
            rows = []
            for key in candidates:
                terms = themed.get(key) or {}
                labels = {str(v).casefold() for v in (terms.get("topics") or []) + (terms.get("keywords") or [])}
                if labels & phrases:
                    rows.append(key)
            if len(rows) >= 3:
                focus, tag = rows, theme[:3]
                break
    if not tag:
        tag = ("curated", "Una settimana di grande cinema", "Storie scelte per lasciare qualcosa")
        focus = [ident(x) for x in byid.get("cinephiles", {}).get("items") or []]

    selected = set()
    focused = pick(focus, 3, selected, "focus")
    weekly = [ident(x) for x in byid.get("week", {}).get("items") or []]
    lead_key = focused.pop(0) if focused else None
    if lead_key is None:
        leads = pick(weekly or list(candidates), 1, selected, "lead")
        lead_key = leads[0] if leads else None
    if not lead_key:
        raise SystemExit("No quality spotlight: preserving previous newsletter")

    groups = []
    def section(ident_, title, subtitle, keys, count=2, reasons=None):
        chosen = pick(keys, count, selected, ident_)
        if len(chosen) >= 2:
            groups.append({
                "id": ident_, "title": title, "subtitle": subtitle,
                "items": [headline_card(candidates[k], (reasons or {}).get(k, "")) for k in chosen],
            })

    # Show at least one title explicitly sharing the edition's theme.
    if len(focused) >= 2:
        groups.append({
            "id": "theme", "title": "Sul filo della storia",
            "subtitle": "Altre due scelte che esplorano questo stesso universo",
            "items": [headline_card(candidates[k], "Un'altra prospettiva sul tema della settimana") for k in focused[:2]],
        })
    # Award-winning cinema is a periodic column, not a permanent Oscars list.
    award_reasons = {}
    for group in get("data/cinema/explore.json").get("awards") or []:
        if group.get("event") != "Oscar" or group.get("category") not in (
                "Miglior film", "Miglior regia", "Miglior film d'animazione",
                "Miglior sceneggiatura originale", "Miglior colonna sonora"):
            continue
        for film in group.get("films") or []:
            try:
                k = f"movie:{int(film['id'])}"
            except (KeyError, ValueError, TypeError):
                continue
            if k in candidates:
                award_reasons.setdefault(k, "Oscar · " + str(group["category"]))
    if today.isocalendar().week % 3 == 0 and len(award_reasons) >= 2 and len(groups) < 3:
        section("awards", "Storie da premio", "Un viaggio fra i riconoscimenti del cinema",
                list(award_reasons), reasons=award_reasons)
    series = [k for k in candidates if k.startswith("tv:") and int(candidates[k].get("year") or 0) >= 2010]
    hidden = [ident(x) for x in byid.get("hidden", {}).get("items") or []]
    classic = [ident(x) for x in byid.get("classics", {}).get("items") or []]
    if len(groups) < 2:
        section("discovery", "Fuori dai soliti radar", "Film apprezzati da riscoprire", hidden + classic)
    section("series", "Una serie, un altro mondo", "Due storie a episodi da tenere d'occhio", series)
    if len(groups) < 3:
        section("films", "Il film che non ti aspetti", "Una seconda possibilità a grandi storie",
                hidden + classic + weekly)
    if len(groups) < 2:
        section("more", "Altre idee per la serata", "Se hai voglia di cambiare genere", list(candidates))
    groups = groups[:3]

    # Curiosity: use only facts computed from actual shared credits in our archive.
    curiosities = []
    for key in [lead_key] + [ident(r) for g in groups for r in g["items"]]:
        kind, rawid = key.split(":")
        file = f"data/cinema/connections/{int(rawid) % 128:02x}.json"
        entry = get(file).get("items", {}).get(key) or {}
        fact = str(entry.get("fact") or "").strip()
        if fact and len(fact) <= 250:
            curiosities.append((key, fact))
    curiosity = None
    if not curiosities:
        # An additional proven connection can be featured independently.
        # Avoid invented behind-the-scenes trivia when no cast data is present.
        for key in sorted(candidates, key=lambda k: score(k, "curiosity"), reverse=True)[:80]:
            if key in selected:
                continue
            rawid = int(key.split(":")[1])
            entry = get(f"data/cinema/connections/{rawid % 128:02x}.json").get("items", {}).get(key) or {}
            fact = str(entry.get("fact") or "").strip()
            if fact and len(fact) <= 250:
                curiosities.append((key, fact))
                break
    if curiosities:
        k, fact = curiosities[0]
        curiosity = {"title": "Dietro le quinte", "text": fact,
                     "item": headline_card(candidates[k])}

    # Quotes are from the reviewed local shortlist, never from arbitrary scraped text.
    approved = [(k, v) for k, v in quotes.items()
                if k in verified and isinstance(v, dict) and v.get("reviewed") is True
                and str(v.get("source_url") or "").startswith("https://it.wikiquote.org/wiki/")
                and 0 < len(str(v.get("text") or "")) <= 115]
    approved.sort(key=lambda row: row[0])
    quote = None
    if approved:
        idx = today.isocalendar().week % len(approved)
        k, q = approved[idx]
        quote = {"text": str(q["text"])[:115], "speaker": str(q.get("speaker") or "")[:70],
                 "context": str(q.get("context") or "")[:220],
                 "source_url": str(q["source_url"])[:350],
                 "item": headline_card(verified[k])}

    issue = {
        # Keep schema=1 so a server not yet upgraded can still send the classic digest.
        "schema": 1, "magazine_schema": 2,
        "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "edition": {"id": week, "theme": tag[0], "eyebrow": f"IL CLUB / SETTIMANA {today.isocalendar().week:02d}",
                    "title": tag[1], "subtitle": tag[2],
                    "subject": "BOBO / " + tag[1] + " · " + str(candidates[lead_key]["title"])[:60],
                    "preheader": tag[2] + ". Film, serie e una curiosità da raccontare."},
        "lead": headline_card(candidates[lead_key], "La scelta del club"),
        "sections": groups, "curiosity": curiosity, "quote": quote,
        # Retain the v1-compatible information for read-only consumers.
        "weekly": [headline_card(candidates[lead_key])],
        "platforms": [],
        "disclaimer": "Selezione editoriale, non un elenco di nuovi arrivi sulle piattaforme.",
    }
    if len(groups) < 2:
        raise SystemExit("Incomplete editorial issue: keeping previous newsletter")
    write(ROOT / OUT, issue)
    ids = [lead_key] + [ident(row) for g in groups for row in g["items"]]
    issues.append({"week": week, "lead": lead_key, "ids": ids, "theme": tag[0]})
    write(ROOT / HISTORY, {"schema": 1, "issues": issues[-25:]})
    print(f"Bobo magazine: {week}, {tag[0]}, {len(ids)} titles, quote={bool(quote)}, curiosity={bool(curiosity)}")
    return issue


if __name__ == "__main__":
    build()
