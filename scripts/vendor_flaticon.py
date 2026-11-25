#!/usr/bin/env python3
"""Vendor Flaticon FREE animated GIF previews with attribution.

These exact animated items were linked from Flaticon's free-animated-icon
listings. The free license requires visible author credit. We keep a compact
manifest with each original source page; no premium or protected downloads.
Only the publicly exposed GIF preview (not paid Lottie/SVG files) is requested.

Bobo renders each transparent GIF in a single tint using CSS brightness/filter.
Never store private login cookies or attempt gated/paywalled download endpoints.
"""
from __future__ import annotations
import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT=Path("assets/flaticon")
AUTHOR="Magnific"
# label, category, id, official free-icon detail page
ITEMS=[
    ("climbing","climb",17091804,"https://www.flaticon.com/free-animated-icon/climbing_17091804"),
    ("climber-1","climb",16780820,"https://www.flaticon.com/free-animated-icon/climber_16780820"),
    ("climber-2","climb",16780819,"https://www.flaticon.com/free-animated-icon/climber_16780819"),
    ("hiking","climb",17513885,"https://www.flaticon.com/free-animated-icon/hiking_17513885"),
    ("summit","climb",16780825,"https://www.flaticon.com/free-animated-icon/summit_16780825"),
    ("dog-1","dog",12280731,"https://www.flaticon.com/free-animated-icon/dog_12280731"),
    ("dog-2","dog",11684052,"https://www.flaticon.com/free-animated-icon/dog_11684052"),
    ("dog-3","dog",9874154,"https://www.flaticon.com/free-animated-icon/dog_9874154"),
]
MAX=2_000_000

def download(id:int, target:Path) -> bool:
    if target.exists() and target.stat().st_size>100 and target.read_bytes()[:6] in (b"GIF87a",b"GIF89a"):
        return True
    url=f"https://cdn-icons-gif.flaticon.com/{str(id)[:5]}/{id}.gif"
    request=urllib.request.Request(url,headers={
        "User-Agent":"Mozilla/5.0 (compatible; BoboMovieNight/1.0; static asset build)",
        "Accept":"image/gif,image/*;q=0.8",
        "Referer":"https://www.flaticon.com/",
    })
    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            if int(response.headers.get("Content-Length") or 0)>MAX:
                raise ValueError("GIF too large")
            content=response.read(MAX+1)
        if not (content[:6] in (b"GIF87a",b"GIF89a") and 100<len(content)<=MAX):
            raise ValueError("Not a public animated GIF response")
        target.write_bytes(content)
        print(f"Downloaded Flaticon free GIF {id}: {len(content)} bytes")
        return True
    except (urllib.error.URLError,ValueError,TimeoutError) as e:
        print(f"Could not retrieve free GIF {id}: {type(e).__name__}: {str(e)[:160]}")
        return False

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    icons=[]
    for name,category,id,page in ITEMS:
        target=ROOT/f"{name}.gif"
        if download(id,target):
            icons.append({"name":name,"category":category,"file":f"assets/flaticon/{name}.gif",
                          "author":AUTHOR,"source":page})
    data={"schema":1,"license":"Flaticon free license: attribution required","icons":icons}
    text=json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+"\n"
    manifest=ROOT/"manifest.json"
    if not manifest.exists() or manifest.read_text(encoding="utf-8")!=text:
        manifest.write_text(text,encoding="utf-8")
    print(f"Flaticon animated preview assets available: {len(icons)}/{len(ITEMS)}")

if __name__=="__main__":
    main()
