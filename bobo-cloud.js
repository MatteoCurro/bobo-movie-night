/* BOBO cloud bridge — optional account sync with existing PHP JSON service.
 * Guest lists stay local. Signed-in collections live on the server, with a
 * per-user retry queue when offline; never silently mix two users' lists.
 */
(function () {
  'use strict';
  const Local=window.BoboLibrary;
  if(!Local)return;
  const ORIGIN='https://movieaccount.curromatteo.it';
  const API=ORIGIN+'/api.php?route=';
  const PENDING='bobo-account-pending-v1:';
  const MAX=500;
  let state='checking', user=null, items=[], revision=0, flushing=false, timer=null;
  const guestProfile=Local.profile();
  const normalize=x=>{
    if(!x||!['movie','tv'].includes(x.type)||!/^[0-9]{1,12}$/.test(String(x.tmdb_id||'')))return null;
    const title=String(x.title||'').trim().slice(0,180);
    if(!title)return null;
    return {
      type:x.type,tmdb_id:Number(x.tmdb_id),title,year:Number(x.year)||null,
      saved_at:String(x.saved_at||new Date().toISOString()).slice(0,40),
      poster:/^https:\/\/image\.tmdb\.org\//.test(x.poster||'')?String(x.poster).slice(0,350):'',
      backdrop:/^https:\/\/image\.tmdb\.org\//.test(x.backdrop||'')?String(x.backdrop).slice(0,350):'',
      genres:Array.isArray(x.genres)?x.genres.filter(t=>typeof t==='string').slice(0,10):[],
      overview:String(x.overview||'').slice(0,500)
    };
  };
  function unique(list){
    const result=[],found=new Set();
    for(const raw of Array.isArray(list)?list:[]){
      const x=normalize(raw);
      if(!x)continue;
      const k=x.type+':'+x.tmdb_id;
      if(found.has(k))continue;
      found.add(k);result.push(x);
      if(result.length>=MAX)break;
    }
    return result;
  }
  function emit(){
    window.dispatchEvent(new CustomEvent('bobo:favorites-change',{
      detail:{count:read().length,profile:profile()}
    }));
    window.dispatchEvent(new CustomEvent('bobo:account-change',{
      detail:{state,user:user?{username:user.username,role:user.role}:null}
    }));
  }
  async function api(route,payload,method){
    const res=await fetch(API+encodeURIComponent(route),{
      method:payload===undefined?'GET':(method||'POST'),
      credentials:'include',cache:'no-store',
      headers:payload===undefined?{}:{'Content-Type':'application/json'},
      body:payload===undefined?undefined:JSON.stringify(payload)
    });
    let json={};
    try {json=await res.json();}catch(_){}
    if(!res.ok){const e=new Error(json.error||'Servizio account temporaneamente non disponibile');e.status=res.status;throw e;}
    return json;
  }
  const pendingKey=()=>PENDING+(user?.username||'').toLowerCase();
  function readPending(){
    try{
      const raw=localStorage.getItem(pendingKey());
      return raw?unique(JSON.parse(raw)):null;
    }catch(_){return null;}
  }
  function persistPending(){
    try {localStorage.setItem(pendingKey(),JSON.stringify(items));return true;}
    catch(_){return false;}
  }
  function clearPending(){
    try {localStorage.removeItem(pendingKey());}catch(_){}
  }
  function read(){return state==='member'?items.slice():[];}
  function profile(){return state==='member'&&user?user.username:Local.profile();}
  function has(type,id){return read().some(x=>x.type===type&&String(x.tmdb_id)===String(id));}
  function save(next){
    if(state!=='member')return false;
    const clean=unique(next);
    if(clean.length>MAX)return false;
    items=clean;revision+=1;
    const queued=persistPending();
    emit();
    schedule();
    return queued;
  }
  function toggle(raw){
    if(state!=='member')return {saved:false,error:state==='offline'?'Account non raggiungibile: riprova tra poco':'Per aggiungere preferiti crea un account o accedi'};
    const x=normalize(raw);
    if(!x)return {saved:false,error:'Titolo non valido'};
    const next=items.slice(),at=next.findIndex(t=>t.type===x.type&&t.tmdb_id===x.tmdb_id);
    if(at>=0)next.splice(at,1);else next.unshift(x);
    if(!save(next))return {saved:false,error:'Impossibile memorizzare le modifiche in attesa'};
    return {saved:at<0,count:next.length};
  }
  function exportText(){
    if(state!=='member')throw Error('Accedi per esportare i preferiti');
    return JSON.stringify({format:'bobo-favorites',version:2,profile:profile(),items:read()},null,2);
  }
  function importText(text){
    if(state!=='member')throw Error('Accedi per importare preferiti');
    const data=JSON.parse(text);
    if(!data||data.format!=='bobo-favorites'||![1,2].includes(data.version)||
       !Array.isArray(data.items)||data.items.length>MAX)throw Error('Backup Bobo non valido');
    const merged=unique([...items,...data.items]);
    if(!save(merged))throw Error('Salvataggio temporaneo non disponibile');
    return merged.length;
  }
  function importLocal(){
    if(state!=='member')throw Error('Accedi per importare la raccolta locale');
    const old=Local.read();
    const merged=unique([...items,...old]);
    if(!save(merged))throw Error('Salvataggio temporaneo non disponibile');
    return merged.length;
  }
  async function flush(){
    if(flushing||state!=='member'||!user)return;
    if(!readPending())return;
    flushing=true;
    const version=revision, snapshot=items.slice(),username=user.username;
    try{
      await api('favorites',{items:snapshot},'PUT');
      if(user?.username===username&&revision===version){
        clearPending();
        updateStatus('Sincronizzato');
      }
    }catch(err){
      updateStatus(err.status===401?'Sessione scaduta':'Da sincronizzare');
      // Persisted pending copy is retried when this tab is focused/online.
    }finally{
      flushing=false;
      if(user?.username===username&&revision!==version)schedule(250);
    }
  }
  function schedule(delay=450){
    clearTimeout(timer);
    timer=setTimeout(flush,delay);
  }
  function updateStatus(message){
    const x=document.querySelector('#bobo-account-sync');
    if(x)x.textContent=message;
  }
  async function refresh(){
    if(state==='member'&&readPending())await flush();
    try {
      const current=await api('me');
      if(!current.username)throw Error('Profilo non valido');
      user={username:current.username,role:current.role,email:current.email};
      const queued=readPending();
      const remote=await api('favorites');
      const server=unique(remote.items);
      if(queued){
        // Retry an acknowledged local edit before displaying server data.
        items=queued;
        state='member';revision+=1;emit();renderControls();
        schedule(0);
      }else{
        items=server;state='member';emit();renderControls();
        updateStatus('Sincronizzato');
      }
    } catch(err){
      user=null;items=[];
      state=err.status===401?'guest':'offline';
      emit();renderControls();
    }
  }
  async function logout(){
    try{await api('logout',{});}catch(_){}
    user=null;items=[];state='guest';
    emit();renderControls();
  }
  function status(){return {state,user:user?{...user}:null,pending:Boolean(user&&readPending())};}
  function accountLink(mode='login'){
    const file=location.pathname.split('/').pop()||'index.html';
    const allowed=['index.html','favorites.html','watch.html'];
    const base=allowed.includes(file)?file:'index.html';
    let suffix='';
    if(base==='watch.html'){
      const q=new URLSearchParams(location.search);
      const clean=new URLSearchParams();
      for(const key of ['type','id','s','e']){
        const value=q.get(key);
        if(value&&/^[a-z0-9]{1,12}$/i.test(value))clean.set(key,value);
      }
      if(clean.toString())suffix='?'+clean;
    }
    if(base==='index.html'&&['#tv','#movies'].includes(location.hash))suffix=location.hash;
    const target=location.origin+'/'+base+suffix;
    return ORIGIN+'/account.html?return='+encodeURIComponent(target)+'&view='+encodeURIComponent(mode);
  }
  function renderControls(){
    if(!document.body)return;
    const header=document.querySelector('header');
    if(!header)return;
    let node=header.querySelector('.bobo-account-control');
    if(!node){node=document.createElement('div');node.className='bobo-account-control';header.appendChild(node);}
    const signature=(state==='member'?(user?.username||'')+':'+(user?.role||''):state);
    if(node.dataset.signature===signature)return;
    node.dataset.signature=signature;
    node.replaceChildren();
    if(state==='member'){
      const menu=document.createElement('details');
      menu.className='bobo-account-menu';
      const summary=document.createElement('summary');
      summary.textContent='◉ '+user.username;
      menu.appendChild(summary);
      const links=document.createElement('div');
      links.className='bobo-account-menu-links';
      const account=document.createElement('a');
      account.href=accountLink('settings');account.textContent='Impostazioni account e newsletter';
      links.appendChild(account);
      if(user.role==='admin'){
        const admin=document.createElement('a');admin.href=ORIGIN+'/admin.html';admin.textContent='Amministrazione';
        links.appendChild(admin);
      }
      const sync=document.createElement('span');sync.id='bobo-account-sync';
      sync.textContent=readPending()?'Da sincronizzare':'Sincronizzato';
      links.appendChild(sync);
      const exit=document.createElement('button');exit.type='button';
      exit.textContent='Esci';exit.addEventListener('click',logout);
      links.appendChild(exit);
      menu.appendChild(links);
      node.appendChild(menu);
    }else{
      const link=document.createElement('a');link.href=accountLink();link.className='bobo-account-login';
      link.textContent=state==='offline'?'Account non raggiungibile':'Accedi / Registrati';
      node.appendChild(link);
    }
  }
  const bridge=Object.freeze({
    ...Local,read,save,toggle,has,profile,exportText,importText,
    profiles:()=>state==='member'?[user.username]:Local.profiles(),
    switchProfile:n=>{if(state==='member')throw Error('I profili personali sono gestiti dal tuo account');return Local.switchProfile(n);},
    recoveryCode:()=>null,
    importRecoveryCode:()=>{throw Error('Il vecchio recupero locale è disponibile solo nella funzione Importa precedenti');}
  });
  window.BoboLibrary=bridge;
  window.BoboCloud=Object.freeze({api,refresh,logout,status,importLocal,
    localCount:()=>Local.read().length,accountLink,settingsLink:()=>accountLink('settings')});
  function start(){
    renderControls();
    refresh();
    window.addEventListener('online',()=>{if(state==='member')schedule(0);else refresh();});
    window.addEventListener('focus',()=>{if(state==='member'&&readPending())schedule(0);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}());