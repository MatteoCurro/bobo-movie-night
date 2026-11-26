#!/usr/bin/env python3
"""Offline checks: independent publisher review links, strict matching and durability."""
import importlib.util
import json
import tempfile
from pathlib import Path

spec=importlib.util.spec_from_file_location("critic",Path("scripts/build_critic_links.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.safe_url("https://www.comingsoon.it/film/fight-club/1234/recensione/","comingsoon")
assert not m.safe_url("http://www.comingsoon.it/film/fight-club/1234/recensione/","comingsoon")
assert not m.safe_url("https://example.com/film/fight-club/1234/recensione/","comingsoon")
assert m.safe_url("https://www.cinematografo.it/recensioni/fight-club-abcdef","cinematografo")
assert not m.safe_url("https://www.cinematografo.it/opinioni/news","cinematografo")
assert m.safe_url("https://movieplayer.it/articoli/fight-club-recensione_38160/","movieplayer")

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);(root/"data").mkdir()
    films=[{"tmdb_id":550,"title":"Fight Club","year":1999},
           {"tmdb_id":123,"title":"La forma della voce","year":2016},
           {"tmdb_id":42,"title":"Un nome comune","year":2026}]
    series=[{"tmdb_id":43,"title":"Un nome comune","year":2020}]
    (root/"data/movies.json").write_text(json.dumps({"items":films}))
    (root/"data/tv.json").write_text(json.dumps({"items":series}))
    sources={
       "https://www.comingsoon.it/cinema/recensioni/":b'<html><a href="/film/fight-club/1234/recensione/">Fight Club: la recensione del film</a><a href="/film/other/456/recensione/">Film senza corrispondenza: recensione</a></html>',
       "https://www.cinematografo.it/recensioni":b'<html><a href="/recensioni/la-forma-della-voce-abcd">La forma della voce</a><a href="/opinioni/other">Non recensione</a></html>',
       "https://movieplayer.it/rss/homepage.xml":b'<rss><channel><item><title>Fight Club: recensione del film</title><link>https://movieplayer.it/articoli/fight-club-recensione_38160/</link><category>Recensioni</category></item></channel></rss>'
    }
    def get(url):return sources[url]
    checked,added=m.build(root,reader=get,force=True)
    assert (checked,added)==(3,3),(checked,added)
    data=json.loads((root/"data/critic-reviews.json").read_text())
    assert {x["source"] for x in data["items"]["movie:550"]}=={"comingsoon","movieplayer"}
    assert [x["source"] for x in data["items"]["movie:123"]]==["cinematografo"]
    assert "movie:42" not in data and "tv:43" not in data["items"]
    assert len(data["items"])==2
    checked2,added2=m.build(root,reader=get,force=True)
    assert (checked2,added2)==(3,0),"Duplicate articles must not be added"
    assert data["items"]["movie:550"]==json.loads((root/"data/critic-reviews.json").read_text())["items"]["movie:550"]
    def unavailable(_):raise OSError("Temporary outage")
    assert m.build(root,reader=unavailable,force=True)==(0,0)
    assert len(json.loads((root/"data/critic-reviews.json").read_text())["items"]["movie:550"])==2

print("Independent criticism: public links, no text copies, title matching, source labels and outage retention OK")
