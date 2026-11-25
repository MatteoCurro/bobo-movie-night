(function(){
'use strict';
// APK-only account integration. The web app and PHP backend remain unchanged.
const API='https://movieaccount.curromatteo.it/api.php?route=';
const root=document.getElementById('main');
let profile=null, favorites=[],busy=false,ready=false,offline=false,refreshPromise=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text){if(window.BoboTV?.toast)window.BoboTV.toast(text);else {
 const toast=$('#toast');if(toast){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2700);}
}}
async function request(route,payload,method){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),14000);
 try{
  const response=await fetch(API+encodeURIComponent(route),{
   method:payload===undefined?'GET':(method||'POST'),
   credentials:'include',cache:'no-store',signal:controller.signal,
   headers:payload===undefined?{}:{'Content-Type':'application/json'},
   body:payload===undefined?undefined:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'Servizio account non disponibile'),{status:response.status});
  return data;
 }finally{clearTimeout(timer);}
}
function key(x){return x.type+':'+x.tmdb_id;}
function normalized(list){
 const found=new Set();
 return (Array.isArray(list)?list:[]).filter(i=>{
  if(!i||!['movie','tv'].includes(i.type)||!/^[1-9][0-9]{0,11}$/.test(String(i.tmdb_id)))return false;
  const k=key(i);if(found.has(k))return false;found.add(k);return true;
 });
}
function has(item){return favorites.some(i=>key(i)===key(item));}
function setAccount(username){
 const userButton=$('[data-view="account"]');
 const favButton=$('[data-view="favorites"]');
 if(userButton)userButton.textContent=username?'◉ '+username:'Account';
 if(favButton)favButton.textContent='♥ Preferiti'+(username?' ('+favorites.length+')':'');
}
async function refresh(){
 // Opening the app and loading the catalog can both request refresh;
 // coalesce them so a slower failed request cannot undo a newer login.
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{
  try{
   const user=await request('me');
   if(!user.username)throw Object.assign(Error('Accesso richiesto'),{status:401});
   profile=user;
   const data=await request('favorites');
   favorites=normalized(data.items);
   offline=false;
  }catch(err){
   if(err.status===401){profile=null;favorites=[];offline=false;}
   else{
    // The network being temporarily unavailable is NOT a logout.
    offline=true;
    if(profile)notify('Sincronizzazione non disponibile, riprova tra poco');
   }
  }
  ready=true;setAccount(profile?.username);updateDetail();
  if(window.BoboTV?.state().player)return;
  const view=window.BoboTV?.state().view;
  // Do not replace the active login form while someone types with the remote.
  if(view==='account'&&!profile&&document.activeElement?.closest('#tv-login'))return;
  if(view==='account'||view==='favorites')render(view);
 })();
 try{return await refreshPromise;}finally{refreshPromise=null;}
}
function signInUI(){
 return '<div class="account-screen"><div class="account-heading">'+
 '<p class="eyebrow">UN SOLO ACCOUNT, SU TUTTI I DISPOSITIVI</p><h1>Accedi a Bobo</h1>'+
 '<p class="section-desc">Ritrova sulla TV i preferiti che hai salvato sul sito.</p></div>'+
 '<form id="tv-login" class="account-form">'+
 '<label for="tv-username">Nome utente</label>'+
 '<input class="tv-focus" id="tv-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Nome utente" maxlength="24">'+
 '<label for="tv-password">Password</label>'+
 '<input class="tv-focus" id="tv-password" name="password" type="password" autocomplete="current-password" required placeholder="Password">'+
 '<div class="actions"><button type="submit" class="action tv-focus">Accedi</button></div>'+
 '<p id="tv-login-error" role="status"></p></form>'+
 '<p class="account-help">Non hai un account? Registrati dal telefono su <strong>movieaccount.curromatteo.it/account.html</strong>, poi accedi qui.</p></div>';
}
function accountScreen(){
 return profile?'<div class="account-screen"><p class="eyebrow">ACCOUNT BOBO</p>'+
 '<h1>Ciao, '+esc(profile.username)+'</h1>'+
 '<p class="section-desc">I tuoi preferiti sono sincronizzati con Bobo Movie Club.</p>'+ '<p class="account-status">'+(offline?'● Connessione da verificare · i dati rimangono disponibili':'✓ Accesso protetto · puoi restare collegato su questa TV')+'</p>'+
 '<div class="actions"><button class="action tv-focus" data-view="favorites">♥ Vedi i preferiti ('+favorites.length+')</button>'+
 '<button class="action secondary tv-focus" id="tv-refresh">↻ Sincronizza</button>'+ '<button class="action secondary tv-focus" id="tv-check-update">Controlla aggiornamenti</button>'+ '<button class="action secondary tv-focus" id="tv-logout">Esci dall’account</button></div></div>':
 signInUI();
}
function favoriteScreen(){
 if(!profile)return '<div class="account-screen"><h1>I tuoi preferiti</h1>'+
 '<p class="section-desc">Accedi per vedere i film e le serie che hai salvato.</p>'+
 '<div class="actions"><button class="action tv-focus" data-view="account">Accedi</button></div></div>';
 if(!favorites.length)return '<div class="account-screen"><h1>I tuoi preferiti</h1>'+
 '<p class="section-desc">Ancora nessun titolo salvato. Apri una scheda e seleziona ♥ Aggiungi ai preferiti.</p>'+
 '<div class="actions"><button class="action tv-focus" data-view="home">Scopri il catalogo</button></div></div>';
 const index=window.BoboTV?.getIndex();
 const films=favorites.filter(i=>i.type==='movie').map(i=>index?.get(key(i))||i);
 const series=favorites.filter(i=>i.type==='tv').map(i=>index?.get(key(i))||i);
 return '<div class="section-header"><h1>♥ I tuoi preferiti</h1><span class="section-desc">'+favorites.length+' titoli · '+esc(profile.username)+'</span></div>'+
  window.BoboTV.rail('Film salvati',films)+window.BoboTV.rail('Serie TV salvate',series);
}
function render(view){
 if(view==='account'||view==='favorites'){
  root.innerHTML=view==='account'?accountScreen():favoriteScreen();
  window.scrollTo(0,0);
  requestAnimationFrame(()=>{
   const first=root.querySelector('.tv-focus');
   if(first)first.focus({preventScroll:true});
  });
  return true;
 }
 return false;
}
function updateDetail(item){
 const host=document.querySelector('.detail-backdrop .actions');
 if(!host)return;
 let button=document.getElementById('tv-favorite');
 if(!button){
  button=document.createElement('button');
  button.type='button';button.id='tv-favorite';button.className='action secondary tv-focus';
  host.appendChild(button);
 }
 const chosen=item||window.BoboTV?.getChosen();
 if(!chosen)return;
 button.textContent=has(chosen)?'♥ Nei preferiti':'♡ Aggiungi ai preferiti';
 button.setAttribute('aria-label',(has(chosen)?'Rimuovi dai preferiti ':'Aggiungi ai preferiti ')+chosen.title);
}
async function toggleFavorite(){
 if(busy)return;
 const item=window.BoboTV?.getChosen();
 if(!item)return;
 if(!profile){notify('Accedi da Account per salvare questo titolo',3500);return;}
 busy=true;
 const btn=$('#tv-favorite');if(btn){btn.disabled=true;btn.textContent='Salvataggio…';}
 try{
  // Prefer the atomic endpoint: only one request, no cross-device overwrite.
  // The legacy route remains as a fallback until the PHP deployment is updated.
  try {
   const result=await request('favorites/toggle',{item:{
    type:item.type,tmdb_id:Number(item.tmdb_id),title:item.title,
    year:item.year||null,poster:item.poster||'',overview:item.overview||'',
    genres:item.genres||[],saved_at:new Date().toISOString()
   }});
   favorites=normalized(result.items);setAccount(profile.username);
   notify(result.saved?'Aggiunto ai preferiti':'Rimosso dai preferiti');
   return;
  }catch(err){if(err.status!==404)throw err;}
  // Always read the latest collection to avoid overwriting changes made
  // from another device before saving on this TV.
  const data=await request('favorites');
  const fresh=normalized(data.items);
  const ix=fresh.findIndex(x=>key(x)===key(item));
  let label;
  if(ix>=0){fresh.splice(ix,1);label='Rimosso dai preferiti';}
  else {
   if(fresh.length>=500)throw Error('Hai raggiunto il limite di 500 preferiti.');
   fresh.unshift({type:item.type,tmdb_id:Number(item.tmdb_id),title:item.title,
    year:item.year||null,poster:item.poster||'',backdrop:item.backdrop||'',
    overview:item.overview||'',genres:item.genres||[],saved_at:new Date().toISOString()});
   label='Aggiunto ai preferiti';
  }
  await request('favorites',{items:fresh},'PUT');
  favorites=fresh;setAccount(profile.username);notify(label);
 }catch(err){
  if(err.status===401){profile=null;favorites=[];setAccount(null);notify('Sessione scaduta: accedi da Account',3500);}
  else notify('Salvataggio non riuscito. Riprova quando la rete è disponibile',3500);
 }finally{
  busy=false;updateDetail(item);if(btn)btn.disabled=false;
 }
}
async function signIn(form){
 if(busy)return;
 const username=form.querySelector('#tv-username').value.trim();
 const password=form.querySelector('#tv-password').value;
 const error=form.querySelector('#tv-login-error');
 if(!username||!password)return;
 busy=true;
 const submit=form.querySelector('button[type=submit]');submit.disabled=true;
 error.textContent='Accesso in corso…';
 try{
  await request('login',{username,password});
  form.querySelector('#tv-password').value='';
  // An optional TV-only backend endpoint issues a secure 365-day device cookie.
  try{await request('tv/remember',{});}catch(e){notify('Accesso riuscito, ma ricorda dispositivo non ancora attivo',3500);}
  await refresh();
  if(profile){notify('Bentornato, '+profile.username);window.BoboTV?.openView('favorites');}
  else error.textContent='Accesso effettuato ma sessione non disponibile. Riprova.';
 }catch(err){error.textContent=err.message;}
 finally{busy=false;if(submit.isConnected)submit.disabled=false;}
}
async function logout(){
 if(busy)return;busy=true;
 try{await request('logout',{});profile=null;favorites=[];setAccount(null);window.BoboTV?.openView('account');}
 catch(err){notify('Uscita non riuscita: '+err.message);}
 finally{busy=false;}
}
function onClick(e){
 if(e.target.closest('#tv-favorite')){toggleFavorite();return true;}
 if(e.target.closest('#tv-logout')){logout();return true;}
 if(e.target.closest('#tv-refresh')){refresh();return true;}
 if(e.target.closest('#tv-check-update')){window.BoboTVUpdates?.check();return true;}
 return false;
}
root.addEventListener('submit',e=>{
 if(e.target.id!=='tv-login')return;
 e.preventDefault();signIn(e.target);
});
window.BoboTVExtras={render,onClick,updateDetail,refresh,catalogReady:()=>refresh()};
refresh();
}());