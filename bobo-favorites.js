/* Bobo's account-free personal lists. Username = browser-local namespace,
 * recovery link/code = explicit portable backup, never remote synchronization.
 */
(function () {
  'use strict';
  const lib=()=>window.BoboLibrary;
  const el=id=>document.getElementById(id);
  const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  let catalog=new Map();
  let loading=false;
  let cacheKey='';
  let msgTimer=null;
  function k(item){return item.type+':'+item.tmdb_id;}
  function current(item){return catalog.get(k(item))||item;}
  function message(s){
    let node=el('bobo-fav-notice');
    if(!node){node=document.createElement('p');node.id='bobo-fav-notice';node.setAttribute('role','status');document.body.appendChild(node);}
    node.textContent=s;
    node.hidden=false;
    clearTimeout(msgTimer);msgTimer=setTimeout(()=>{node.hidden=true;},4800);
  }
  async function loadMetadata(){
    if(loading)return;
    const items=lib().read(),needed=new Set(items.map(k));
    if(!items.length)return;
    loading=true;
    await Promise.all(['movie','tv'].map(async kind=>{
      if(!items.some(x=>x.type===kind))return;
      try{
        const response=await fetch('data/'+(kind==='tv'?'tv':'movies')+'.json');
        if(!response.ok)return;
        const data=await response.json();
        for(const raw of data.items||[]){
          const id=kind+':'+raw.tmdb_id;
          if(needed.has(id))catalog.set(id,{...raw,type:kind});
        }
      }catch(_){}
    }));
    loading=false;render();
  }
  function updateProfiles(){
    const select=el('bobo-profile-picker'),selected=lib().profile();
    const html=lib().profiles().map(n=>'<option value="'+escape(n)+'">'+escape(n)+'</option>').join('');
    if(select.innerHTML!==html)select.innerHTML=html;
    select.value=selected;
  }
  function updateGenres(){
    const select=el('bobo-fav-genre'),current=select.value;
    const genres=new Map();
    lib().read().forEach(item=>currentItemGenres(item).forEach(genre=>genres.set(genre.toLocaleLowerCase('it'),genre)));
    const sorted=Array.from(genres.values()).sort((a,b)=>a.localeCompare(b,'it'));
    select.innerHTML='<option value="all">Tutti i generi</option>'+sorted.map(g=>
      '<option value="'+escape(g.toLocaleLowerCase('it'))+'">'+escape(g)+'</option>').join('');
    select.value=sorted.some(g=>g.toLocaleLowerCase('it')===current)?current:'all';
  }
  function currentItemGenres(item){const enriched=current(item);return enriched.genres||item.genres||[];}
  function filter(){
    let items=lib().read().map(item=>({...item,...current(item),saved_at:item.saved_at}));
    const type=el('bobo-fav-type').value,genre=el('bobo-fav-genre').value,
      q=el('bobo-fav-search').value.trim().toLocaleLowerCase('it'),
      sort=el('bobo-fav-order').value;
    if(type!=='all')items=items.filter(x=>x.type===type);
    if(genre!=='all')items=items.filter(x=>(x.genres||[]).some(g=>g.toLocaleLowerCase('it')===genre));
    if(q)items=items.filter(x=>[x.title,(x.genres||[]).join(' '),x.overview].join(' ').toLocaleLowerCase('it').includes(q));
    if(sort==='title')items.sort((a,b)=>a.title.localeCompare(b.title,'it'));
    else if(sort==='year')items.sort((a,b)=>Number(b.year||0)-Number(a.year||0));
    else items.sort((a,b)=>(b.saved_at||'').localeCompare(a.saved_at||''));
    return items;
  }
  function poster(item){
    const img=/^https:\/\/image\.tmdb\.org\//.test(item.poster||'')
      ?'<img src="'+escape(item.poster)+'" loading="lazy" decoding="async" alt="">':'<span class="bobo-favorites-poster-fallback">BOBO</span>';
    const available=catalog.has(k(item))||!item.title;
    const href='watch.html?type='+encodeURIComponent(item.type)+'&id='+encodeURIComponent(item.tmdb_id);
    return '<article class="bobo-favorites-card">'+
      '<a class="bobo-favorites-card-link" href="'+href+'" aria-label="Apri '+escape(item.title)+'">'+
      '<div class="bobo-favorites-poster">'+img+'<span class="bobo-favorites-type bobo-favorites-type--'+(item.type==='tv'?'tv':'movie')+'">'+
      (item.type==='tv'?'SERIE':'FILM')+'</span></div>'+
      '<strong>'+escape(item.title)+'</strong><small>'+(item.year?escape(item.year):'')+
      (available?'':' · dal tuo archivio')+'</small></a>'+
      '<button type="button" class="bobo-favorites-remove" data-remove="'+item.tmdb_id+'" data-type="'+item.type+
      '" title="Rimuovi dai preferiti" aria-label="Rimuovi '+escape(item.title)+' dai preferiti">♥</button>'+
      '</article>';
  }
  function render(){
    if(!lib())return;
    updateProfiles();
    updateGenres();
    const chosen=filter(),saved=lib().read(),container=el('bobo-fav-collections');
    el('bobo-fav-summary').textContent=saved.length+
      (saved.length===1?' titolo salvato':' titoli salvati')+
      (chosen.length!==saved.length?' · '+chosen.length+' visualizzati':'')+
      ' · '+lib().profile();
    if(!saved.length){
      container.innerHTML='<div class="bobo-fav-empty"><h2>Ancora nessun preferito.</h2>'+
        '<p>Trova qualcosa da guardare e tocca il cuore sulla copertina.</p>'+
        '<a href="index.html">Esplora il catalogo</a></div>';
      return;
    }
    if(!chosen.length){
      container.innerHTML='<div class="bobo-fav-empty"><h2>Nessuna corrispondenza.</h2><p>Prova altri filtri o un titolo diverso.</p></div>';
      return;
    }
    container.innerHTML=['movie','tv'].map(kind=>{
      const items=chosen.filter(x=>x.type===kind);
      if(!items.length)return '';
      return '<section class="bobo-fav-group" aria-label="'+(kind==='tv'?'Serie TV':'Film')+'">'+
        '<div class="bobo-fav-group-heading"><h2>'+(kind==='tv'?'Le tue serie TV':'I tuoi film')+
        '</h2><span>'+items.length+'</span></div>'+
        '<div class="bobo-favorites-grid">'+items.map(poster).join('')+'</div></section>';
    }).join('');
  }
  async function copyShare(){
    const code=lib().recoveryCode();
    const url=new URL('favorites.html',location.href);
    // Fragment is not transmitted in HTTP requests or ordinary Referer headers.
    url.hash='recover='+encodeURIComponent(code);
    // Browser links are fragile above 2000 chars; code and full JSON are safer.
    const output=url.toString().length<=1900?url.toString():code;
    try{await navigator.clipboard.writeText(output);message(output===code?
      'Codice copiato (la raccolta è grande per un link).':'Link di recupero copiato.');}
    catch(_){window.prompt('Copia il link o il codice e conservalo:',output);}
  }
  function restore(raw){
    if(!raw)return;
    try{
      const count=lib().importRecoveryCode(raw);
      catalog=new Map();cacheKey='';updateProfiles();render();loadMetadata();
      message('Recuperati '+count+' titoli nel profilo '+lib().profile());
    }catch(e){message(e.message||'Codice non valido');}
  }
  function events(){
    el('bobo-profile-picker').addEventListener('change',()=>{
      try{lib().switchProfile(el('bobo-profile-picker').value);catalog=new Map();cacheKey='';render();loadMetadata();}
      catch(e){message(e.message);}
    });
    el('bobo-profile-new').addEventListener('click',()=>{
      const proposed=window.prompt('Nome della nuova raccolta (solo su questo browser):','');
      if(proposed===null)return;
      try{lib().switchProfile(proposed);catalog=new Map();cacheKey='';render();loadMetadata();
        message('Raccolta "'+lib().profile()+'" pronta.');}
      catch(e){message(e.message);}
    });
    ['bobo-fav-type','bobo-fav-genre','bobo-fav-order'].forEach(id=>el(id).addEventListener('change',render));
    el('bobo-fav-search').addEventListener('input',render);
    el('bobo-fav-collections').addEventListener('click',event=>{
      const button=event.target.closest('[data-remove]');
      if(!button)return;
      lib().toggle({type:button.dataset.type,tmdb_id:button.dataset.remove,
        title:lib().read().find(x=>String(x.tmdb_id)===button.dataset.remove&&x.type===button.dataset.type)?.title});
      render();message('Tolto dai preferiti');
    });
    el('bobo-export').addEventListener('click',()=>{
      const blob=new Blob([lib().exportText()],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='bobo-'+lib().profile().replace(/[^\w-]/g,'_')+'-preferiti.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    el('bobo-import').addEventListener('click',()=>el('bobo-import-file').click());
    el('bobo-import-file').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{
        if(file.size>500000)throw Error('File troppo grande');
        const value=await file.text(),obj=JSON.parse(value);
        if(obj.profile&&obj.profile!==lib().profile()&&
          window.confirm('Il backup appartiene a "'+obj.profile+'". Vuoi usare quel nome di raccolta?'))
            lib().switchProfile(obj.profile);
        const count=lib().importText(value);
        catalog=new Map();render();loadMetadata();
        message(count+' preferiti importati');
      }catch(e){message(e.message);}
      event.target.value='';
    });
    el('bobo-share').addEventListener('click',copyShare);
    el('bobo-recover').addEventListener('click',()=>{
      const code=window.prompt('Incolla qui il codice di recupero o il link Bobo:');
      if(code)restore(code);
    });
  }
  function start(){
    events();render();loadMetadata();
    const code=new URLSearchParams(location.hash.slice(1)).get('recover');
    if(code){
      history.replaceState(null,'','favorites.html');
      if(window.confirm('È stato aperto un link di recupero. Vuoi importare questa raccolta di preferiti?'))restore(code);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}());