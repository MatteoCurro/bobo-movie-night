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
  seasons:[],episodeNames:{},search:'',recent:[],autoNext:true,mediaSeen:false};
let hudTimer=0,toastTimer=0,topTimer=0,loadCount=0,requestVersion=0,commandSerial=0,pendingCommand=null,mediaWall=0,playerLoadedAt=0;
const $=s=>document.querySelector(s);
const els=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function image(src,size){
 if(typeof src!=='string'||!/^https:\/\/image\.tmdb\.org\//.test(src))return '';
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
async function boot(){
 loading();
 try{
  const [movies,series]=await Promise.all([
   fetch(BASE+'data/movies.json').then(r=>{if(!r.ok)throw Error('Catalogo film non disponibile');return r.json();}),
   fetch(BASE+'data/tv.json').then(r=>{if(!r.ok)throw Error('Catalogo serie non disponibile');return r.json();})
  ]);
  status.movies=mapItems(movies,'movie');
  status.series=mapItems(series,'tv');
  status.items=status.movies.concat(status.series);
  status.items.forEach(i=>status.index.set(i.type+':'+i.tmdb_id,i));
  render('home');
  window.BoboTVExtras?.catalogReady();
 }catch(error){
  app.innerHTML='<div class="message"><h1>Impossibile caricare il catalogo</h1><p>Controlla la connessione della TV.</p><button class="action" id="retry">Riprova</button></div>';
  $('#retry').addEventListener('click',boot);$('#retry').focus();
 }
}
function poster(item){
 const url=image(item.poster,'w500');
 return '<button type="button" class="poster tv-focus" data-title="'+esc(item.type+':'+item.tmdb_id)+'" aria-label="'+esc(item.title)+'">'+
  '<span class="poster-art" data-focus-title="'+esc(item.title)+'" data-focus-meta="'+esc(meta(item))+'"><span class="poster-type">'+(item.type==='tv'?'SERIE TV':'FILM')+'</span>'+(url?'<img loading="lazy" decoding="async" src="'+esc(url)+'" alt="">':
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
 const first=feature();
 const movies=recent(status.movies);
 const series=recent(status.series);
 const all=recent(status.items);
 return '<div class="home-kicker"><span class="eyebrow">BOBO TV · NUOVA ESPERIENZA</span>'+
  '<span class="home-kicker-count">'+status.items.length.toLocaleString('it-IT')+' titoli da scoprire</span></div>'+
  (first?hero(first,false):'')+
  rail('Da scoprire adesso',all,'Film e serie')+
  rail('Film recenti',movies)+rail('Serie TV',series)+
  rail('I più apprezzati',rated(status.items))+
  rail('Un film per stasera',rated(status.movies).filter(i=>Number(i.runtime)>=75&&Number(i.runtime)<=145));
}
function browse(type){
 const list=(type==='tv'?status.series:status.movies).filter(i=>i.poster)
  .sort((a,b)=>Number(b.year)-Number(a.year)||Number(b.vote)-Number(a.vote));
 return '<div class="section-header"><h1>'+(type==='tv'?'Serie TV':'Film')+'</h1><span class="section-desc">'+
  list.length.toLocaleString('it-IT')+' titoli</span></div>'+
  '<div class="results">'+list.slice(0,108).map(poster).join('')+'</div>'+
  (list.length>108?'<p class="message">Utilizza Cerca per trovare tutti gli altri titoli del catalogo.</p>':'');
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
 const list=status.items.filter(i=>normalize(i.title).includes(q))
  .sort((a,b)=>Number(normalize(a.title).startsWith(q))-Number(normalize(b.title).startsWith(q))||
    Number(a.vote)-Number(b.vote)||Number(a.year)-Number(b.year)).reverse();
 results.innerHTML=list.slice(0,60).map(poster).join('');
 msg.textContent=list.length>60?'Mostrati i primi 60 risultati su '+list.length+'.':'Trovati '+list.length+' titoli.';
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
function detail(item){
 status.chosen=item;
 status.seasons=getSeasons(item);
 status.season=(status.seasons.find(s=>s.n>0)||status.seasons[0]||{n:1}).n;
 status.episode=1;
 status.view='detail';
 app.innerHTML=hero(item,true)+seasonControls();
 $('#hero-play').textContent=item.type==='tv'?'▶ Riproduci S'+status.season+' E1':'▶ Riproduci';
 drawEpisodes();episodeNames(item);
 window.BoboTVExtras?.updateDetail(item);
 navActive();window.scrollTo(0,0);
 focusFirst('#hero-play');
}
function navActive(){
 els('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===status.view));
}
function render(view){
 if(status.player)exitPlayer(false);
 let external=false;
 status.view=view;
 navActive();
 if(view==='home')app.innerHTML=featuredHome();
 else if(view==='movie'||view==='tv')app.innerHTML=browse(view);
 else if(view==='search'){
  app.innerHTML=searchScreen();searchNow();
  const field=$('#q');
  field.addEventListener('input',()=>{status.search=field.value;searchNow();});
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
function ensure(item){
 if(!item||!item.isConnected)return;
 try{item.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});}
 catch(e){item.scrollIntoView(false);}
}
function focusChoices(){
 return els('.tab,.tv-focus').filter(el=>{
  if(el.disabled||el.closest('[hidden]'))return false;
  const r=el.getBoundingClientRect();return r.width>5&&r.height>5&&getComputedStyle(el).visibility!=='hidden';
 });
}
function move(key){
 const choices=focusChoices();
 if(!choices.length)return;
 let current=document.activeElement;
 if(!choices.includes(current)){current=choices[0];current.focus();ensure(current);return;}
 const from=current.getBoundingClientRect(),fx=from.left+from.width/2,fy=from.top+from.height/2;
 const horizontal=key==='ArrowLeft'||key==='ArrowRight',forward=key==='ArrowRight'||key==='ArrowDown';
 const rail=horizontal?current.closest('.rail,.season-list'):null;
 function score(el){
  if(el===current)return null;
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  const main=horizontal?x-fx:y-fy,cross=horizontal?Math.abs(y-fy):Math.abs(x-fx);
  if(forward?main<=2:main>=-2)return null;
  const d=Math.abs(main);
  return {el,score:d+2.4*cross+(cross*cross)/(d+45)};
 }
 let pool=choices;
 if(rail)pool=choices.filter(el=>el.closest('.rail,.season-list')===rail);
 let ranked=pool.map(score).filter(Boolean).sort((a,b)=>a.score-b.score);
 if(!ranked.length && rail)ranked=choices.map(score).filter(Boolean).sort((a,b)=>a.score-b.score);
 if(ranked.length){ranked[0].el.focus({preventScroll:true});ensure(ranked[0].el);}
}
function onClick(e){
 if(window.BoboTVExtras?.onClick(e))return;
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
 if(status.view==='search'&&document.activeElement?.id==='q'){
  closeSearchKeyboard();return;
 }
 if(status.player){exitPlayer();return;}
 if(status.view==='detail'){render('home');return;}
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
 state:()=>({view:status.view,player:status.player,started:status.started,paused:status.paused,bridge:status.bridge}),
 version:'1.3.1-TV'
};
document.getElementById('tabs').addEventListener('click',onClick);
app.addEventListener('click',onClick);
window.addEventListener('message',onPlayerEvent);
document.addEventListener('keydown',handleKey,true);
document.addEventListener('focusin',e=>{
  if(e.target&&e.target.closest('#main,#tabs'))status.focus=e.target;
  const el=e.target&&e.target.closest('.poster');
  const item=el&&status.index.get(el.dataset.title);
  document.getElementById('clock').textContent=item?(item.title+(item.year?' · '+item.year:'')):'BOBO TV · 1.3.1';
},true);
boot();
}());