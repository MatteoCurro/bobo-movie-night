/* BOBO / friends' collection enhancements.
 * Local favorites, current streaming-platform labels and one compact library shelf.
 * No accounts, paid APIs, tracking or changes to third-party player embeds.
 */
(function () {
  'use strict';
  let sourceMap = new Map();
  const PROVIDERS = {
    netflix:{name:'Netflix',label:'NETFLIX'},
    prime:{name:'Prime Video',label:'prime'},
    disney:{name:'Disney+',label:'Disney+'},
    apple:{name:'Apple TV+',label:'Apple TV+'}
  };
  let syncScheduled = false;
  const byId = name => document.getElementById(name);
  const lib = () => window.BoboLibrary;
  const key = (kind,id) => kind+':'+String(id);
  const safe = text => String(text == null?'':text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function currentItem(kind,id) {
    try {
      if (typeof catalogs !== 'undefined' && catalogs && catalogs[kind]) {
        const result = catalogs[kind].find(x=>String(x.tmdb_id)===String(id));
        if(result)return result;
      }
    } catch (_) {}
    try {
      const stored = JSON.parse(sessionStorage.getItem('bobo_selected_title') || 'null');
      if(stored && stored.type===kind && String(stored.tmdb_id)===String(id)) return stored;
    } catch (_) {}
    if(byId('watch-title') && new URLSearchParams(location.search).get('id')===String(id)) {
      return {
        type:kind,tmdb_id:id,title:byId('watch-title').textContent || '',
        overview:byId('watch-overview')?.textContent || '',
        backdrop:byId('watch-backdrop')?.querySelector('img')?.src || '',
        year:Number((byId('watch-meta')?.textContent || '').match(/\b(19|20)\d{2}\b/)?.[0] || 0)
      };
    }
    return lib()?.read().find(x=>key(x.type,x.tmdb_id)===key(kind,id)) || null;
  }
  function labels(kind,id) {
    return sourceMap.get(key(kind,id)) || [];
  }
  function badgeNode(kind,id) {
    const providers=labels(kind,id);
    if(!providers.length)return null;
    const el=document.createElement('span');
    el.className='bobo-source-tags';
    el.setAttribute('aria-label','Segnalato disponibile in Italia su '+providers.map(p=>PROVIDERS[p]?.name || p).join(', '));
    providers.slice(0,3).forEach(p=>{
      const value=PROVIDERS[p];if(!value)return;
      const child=document.createElement('span');
      child.className='bobo-platform bobo-platform--'+p;
      child.title='Disponibilità italiana segnalata per '+value.name+'; non è il provider del player';
      child.textContent=value.label;
      el.appendChild(child);
    });
    if(providers.length>3) {
      const rest=document.createElement('span');
      rest.className='bobo-platform-more';
      rest.textContent='+'+(providers.length-3);
      el.appendChild(rest);
    }
    return el;
  }
  function renderPlatform(element,kind,id,where) {
    const state=labels(kind,id).join(',');
    if(element.dataset.boboPlatformState===state)return;
    element.dataset.boboPlatformState=state;
    const previous=where==='after' && element.nextElementSibling?.classList.contains('bobo-source-tags')
      ? element.nextElementSibling : element.querySelector('.bobo-source-tags');
    if(previous)previous.remove();
    const label=badgeNode(kind,id);
    if(!label)return;
    if(where==='after')element.insertAdjacentElement('afterend',label);
    else element.appendChild(label);
  }

  function favoriteButton(kind,id,extra='') {
    const active=Boolean(lib()?.has(kind,id));
    const button=document.createElement('button');
    button.type='button';button.className='bobo-save '+extra;
    button.dataset.boboSave=id;
    button.dataset.boboSaveType=kind;
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'Rimuovi dai preferiti':'Aggiungi ai preferiti');
    button.title=active?'Rimuovi dai preferiti':'Salva nei preferiti';
    button.textContent=active?'♥':'♡';
    return button;
  }
  function updateButtons() {
    document.querySelectorAll('[data-bobo-save]').forEach(button=>{
      const active=Boolean(lib()?.has(button.dataset.boboSaveType,button.dataset.boboSave));
      const wanted=active?'♥':'♡';
      if(button.textContent!==wanted)button.textContent=wanted;
      if(button.getAttribute('aria-pressed')!==String(active))button.setAttribute('aria-pressed',String(active));
      button.title=active?'Rimuovi dai preferiti':'Salva nei preferiti';
      button.setAttribute('aria-label',button.title);
    });
    const badge=byId('bobo-fav-count');
    if(badge) {
      const value=String(lib()?.read().length || 0);
      if(badge.textContent!==value)badge.textContent=value;
    }
  }

  function decorateCards() {
    const selector='.bobo-tile[data-bobo-id], .bobo-result[data-bobo-id]';
    document.querySelectorAll(selector).forEach(button=>{
      const kind=button.dataset.boboType,id=button.dataset.boboId;
      if(!kind||!id)return;
      button.dataset.boboVisualType=kind;
      renderPlatform(button,kind,id,'append');
      if(button.parentElement?.classList.contains('bobo-item-wrap'))return;
      const parent=button.parentElement;
      if(!parent)return;
      const wrap=document.createElement('div');
      wrap.className='bobo-item-wrap'+(button.classList.contains('bobo-result')?' bobo-result-wrap':'');
      parent.insertBefore(wrap,button);
      wrap.appendChild(button);
      wrap.appendChild(favoriteButton(kind,id,'bobo-save-corner'));
    });
  }

  function decorateHero() {
    const hero=document.querySelector('.bobo-feature');
    if(hero) {
      const play=hero.querySelector('[data-bobo-play]');
      if(play) {
        const kind=play.dataset.boboType,id=play.dataset.boboPlay;
        const meta=hero.querySelector('.bobo-feature-meta');
        if(meta)renderPlatform(meta,kind,id,'after');
        const acts=hero.querySelector('.bobo-feature-actions');
        if(acts && !acts.querySelector('[data-bobo-save]'))acts.appendChild(favoriteButton(kind,id,'bobo-save-hero'));
        const genre=hero.querySelector('.bobo-kind');if(genre)genre.dataset.boboVisualType=kind;
      }
    }
    const modal=document.querySelector('#bobo-details .bobo-detail-box');
    if(modal) {
      const play=modal.querySelector('[data-bobo-play]');
      if(play) {
        const kind=play.dataset.boboType,id=play.dataset.boboPlay;
        const meta=modal.querySelector('.bobo-detail-meta');
        if(meta)renderPlatform(meta,kind,id,'after');
        const acts=modal.querySelector('.bobo-detail-actions');
        if(acts && !acts.querySelector('[data-bobo-save]'))acts.appendChild(favoriteButton(kind,id,'bobo-save-hero'));
      }
    }
  }
  function decorateWatch() {
    const title=byId('watch-title');
    if(!title || !title.textContent)return;
    const params=new URLSearchParams(location.search);
    const kind=params.get('type'),id=params.get('id');
    if(!['movie','tv'].includes(kind)||!/^\d+$/.test(id||''))return;
    const meta=byId('watch-meta');
    if(meta)renderPlatform(meta,kind,id,'after');
    const acts=document.querySelector('.hero-actions');
    if(acts && !acts.querySelector('[data-bobo-save]'))acts.appendChild(favoriteButton(kind,id,'bobo-save-watch'));
    const k=byId('watch-kind');
    if(k)k.dataset.boboVisualType=kind;
  }

  function favoritesHTML() {
    const saved=lib()?.read() || [];
    return saved.map(item=>{
      const actual=currentItem(item.type,item.tmdb_id) || item;
      const available=Boolean((typeof catalogs!=='undefined') && catalogs && catalogs[item.type]?.some(x=>String(x.tmdb_id)===String(item.tmdb_id)));
      const html='<span class="bobo-fav-poster">'+
        (item.poster?'<img src="'+safe(item.poster)+'" alt="" loading="lazy" decoding="async">':'<span class="bobo-fav-fallback">BOBO</span>')+
        '<span class="bobo-fav-kind" data-bobo-visual-type="'+item.type+'">'+(item.type==='tv'?'Serie':'Film')+'</span></span>'+
        '<strong>'+safe(actual.title || item.title)+'</strong>'+
        '<small>'+(item.year?safe(item.year):'')+(available?'':' · Archiviato')+'</small>';
      return '<div class="bobo-favorite-item">'+
        (available?'<button type="button" class="bobo-fav-open" data-bobo-id="'+safe(item.tmdb_id)+'" data-bobo-type="'+item.type+'">'+html+'</button>':
          '<div class="bobo-fav-open bobo-fav-inactive" title="Il titolo non è nel catalogo corrente">'+html+'</div>')+
        '<button type="button" class="bobo-fav-remove" data-bobo-save="'+safe(item.tmdb_id)+'" data-bobo-save-type="'+item.type+'" aria-label="Rimuovi '+safe(item.title)+' dai preferiti">×</button></div>';
    }).join('');
  }
  let lastShelfSignature='';
  function favoritesShelf() {
    const host=byId('bobo-discover');
    const feature=host?.querySelector('.bobo-feature');
    if(!host || !feature)return;
    let shelf=byId('bobo-favorites');
    if(!shelf) {
      shelf=document.createElement('section');
      shelf.id='bobo-favorites';
      shelf.className='bobo-favorite-shelf';
      feature.insertAdjacentElement('afterend',shelf);
      lastShelfSignature='';
    }
    const saved=lib()?.read() || [];
    const catalogReady=typeof catalogs!=='undefined' && catalogs &&
      (catalogs.movie?.length || catalogs.tv?.length);
    const signature=saved.map(x=>key(x.type,x.tmdb_id)+':'+x.title).join('|')+':'+catalogReady;
    if(signature===lastShelfSignature)return;
    lastShelfSignature=signature;
    shelf.innerHTML='<div class="bobo-favorite-head"><div><span>IL TUO SPAZIO / 001</span>'+
      '<h2>♡ I tuoi preferiti <small>'+saved.length+'</small></h2></div>'+
      '<div class="bobo-favorite-actions"><button type="button" data-bobo-export title="Salva i preferiti in un file">Esporta</button>'+
      '<button type="button" data-bobo-import title="Importa i preferiti da un file">Importa</button></div></div>'+
      (saved.length?'<div class="bobo-favorite-rail">'+favoritesHTML()+'</div>':
        '<p>La prossima serata inizia qui. Premi ♡ su un film o una serie per salvarli, anche per le prossime settimane.</p>')+
      '<input id="bobo-favorites-file" type="file" accept="application/json,.json" hidden>';
  }

  function nav() {
    const header=document.querySelector('header');
    if(!header || header.querySelector('.bobo-library-nav'))return;
    const link=document.createElement('a');
    link.className='bobo-library-nav';
    link.href=location.pathname.endsWith('/watch.html')?'index.html#bobo-favorites':'#bobo-favorites';
    link.innerHTML='♡ <span>Preferiti</span> <b id="bobo-fav-count">0</b>';
    const settings=header.querySelector('#bobo-settings-open,.settings-trigger');
    if(settings)header.insertBefore(link,settings);
    else header.appendChild(link);
  }
  function message(text) {
    let toast=byId('bobo-library-notice');
    if(!toast){toast=document.createElement('div');toast.id='bobo-library-notice';toast.setAttribute('role','status');document.body.appendChild(toast);}
    toast.textContent=text;
    toast.hidden=false;
    clearTimeout(message.timer);
    message.timer=setTimeout(()=>{toast.hidden=true;},3900);
  }

  function sync() {
    syncScheduled=false;
    if(!document.body)return;
    nav();
    decorateCards();
    decorateHero();
    decorateWatch();
    favoritesShelf();
    updateButtons();
    if(location.hash==='#bobo-favorites' && byId('bobo-favorites') && !sync.didScroll) {
      sync.didScroll=true;
      byId('bobo-favorites').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  function schedule() {
    if(syncScheduled)return;
    syncScheduled=true;
    requestAnimationFrame(sync);
  }
  async function sourceFeed() {
    try {
      const res=await fetch('data/discovery.json',{cache:'no-store'});
      if(!res.ok)return;
      const data=await res.json();
      const map=new Map();
      (data.streaming?.platforms || []).forEach(platform=>{
        if(!PROVIDERS[platform.id])return;
        (platform.items || []).forEach(item=>{
          if(!item || !['movie','tv'].includes(item.type))return;
          const k=key(item.type,item.tmdb_id);
          if(!map.has(k))map.set(k,[]);
          if(!map.get(k).includes(platform.id))map.get(k).push(platform.id);
        });
      });
      sourceMap=map;
      schedule();
    }catch(_){}
  }
  function run() {
    document.addEventListener('click',async event=>{
      const t=event.target.closest?.('[data-bobo-save]');
      if(t) {
        event.preventDefault();event.stopPropagation();
        const kind=t.dataset.boboSaveType,id=t.dataset.boboSave;
        const item=currentItem(kind,id);
        if(!item){message('Informazioni sul titolo non disponibili');return;}
        const changed=lib()?.toggle(Object.assign({},item,{type:kind,tmdb_id:id}));
        if(changed?.error)message(changed.error);
        else message(changed?.saved?'♥ Aggiunto ai preferiti':'Rimosso dai preferiti');
        lastShelfSignature='';
        schedule();return;
      }
      if(event.target.closest?.('[data-bobo-export]')) {
        const contents=lib()?.exportText();
        if(!contents)return;
        const blob=new Blob([contents],{type:'application/json;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;a.download='bobo-preferiti.json';document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        message('Backup preferiti esportato');return;
      }
      if(event.target.closest?.('[data-bobo-import]')) {
        byId('bobo-favorites-file')?.click();return;
      }
    },true);
    document.addEventListener('change',async event=>{
      if(event.target?.id!=='bobo-favorites-file')return;
      try {
        const file=event.target.files?.[0];
        if(!file)return;
        if(file.size>500000)throw Error('Il file è troppo grande');
        const number=lib().importText(await file.text());
        lastShelfSignature='';schedule();
        message('Preferiti importati: '+number);
      }catch(err){message('Importazione non riuscita: '+err.message);}
      event.target.value='';
    });
    window.addEventListener('bobo:favorites-change',()=>{lastShelfSignature='';schedule();});
    window.addEventListener('hashchange',()=>{sync.didScroll=false;schedule();});
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    sourceFeed();
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
}());