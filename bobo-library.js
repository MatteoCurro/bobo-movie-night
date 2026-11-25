/* BOBO / anonymous named libraries: strictly browser-local, no server account.
 * Portable JSON and compact recovery code make cross-device transfer explicit.
 */
(function () {
  'use strict';
  const PREFIX='bobo-favs-profile-v2:';
  const PROFILES_KEY='bobo-profile-names-v2';
  const ACTIVE_KEY='bobo-active-profile-v2';
  const LEGACY_KEY='bobo-favorites-v1';
  const MAX=500;
  const MAX_PROFILES=25;
  function identity(name) { return String(name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('it'); }
  function validate(name) {
    const raw=String(name||'').trim().replace(/\s+/g,' ');
    if(raw.length<2 || raw.length>24 || !/^[\p{L}\p{N} _.+-]+$/u.test(raw)) throw Error('Usa un nome di 2–24 caratteri (lettere e numeri)');
    return raw;
  }
  function key(kind,id) { return (kind==='tv'?'tv':'movie')+':'+String(id); }
  function names() {
    try {
      const list=JSON.parse(localStorage.getItem(PROFILES_KEY)||'[]');
      return Array.isArray(list)?list.filter(x=>typeof x==='string').slice(0,MAX_PROFILES):[];
    } catch(_){return [];}
  }
  function writeNames(list) { localStorage.setItem(PROFILES_KEY,JSON.stringify(list)); }
  function init() {
    try {
      let list=names();
      if(!list.length) {
        list=['Ospite'];
        writeNames(list);
        const previous=localStorage.getItem(LEGACY_KEY);
        if(previous && !localStorage.getItem(PREFIX+identity('Ospite'))) {
          localStorage.setItem(PREFIX+identity('Ospite'),previous);
        }
      }
      const current=localStorage.getItem(ACTIVE_KEY);
      if(!list.some(n=>identity(n)===identity(current))) localStorage.setItem(ACTIVE_KEY,list[0]);
    } catch(_) {}
  }
  init();
  function profile() {
    const list=names();
    let current='Ospite';
    try {current=localStorage.getItem(ACTIVE_KEY)||'Ospite';} catch(_){}
    return list.find(n=>identity(n)===identity(current))||list[0]||'Ospite';
  }
  function profiles(){return names();}
  function switchProfile(name) {
    const validated=validate(name), prior=names();
    const existing=prior.find(n=>identity(n)===identity(validated));
    if(!existing && prior.length>=MAX_PROFILES) throw Error('Limite profili locali raggiunto');
    const chosen=existing||validated;
    try {
      if(!existing) writeNames(prior.concat(chosen));
      localStorage.setItem(ACTIVE_KEY,chosen);
      dispatch();
      return chosen;
    } catch(_){throw Error('Non posso salvare il profilo in questo browser');}
  }
  function storageKey(){return PREFIX+identity(profile());}
  function normalize(x) {
    if(!x||!['movie','tv'].includes(x.type))return null;
    const id=String(x.tmdb_id||'');
    if(!/^[0-9]{1,12}$/.test(id))return null;
    const title=String(x.title||'').trim().slice(0,180);
    if(!title)return null;
    const img=s=>{const v=String(s||'');return /^\/[a-zA-Z0-9_-]{5,180}\.(?:jpg|jpeg|png|webp)$/.test(v)?'https://image.tmdb.org/t/p/w342'+v:/^https:\/\/image\.tmdb\.org\/t\/p\//.test(v)?v.slice(0,350):'';};
    return {
      type:x.type,tmdb_id:Number(id),title,year:Number(x.year)||null,
      poster:img(x.poster),backdrop:img(x.backdrop),
      genres:Array.isArray(x.genres)?x.genres.filter(v=>typeof v==='string').slice(0,10).map(v=>v.slice(0,48)):[],
      vote:Number(x.vote)||0,overview:String(x.overview||'').slice(0,500),
      saved_at:x.saved_at||new Date().toISOString()
    };
  }
  function unique(items){
    const seen=new Set();
    return items.map(normalize).filter(x=>{
      if(!x)return false;
      const k=key(x.type,x.tmdb_id);
      if(seen.has(k))return false;
      seen.add(k);return true;
    }).slice(0,MAX);
  }
  function read(){
    try {
      const values=JSON.parse(localStorage.getItem(storageKey())||'[]');
      return unique(Array.isArray(values)?values:[]);
    } catch(_){return [];}
  }
  function dispatch(){
    try {window.dispatchEvent(new CustomEvent('bobo:favorites-change',{detail:{count:read().length,profile:profile()}}));} catch(_){}
  }
  function save(items){
    try {localStorage.setItem(storageKey(),JSON.stringify(unique(items)));dispatch();return true;}
    catch(_){return false;}
  }
  function has(kind,id){return read().some(x=>key(x.type,x.tmdb_id)===key(kind,id));}
  function toggle(item) {
    const normalized=normalize(item);
    if(!normalized)return {saved:false,error:'Titolo non valido'};
    const list=read(),at=list.findIndex(x=>key(x.type,x.tmdb_id)===key(normalized.type,normalized.tmdb_id));
    const added=at<0;
    if(added)list.unshift(normalized);else list.splice(at,1);
    if(!save(list))return {saved:false,error:'Salvataggio non disponibile nel browser'};
    return {saved:added,count:list.length};
  }
  function exportText(){
    return JSON.stringify({format:'bobo-favorites',version:2,profile:profile(),
      created:new Date().toISOString(),items:read()},null,2);
  }
  function importText(raw) {
    const obj=JSON.parse(raw);
    if(!obj||obj.format!=='bobo-favorites'||![1,2].includes(obj.version)||!Array.isArray(obj.items))
      throw Error('Il testo non è un backup Bobo valido');
    if(obj.items.length>MAX)throw Error('Limite di 500 preferiti');
    const result=unique([...read(),...obj.items]);
    if(!save(result))throw Error('Impossibile salvare nel browser');
    return result.length;
  }
  function recoveryCode(){
    // Short but portable. Contains titles, IDs and genres, not credentials or a password.
    const payload=[profile(),read().map(x=>[x.type==='tv'?'s':'f',x.tmdb_id,x.title,x.year,x.genres])];
    const data=JSON.stringify(payload);
    const bytes=new TextEncoder().encode(data);
    let binary=''; for(const byte of bytes)binary+=String.fromCharCode(byte);
    return 'BMF2.'+btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function importRecoveryCode(code){
    const value=String(code||'').trim().replace(/^.*[?#]recover=/,'');
    if(!/^BMF2\.[A-Za-z0-9_-]{10,150000}$/.test(value))throw Error('Codice di recupero non valido');
    const enc=value.substring(5).replace(/-/g,'+').replace(/_/g,'/');
    const bytes=atob(enc);
    const data=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++)data[i]=bytes.charCodeAt(i);
    const payload=JSON.parse(new TextDecoder().decode(data));
    if(!Array.isArray(payload)||!Array.isArray(payload[1])||payload[1].length>MAX)throw Error('Contenuto di recupero non valido');
    const incoming=payload[1].map(x=>({
      type:x[0]==='s'?'tv':'movie',tmdb_id:x[1],title:x[2],year:x[3],genres:x[4]
    }));
    if(incoming.some(x=>!normalize(x)))throw Error('Uno o più titoli non validi');
    // A recovery link carries the collection name; restore into the same
    // local namespace instead of merging it into an unrelated person's list.
    if(typeof payload[0]==='string')switchProfile(validate(payload[0]));
    const result=unique([...read(),...incoming]);
    if(!save(result))throw Error('Impossibile salvare nel browser');
    return result.length;
  }
  window.BoboLibrary=Object.freeze({
    read,save,has,toggle,exportText,importText,key,profile,profiles,switchProfile,
    recoveryCode,importRecoveryCode
  });
}());
