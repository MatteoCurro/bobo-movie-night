(function(){
'use strict';
const BASE='https://movie.curromatteo.it/';
const app=document.getElementById('main');
const frame=document.getElementById('vixframe');
const player=document.getElementById('player');
const hud=document.getElementById('player-hud');
const guide=document.getElementById('player-start-guide');
const toastNode=document.getElementById('toast');
const status={view:'home',items:[],movies:[],series:[],index:new Map(),chosen:null,season:1,episode:1,
  focus:null,player:false,started:false,paused:false,bridge:false,time:0,duration:0,playerUrl:'',
  seasons:[],episodeNames:{},search:'',recent:[],autoNext:true,mediaSeen:false,indexReady:false,browseLimit:{movie:48,tv:48},returnTo:null};
let hudTimer=0,toastTimer=0,topTimer=0,loadCount=0,requestVersion=0,commandSerial=0,pendingCommand=null,mediaWall=0,playerLoadedAt=0;
let homeFeed=null,searchTimer=0,detailSerial=0;
const detailPromises=new Map(),relatedPromises=new Map();
const $=s=>document.querySelector(s);
const els=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function image(src,size){
 if(typeof src!=='string')return '';
 if(/^\/[A-Za-z0-9_-]{5,200}\.(?:jpg|jpeg|png|webp)$/i.test(src))
  return 'https://image.tmdb.org/t/p/'+size+src;
 if(!/^https:\/\/image\.tmdb\.org\/t\/p\//.test(src))return '';
 return src.replace(/\/t\/p\/(?:w\d+|original)\//,'/t/p/'+size+'/');
}
function label(item){return item.type==='tv'?'Serie TV':'Film';}
function meta(item){
 const parts=[label(item),item.year||'',item.vote?'★ '+Number(item.vote).toFixed(1):''];
 return parts.filter(Boolean).join(' · ');
}
function notify(message,ms=2200){
 toastNode.textContent=message;toastNode.classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastNode.classList.remove('show'),ms);
}
function tellNative(obj){
 if(window.BoboNative&&typeof window.BoboNative.postMessage==='function'){
  try{window.BoboNative.postMessage(JSON.stringify(obj));}catch(e){}
 }
}
function nativeState(){tellNative({event:'state',player:status.player,started:status.started||status.paused});}
function loading(){app.innerHTML='<div class="loading"><span class="spinner"></span><p>Caricamento catalogo Bobo…</p></div>';}
function valid(item){return item&&item.tmdb_id&&item.title;}
function mapItems(collection,type){
 return (collection.items||[]).filter(valid).map(x=>Object.assign({type},x));
}
function unpack(row){
 return Array.isArray(row)?{type:row[0],tmdb_id:row[1],title:row[2],year:row[3],vote:row[4],poster:row[5]}:row;
}
function seedHome(home){
 for(const group of home.sections||[]){
  for(const item of group.items||[]){
   if(valid(item))status.index.set(item.type+':'+item.tmdb_id,item);
  }
 }
 if(valid(home.featured))status.index.set(home.featured.type+':'+home.featured.tmdb_id,home.featured);
}
async function legacyCatalog(){
 const [movies,series]=await Promise.all([
  fetch(BASE+'data/movies.json').then(r=>{if(!r.ok)throw Error('Film offline');return r.json();}),
  fetch(BASE+'data/tv.json').then(r=>{if(!r.ok)throw Error('Serie offline');return r.json();})
 ]);
 status.movies=mapItems(movies,'movie');status.series=mapItems(series,'tv');
 status.items=status.movies.concat(status.series);
 status.items.forEach(i=>status.index.set(i.type+':'+i.tmdb_id,Object.assign(i,status.index.get(i.type+':'+i.tmdb_id)||{})));
 status.indexReady=true;
}
function networkFailure(){
 if(status.view==='home'&&!homeFeed&&!status.items.length){
  app.innerHTML='<div class="message"><h1>Impossibile caricare il catalogo</h1><p>Controlla la connessione della TV.</p><button class="action tv-focus" id="retry">Riprova</button></div>';
  $('#retry').addEventListener('click',boot);$('#retry').focus();
 }
}
async function boot(){
 if(!homeFeed)loading();
 try{
  const cached=localStorage.getItem('bobo-tv-home-v1');
  if(cached){const value=JSON.parse(cached);if(value?.schema===1&&value?.featured&&Array.isArray(value.sections)){
   homeFeed=value;seedHome(value);render('home');
  }}
 }catch(e){}
 const homepage=fetch(BASE+'data/tv-home.json')
  .then(async r=>{if(!r.ok)throw Error('Home non disponibile');return r.json();})
  .then(home=>{
   if(home?.schema!==1||!Array.isArray(home.sections)||!home.featured)throw Error('Home non valida');
   const fresh=!homeFeed;homeFeed=home;seedHome(home);
   try{localStorage.setItem('bobo-tv-home-v1',JSON.stringify(home));}catch(e){}
   if(fresh&&status.view==='home')render('home');
  });
 const index=fetch(BASE+'data/tv-lite.json')
  .then(async r=>{if(!r.ok)throw Error('Indice non disponibile');return r.json();})
  .then(data=>{
   if(data?.schema!==1||!Array.isArray(data.items)||!data.items.length)throw Error('Indice vuoto');
   status.items=data.items.map(unpack).filter(valid);
   status.movies=status.items.filter(i=>i.type==='movie');
   status.series=status.items.filter(i=>i.type==='tv');
   status.items.forEach(item=>{
    const key=item.type+':'+item.tmdb_id;
    status.index.set(key,Object.assign(item,status.index.get(key)||{}));
   });
   status.indexReady=true;
   if(status.view==='movie'||status.view==='tv')render(status.view);
   if(status.view==='search')searchNow();
   window.BoboTVExtras?.catalogReady();
  });
 const results=await Promise.allSettled([homepage,index]);
 if(results[1].status==='rejected'){
  try{await legacyCatalog();if(status.view==='movie'||status.view==='tv'||status.view==='search')render(status.view);}
  catch(e){networkFailure();}
  window.BoboTVExtras?.catalogReady();
 }
 if(results[0].status==='rejected'&&!homeFeed){
  if(status.indexReady&&status.view==='home')render('home');
  else networkFailure();
 }
}
function poster(item){
 const url=image(item.poster,'w342');
 return '<button type="button" class="poster tv-focus" data-title="'+esc(item.type+':'+item.tmdb_id)+'" aria-label="'+esc(item.title)+'">'+
  '<span class="poster-art" data-focus-title="'+esc(item.title)+'" data-focus-meta="'+esc(meta(item))+'"><span class="poster-type">'+(item.provider?esc(item.provider):(item.type==='tv'?'SERIE TV':'FILM'))+'</span>'+(url?'<img loading="lazy" decoding="async" src="'+esc(url)+'" alt="">':
   '<span class="poster-placeholder">'+esc(item.title)+'</span>')+'</span>'+
  '<span class="poster-title">'+esc(item.title)+'</span>'+
  '<span class="poster-sub">'+esc([item.year||'',item.vote?'★ '+Number(item.vote).toFixed(1):''].filter(Boolean).join(' · '))+'</span></button>';
}
function rail(name,items,desc){
 const list=items.filter(x=>x&&x.poster).slice(0,24);
 if(!list.length)return '';
 return '<section class="shelf"><div class="shelf-head"><h2>'+esc(name)+'</h2>'+
   (desc?'<span class="shelf-note">'+esc(desc)+'</span>':'')+'</div>'+
   '<div class="rail" aria-label="'+esc(name)+'">'+list.map(poster).join('')+'</div></section>';
}
function rated(list){return list.filter(i=>i.poster&&Number(i.vote)>=6.5).sort((a,b)=>Number(b.vote)-Number(a.vote)||Number(b.year)-Number(a.year));}
function recent(list){return list.filter(i=>i.poster&&i.year>=2023&&i.year<=2027).sort((a,b)=>Number(b.year)-Number(a.year)||Number(b.vote)-Number(a.vote));}
function feature(){
 return status.items.filter(i=>i.backdrop&&i.overview&&Number(i.vote)>=7&&i.year>=2023&&i.year<=2026)
  .sort((a,b)=>Number(b.vote)-Number(a.vote)||Number(b.year)-Number(a.year))[0]||
  status.items.find(i=>i.backdrop&&i.overview);
}
function hero(item,detail){
 const art=image(item.backdrop,'w1280')||image(item.poster,'w780');
 const genre=(item.genres||[]).slice(0,3).join(' · ');
 return '<section class="hero'+(detail?' detail-backdrop':'')+'">'+
  '<div class="hero-art" '+(art?'style="background-image:url('+JSON.stringify(art).replace(/"/g,'&quot;')+')"':'')+'></div>'+
  '<div class="hero-content"><p class="eyebrow">'+esc(detail?'NEL CATALOGO BOBO':'IN EVIDENZA')+'</p>'+
  '<h1>'+esc(item.title)+'</h1><div class="meta">'+esc(meta(item))+(genre?' · '+esc(genre):'')+'</div>'+
  '<p class="synopsis">'+esc(item.overview||'Scopri questo titolo nel catalogo Bobo.')+'</p>'+
  '<div class="actions"><button class="action tv-focus" id="hero-play" data-play="'+esc(item.type+':'+item.tmdb_id)+'">▶ Riproduci</button>'+
  (!detail?'<button class="action secondary tv-focus" data-title="'+esc(item.type+':'+item.tmdb_id)+'">Dettagli</button>':'')+
  '</div></div></section>';
}
function featuredHome(){
 if(homeFeed){
  return '<div class="home-kicker"><span class="eyebrow">BOBO TV · SELEZIONI</span>'+
   '<span class="home-kicker-count">'+Number(homeFeed.total||status.items.length).toLocaleString('it-IT')+' titoli</span></div>'+
   (homeFeed.featured?hero(homeFeed.featured,false):'')+'<div id="home-favorites"></div>'+
   (homeFeed.sections||[]).map(s=>rail(s.title,s.items||[],s.note)).join('');
 }
 const first=feature(),all=recent(status.items);
 return '<div class="home-kicker"><span class="eyebrow">BOBO TV</span></div>'+
  (first?hero(first,false):'')+'<div id="home-favorites"></div>'+
  rail('Da scoprire',all)+rail('Film recenti',recent(status.movies))+
  rail('Serie TV',recent(status.series));
}
function updateHomeFavorites(){
 const host=$('#home-favorites');if(!host)return;
 const extra=window.BoboTVExtras;
 const items=extra?.isLoggedIn?.()?extra?.getFavorites?.()||[]:[];
 host.innerHTML=items.length?rail('♥ I tuoi preferiti',items.slice(0,14),'La tua raccolta'):'';
}
function browse(type){
 if(!status.indexReady)return '<div class="loading"><span class="spinner"></span><p>Preparazione catalogo…</p></div>';
 const list=(type==='tv'?status.series:status.movies).filter(i=>i.poster);
 const visible=status.browseLimit[type]||48;
 return '<div class="section-header"><h1>'+(type==='tv'?'Serie TV':'Film')+'</h1><span class="section-desc">'+
  list.length.toLocaleString('it-IT')+' titoli</span></div>'+
  '<div class="results">'+list.slice(0,visible).map(poster).join('')+'</div>'+
  (list.length>visible?'<button type="button" class="action secondary tv-focus tv-more" data-more="'+type+'">Mostra altri titoli ↓</button>':'');
}
function moreBrowse(type){
 const list=(type==='tv'?status.series:status.movies).filter(i=>i.poster);
 const start=status.browseLimit[type]||48;
 const end=Math.min(list.length,start+48);
 status.browseLimit[type]=end;
 const grid=$('.results');if(!grid)return;
 grid.insertAdjacentHTML('beforeend',list.slice(start,end).map(poster).join(''));
 const more=$('.tv-more');if(more&&end>=list.length)more.remove();
 const next=grid.querySelectorAll('.poster')[start];
 if(next){next.focus({preventScroll:true});ensure(next,'vertical');}
}
function searchScreen(){
 return '<div class="section-header"><h1>Cerca</h1><span class="section-desc">Film e serie TV</span></div>'+
  '<div class="search-bar"><label class="search-label" for="q">Cerca un titolo</label>'+
  '<input class="search-input tv-focus" id="q" autocomplete="off" enterkeyhint="done" placeholder="Scrivi con il telecomando" value="'+esc(status.search)+'">'+
  '<button type="button" class="action secondary tv-focus search-finish" id="search-done">Mostra risultati ↓</button></div>'+
  '<div class="results" id="search-results"></div><p class="message" id="search-message"></p>';
}
function normalize(s){return String(s||'').toLocaleLowerCase('it').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
function searchNow(){
 const q=normalize(status.search.trim()),results=$('#search-results'),msg=$('#search-message');
 if(!results)return;
 if(q.length<2){results.innerHTML='';msg.textContent='Scrivi almeno due caratteri per cercare un titolo.';return;}
 if(!status.indexReady){msg.textContent='Preparazione ricerca…';return;}
 const starts=[],inside=[];let count=0;
 for(const item of status.items){
  const name=item.searchKey||(item.searchKey=normalize(item.title));
  if(!name.includes(q))continue;
  count++;
  if(starts.length+inside.length>=60)continue;
  if(name.startsWith(q))starts.push(item);else inside.push(item);
 }
 results.innerHTML=starts.concat(inside).slice(0,60).map(poster).join('');
 msg.textContent=count>60?'Mostrati i primi 60 risultati su '+count+'.':'Trovati '+count+' titoli.';
}
function getSeasons(item){
 if(item.type!=='tv')return [];
 const arr=(item.seasons||[]).map(s=>({n:Number(s.n),episodes:Number(s.episodes)}))
  .filter(s=>Number.isInteger(s.n)&&s.n>=0&&Number.isInteger(s.episodes)&&s.episodes>0);
 return arr.length?arr:[{n:1,episodes:1}];
}
async function episodeNames(item){
 const seq=++requestVersion;
 status.episodeNames={};
 if(item.type!=='tv')return;
 try {
  const response=await fetch(BASE+'data/episodes/'+item.tmdb_id+'.json');
  if(!response.ok)return;
  const data=await response.json();
  if(seq!==requestVersion||status.chosen!==item)return;
  status.episodeNames=data.episode_images?.seasons||{};
  drawEpisodes();
 }catch(e){}
}
function seasonControls(){
 if(!status.seasons.length)return '';
 return '<section class="shelf"><div class="shelf-head"><h2>Stagioni</h2></div><div class="season-list">'+
  status.seasons.map(s=>'<button class="season tv-focus'+(s.n===status.season?' active':'')+
  '" data-season="'+s.n+'">'+(s.n===0?'Speciali':'Stagione '+s.n)+'</button>').join('')+
  '</div></section><section class="shelf"><h2>Episodi</h2><div id="episodes" class="episodes"></div></section>';
}
function drawEpisodes(){
 const root=$('#episodes');if(!root||!status.chosen)return;
 const season=status.seasons.find(s=>s.n===status.season);if(!season)return;
 const map=status.episodeNames[String(status.season)]||{};
 root.innerHTML=Array.from({length:Math.min(season.episodes,100)},(_,idx)=>{
  const n=idx+1,name=map[String(n)]&&map[String(n)].name||'';
  return '<button class="episode tv-focus'+(n===status.episode?' active':'')+'" data-episode="'+n+'">'+
    '<strong>Episodio '+n+'</strong><span>'+esc(name||'Premi OK per riprodurre')+'</span></button>';
 }).join('');
}
async function loadDetail(item,serial){
 const key=item.type+':'+item.tmdb_id,bucket=(Number(item.tmdb_id)%64).toString(16).padStart(2,'0');
 if(!detailPromises.has(bucket)){
  detailPromises.set(bucket,fetch(BASE+'data/tv-detail/'+bucket+'.json')
   .then(r=>{if(!r.ok)throw Error('Scheda non disponibile');return r.json();})
   .catch(e=>{detailPromises.delete(bucket);throw e;}));
  if(detailPromises.size>8)detailPromises.delete(detailPromises.keys().next().value);
 }
 try{
  const data=await detailPromises.get(bucket),more=data.items?.[key];
  if(!more||serial!==detailSerial||!status.chosen||status.chosen.type+':'+status.chosen.tmdb_id!==key)return;
  Object.assign(status.chosen,more);status.index.set(key,status.chosen);
  const heroImg=$('.detail-backdrop .hero-art');
  const backdrop=image(more.backdrop,'w780')||image(more.poster,'w500');
  if(heroImg&&backdrop)heroImg.style.backgroundImage='url("'+backdrop+'")';
  const summary=$('.detail-backdrop .synopsis');if(summary)summary.textContent=more.overview||'Descrizione non disponibile.';
  const metadata=$('.detail-backdrop .meta');
  if(metadata)metadata.textContent=meta(more)+(more.genres?.length?' · '+more.genres.slice(0,3).join(' · '):'')+
   (more.runtime?' · '+more.runtime+' min':'');
  status.seasons=getSeasons(more);
  const slot=$('#tv-seasons-slot');if(slot)slot.innerHTML=seasonControls();
  const play=$('#hero-play');if(play&&more.type==='tv')play.textContent='▶ Riproduci S'+status.season+' E'+status.episode;
  drawEpisodes();episodeNames(more);
  window.BoboTVExtras?.updateDetail(more);
 }catch(e){}
}
async function loadRelated(item,serial){
 const key=item.type+':'+item.tmdb_id,bucket=(Number(item.tmdb_id)%64).toString(16).padStart(2,'0');
 if(!relatedPromises.has(bucket)){
  relatedPromises.set(bucket,fetch(BASE+'data/related/'+bucket+'.json')
   .then(r=>{if(!r.ok)throw Error('Correlati non disponibili');return r.json();})
   .catch(e=>{relatedPromises.delete(bucket);throw e;}));
  if(relatedPromises.size>7)relatedPromises.delete(relatedPromises.keys().next().value);
 }
 try{
  const raw=(await relatedPromises.get(bucket)).items?.[key]||[];
  if(serial!==detailSerial||!status.chosen||status.chosen.type+':'+status.chosen.tmdb_id!==key)return;
  const matches=raw.slice(0,8).map(x=>({
   type:x[0],tmdb_id:x[1],title:x[2],year:x[3],vote:0,poster:x[4]?'/'+x[4]:''
  })).filter(valid);
  matches.forEach(x=>{const k=x.type+':'+x.tmdb_id;if(!status.index.has(k))status.index.set(k,x);});
  const host=$('#tv-related-slot');if(host&&matches.length)host.innerHTML=rail('Ti potrebbero piacere',matches,'Dai temi del catalogo');
 }catch(e){}
}
function detail(item){
 const focus=document.activeElement;
 const shelf=focus?.closest?.('.rail,.season-list');
 const shelves=Array.from(document.querySelectorAll('.rail,.season-list'));
 status.returnTo={view:status.view,key:focus?.dataset?.title||null,scroll:window.scrollY,
  shelfIndex:shelf?shelves.indexOf(shelf):-1,shelfLeft:shelf?.scrollLeft||0};
 status.chosen=item;
 status.seasons=getSeasons(item);
 status.season=(status.seasons.find(s=>s.n>0)||status.seasons[0]||{n:1}).n;
 status.episode=1;
 status.view='detail';
 app.innerHTML=hero(item,true)+'<div id="tv-seasons-slot">'+seasonControls()+'</div>'+
  '<div id="tv-related-slot"></div>';
 $('#hero-play').textContent=item.type==='tv'?'▶ Riproduci S'+status.season+' E1':'▶ Riproduci';
 drawEpisodes();if(item.seasons?.length)episodeNames(item);
 window.BoboTVExtras?.updateDetail(item);
 navActive();window.scrollTo(0,0);focusFirst('#hero-play');
 const serial=++detailSerial;
 loadDetail(item,serial);loadRelated(item,serial);
}
function navActive(){
 els('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===status.view));
}
function render(view){
 if(status.player)exitPlayer(false);
 let external=false;
 status.view=view;
 navActive();
 if(view==='home'){app.innerHTML=featuredHome();updateHomeFavorites();}
 else if(view==='movie'||view==='tv')app.innerHTML=browse(view);
 else if(view==='search'){
  app.innerHTML=searchScreen();searchNow();
  const field=$('#q');
  field.addEventListener('input',()=>{status.search=field.value;clearTimeout(searchTimer);searchTimer=setTimeout(searchNow,170);});
  field.addEventListener('focus',()=>document.body.classList.add('tv-search-editing'));
  field.addEventListener('blur',()=>document.body.classList.remove('tv-search-editing'));
  field.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key==='ArrowDown'){
    e.preventDefault();e.stopImmediatePropagation();closeSearchKeyboard();
   }
  });
 }else if(window.BoboTVExtras?.render(view)){external=true;}

 window.scrollTo(0,0);
 if(!external)focusFirst(view==='search'?'#q':view==='home'?'#hero-play':'.results .poster');
}
function closeSearchKeyboard(){
 const field=$('#q');if(!field)return;
 field.blur();document.body.classList.remove('tv-search-editing');
 tellNative({event:'keyboard-hide'});
 const first=$('#search-results .poster')||$('#search-done')||field;
 requestAnimationFrame(()=>{first.focus({preventScroll:true});ensure(first);});
}
function focusFirst(selector){
 requestAnimationFrame(()=>{
  const item=$(selector)||$('.tab.active');
  if(item){item.focus({preventScroll:true});ensure(item);}
 });
}
function ensure(item,axis){
 if(!item||!item.isConnected)return;
 // The sticky header stays visible while the document is far down the catalog.
 // Once focus returns to the menu, put the page genuinely back at the top.
 if(item.closest('#topbar')){
  window.scrollTo({top:0,behavior:'auto'});
  return;
 }
 const rail=item.closest('.rail,.season-list');
 if(axis==='horizontal'){
  // Horizontal navigation may scroll ONLY the associated carousel.
  // Calling scrollIntoView() here also scrolled the document vertically,
  // making left/right feel like up/down on Android TV.
  if(rail){
   const itemBox=item.getBoundingClientRect(),box=rail.getBoundingClientRect();
   const pad=22;
   let distance=0;
   if(itemBox.left<box.left+pad)distance=itemBox.left-box.left-pad;
   else if(itemBox.right>box.right-pad)distance=itemBox.right-box.right+pad;
   if(Math.abs(distance)>1)rail.scrollBy({left:distance,behavior:'auto'});
  }
  return;
 }
 // Keep the selected target outside the sticky header, with a safe TV margin.
 const bounds=item.getBoundingClientRect();
 const header=document.getElementById('topbar');
 const safeTop=(header&&!header.hidden?header.getBoundingClientRect().height:0)+24;
 const safeBottom=window.innerHeight-42;
 if(bounds.top<safeTop){
  window.scrollBy({top:bounds.top-safeTop,behavior:'auto'});
 }else if(bounds.bottom>safeBottom){
  window.scrollBy({top:bounds.bottom-safeBottom,behavior:'auto'});
 }
}
function focusChoices(){
 return els('.tab,.tv-focus').filter(el=>{
  if(el.disabled||el.closest('[hidden]'))return false;
  const r=el.getBoundingClientRect();
  return r.width>5&&r.height>5&&getComputedStyle(el).visibility!=='hidden';
 });
}
function move(key){
 const active=document.activeElement;
 const rail=active?.closest?.('.rail,.season-list');
 const horizontal=key==='ArrowLeft'||key==='ArrowRight';
 const direction=(key==='ArrowRight'||key==='ArrowDown')?1:-1;
 if(horizontal&&rail?.querySelectorAll){
  const items=Array.from(rail.querySelectorAll('.poster,.season'));
  const target=items[items.indexOf(active)+direction];
  if(target){target.focus({preventScroll:true});ensure(target,'horizontal');}
  return;
 }
 const grid=active?.closest?.('.results');
 if(grid?.querySelectorAll){
  const items=Array.from(grid.querySelectorAll('.poster'));
  const i=items.indexOf(active);
  if(i>=0){
   const cols=Math.max(1,String(getComputedStyle(grid).gridTemplateColumns||'').trim().split(/\s+/).length);
   const next=horizontal?i+direction:i+direction*cols;
   const sameRow=!horizontal||Math.floor(i/cols)===Math.floor(next/cols);
   if(next>=0&&next<items.length&&sameRow){
    items[next].focus({preventScroll:true});ensure(items[next],horizontal?'horizontal':'vertical');
   }
   return;
  }
 }
 const choices=focusChoices();
 if(!choices.length)return;
 let current=document.activeElement;
 if(!choices.includes(current)){
  current=choices[0];current.focus({preventScroll:true});ensure(current,'vertical');return;
 }
 const from=current.getBoundingClientRect();
 const fx=from.left+from.width/2,fy=from.top+from.height/2;
 const forward=key==='ArrowRight'||key==='ArrowDown';
 if(horizontal){
  const rail=current.closest('.rail,.season-list');
  if(rail){
   const row=choices.filter(el=>el.closest('.rail,.season-list')===rail);
   const i=row.indexOf(current);
   const next=row[i+direction];
   // End of carousel = stay here. Never accidentally jump to another row.
   if(next){next.focus({preventScroll:true});ensure(next,'horizontal');}
   return;
  }
  // The catalog grid has multiple rows inside one container. Stay on the
  // SAME visual row; crossing a row boundary belongs to the Up/Down keys.
  const grid=current.closest('.results');
  if(grid){
   const row=choices.filter(el=>{
    if(el.closest('.results')!==grid)return false;
    const r=el.getBoundingClientRect();
    return Math.abs((r.top+r.height/2)-fy)<Math.max(26,Math.min(65,from.height*.22));
   });
   const ordered=row.sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
   const next=ordered[ordered.indexOf(current)+direction];
   if(next){next.focus({preventScroll:true});ensure(next,'horizontal');}
   return;
  }
  const nav=current.closest('#topbar');
  const row=choices.filter(el=>!!el.closest('#topbar')===!!nav);
  const ranked=row.map(el=>{
   if(el===current)return null;
   const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
   const dx=x-fx,dy=Math.abs(y-fy);
   // Sideways input cannot select a different vertical level.
   if(dx*direction<=2||dy>Math.max(28,from.height*.55))return null;
   return {el,score:Math.abs(dx)+dy*2};
  }).filter(Boolean).sort((a,b)=>a.score-b.score);
  if(ranked.length){ranked[0].el.focus({preventScroll:true});ensure(ranked[0].el,'horizontal');}
  return;
 }
 // Vertical remote input finds the nearest title/control in the next visual
 // row and prioritizes the same horizontal column.
 const candidates=choices.map(el=>{
  if(el===current)return null;
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  const dy=y-fy,dx=Math.abs(x-fx);
  const tolerance=Math.min(38,from.height*.18);
  if(dy*direction<=tolerance)return null;
  const horizontalOverlap=Math.max(0,Math.min(from.right,r.right)-Math.max(from.left,r.left));
  const penalty=horizontalOverlap>0?dx*.35:dx*1.8;
  return {el,score:Math.abs(dy)+penalty};
 }).filter(Boolean).sort((a,b)=>a.score-b.score);
 if(candidates.length){
  const next=candidates[0].el;
  next.focus({preventScroll:true});
  ensure(next,'vertical');
 }
}
function onClick(e){
 if(window.BoboTVExtras?.onClick(e))return;
 const more=e.target.closest('[data-more]');if(more){moreBrowse(more.dataset.more);return;}
 if(e.target.closest('#search-done')){closeSearchKeyboard();return;}
 const targetView=e.target.closest('[data-view]');
 if(targetView){render(targetView.dataset.view);return;}
 const tab=e.target.closest('.tab');
 if(tab){render(tab.dataset.view);return;}
 const title=e.target.closest('[data-title]');
 if(title){const i=status.index.get(title.dataset.title);if(i)detail(i);return;}
 const play=e.target.closest('[data-play]');
 if(play){const i=status.index.get(play.dataset.play);if(i){status.chosen=i;status.seasons=getSeasons(i);status.season=(status.seasons.find(s=>s.n>0)||{n:1}).n;status.episode=1;startPlayer();}return;}
 const season=e.target.closest('[data-season]');
 if(season){status.season=Number(season.dataset.season);status.episode=1;
  els('.season').forEach(el=>el.classList.toggle('active',Number(el.dataset.season)===status.season));
  drawEpisodes();return;}
 const episode=e.target.closest('[data-episode]');
 if(episode){status.episode=Number(episode.dataset.episode);startPlayer();}
}
function playerLink(t){
 const item=status.chosen;
 let url='https://vixsrc.to/'+(item.type==='tv'?
  'tv/'+item.tmdb_id+'/'+status.season+'/'+status.episode:
  'movie/'+item.tmdb_id)+'?lang=it&primaryColor=a6dbd2&secondaryColor=162f39';
 if(t>0)url+='&startAt='+Math.floor(t);
 url+='&autoplay=true';
 return url;
}
function currentEpisodeTitle(){
 const i=status.chosen;
 return i.title+(i.type==='tv'?' · S'+status.season+' E'+status.episode:'');
}
function timer(t){
 if(!Number.isFinite(t))return '—:—';
 const s=Math.max(0,Math.floor(t));
 return (s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor((s%3600)/60)).padStart(s>=3600?2:1,'0')+':'+String(s%60).padStart(2,'0');
}
function progress(){
 $('#play-timestamp').textContent=timer(status.time)+' / '+timer(status.duration);
 $('#hud-progress-fill').style.width=status.duration>0?Math.min(100,100*status.time/status.duration)+'%':'0%';
 $('#play-symbol').textContent=status.paused?'▶':'Ⅱ';
 $('#play-hint').textContent=status.paused?'OK · Riprendi':'OK · Pausa / riprendi';
}
function showHud(ms=2800){
 hud.classList.remove('quiet');clearTimeout(hudTimer);
 if(ms)hudTimer=setTimeout(()=>{if(status.player&&!status.paused)hud.classList.add('quiet');},ms);
}
function setPlayerNote(text){const el=$('#player-note');if(el)el.textContent=text;}
function hideTopSoon(){
 const top=$('.player-top');
 if(!top)return;
 top.classList.remove('quiet');clearTimeout(topTimer);
 topTimer=setTimeout(()=>top.classList.add('quiet'),2600);
}
function playFrame(at){
 status.bridge=false;status.paused=false;status.started=false;status.mediaSeen=false;
 mediaWall=0;playerLoadedAt=0;
 status.playerUrl=playerLink(at||0);
 frame.src=status.playerUrl;
 guide.hidden=true;
 setPlayerNote('Avvia il film normalmente; OK per pausa, ◀/▶ per saltare 10 secondi.');
 nativeState();showHud(3500);hideTopSoon();progress();
 const url=status.playerUrl;
 frame.addEventListener('load',function onload(){
  frame.removeEventListener('load',onload);
  if(!status.player||frame.src!==url)return;
  playerLoadedAt=performance.now();
  status.started=true;nativeState();guide.hidden=true;
  // The video is on a different origin. Keep remote controls available even
  // if Vix does not emit PLAYER_EVENT to the parent on this TV.
  setTimeout(()=>{if(status.player&&!status.paused)hud.classList.add('quiet');},3100);
 },{once:true});
}
function startPlayer(){
 if(!status.chosen)return;
 status.player=true;
 status.time=0;status.duration=0;
 player.hidden=false;$('#topbar').hidden=true;app.hidden=true;
 $('#playing-title').textContent=currentEpisodeTitle();
 window.scrollTo(0,0);
 playFrame(0);
}
function exitPlayer(restoreFocus=true){
 status.player=false;status.started=false;status.paused=false;status.bridge=false;
 status.mediaSeen=false;
 if(pendingCommand){clearTimeout(pendingCommand.timer);pendingCommand=null;}
 frame.src='about:blank';player.hidden=true;$('#topbar').hidden=false;app.hidden=false;
 clearTimeout(hudTimer);clearTimeout(topTimer);nativeState();
 if(restoreFocus)focusFirst('#hero-play');
}
function previousPage(){
 if(status.view==='search'&&document.activeElement?.id==='q'){closeSearchKeyboard();return;}
 if(status.player){exitPlayer();return;}
 if(status.view==='detail'){
  ++detailSerial;
  const where=status.returnTo;status.returnTo=null;
  render(where?.view||'home');
  if(where)requestAnimationFrame(()=>{
   const shelves=Array.from(document.querySelectorAll('.rail,.season-list'));
   if(where.shelfIndex>=0&&shelves[where.shelfIndex])shelves[where.shelfIndex].scrollLeft=where.shelfLeft;
   window.scrollTo({top:where.scroll||0,behavior:'auto'});
   const target=where.key?Array.from(document.querySelectorAll('[data-title]')).find(el=>el.dataset.title===where.key):null;
   if(target)target.focus({preventScroll:true});
  });
  return;
 }
 if(status.view!=='home'){render('home');return;}
 tellNative({event:'exit'});
}
function adjacent(){
 const s=status.seasons.findIndex(x=>x.n===status.season);
 if(s<0)return null;
 const season=status.seasons[s];
 if(status.episode<season.episodes)return {s:status.season,e:status.episode+1};
 const next=status.seasons[s+1];return next?{s:next.n,e:1}:null;
}
function handleEnd(){
 if(status.chosen?.type==='tv'&&status.autoNext){
  const next=adjacent();
  if(next){notify('Prossimo episodio…');setTimeout(()=>{
   if(!status.player)return;
   status.season=next.s;status.episode=next.e;$('#playing-title').textContent=currentEpisodeTitle();
   playFrame(0);
  },1800);return;}
 }
 status.paused=true;progress();showHud(0);
}
function estimatedTime(){
 if(status.mediaSeen && mediaWall){
  return Math.max(0,status.time+(status.paused?0:(performance.now()-mediaWall)/1000));
 }
 return Math.max(0,status.time+(status.paused||!playerLoadedAt?0:(performance.now()-playerLoadedAt)/1000));
}
function fallbackPause(){
 if(!status.paused){
  status.time=estimatedTime();
  status.paused=true;status.started=true;mediaWall=performance.now();
  frame.src='about:blank';
  setPlayerNote(status.mediaSeen?'Video fermato. Premi OK per riprendere.':
    'Video fermato, posizione stimata: premi OK per riprendere.');
  notify('Pausa alternativa',2600);
 }else{
  const at=status.time;
  status.paused=false;
  playFrame(at);
  notify('Riprendo da '+timer(at),2600);
 }
 progress();showHud(status.paused?0:3600);nativeState();
}
function fallbackSeek(delta){
 const current=estimatedTime();
 const destination=Math.max(0,Math.min(status.duration||Infinity,current+delta));
 status.time=destination;
 if(status.paused){
  progress();showHud(0);return;
 }
 setPlayerNote(status.mediaSeen?'Spostamento video: caricamento dal punto selezionato…':
   'Posizione stimata: riprendo dal punto selezionato…');
 notify((delta>0?'+':'')+delta+' s · '+timer(destination),3300);
 playFrame(destination);
}
function acceptMedia(data,isAck){
 if(!data||data.supported===false)return;
 status.bridge=true;status.started=true;status.mediaSeen=true;
 const time=Number(data.time);
 const duration=Number(data.duration);
 if(data.time!==null&&Number.isFinite(time)){status.time=Math.max(0,time);mediaWall=performance.now();}
 if(data.duration!==null&&Number.isFinite(duration)&&duration>0)status.duration=duration;
 if(typeof data.paused==='boolean')status.paused=data.paused;
 guide.hidden=true;
 if(isAck)showHud(status.paused?0:2800);
 progress();nativeState();
 setPlayerNote('Controllo diretto del video disponibile.');
}
function finishCommand(success,data){
 if(!pendingCommand)return;
 const p=pendingCommand;pendingCommand=null;clearTimeout(p.timer);
 if(success){acceptMedia(data,true);return;}
 status.bridge=false;
 if(p.action==='toggle')fallbackPause();
 else if(p.action==='seek')fallbackSeek(p.delta);
}
function issueCommand(action,delta=0){
 if(pendingCommand)return;
 const id=++commandSerial;
 pendingCommand={id,action,delta,timer:setTimeout(()=>{
  finishCommand(false,{reason:'no-response'});
 },1000)};
 setPlayerNote('Verifica del controllo video…');
 try {
  frame.contentWindow.postMessage({type:'BOBO_TV_COMMAND',action,delta,cmdId:id},new URL(status.playerUrl).origin);
 }catch(e){finishCommand(false,{reason:'post-message-failed'});}
}
function scrubPreview(direction,seconds){
 if(!status.player)return false;
 const delta=(direction==='left'?-1:1)*Math.min(7200,Math.max(10,seconds|0));
 const target=Math.max(0,Math.min(status.duration||Infinity,estimatedTime()+delta));
 showHud(0);
 $('#play-timestamp').textContent='Vai a '+timer(target)+' ('+(delta>0?'+':'−')+timer(Math.abs(delta))+')';
 $('#play-hint').textContent='Rilascia la freccia per saltare';
 return true;
}
function scrubCommit(direction,seconds){
 if(!status.player)return false;
 const delta=(direction==='left'?-1:1)*Math.min(7200,Math.max(10,seconds|0));
 progress();
 if(status.paused&&!status.bridge){fallbackSeek(delta);return true;}
 issueCommand('seek',delta);showHud(3200);
 return true;
}
function remote(key){
 if(!status.player)return false;
 if(key==='back'){previousPage();return true;}
 if(!status.started&&!status.paused){showHud(2600);return false;}
 if(key==='left'||key==='right'){scrubCommit(key,10);return true;}
 if(key==='center'){
  if(status.paused&&!status.bridge){fallbackPause();return true;}
  issueCommand('toggle');showHud(3300);return true;
 }
 if(key==='up'||key==='down'){
  showHud(4500);return true;
 }
 return false;
}
function onPlayerEvent(event){
 if(!status.player||!/^https:\/\/([a-z0-9-]+\.)*vixsrc\.to$/i.test(event.origin))return;
 let obj=event.data;
 if(typeof obj==='string'){try{obj=JSON.parse(obj);}catch(e){return;}}
 if(!obj||typeof obj!=='object')return;
 if(obj.type==='BOBO_TV_BRIDGE_READY'){
  if(obj.supported)acceptMedia(obj,false);
  return;
 }
 if(obj.type==='BOBO_TV_MEDIA_STATE'){
  if(obj.supported)acceptMedia(obj,false);
  if(obj.event==='ended')handleEnd();
  return;
 }
 if(obj.type==='BOBO_TV_BRIDGE_ACK'){
  if(!pendingCommand||obj.cmdId!==pendingCommand.id)return;
  finishCommand(obj.supported===true,obj);
  return;
 }
 if(obj.type!=='PLAYER_EVENT'||!obj.data||typeof obj.data!=='object')return;
 const d=obj.data;
 const t=Number(d.currentTime),duration=Number(d.duration);
 if(d.currentTime!==null&&Number.isFinite(t)){status.time=Math.max(0,t);mediaWall=performance.now();status.mediaSeen=true;}
 if(d.duration!==null&&Number.isFinite(duration)&&duration>0)status.duration=duration;
 if(d.event==='play'||d.event==='timeupdate'){
  status.started=true;status.paused=false;guide.hidden=true;
 }
 if(d.event==='pause')status.paused=true;
 if(d.event==='ended')handleEnd();
 progress();nativeState();
 if(['play','pause','seeked'].includes(d.event))showHud(d.event==='pause'?0:2600);
}
function handleKey(e){
 if(status.player){
  if(e.key==='Escape'||e.key==='Backspace'){e.preventDefault();previousPage();return;}
  if(status.started||status.paused){
   const key={'ArrowLeft':'left','ArrowRight':'right','ArrowUp':'up','ArrowDown':'down','Enter':'center',' ':'center'}[e.key];
   if(key){e.preventDefault();remote(key);}
  }
  return;
 }
 if(e.key==='Escape'||e.key==='Backspace'){
  if(e.key==='Backspace'&&e.target.matches('input'))return;
  if(status.view==='search'&&document.activeElement?.id==='q'){
   e.preventDefault();closeSearchKeyboard();return;
  }
  e.preventDefault();previousPage();return;
 }
 if(!/^Arrow(Left|Right|Up|Down)$/.test(e.key))return;
 if(e.target.matches('input')&&(e.key==='ArrowLeft'||e.key==='ArrowRight'))return;
 if(e.target.id==='q'&&e.key==='ArrowDown'){e.preventDefault();closeSearchKeyboard();return;}
 e.preventDefault();move(e.key);
}
window.BoboTV={
 remoteKey:remote,
 scrubPreview:scrubPreview,
 scrubCommit:scrubCommit,
 back:previousPage,
 openView:render,
 getChosen:()=>status.chosen,
 getIndex:()=>status.index,
 rail:rail,
 toast:notify,
 updateHomeFavorites:updateHomeFavorites,
 state:()=>({view:status.view,player:status.player,started:status.started,paused:status.paused,bridge:status.bridge}),
 version:'1.4.0-TV'
};
document.getElementById('tabs').addEventListener('click',onClick);
app.addEventListener('click',onClick);
window.addEventListener('message',onPlayerEvent);
document.addEventListener('keydown',handleKey,true);
document.addEventListener('focusin',e=>{
  if(e.target&&e.target.closest('#main,#tabs'))status.focus=e.target;
  const el=e.target&&e.target.closest('.poster');
  const item=el&&status.index.get(el.dataset.title);
  document.getElementById('clock').textContent=item?(item.title+(item.year?' · '+item.year:'')):'BOBO TV · 1.4.0';
},true);
boot();
}());