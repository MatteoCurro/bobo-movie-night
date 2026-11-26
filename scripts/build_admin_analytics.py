#!/usr/bin/env python3
"""Small admin-ready statistical report, derived only from existing Bobo data.

No secrets, user profiles, network calls or additional upstream requests.
All audience metrics remain on the separate authenticated PHP backend.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path


def load(path: Path, fallback=None):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return {} if fallback is None else fallback


def ranked(counter, limit=15):
    return [{"name": str(key), "count": number} for key, number in
            sorted(counter.items(), key=lambda item: (-item[1], str(item[0])))[:limit]]


def build(root=Path(".")):
    catalog = {}
    total = Counter()
    genres = Counter()
    languages = Counter()
    decades = Counter()
    years = Counter()
    rating_bands = Counter()
    runtime_bands = Counter()
    coverage = Counter()
    top_rated = []
    for kind, filename in (("movie", "movies.json"), ("tv", "tv.json")):
        source = load(root / "data" / filename)
        items = source.get("items", [])
        if not isinstance(items, list) or not items:
            raise ValueError("Missing Bobo catalog: " + filename)
        for row in items:
            if not isinstance(row, dict) or not row.get("tmdb_id"):
                continue
            key = kind + ":" + str(row["tmdb_id"])
            if key in catalog:
                continue
            catalog[key] = row
            total[kind] += 1
            if row.get("poster"):
                coverage["poster"] += 1
            if row.get("backdrop"):
                coverage["backdrop"] += 1
            if row.get("overview"):
                coverage["overview"] += 1
            if row.get("genres"):
                coverage["genres"] += 1
            for genre in set(row.get("genres") or []):
                if isinstance(genre, str) and genre:
                    genres[genre] += 1
            lang = row.get("original_language")
            if isinstance(lang, str) and lang:
                languages[lang] += 1
            try:
                year = int(row.get("year") or 0)
            except (TypeError, ValueError):
                year = 0
            if 1880 <= year <= 2100:
                years[str(year)] += 1
                decades[str((year // 10) * 10) + "s"] += 1
            try:
                vote = float(row.get("vote") or 0)
            except (TypeError, ValueError):
                vote = 0
            if 0 < vote <= 10:
                rating_bands[str(min(9, int(vote))) + "–" + str(min(10, int(vote) + 1))] += 1
                if vote >= 8.0:
                    top_rated.append({"type": kind, "tmdb_id": row["tmdb_id"],
                                      "title": row.get("title", ""), "year": year, "vote": vote})
            if kind == "movie":
                try:
                    runtime = int(row.get("runtime") or 0)
                except (TypeError, ValueError):
                    runtime = 0
                if runtime:
                    coverage["runtime"] += 1
                    bracket = "< 90 min" if runtime < 90 else "90–119 min" if runtime < 120 else "120–149 min" if runtime < 150 else "150+ min"
                    runtime_bands[bracket] += 1

    credit_titles = set()
    imdb_titles = set()
    imdb_identified = set()
    taglines = set()
    credits_checked = set()
    meta_keywords = set()
    keyword_titles = set()
    award_titles = set()
    awards = Counter()
    people = {}
    actors = defaultdict(set)
    directors = defaultdict(set)
    finances = []
    finance_coverage = Counter()
    for shard in sorted((root / "data/cinema/credits").glob("??.json")):
        doc = load(shard)
        for key, record in (doc.get("items") or {}).items():
            if key not in catalog or not isinstance(record, dict):
                continue
            if record.get("cast") or record.get("crew"):
                credit_titles.add(key)
            if record.get("checked_at"):
                credits_checked.add(key)
            if record.get("imdb_id"):
                imdb_identified.add(key)
            if record.get("imdb_metadata"):
                imdb_titles.add(key)
            if record.get("tagline"):
                taglines.add(key)
            if record.get("tmdb_keywords"):
                meta_keywords.add(key)
            if record.get("tmdb_keywords") or (record.get("imdb_metadata") or {}).get("keywords"):
                keyword_titles.add(key)
            if record.get("awards"):
                award_titles.add(key)
            for person in record.get("cast") or []:
                try:
                    pid = int(person.get("id"))
                except (TypeError, ValueError, AttributeError):
                    continue
                if pid > 0:
                    actors[pid].add(key)
                    people[pid] = str(person.get("name") or people.get(pid) or "Senza nome")[:140]
            for person in record.get("crew") or []:
                if not isinstance(person, dict) or person.get("job") not in ("Director", "Creator"):
                    continue
                try:
                    pid = int(person.get("id"))
                except (TypeError, ValueError):
                    continue
                if pid > 0:
                    directors[pid].add(key)
                    people[pid] = str(person.get("name") or people.get(pid) or "Senza nome")[:140]
            seen_awards = set()
            for award in record.get("awards") or []:
                if not isinstance(award, dict):
                    continue
                identity = (award.get("event"), award.get("category"), award.get("year"),
                            award.get("outcome"), award.get("recipient"))
                if identity in seen_awards:
                    continue
                seen_awards.add(identity)
                outcome = award.get("outcome")
                if outcome in ("won", "nominated"):
                    awards[outcome] += 1
                    awards[str(award.get("event") or "Altro")] += 1
            if key.startswith("movie:"):
                facts = record.get("facts") or {}
                try:
                    budget = int(facts.get("budget_usd") or 0)
                    revenue = int(facts.get("revenue_usd") or 0)
                except (TypeError, ValueError, AttributeError):
                    budget, revenue = 0, 0
                # IMDb's USD worldwide gross supplements TMDB only when TMDB
                # lacks a known revenue figure. Never mix currencies.
                source_name = "TMDB"
                imdb = record.get("imdb_metadata") or {}
                gross = imdb.get("gross_worldwide") or {} if isinstance(imdb,dict) else {}
                if revenue <= 0 and isinstance(gross,dict) and gross.get("currency") == "USD":
                    try:
                        revenue = max(0,int(gross.get("amount") or 0))
                    except (ValueError,TypeError):
                        revenue = 0
                    if revenue > 0:
                        source_name = "IMDb"
                if budget > 0:
                    finance_coverage["budget"] += 1
                if revenue > 0:
                    finance_coverage["revenue"] += 1
                if budget > 0 and revenue > 0:
                    finance_coverage["both"] += 1
                if revenue > 0:
                    row = catalog[key]
                    finances.append({"tmdb_id": row.get("tmdb_id"), "title": row.get("title", ""),
                                     "year": row.get("year"), "revenue_usd": revenue,
                                     "budget_usd": budget, "ratio": round(revenue / budget, 2) if budget else None,
                                     "source": source_name})

    def people_rank(associations, limit=20):
        result = []
        for pid, keys in associations.items():
            if len(keys) < 2:
                continue
            examples = sorted(keys, key=lambda key: float(catalog[key].get("vote") or 0), reverse=True)[:3]
            result.append({"id": pid, "name": people.get(pid, ""), "works": len(keys),
                           "examples": [{"type": key.split(":")[0],
                                         "tmdb_id": catalog[key]["tmdb_id"],
                                         "title": catalog[key].get("title", "")} for key in examples]})
        return sorted(result, key=lambda row: (-row["works"], row["name"]))[:limit]

    profiles = Counter()
    people_identifiers = set()
    for shard in sorted((root / "data/cinema/people").glob("??.json")):
        for pid, person in (load(shard).get("items") or {}).items():
            if not isinstance(person, dict) or not isinstance(person.get("name"), str):
                continue
            people_identifiers.add(str(pid))
            if person.get("photo"):
                profiles["portrait"] += 1
            if person.get("biography"):
                profiles["biography"] += 1
            if person.get("biography_language") == "it":
                profiles["biography_italian"] += 1
            if person.get("filmography"):
                profiles["filmography"] += 1
            if person.get("birthday"):
                profiles["birthdate"] += 1

    thematic = load(root / "data/cinema/theme-index.json")
    thematic_items = thematic.get("items") or {}
    with_topics = sum(1 for row in thematic_items.values() if isinstance(row, dict) and row.get("topics"))
    with_themes = sum(1 for row in thematic_items.values() if isinstance(row, dict) and row.get("keywords"))
    seasonal = sum(1 for row in thematic_items.values() if isinstance(row, dict) and row.get("seasons"))
    quotes = load(root / "data/cinema/quote-sources.json")
    quote_items = quotes.get("items") or {}
    quote_checked = quotes.get("checked") or []
    connections = load(root / "data/cinema/connections-status.json")
    related_status = load(root / "data/related/status.json")
    ratings_source = load(root / "data/multi-ratings.json")
    ratings_items = ratings_source.get("items") or {}
    critics = load(root / "data/critic-reviews.json")
    critics_items = critics.get("items") or {}
    reviews_source = load(root / "data/reviews.json")
    reviews_items = reviews_source.get("items") or {}
    reviews_checked = sum(1 for record in reviews_items.values() if isinstance(record,dict) and record.get("checked_at"))
    reviews_found = sum(1 for record in reviews_items.values() if isinstance(record,dict) and record.get("reviews"))
    quote_count = sum(1 for record in quote_items.values() if record)
    enrichment = {
        "credits_checked": len(credits_checked), "credits_with_cast_crew": len(credit_titles),
        "imdb_identified": len(imdb_identified), "imdb_metadata": len(imdb_titles),
        "tmdb_keywords": len(meta_keywords), "title_taglines": len(taglines),
        "people_indexed": len(people_identifiers),
        "people_portraits": profiles["portrait"], "people_biographies": profiles["biography"],
        "people_biographies_it": profiles["biography_italian"],
        "people_filmographies": profiles["filmography"], "people_birthdates": profiles["birthdate"],
        "theme_titles": len(thematic_items), "keyword_titles": with_themes,
        "topic_titles": with_topics, "seasonal_titles": seasonal,
        "quote_checked": len(quote_checked), "quote_titles": quote_count,
        "connections_titles": int(connections.get("titles") or 0),
        "connections_enriched": int(connections.get("enriched") or 0),
        "related_titles": int(related_status.get("indexed") or 0),
        "related_remaining": int(related_status.get("remaining") or 0),
        "related_added_last_run": int(related_status.get("added") or 0),
        "reviews_checked": reviews_checked, "reviewed_titles": reviews_found,
        "external_critic_titles": len(critics_items),
        "external_rating_titles": sum(1 for v in ratings_items.values() if isinstance(v,dict) and v.get("scores")),
        "award_titles": len(award_titles)
    }
    metrics = load(root / "data/catalog-metrics.json")
    current = metrics.get("current") or {}
    days = metrics.get("history") or []
    runs = metrics.get("runs") or []
    source_count = sum(total.values())
    finance_sum = sum(row["revenue_usd"] for row in finances)
    revenue_rank = sorted(finances, key=lambda row: -row["revenue_usd"])[:20]
    roi_rank = sorted((r for r in finances if r["budget_usd"] >= 1000000),
                      key=lambda row: -(row["ratio"] or 0))[:20]
    updated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    imdb_state = load(root / "data/cinema/imdb-import-status.json")
    years = imdb_state.get("years") or {}
    imdb_years = [{
        "year": year,
        "known_titles": int(detail.get("known_titles") or 0),
        "updated": int(detail.get("updated") or 0),
        "checked_at": detail.get("checked_at", "")
    } for year,detail in sorted(years.items(),reverse=True)
      if isinstance(detail,dict)]
    source_status = {
        "imdb_years": imdb_years,
        "last_imdb_check": max((v.get("checked_at","") for v in years.values()
                                if isinstance(v,dict)),default=""),
        "portrait": load(root / "data/cinema/portrait-status.json"),
        "connections": connections,
        "related": related_status,
        "quotes": {"checked": len(quote_checked), "titles": quote_count,
                   "updated_at": quotes.get("updated_at","")},
        "wikidata_last_failure": load(root / "data/cinema/wikidata-status.json").get("last_failure"),
        "translation_last_failure": load(root / "data/cinema/translation-status.json").get("failed_on")
    }
    previous_report = load(root / "data/admin-analytics.json")
    prior_enrichment = previous_report.get("enrichment") or {}
    previous_runs = previous_report.get("enrichment_runs") or []
    prior_history = previous_report.get("enrichment_history") or []
    deltas = {key: (value - int(prior_enrichment[key]))
              for key,value in enrichment.items()
              if isinstance(value,int) and key in prior_enrichment
              and key not in ("related_remaining","related_added_last_run")}
    snapshot = {"at": updated, "total_titles": source_count, **enrichment}
    history = [x for x in prior_history if str(x.get("at",""))[:10] != updated[:10]]
    history.append(snapshot)
    run_history = (previous_runs + [snapshot])[-270:]
    # Preserve up to one daily snapshot for a full year, plus recent run-by-run history.
    history = history[-365:]
    result = {
        "schema": 1, "updated_at": updated, "source": "Bobo catalog, TMDB and indexed credits",
        "catalog": {
            "movies": total["movie"], "series": total["tv"], "total": source_count,
            "years": ranked(years, 200), "decades": ranked(decades, 30),
            "genres": ranked(genres, 30), "languages": ranked(languages, 25),
            "ratings": ranked(rating_bands, 11), "runtime": ranked(runtime_bands, 5),
            "top_rated": sorted(top_rated, key=lambda r: (-r["vote"], -r["year"], r["title"]))[:20]
        },
        "coverage": {
            "total": source_count, "poster": coverage["poster"],
            "backdrop": coverage["backdrop"], "overview": coverage["overview"],
            "genres": coverage["genres"], "runtime_movies": coverage["runtime"],
            "credits": len(credit_titles), "keywords": len(keyword_titles),
            "awards": len(award_titles),
            "reviewed_titles": int(current.get("reviewed_titles") or 0),
            "episode_series": int(current.get("series_with_episode_data") or 0),
            "platform_checked": int(current.get("titles_with_platform_check") or 0),
            "related_titles": int(current.get("related_titles") or 0)
        },
        "finances": {
            "currency": "USD", "scope": "Solo film con ricavi USD registrati in TMDB o IMDb",
            "with_budget": finance_coverage["budget"],
            "with_revenue": finance_coverage["revenue"],
            "with_both": finance_coverage["both"],
            "total_known_revenue_usd": finance_sum,
            "top_revenue": revenue_rank, "top_ratio": roi_rank
        },
        "people": {"actors": people_rank(actors), "directors": people_rank(directors),
                   "actors_indexed": len(actors), "directors_indexed": len(directors)},
        "awards": {"won": awards["won"], "nominated": awards["nominated"],
                   "events": ranked({k:v for k,v in awards.items() if k not in ("won","nominated")}, 15)},
        "enrichment": enrichment,
        "source_status": source_status,
        "enrichment_delta_last_run": deltas,
        "enrichment_history": history,
        "enrichment_runs": run_history,
        "growth": {"current": current, "daily": days[-365:], "runs": runs[-270:]}
    }
    return result


def main():
    root = Path(".")
    output = root / "data/admin-analytics.json"
    data = build(root)
    serialized = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    if not output.exists() or output.read_text(encoding="utf-8") != serialized:
        output.write_text(serialized, encoding="utf-8")
    print("Bobo admin analytics:", data["catalog"]["total"],
          "titles /", data["finances"]["with_revenue"], "revenue records")


if __name__ == "__main__":
    main()
