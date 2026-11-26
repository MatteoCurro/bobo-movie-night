#!/usr/bin/env python3
"""No-network quote source discovery: exact film templates, no dialogue copying."""
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path("scripts").resolve()))
from build_cinema import load, write
import discover_quote_sources as mod

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    write(root/"data/movies.json", {"items": [
        {"tmdb_id": 238, "title": "Il padrino", "year": 1972, "vote": 9.2},
        {"tmdb_id": 603, "title": "Matrix", "year": 1999, "vote": 8.7},
        {"tmdb_id": 6101, "title": "Remake", "year": 2000, "vote": 7.1},
        {"tmdb_id": 6102, "title": "Remake", "year": 2010, "vote": 7.5},
    ]})
    write(root/"data/tv.json", {"items":[]})
    called = []
    def finder(titles):
        called.extend(titles)
        return [
          {"ns":0,"pageid":123,"title":"Il padrino",
           "templates":[{"ns":10,"title":"Template:Film"}]},
          {"ns":0,"pageid":345,"title":"Matrix",
           "templates":[{"ns":10,"title":"Template:Biografia"}]},
        ]
    out = mod.build(root,finder=finder,limit=50,today="2026-11-26")
    assert out == {"checked":2,"matched":1,"total":1},out
    assert not any(t=="Remake" for t in called)
    saved = load(root/"data/cinema/quote-sources.json")
    assert saved["items"]["movie:238"]["url"] == "https://it.wikiquote.org/wiki/Il_padrino"
    assert "movie:603" not in saved["items"]
    assert set(saved["checked"])=={"movie:238","movie:603"}
    assert mod.build(root,finder=finder,limit=50)["checked"]==0
    assert not mod.valid_page({"title":"Il padrino","ns":0,"missing":True,
                               "templates":[{"title":"Template:Film"}]})
    assert mod.valid_page({"title":"Il padrino","ns":0,
                           "templates":[{"title":"Template:Film"}]})
    assert not mod.valid_page({"title":"La biografia","ns":0,
                               "templates":[{"title":"Template:Biografia"}]})
print("Wikiquote source discovery: exact film pages, remakes skipped and cached results OK")
