/* BOBO / local library. Private to this browser, no backend or account.
 * Stores lightweight TMDB IDs + enough metadata to survive catalog refreshes.
 */
(function () {
  'use strict';
  const KEY = 'bobo-favorites-v1';
  const MAX = 500;
  function key(kind,id) { return (kind === 'tv' ? 'tv' : 'movie') + ':' + String(id); }
  function normalize(x) {
    if (!x || !['movie','tv'].includes(x.type)) return null;
    const id = String(x.tmdb_id || '');
    if (!/^[0-9]{1,12}$/.test(id)) return null;
    const name = String(x.title || '').trim().slice(0,180);
    if (!name) return null;
    const url = s => /^https:\/\/image\.tmdb\.org\//.test(s || '') ? String(s).slice(0,350) : '';
    return {
      tmdb_id: Number(id), type:x.type, title:name, year:Number(x.year) || null,
      poster:url(x.poster), backdrop:url(x.backdrop),
      vote:Number(x.vote) || 0, overview:String(x.overview || '').slice(0,450),
      saved_at:x.saved_at || new Date().toISOString()
    };
  }
  function read() {
    try {
      const values = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(values)) return [];
      const seen = new Set();
      return values.map(normalize).filter(x => {
        if (!x) return false;
        const id = key(x.type,x.tmdb_id);
        if (seen.has(id)) return false;
        seen.add(id);return true;
      }).slice(0,MAX);
    } catch (_) { return []; }
  }
  function save(list) {
    try {
      localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)));
      window.dispatchEvent(new CustomEvent('bobo:favorites-change', {detail:{count:list.length}}));
      return true;
    } catch (_) { return false; }
  }
  function has(kind,id) { return read().some(x => key(x.type,x.tmdb_id) === key(kind,id)); }
  function toggle(item) {
    const clean = normalize(item);
    if (!clean) return {saved:false,error:'Titolo non valido'};
    const list = read(), pos = list.findIndex(x => key(x.type,x.tmdb_id) === key(clean.type,clean.tmdb_id));
    const added = pos === -1;
    if (added) list.unshift(clean);
    else list.splice(pos,1);
    if (!save(list)) return {saved:false,error:'Salvataggio non disponibile nel browser'};
    return {saved:added,count:list.length};
  }
  function exportText() {
    return JSON.stringify({format:'bobo-favorites',version:1,created:new Date().toISOString(),items:read()},null,2);
  }
  function importText(raw) {
    const obj = JSON.parse(raw);
    if (!obj || obj.format !== 'bobo-favorites' || obj.version !== 1 || !Array.isArray(obj.items))
      throw Error('Il testo non è un backup dei preferiti Bobo');
    const merged = [...read(),...obj.items.map(normalize).filter(Boolean)];
    const result = [],seen = new Set();
    for(const item of merged) {
      const k=key(item.type,item.tmdb_id);
      if(seen.has(k))continue;
      seen.add(k); result.push(item);
    }
    if (!save(result)) throw Error('Impossibile salvare nel browser');
    return result.length;
  }
  window.BoboLibrary = Object.freeze({read,has,toggle,exportText,importText,key});
}());