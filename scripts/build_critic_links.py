#!/usr/bin/env python3
"""Multi-publication film-review *link* index, separate from TMDB user reviews.

Collects only article headline + public URL from RSS/official review listing
pages, no article bodies, paragraphs, screenshots or unlicensed ratings.
Strong title matching; ambiguous and short title matches are discarded.
"""
from __future__ import annotations
import datetime as dt
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET

TODAY=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
SOURCES=(
    ("comingsoon","ComingSoon","https://www.comingsoon.it/cinema/recensioni/","html","movie"),
    ("cinematografo","Cinematografo","https://www.cinematografo.it/recensioni","html","movie"),
    ("movieplayer","Movieplayer","https://movieplayer.it/rss/homepage.xml","rss","either"),
)
SOURCE_HOSTS={
    "comingsoon":"www.comingsoon.it",
    "cinematografo":"www.cinematografo.it",
    "movieplayer":"movieplayer.it",
}
MAX_ARTICLES=100
MAX_ARTICLES_PER_TITLE=20

def read(path,default):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,ValueError):return default
def norm(value):
    s=unicodedata.normalize("NFKD",html.unescape(str(value or "")))
    s="".join(c for c in s if not unicodedata.combining(c)).casefold()
    return " ".join(re.findall(r"[a-z0-9]+",s))
def safe_url(value,source):
    try:
        parsed=urllib.parse.urlsplit(value)
        if parsed.scheme!="https" or parsed.username or parsed.password or parsed.port:return ""
        if parsed.hostname!=SOURCE_HOSTS[source]:return ""
        if source=="comingsoon" and not re.fullmatch(r"/film/[^/?#]+/[0-9]+/recensione/?",parsed.path):return ""
        if source=="cinematografo" and not re.fullmatch(r"/recensioni/[^/?#]+",parsed.path):return ""
        if source=="movieplayer" and not re.fullmatch(r"/articoli/[^/?#]+",parsed.path):return ""
        return parsed.scheme+"://"+parsed.netloc+parsed.path
    except (ValueError,TypeError,KeyError):return ""

class Links(HTMLParser):
    def __init__(self,source):
        super().__init__(convert_charrefs=True)
        self.source=source;self.entries=[];self.href="";self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag!="a":return
        url=dict(attrs).get("href","")
        url=urllib.parse.urljoin("https://"+SOURCE_HOSTS[self.source],url)
        valid=safe_url(url,self.source)
        if valid:self.href=valid;self.parts=[]
    def handle_data(self,data):
        if self.href:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=="a" and self.href:
            title=" ".join("".join(self.parts).split())
            if title:self.entries.append({"title":title[:180],"url":self.href})
            self.href="";self.parts=[]
def articles(body,source,mode):
    if mode=="html":
        parser=Links(source);parser.feed(body.decode("utf-8","replace"))
        return parser.entries[:MAX_ARTICLES]
    root=ET.fromstring(body)
    result=[]
    for item in root.findall(".//item"):
        title=" ".join((item.findtext("title") or "").split())
        url=safe_url(item.findtext("link") or "",source)
        cats=[norm(el.text) for el in item.findall("category") if el.text]
        if url and title and ("recension" in norm(title) or any("recension" in c for c in cats)
                              or "recension" in url):
            result.append({"title":title[:180],"url":url})
    return result[:MAX_ARTICLES]

def fetch(url,max_bytes=700_000):
    request=urllib.request.Request(url,headers={
        "User-Agent":"BoboMovieClub/1.0 (attributed editorial link index; contact via project repository)",
        "Accept":"text/html,application/rss+xml,application/xml;q=0.9",
    })
    with urllib.request.urlopen(request,timeout=12) as response:
        return response.read(max_bytes)

def catalog_index(root):
    keys={}
    for kind,path in (("movie","movies.json"),("tv","tv.json")):
        for row in read(root/"data"/path,{"items":[]}).get("items",[]):
            title=norm(row.get("title",""))
            tid=row.get("tmdb_id")
            try:tid=int(tid)
            except (ValueError,TypeError):continue
            if tid<=0 or len(title)<7 or len(title.split())==1 and len(title)<10:continue
            keys.setdefault(title,[]).append((kind,tid,row.get("year")))
    return keys

def matching_title(title,index,kind="either"):
    normalized=norm(title)
    matches=[]
    for candidate,identity in index.items():
        if not(normalized==candidate or normalized.startswith(candidate+" ")):continue
        if not any(k in normalized for k in ("recensione","review","critica")) and kind=="either":continue
        identities=[x for x in identity if kind=="either" or x[0]==kind]
        if len(identities)!=1:continue
        matches.append((len(candidate),identities[0]))
    if not matches:return None
    matches.sort(reverse=True,key=lambda x:x[0])
    if len(matches)>1 and matches[0][0]==matches[1][0]:return None
    movie=matches[0][1]
    return movie[0]+":"+str(movie[1])

def build(root:Path,reader=fetch,force=False):
    path=root/"data/critic-reviews.json"
    data=read(path,{"schema":1,"items":{},"sources":{}})
    if data.get("schema")!=1 or not isinstance(data.get("items"),dict):
        raise ValueError("Invalid editorial index")
    indexed=catalog_index(root)
    added=0;checked=0
    for key,name,url,mode,kind in SOURCES:
        state=data.setdefault("sources",{}).get(key,{})
        try:last=dt.date.fromisoformat((state.get("checked_at") or "")[:10])
        except (TypeError,ValueError):last=None
        if not force and last==dt.date.today():continue
        try:
            rows=articles(reader(url),key,mode)
            if not rows:continue
            for record in rows:
                target=matching_title(record["title"],indexed,kind)
                if not target:continue
                existing=data["items"].setdefault(target,[])
                if any(e.get("url")==record["url"] for e in existing):continue
                if len(existing)>=MAX_ARTICLES_PER_TITLE:continue
                existing.append({"source":key,"title":record["title"],
                                 "url":record["url"],"observed_at":TODAY[:10]})
                added+=1
            data["sources"][key]={"name":name,"checked_at":TODAY,"articles_seen":len(rows)}
            checked+=1
        except (OSError,urllib.error.URLError,ValueError,ET.ParseError,TimeoutError) as exc:
            print("Editorial source unavailable:",key,type(exc).__name__)
    data["updated_at"]=TODAY
    data["schema"]=1
    if checked:
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n",encoding="utf-8")
    print("Independent criticism links: sources_checked",checked,"new_matches",added,"total_titles",len(data["items"]))
    return checked,added
if __name__=="__main__":build(Path("."))
