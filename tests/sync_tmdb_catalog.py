#!/usr/bin/env python3
import importlib.util, json, tempfile
from pathlib import Path
source=Path(__file__).parent/'scripts/sync_tmdb_catalog.py'
spec=importlib.util.spec_from_file_location('bobo_tmdb_sync',source)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.candidate('movie',{'id':5,'title':'','release_date':'2026-11-20'}, {}, None) is None
assert m.candidate('movie',{'id':5,'title':'Cinéma','poster_path':'/abcde.jpg','release_date':'2026-11-20'}, {}, None)['year']==2026
with tempfile.TemporaryDirectory() as t:
    root=Path(t);(root/'data').mkdir()
    baseline={kind: {'schema':1,'items':[{'tmdb_id':i,'title':kind+str(i),'poster':'https://image.tmdb.org/t/p/w342/test.jpg','overview':'original'} for i in range(1,102)]} for kind in ('movie','tv')}
    (root/'data/movies.json').write_text(json.dumps(baseline['movie']))
    (root/'data/tv.json').write_text(json.dumps(baseline['tv']))
    responses={'/genre/movie/list':{'genres':[{'id':10,'name':'Avventura'}]},'/genre/tv/list':{'genres':[]}}
    calls=[]
    def fetch(path,params=None):
        calls.append(path)
        if path in responses:return responses[path]
        if path=='/trending/movie/week':return {'results':[{'id':102,'title':'New movie','release_date':'2026-11-20','poster_path':'/abcde.jpg','overview':'New','genre_ids':[10]},{'id':2,'title':'New description','poster_path':'/abcde.jpg'}]}
        if path=='/trending/tv/week':return {'results':[{'id':103,'name':'New series','first_air_date':'2026-01-01','poster_path':'/abcde.jpg'}]}
        if path.startswith('/tv/103/season/'):return {'episodes':[{'episode_number':1,'still_path':'/abcde.jpg','name':'Pilot'}]}
        if path=='/tv/103':return {'seasons':[{'season_number':1,'episode_count':2}]}
        if path.endswith('/watch/providers'):return {'results':{'IT':{'flatrate':[{'provider_id':8}]}}}
        return {'results':[]}
    status=m.update(root,fetch)
    assert status['catalog']['movie']['added']==1,status
    assert status['catalog']['tv']['added']==1,status
    assert status['catalog']['movie']['total']==102,status
    movies=json.loads((root/'data/movies.json').read_text())['items']
    assert movies[0]['tmdb_id']==102 and movies[0]['genres']==['Avventura']
    assert next(x for x in movies if x['tmdb_id']==2)['overview']=='original'
    enriched=json.loads((root/'data/enrichment.json').read_text())['items']
    assert enriched['movie:102']['providers_it']['flatrate']==['netflix']
    assert enriched['tv:103']['episode_images']['seasons']['1']['1']['name']=='Pilot'
    status2=m.update(root,fetch)
    assert status2['catalog']['movie']['added']==0,status2
    assert status2['catalog']['tv']['added']==0,status2
    # Total source outage must not replace the retained catalog.
    snapshot=(root/'data/movies.json').read_bytes()
    def bad(path,params=None):
        if path.startswith('/genre/'):return {'genres':[]}
        raise ValueError('outage')
    try:m.update(root,bad)
    except RuntimeError:pass
    else:raise AssertionError('Outage must fail loudly')
    assert (root/'data/movies.json').read_bytes()==snapshot
print('TMDB incremental catalog: upsert, enrichment, idempotence and outage tests passed')