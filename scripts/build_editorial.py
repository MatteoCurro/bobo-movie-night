#!/usr/bin/env python3
"""Build durable, quality-gated Bobo Discover shelves from *verified* TMDB votes.

Only titles in our own catalog qualify. TMDB counts and their provenance live in
a persistent evidence file; a 10/10 from one user is never treated as editorial
quality. Failure of an external request preserves previous evidence.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path("data")
OUT=ROOT/"editorial.json"
HISTORY=ROOT/"editorial-history.json"
EVIDENCE=ROOT/"editorial-evidence.json"
NOW=dt.datetime.now(dt.timezone.utc)
TODAY=NOW.date()
TOKEN=os.environ.get("TMDB_ACCESS_TOKEN","").strip()
API="https://api.themoviedb.org/3"

def read(path, default):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError): return default

def write(path, data):
    result=json.dumps(data,ensure_ascii=False,indent=2,sort_keys=True)+"\n"
    if not path.exists() or path.read_text(encoding="utf-8")!=result:
        path.write_text(result,encoding="utf-8")

def key(item): return str(item["type"])+":"+str(item["tmdb_id"])

def fetch(kind, params):
    query=dict(params,language="it-IT",include_adult="false")
    headers={"Accept":"application/json","User-Agent":"BoboMovieNight/3.0 (curated-catalog)"}
    if TOKEN.startswith("eyJ") or TOKEN.startswith("Bearer "):
        headers["Authorization"]="Bearer "+TOKEN.removeprefix("Bearer ").strip()
    else:
        query["api_key"]=TOKEN
    url=API+"/discover/"+kind+"?"+urllib.parse.urlencode(query)
    request=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(request,timeout=15) as response:
        result=json.load(response)
    if not isinstance(result,dict) or not isinstance(result.get("results"),list):
        raise ValueError("Unexpected TMDB discovery payload")
    return result["results"]


def add_seasonal_evidence(metrics, catalog, limit=14):
    """Gradually verify holiday titles instead of trusting a tiny rating sample."""
    if not TOKEN:
        return
    seasonal=read(ROOT/"seasonal.json",{}).get("seasons") or []
    month=TODAY.month
    priority={"christmas":0 if month in (11,12,1) else 2,
              "halloween":0 if month in (9,10) else 2,
              "easter":1}
    pending=[]
    for shelf in sorted(seasonal,key=lambda row:priority.get(row.get("id"),3)):
        for row in shelf.get("items") or []:
            key=str(row.get("type"))+":"+str(row.get("tmdb_id"))
            if key not in catalog or key in pending:
                continue
            previous=metrics.get(key) or {}
            try:
                age=(TODAY-dt.date.fromisoformat(previous.get("observed_at",""))).days
            except (ValueError,TypeError):
                age=1000
            if previous.get("vote_count") and age < 45:
                continue
            pending.append(key)
    for key in pending[:limit]:
        kind,mid=key.split(":",1)
        query={"language":"it-IT"}
        headers={"Accept":"application/json","User-Agent":"BoboMovieNight/3.1 (editorial evidence)"}
        if TOKEN.startswith("eyJ") or TOKEN.startswith("Bearer "):
            headers["Authorization"]="Bearer "+TOKEN.removeprefix("Bearer ").strip()
        else:
            query["api_key"]=TOKEN
        uri=API+"/"+kind+"/"+mid+"?"+urllib.parse.urlencode(query)
        try:
            with urllib.request.urlopen(urllib.request.Request(uri,headers=headers),timeout=9) as response:
                row=json.load(response)
            votes=int(row.get("vote_count") or 0)
            rating=float(row.get("vote_average") or 0)
            if votes>0 and 0<=rating<=10:
                metrics[key]={"vote_count":votes,"vote_average":round(rating,3),
                              "popularity":float(row.get("popularity") or 0),
                              "observed_at":TODAY.isoformat(),"source":"TMDB"}
        except (OSError,ValueError,TypeError,KeyError,TimeoutError,urllib.error.URLError):
            continue

def collect_metrics(catalog):
    evidence=read(EVIDENCE,{"schema":1,"titles":{}})
    metrics=evidence.get("titles",{})
    if not isinstance(metrics,dict):metrics={}
    if TOKEN:
        # Broad popularity, strong ratings with meaningful sample, recent releases.
        for kind in ("movie","tv"):
            datekey="primary_release_date.gte" if kind=="movie" else "first_air_date.gte"
            base=[
                ("vote_count.desc",{"vote_count.gte":"400","vote_average.gte":"6.6"},5),
                ("vote_average.desc",{"vote_count.gte":"200","vote_average.gte":"7.0"},5),
                ("vote_count.desc",{"vote_count.gte":"80","vote_average.gte":"6.7",
                                    datekey:str(TODAY.year-4)+"-01-01"},3),
            ]
            for sort,filters,pages in base:
                for page in range(1,pages+1):
                    try:
                        rows=fetch(kind,dict(filters,sort_by=sort,page=str(page)))
                        count=0
                        for row in rows:
                            ident=row.get("id")
                            k=kind+":"+str(ident)
                            votes=row.get("vote_count")
                            average=row.get("vote_average")
                            if k not in catalog or not isinstance(votes,int) or votes<1 or not isinstance(average,(int,float)):
                                continue
                            metrics[k]={"vote_count":votes,"vote_average":round(float(average),3),
                                        "popularity":float(row.get("popularity") or 0),
                                        "observed_at":TODAY.isoformat(),"source":"TMDB"}
                            count+=1
                        if len(rows)<20:break
                    except (urllib.error.URLError,TimeoutError,ValueError,KeyError) as exc:
                        print("TMDB editorial evidence unavailable",kind,sort,page,type(exc).__name__)
                        break
    elif not metrics:
        print("TMDB token unavailable; no unverified titles will be promoted.")
    add_seasonal_evidence(metrics,catalog)
    if metrics:write(EVIDENCE,{"schema":1,"titles":metrics})
    return metrics

def main():
    catalog={}
    for kind in ("movie","tv"):
        file=ROOT/("movies.json" if kind=="movie" else "tv.json")
        for row in read(file,{}).get("items",[]):
            if row.get("tmdb_id") and row.get("title"):
                item=dict(row,type=kind)
                catalog[key(item)]=item
    evidence=collect_metrics(catalog)
    if not evidence:
        print("No verified evidence; preserving existing Discover data")
        return

    source=read(ROOT/"discovery.json",{})
    trending={str(r.get("type"))+":"+str(r.get("tmdb_id")) for r in source.get("trending",[])}
    stream=source.get("streaming") or {}
    arrivals={str(r.get("type"))+":"+str(r.get("tmdb_id")) for r in stream.get("items",[])}
    for platform in stream.get("platforms",[]):
        arrivals.update(str(r.get("type"))+":"+str(r.get("tmdb_id")) for r in platform.get("items",[]))
    archive=read(HISTORY,{"schema":1,"titles":{},"issues":[]})
    known=archive.get("titles",{})
    issues=archive.get("issues",[])
    previous={k for issue in issues[-4:] if issue.get("week")!=NOW.strftime("%G-W%V") for k in issue.get("ids",[])}

    def verify(item):
        k=key(item)
        proof=evidence.get(k)
        if not proof or not item.get("poster") or not item.get("overview"):return False
        count=int(proof.get("vote_count") or 0)
        vote=float(proof.get("vote_average") or 0)
        # Minimum independent votes; scores above 9 do not get a pass.
        return count>=200 and 6.8<=vote<=10 and 1920<=int(item.get("year") or 0)<=TODAY.year

    eligible=[x for x in catalog.values() if verify(x)]
    def votes(item):return int(evidence[key(item)]["vote_count"])
    def rating(item):return float(evidence[key(item)]["vote_average"])
    def score(item):
        n=votes(item)
        v=rating(item)
        bayes=(v*n+6.8*1200)/(n+1200)
        confidence=min(1.2,math.log10(n+1)*.29)
        freshness=max(0,3-(TODAY.year-int(item.get("year") or 0)))*.06
        return bayes+confidence+freshness+.18*(key(item) in trending)-.7*(key(item) in previous)
    def brief(item):
        return {"type":item["type"],"tmdb_id":int(item["tmdb_id"]),"title":str(item.get("title") or "")[:160],
            "year":int(item.get("year") or 0),"vote":round(rating(item),1),
            "vote_count":votes(item),"poster":item.get("poster"),
            "overview":str(item.get("overview") or "")[:280],
            "genres":list(item.get("genres") or [])[:7],"runtime":int(item.get("runtime") or 0)}
    used=set()
    sections=[]
    def add(ident,title,subtitle,rows,limit=12):
        out=[]
        for item in sorted(rows,key=lambda x:(score(x),key(x)),reverse=True):
            k=key(item)
            if k in used:continue
            used.add(k);out.append(brief(item))
            if len(out)>=limit:break
        if len(out)>=4:sections.append({"id":ident,"title":title,"subtitle":subtitle,"items":out})

    recent=[x for x in eligible if int(x.get("year") or 0)>=TODAY.year-4 and votes(x)>=300]
    add("week","Da vedere questa settimana","Scelte basate su valutazioni affidabili, non solo sui trend",
        [x for x in recent if rating(x)>=7.0],10)
    add("hidden","Gemme nascoste","Film molto apprezzati, meno presenti nelle classifiche",
        [x for x in eligible if x["type"]=="movie" and 1995<=int(x.get("year") or 0)<=TODAY.year-2
         and 200<=votes(x)<=5000 and rating(x)>=7.2],12)
    add("mini","Serie da divorare","Serie apprezzate da un pubblico significativo",
        [x for x in eligible if x["type"]=="tv" and int(x.get("year") or 0)>=2010 and votes(x)>=350
         and rating(x)>=7.1],12)
    add("anime","Anime da scoprire","Animazione giapponese dal catalogo Bobo; lingua del player da verificare",
        [x for x in eligible if x.get("original_language")=="ja"
         and any("animaz" in str(g).lower() or "animation" in str(g).lower()
                 for g in x.get("genres",[]))],14)
    add("cinephiles","I più amati dal pubblico","Titoli con molti voti e giudizi positivi",
        [x for x in eligible if votes(x)>=2000 and rating(x)>=7.6],12)
    add("classics","Grandi film da recuperare","Film memorabili che superano la prova del tempo",
        [x for x in eligible if x["type"]=="movie" and 1970<=int(x.get("year") or 0)<=2014
         and votes(x)>=900 and rating(x)>=7.2],12)
    add("new","Novità interessanti","Nuove uscite selezionate per consenso e rilevanza",
        [x for x in recent if key(x) in arrivals or key(x) in trending],10)

    # If a section is thin, don't replace it with titles lacking credible evidence.
    if len(sections)<3:
        print("Not enough verified sections; preserving previous edition")
        return
    for section in sections:
        for entry in section["items"]:
            k=key(entry)
            row=known.setdefault(k,{"first_seen":TODAY.isoformat(),"sources":[],"categories":[]})
            row["last_seen"]=TODAY.isoformat()
            if section["id"] not in row["categories"]:row["categories"].append(section["id"])
            for source_name in (["tmdb-trending"] if k in trending else [])+(
                ["streaming-observation"] if k in arrivals else [])+["bobo-editorial","tmdb-vote-count"]:
                if source_name not in row["sources"]:row["sources"].append(source_name)
    selected={key(x) for s in sections for x in s["items"]}
    indexed={key(x):x for x in eligible}
    # Restricted, explainable graph. Prefer shared genres and established ratings.
    related={}
    for k in selected:
        origin=indexed.get(k)
        if not origin:continue
        og=set(str(g).casefold() for g in origin.get("genres") or [])
        ranked=[]
        for other in eligible:
            k2=key(other)
            if k==k2 or votes(other)<350:continue
            common=len(og & set(str(g).casefold() for g in other.get("genres") or []))
            if not common:continue
            weight=common*2+max(0,4-abs(int(other.get("year") or 0)-int(origin.get("year") or 0)))*.15
            weight+=min(2,score(other)-6)*.35
            if k2 in selected:weight+=.35
            ranked.append((weight,k2))
        related[k]=[brief(indexed[k2]) for _,k2 in sorted(ranked,reverse=True)[:8]]
    issue={"week":NOW.strftime("%G-W%V"),"ids":[key(x) for s in sections for x in s["items"]]}
    issues=[x for x in issues if x.get("week")!=issue["week"]][-51:]+[issue]
    payload={"schema":1,"generated_at":NOW.replace(microsecond=0).isoformat(),"region":"IT",
        "sections":sections,"related":related,
        "method":"TMDB, selezione automatica con campione minimo e punteggio bayesiano; non recensioni indipendenti."}
    write(OUT,payload)
    write(HISTORY,{"schema":1,"titles":known,"issues":issues})
    print("Editorial sections:",len(sections),"verified titles:",len(evidence),"chosen:",len(selected))
if __name__=="__main__":
    main()
