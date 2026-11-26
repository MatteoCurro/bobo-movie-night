(()=>{
'use strict';
const $=id=>document.getElementById(id);
const SITE='https://movie.curromatteo.it/';
const nf=new Intl.NumberFormat('it-IT');
const money=n=>new Intl.NumberFormat('it-IT',{notation:'compact',maximumFractionDigits:1,style:'currency',currency:'USD'}).format(Number(n)||0);
const number=n=>nf.format(Number(n)||0);
const pct=(a,b)=>b?Math.round((Number(a)||0)/b*100):0;
const humanDate=s=>{try{return new Date(s).toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'});}catch(_){return s||'';}};
const el=(tag,cls,text)=>{
 const x=document.createElement(tag);if(cls)x.className=cls;
 if(text!==undefined)x.textContent=String(text);
 return x;
};
const status=text=>$('status').textContent=text;
const empty=(target,message='Dati non ancora disponibili.')=>{
 if(typeof target==='string')target=$(target);
 if(!target)return;target.replaceChildren();
 target.append(el('p','empty',message));
};
async function api(route,body){
 const response=await fetch('api.php?route='+encodeURIComponent(route),{
  method:body?'POST':'GET',credentials:'include',cache:'no-store',
  headers:body?{'Content-Type':'application/json'}:{},
  body:body?JSON.stringify(body):undefined
 });
 let data={};try{data=await response.json();}catch(_){}
 if(!response.ok)throw Error(data.error||'Errore HTTP '+response.status);
 return data;
}
function tiles(id,values){
 const node=$(id);if(!node)return;node.replaceChildren();
 for(const [label,value,note] of values){
  const tile=el('div',id==='kpis'?'kpi':'mini');
  if(id==='kpis'){
   tile.append(el('div','k-label',label),el('div','k-number',value),
               el('div','k-note',note||''));
  }else tile.append(el('strong','',value),el('span','',label));
  node.append(tile);
 }
}
function bars(id,rows,limit=12){
 const target=$(id);if(!target)return;
 if(!rows||!rows.length){empty(target);return;}
 target.replaceChildren();
 const filtered=rows.slice(0,limit);
 const max=Math.max(1,...filtered.map(r=>Number(r.count)||0));
 for(const row of filtered){
  const item=el('div','barrow');
  const name=el('div','barname',row.name||'—');name.title=row.name||'';
  const track=el('div','bartrack'),fill=el('div','barfill');
  fill.style.width=Math.max(1,(Number(row.count)||0)/max*100)+'%';
  track.append(fill);
  item.append(name,track,el('div','barvalue',number(row.count)));
  target.append(item);
 }
}
function linkTo(kind,id){
 if((kind!=='movie'&&kind!=='tv')||!Number.isSafeInteger(Number(id))||Number(id)<=0)return '';
 return SITE+'watch.html?type='+kind+'&id='+encodeURIComponent(id);
}
function ranking(id,rows,format,emptyText='Dati non ancora disponibili.'){
 const node=$(id);if(!node)return;
 if(!rows||!rows.length){empty(node,emptyText);return;}
 const list=el('ol','ranking');
 rows.slice(0,15).forEach((row,i)=>{
  const item=el('li');
  item.append(el('span','rank-num',String(i+1).padStart(2,'0')));
  const box=el('div');
  const href=format.href?format.href(row):'';
  const name=el(href?'a':'span','rank-name',format.name(row));
  if(href)name.href=href;
  box.append(name);
  const small=format.subtitle?format.subtitle(row):'';
  if(small)box.append(el('small','',small));
  item.append(box,el('strong','rank-value',format.value(row)));
  list.append(item);
 });
 node.replaceChildren(list);
}
function percentageList(id,rows,base,limit=20){
 const node=$(id);if(!node)return;
 if(!rows.length){empty(node);return;}
 node.replaceChildren();
 for(const [name,count,denominator,note] of rows.slice(0,limit)){
  const outer=el('div','coverage-row'),head=el('div','coverage-top');
  head.append(el('span','',name),el('span','',number(count)+' / '+number(denominator||base)+' · '+pct(count,denominator||base)+'%'));
  const track=el('div','bartrack'),fill=el('div','barfill');
  fill.style.width=Math.min(100,pct(count,denominator||base))+'%';
  track.append(fill);outer.append(head,track);
  if(note)outer.append(el('small','hint',note));
  node.append(outer);
 }
}
function miniChart(id,rows,series,dateKey='date'){
 const target=$(id);if(!target)return;
 if(!rows||rows.length===0){empty(target,'Lo storico parte dall’attivazione del monitoraggio: non sono presenti rilevazioni precedenti.');return;}
 target.replaceChildren();
 const values=rows.slice(-70),wid=640,ht=192,left=33,right=12,top=16,bottom=24,plotWidth=wid-left-right,plotHeight=ht-top-bottom;
 const max=Math.max(1,...values.flatMap(row=>series.map(s=>Math.max(0,Number(row[s.key])||0))));
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 '+wid+' '+ht);
 svg.setAttribute('role','img');svg.setAttribute('aria-label',series.map(s=>s.label).join(' e '));
 function nsvg(tag,attrs){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));return node;}
 for(let i=0;i<5;i++){
  const y=top+(plotHeight/4)*i;
  svg.append(nsvg('line',{x1:left,x2:wid-right,y1:y,y2:y,stroke:'#2b434e','stroke-width':1}));
  const t=nsvg('text',{x:0,y:y+4,fill:'#91acb3','font-size':10});t.textContent=String(Math.round(max*(1-i/4)));svg.append(t);
 }
 for(let idx=0;idx<series.length;idx++){
  const def=series[idx],points=values.map((row,i)=>{
   const x=left+(values.length===1?plotWidth/2:(plotWidth*i/(values.length-1)));
   const y=top+plotHeight*(1-Math.max(0,Number(row[def.key])||0)/max);
   return [x,y];
  });
  if(points.length===1)svg.append(nsvg('circle',{cx:points[0][0],cy:points[0][1],r:5,fill:def.color}));
  else svg.append(nsvg('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:def.color,'stroke-width':2.6,'stroke-linejoin':'round','stroke-linecap':'round'}));
 }
 const labelStart=String(values[0][dateKey]||''),labelEnd=String(values.at(-1)[dateKey]||'');
 const labels=el('div','spark-labels');
 labels.append(el('span','',labelStart.slice(0,10)),el('span','',labelEnd.slice(0,10)));
 target.append(svg,labels);
 const legend=el('div','graph-legend');
 for(const def of series){
  const item=el('span','',def.label);
  item.style.setProperty('--series-color',def.color);
  legend.append(item);
 }
 target.append(legend);
}
function aggregatesToRows(obj){return Object.entries(obj||{}).map(([name,count])=>({name,count:Number(count)||0})).sort((a,b)=>b.count-a.count);}
function dailyToRows(obj,key='count'){return Object.entries(obj||{}).map(([date,value])=>({date,[key]:Number(value)||0})).sort((a,b)=>a.date.localeCompare(b.date));}
function renderCatalog(report){
 const cat=report.catalog||{},growth=report.growth||{},cov=report.coverage||{},fin=report.finances||{},people=report.people||{},awards=report.awards||{};
 $('updated-at').textContent='Dati aggiornati: '+humanDate(report.updated_at);
 bars('genres',cat.genres);
 bars('decades',(cat.decades||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))),30);
 bars('ratings',(cat.ratings||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))),15);
 bars('languages',cat.languages,14);
 bars('runtime',cat.runtime,8);
 const base=cat.total||1;
 percentageList('coverage',[
  ['Locandine',cov.poster,base],['Sfondo cinematografico',cov.backdrop,base],
  ['Sinossi',cov.overview,base],['Generi',cov.genres,base],
  ['Cast / troupe',cov.credits,base],['Film con durata',cov.runtime_movies,cat.movies||1],
  ['Serie con episodi dettagliati',cov.episode_series,cat.series||1],
  ['Titoli con correlati',cov.related_titles,base],
  ['Titoli con recensioni',cov.reviewed_titles,base],
  ['Titoli verificati per streaming',cov.platform_checked,base]
 ],base);
 const daily=(growth.daily||[]).map(r=>({date:String(r.updated_at||'').slice(0,10),movies:r.movies,series:r.series,total:r.total_titles||((r.movies||0)+(r.series||0))}));
 miniChart('chart-growth',daily,[{key:'movies',label:'Film',color:'#b8e6dc'},{key:'series',label:'Serie',color:'#e6bd80'}]);
 const run=(growth.runs||[]).map(r=>({date:String(r.updated_at||'').slice(0,16).replace('T',' '),new_movies:r.new_movies_last_run,new_series:r.new_series_last_run}));
 miniChart('chart-imports',run,[{key:'new_movies',label:'Film aggiunti',color:'#b8e6dc'},{key:'new_series',label:'Serie aggiunte',color:'#e6bd80'}]);
 const syncBody=$('sync-runs');
 if(syncBody){
  syncBody.replaceChildren();
  for(const r of (growth.runs||[]).slice(-24).reverse()){
   const row=el('tr');
   for(const value of [humanDate(r.updated_at),number(r.new_movies_last_run),number(r.new_series_last_run),
    number(r.updated_movies_last_run),number(r.updated_series_last_run),number(r.total_titles)]){
    row.append(el('td','',value));
   }
   syncBody.append(row);
  }
  if(!syncBody.children.length){
   const cell=el('td','', 'Lo storico delle esecuzioni inizierà con il prossimo aggiornamento.');
   cell.colSpan=6;const row=el('tr');row.append(cell);syncBody.append(row);
  }
 }
 const known=fin.with_revenue||0;
 tiles('movie-stats',[
  ['Film con ricavi noti',number(known)],
  ['Film con budget',number(fin.with_budget)],
  ['Budget e ricavi completi',number(fin.with_both)],
  ['Somma ricavi noti',money(fin.total_known_revenue_usd)],
  ['Attori indicizzati',number(people.actors_indexed)],
  ['Registi indicizzati',number(people.directors_indexed)],
  ['Premi registrati',number(awards.won)],
  ['Nomination registrate',number(awards.nominated)]
 ]);
 ranking('revenue-ranking',fin.top_revenue,{name:r=>r.title,subtitle:r=>r.year||'',value:r=>money(r.revenue_usd),href:r=>linkTo('movie',r.tmdb_id)});
 ranking('roi-ranking',fin.top_ratio,{name:r=>r.title,subtitle:r=>'Budget: '+money(r.budget_usd),value:r=>(r.ratio||0).toLocaleString('it-IT')+'×',href:r=>linkTo('movie',r.tmdb_id)});
 ranking('actors-ranking',people.actors,{name:r=>r.name,subtitle:r=>r.examples?.map(x=>x.title).slice(0,2).join(' · '),value:r=>number(r.works),href:r=>Number.isSafeInteger(Number(r.id))?SITE+'person.html?id='+r.id:''});
 ranking('directors-ranking',people.directors,{name:r=>r.name,subtitle:r=>r.examples?.map(x=>x.title).slice(0,2).join(' · '),value:r=>number(r.works),href:r=>Number.isSafeInteger(Number(r.id))?SITE+'person.html?id='+r.id:''});
 ranking('rated-ranking',cat.top_rated,{name:r=>r.title,subtitle:r=>(r.type==='tv'?'Serie · ':'Film · ')+(r.year||''),value:r=>(Number(r.vote)||0).toLocaleString('it-IT',{maximumFractionDigits:1})+'/10',href:r=>linkTo(r.type,r.tmdb_id)});
 bars('award-ranking',awards.events,14);
 renderEnrichment(report);
}
function renderEnrichment(report){
 const e=report.enrichment||{},d=report.enrichment_delta_last_run||{},total=report.catalog?.total||1,people=e.people_indexed||1;
 const metrics=[
  ['Crediti verificati','credits_checked',total],
  ['Cast e troupe disponibili','credits_with_cast_crew',total],
  ['Identificativi IMDb','imdb_identified',total],
  ['Metadati aggiuntivi IMDb','imdb_metadata',total],
  ['Parole chiave TMDB','tmdb_keywords',total],
  ['Parole chiave tematiche','keyword_titles',total],
  ['Tematiche e interessi','topic_titles',total],
  ['Titoli con dati stagionali','seasonal_titles',total],
  ['Collegamenti tra opere','connections_titles',total],
  ['Correlati indicizzati','related_titles',total],
  ['Recensioni verificate','reviews_checked',total],
  ['Titoli con recensioni','reviewed_titles',total],
  ['Citazioni verificate','quote_checked',total],
  ['Citazioni disponibili','quote_titles',total],
  ['Titoli con premi','award_titles',total]
 ];
 $('enrichment-updated').textContent=humanDate(report.updated_at);
 tiles('enrichment-kpis',[
  ['Correlati disponibili',number(e.related_titles)],
  ['Correlati da completare',number(e.related_remaining)],
  ['Metadati IMDb',number(e.imdb_metadata)],
  ['Persone indicizzate',number(e.people_indexed)],
  ['Recensioni trovate',number(e.reviewed_titles)],
  ['Variazione correlati nell’ultimo run','+'+number(e.related_added_last_run)]
 ]);
 const grid=$('enrichment-progress');grid.replaceChildren();
 for(const [label,key,denominator] of metrics){
  const count=Number(e[key])||0,base=denominator||1;
  const item=el('div','enrich-item');
  const header=el('div','enrich-head');
  header.append(el('strong','',label),el('span','',number(count)+' / '+number(base)));
  const track=el('div','bartrack'),fill=el('div','barfill');
  fill.style.width=Math.min(100,pct(count,base))+'%';track.append(fill);
  const foot=el('div','enrich-foot');
  const delta=Object.prototype.hasOwnProperty.call(d,key)?Number(d[key]):null;
  foot.append(el('span','',pct(count,base)+'% copertura · '+number(Math.max(0,base-count))+' mancanti'),
              el('span',delta===null?'neutral':delta>0?'positive':delta<0?'negative':'neutral',
                delta===null?'Storico in avvio':delta>0?'+'+number(delta)+' nell’ultimo run':delta<0?number(delta)+' nell’ultimo run':'Nessuna variazione'));
  item.append(header,track,foot);grid.append(item);
 }
 const history=(report.enrichment_history||[]).map(r=>({
  date:String(r.at||'').slice(0,10),credits:r.credits_checked,
  imdb:r.imdb_metadata,related:r.related_titles
 }));
 miniChart('enrichment-chart',history,[
  {key:'credits',label:'Crediti',color:'#b8e6dc'},
  {key:'imdb',label:'IMDb',color:'#e6bd80'},
  {key:'related',label:'Correlati',color:'#a592e5'}
 ]);
 const deltaRows=Object.entries(d).filter(([key])=>metrics.some(m=>m[1]===key))
   .map(([key,value])=>({name:metrics.find(m=>m[1]===key)?.[0]||key,count:Number(value)||0}))
   .sort((a,b)=>b.count-a.count);
 if(deltaRows.length){
  ranking('enrichment-deltas',deltaRows.slice(0,12),{name:r=>r.name,value:r=>(r.count>0?'+':'')+number(r.count)});
 }else empty('enrichment-deltas','Non è ancora disponibile un secondo rilevamento da confrontare.');
 percentageList('enrichment-people',[
  ['Ritratti',e.people_portraits,people],['Biografie',e.people_biographies,people],
  ['Biografie in italiano',e.people_biographies_it,people],['Filmografie',e.people_filmographies,people],
  ['Date di nascita',e.people_birthdates,people]
 ],people);
 const source=$('enrichment-sources');source.replaceChildren();
 const checks=report.source_status||{};
 if(checks.last_imdb_check){
  const item=el('div','source-line');
  item.append(el('strong','','Ultimo controllo dataset IMDb'),el('span','',checks.last_imdb_check));
  const years=(checks.imdb_years||[]).slice(0,8);
  item.append(el('small','',years.map(y=>y.year+': '+number(y.updated)+' arricchiti / '+number(y.known_titles)+' noti').join(' · ')));
  source.append(item);
 }
 for(const [label,value] of [
  ['Ultimo errore Wikidata',checks.wikidata_last_failure],
  ['Ultimo errore traduzioni',checks.translation_last_failure]
 ]){
  if(!value)continue;
  const item=el('div','source-line');
  item.append(el('strong','',label),el('span','',value));
  item.append(el('small','', 'Segnalazione presente nello stato di sincronizzazione: non indica un blocco dell’intero archivio.'));
  source.append(item);
 }
 for(const [label,current,base,description] of [
  ['IMDb · schede arricchite',e.imdb_metadata,total,'Dati importati da archivio aggiuntivo'],
  ['TMDB · cast / troupe',e.credits_with_cast_crew,total,'Crediti verificati nel nostro catalogo'],
  ['Temi e parole chiave',e.keyword_titles,total,'Dati utilizzabili per Discover e correlati'],
  ['Correlati',e.related_titles,total,'Indicizzazione persistente e incrementale'],
  ['Citazioni · titoli controllati',e.quote_checked,total,'La verifica non implica che ci sia una citazione'],
  ['Recensioni · titoli controllati',e.reviews_checked,total,'Il controllo non garantisce la disponibilità di recensioni']
 ]){
  const line=el('div','source-line');
  line.append(el('strong','',label),el('span','',number(current||0)+' / '+number(base||0)),el('small','',description));
  source.append(line);
 }
}
function renderCommunity(community){
 const c=community||{};
 tiles('community-kpis',[
  ['Utenti',number(c.users)],['Verificati',number(c.verified)],
  ['Newsletter',number(c.newsletter)],['Preferiti salvati',number(c.favorites_total)],
  ['Film preferiti',number(c.favorites_movies)],['Serie preferite',number(c.favorites_tv)],
  ['Titoli distinti salvati',number(c.unique_favorites)]
 ]);
 ranking('favorite-ranking',c.top_favorites,{
  name:r=>r.title||('Titolo '+r.tmdb_id),subtitle:r=>r.type==='tv'?'Serie TV':'Film',
  value:r=>number(r.count),href:r=>linkTo(r.type,r.tmdb_id)
 },'Non sono ancora presenti preferiti salvati.');
 bars('favorite-genres',aggregatesToRows(c.favorite_genres));
 miniChart('registrations-chart',dailyToRows(c.registrations_daily,'registrations'),
  [{key:'registrations',label:'Registrazioni',color:'#b8e6dc'}]);
 miniChart('favorites-chart',dailyToRows(c.favorites_added_daily,'added'),
  [{key:'added',label:'Preferiti attualmente salvati',color:'#e6bd80'}]);
}
function renderTraffic(t){
 const ev=t?.events||{},days=t?.daily||[];
 $('tracking-start').textContent=t?.tracking_since?'Rilevazioni dal '+t.tracking_since:'Le rilevazioni inizieranno con il primo evento registrato.';
 tiles('traffic-kpis',[
  ['Pagine aperte',number(ev.page_view)],
  ['Schede consultate',number(ev.title_view)],
  ['Player avviati',number(ev.play_start)],
  ['Ricerche',number(ev.search_used)]
 ]);
 miniChart('traffic-chart',days,[{key:'page_views',label:'Aperture di pagina',color:'#b8e6dc'},
    {key:'plays',label:'Avvii player',color:'#e6bd80'}]);
 bars('pages-ranking',aggregatesToRows(t?.pages),12);
 ranking('views-ranking',t?.top_views,{name:r=>r.key,value:r=>number(r.views),
  href:r=>{const [kind,id]=String(r.key||'').split(':');return linkTo(kind,id);}});
 ranking('plays-ranking',t?.top_plays?.filter(r=>r.plays>0),{name:r=>r.key,value:r=>number(r.plays),
  href:r=>{const [kind,id]=String(r.key||'').split(':');return linkTo(kind,id);}});
 bars('actions-ranking',aggregatesToRows({
  'Ricerche effettuate':ev.search_used||0,
  'Interazioni con preferiti':ev.favorites_action||0,
  'Schede aperte':ev.title_view||0,
  'Player avviati':ev.play_start||0
 }),8);
}
function usersTable(result){
 $('count').textContent='('+result.count+')';
 $('rows').replaceChildren();
 for(const user of result.users||[]){
  const row=document.createElement('tr');
  for(const value of [user.username,user.email||'—',user.email_verified?'Sì':'No',
     user.role,user.created_at,String(user.favorites_count),user.newsletter_subscribed?'Iscritto':'No']){
   row.append(el('td','',value));
  }
  const detail=el('td'),link=el('a','', 'Vedi titoli ↗');
  link.href='admin-favorites.html?username='+encodeURIComponent(user.username);
  detail.append(link);row.append(detail);$('rows').append(row);
 }
}
async function load(){
 try{
  const info=await api('me');
  if(info.role!=='admin')throw Error('Profilo non autorizzato');
  $('login').hidden=true;$('dashboard').hidden=false;
  $('refresh').hidden=false;$('logout').hidden=false;
  const results=await Promise.allSettled([api('admin/users'),api('admin/overview')]);
  if(results[0].status==='fulfilled')usersTable(results[0].value);
  if(results[1].status==='fulfilled'){
   const d=results[1].value;
   if(d.catalog_available&&d.catalog)renderCatalog(d.catalog);
   else {
    for(const id of ['chart-growth','chart-imports','genres','decades','ratings','languages','runtime','coverage',
      'revenue-ranking','roi-ranking','actors-ranking','directors-ranking','rated-ranking','award-ranking',
      'enrichment-chart','enrichment-progress','enrichment-deltas','enrichment-people','enrichment-sources'])
     empty(id,'Report catalogo in attesa di generazione o di distribuzione.');
   }
   renderCommunity(d.community);
   renderTraffic(d.traffic);
   const catalog=d.catalog_available?'Catalogo aggiornato.':'Il report catalogo non è ancora accessibile dal servizio account.';
   status(catalog);
  }else{
   status('Panoramica non disponibile: '+results[1].reason.message+' — aggiorna prima il servizio PHP.');
  }
  if(results[0].status==='rejected')status('Utenti non disponibili: '+results[0].reason.message);
 }catch(error){
  $('login').hidden=false;$('dashboard').hidden=true;
  $('refresh').hidden=true;$('logout').hidden=true;
  status(error.message);
 }
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();
 try{
  await api('login',{username:$('username').value,password:$('password').value});
  $('password').value='';await load();
 }catch(error){status(error.message);}
});
$('refresh').addEventListener('click',load);
$('newsletter-test').addEventListener('click',async()=>{
 const button=$('newsletter-test');button.disabled=true;
 status('Invio prova newsletter all’email amministratore verificata…');
 try{
  const result=await api('admin/newsletter/test',{});
  status(result.message||'Newsletter inviata all’indirizzo amministratore.');
 }catch(error){status('Prova non riuscita: '+error.message);}
 finally{button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
 try{await api('logout',{});}catch(_){}
 location.reload();
});
load();
})();
