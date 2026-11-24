/* Bobo Movie Night discovery UI. Keeps the original CasaFlix player and catalogs. */
(function () {
  'use strict';
  const PAGE_SIZE = 60;
  const currentYear = new Date().getFullYear();
  let lastResults = [];
  let shown = PAGE_SIZE;
  let currentDetail = null;
  let renderedKey = '';
  let previousFocus = null;

  const originalRenderGrid = window.renderGrid;
  const originalRenderCurrentTab = window.renderCurrentTab;
  const originalOnSearch = window.onSearch;

  function safeImage(value) {
    return typeof value === 'string' && /^https:\/\/image\.tmdb\.org\//.test(value) ? value : '';
  }
  function text(value) { return escH(String(value == null ? '' : value)); }
  function typeName(kind) { return kind === 'tv' ? 'Serie TV' : 'Film'; }
  function isHome() {
    const f = filters[activeTab] || {};
    return !f.q && !f.genre && !f.year && (!f.sort || f.sort === 'year_desc');
  }
  function validItems(items) { return items.filter(function(x) { return x && x.title && x.poster; }); }
  function quality(items) {
    return validItems(items).filter(function(x) { return Number(x.vote) >= 6.0; })
      .sort(function(a,b) { return (Number(b.vote)||0)-(Number(a.vote)||0) || (b.year||0)-(a.year||0); });
  }
  function recent(items) {
    return validItems(items).filter(function(x) { return Number(x.year) >= currentYear-2 && Number(x.year) <= currentYear+1; })
      .sort(function(a,b) { return (b.year||0)-(a.year||0) || (Number(b.vote)||0)-(Number(a.vote)||0); });
  }
  function featured(items) {
    const candidates = validItems(items).filter(function(x) { return x.backdrop && x.overview && (x.year||0)>=currentYear-3 && (x.year||0)<=currentYear+1 && (x.vote||0)>=6.3; });
    candidates.sort(function(a,b) {
      const score = function(x) { return (Number(x.vote)||0)*2 + (Number(x.year)||0-currentYear)*1.6; };
      return score(b)-score(a);
    });
    return candidates[0] || validItems(items).find(function(x) { return x.backdrop && x.overview; }) || null;
  }
  function genresMatch(item, keywords) {
    return (item.genres || []).some(function(g) {
      const label = String(g).toLocaleLowerCase('it');
      return keywords.some(function(k) { return label.includes(k); });
    });
  }
  function getItem(id,kind) {
    return (catalogs[kind]||[]).find(function(x) { return String(x.tmdb_id) === String(id); });
  }
  function meta(item) {
    let bits = [];
    if (item.year) bits.push('<span>'+text(item.year)+'</span>');
    if (item.vote) bits.push('<span class="bobo-rating">★ '+text(Number(item.vote).toFixed(1))+'</span>');
    if (item.runtime) bits.push('<span>'+text(item.runtime)+' min</span>');
    bits.push('<span>'+typeName(item.type)+'</span>');
    return bits.join('<span aria-hidden="true">•</span>');
  }
  function posterTile(item) {
    const image = safeImage(item.poster);
    const art = image ? '<img src="'+text(image)+'" loading="lazy" alt="" decoding="async">' :
      '<span class="bobo-fallback">'+text(item.title)+'</span>';
    return '<button type="button" class="bobo-tile" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'" aria-label="Dettagli: '+text(item.title)+'">'+
      '<span class="bobo-tile-art">'+art+'</span>'+
      '<span class="bobo-tile-title">'+text(item.title)+'</span>'+
      '<span class="bobo-tile-meta">'+text(item.year||'')+(item.vote?' · ★ '+text(Number(item.vote).toFixed(1)):'')+'</span></button>';
  }
  function shelf(id, title, items) {
    const list = items.slice(0, 16);
    if (list.length < 4) return '';
    return '<section class="bobo-shelf" aria-label="'+text(title)+'">'+
      '<div class="bobo-shelf-head"><h2>'+text(title)+'</h2><div class="bobo-shelf-nav">'+
      '<button class="bobo-arrow" type="button" data-bobo-scroll="'+text(id)+'" data-direction="-1" aria-label="Scorri a sinistra">‹</button>'+
      '<button class="bobo-arrow" type="button" data-bobo-scroll="'+text(id)+'" data-direction="1" aria-label="Scorri a destra">›</button></div></div>'+
      '<div class="bobo-rail" id="bobo-rail-'+text(id)+'">'+list.map(posterTile).join('')+'</div></section>';
  }
  function hero(item) {
    if (!item) return '';
    const image = safeImage(item.backdrop);
    const img = image ? '<img src="'+text(image)+'" alt="" fetchpriority="high" decoding="async">' : '';
    return '<section class="bobo-feature" aria-label="In primo piano">'+img+
      '<div class="bobo-feature-body"><div class="bobo-eyebrow">Bobo Movie Night · In primo piano</div>'+
      '<h1>'+text(item.title)+'</h1><div class="bobo-feature-meta">'+meta(item)+'</div>'+
      '<p class="bobo-feature-description">'+text(item.overview||'Scopri il titolo e tutti i dettagli.')+'</p>'+
      '<div class="bobo-feature-actions"><button type="button" class="bobo-btn bobo-btn-primary" data-bobo-play="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">▶ Riproduci</button>'+
      '<button type="button" class="bobo-btn bobo-btn-secondary" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">ⓘ Dettagli</button></div></div></section>';
  }
  function renderHome() {
    const all = catalogs[activeTab] || [];
    const host = document.getElementById('bobo-discover');
    if (!host || !all.length) return;
    const key = activeTab + ':' + all.length;
    if (renderedKey === key) return;
    renderedKey = key;
    const good = quality(all);
    const fresh = recent(all);
    const promoted = validItems(all).filter(function(x) { return x.overview && x.year >= currentYear-3; })
      .sort(function(a,b) { return ((b.vote||0)*1.4+(b.year||0)*.6)-((a.vote||0)*1.4+(a.year||0)*.6); });
    const rails = [
      shelf('highlights','In evidenza',promoted),
      shelf('new','Le novità',fresh),
      shelf('rated','I più apprezzati',good)
    ];
    const genreRows = [
      ['action','Azione e avventura',['azione','avventura']],
      ['thriller','Thriller e mistero',['thriller','mistero','crime','giallo']],
      ['comedy','Commedie',['commedia']],
      ['sci-fi','Fantascienza e fantasy',['fantascienza','fantasy']],
      ['drama','Storie drammatiche',['dramma']],
      ['animation','Animazione',['animazione']]
    ];
    genreRows.forEach(function(row) {
      const picks = good.filter(function(x) { return genresMatch(x,row[2]); });
      rails.push(shelf(row[0],row[1],picks));
    });
    host.innerHTML = hero(featured(all))+rails.join('');
  }
  function renderResults() {
    const more = document.getElementById('bobo-more');
    if (isHome()) {
      const grid = document.getElementById('grid');
      if (grid) grid.innerHTML = '';
      more.hidden = true;
      return;
    }
    originalRenderGrid(lastResults.slice(0,shown));
    document.getElementById('section-count').textContent = lastResults.length + ' titoli';
    more.hidden = shown >= lastResults.length;
    if (!more.hidden) more.textContent = 'Carica altri (' + Math.min(PAGE_SIZE,lastResults.length-shown) + ')';
  }
  function update() {
    const host = document.getElementById('bobo-discover');
    if (!host) return;
    const ready = loaded[activeTab];
    const home = isHome();
    const showHome = home && ready;
    host.hidden = !home;
    document.querySelector('.section-header').hidden = showHome;
    document.getElementById('grid').hidden = showHome;
    const more = document.getElementById('bobo-more');
    if (home) {
      more.hidden = true;
      if (ready) renderHome();
      else host.innerHTML='<p class="bobo-wait">Caricamento catalogo…</p>';
    } else {
      host.hidden = true;
      if (!ready) more.hidden = true;
    }
  }
  function detail(item) {
    if (!item) return;
    currentDetail = item;
    previousFocus = document.activeElement;
    const modal = document.getElementById('bobo-details');
    const image = safeImage(item.backdrop) || safeImage(item.poster);
    const intro = image ? '<img src="'+text(image)+'" alt="" loading="lazy">' : '';
    const genres = (item.genres||[]).join(' · ');
    modal.innerHTML = '<article class="bobo-detail-box" role="dialog" aria-modal="true" aria-label="Dettagli: '+text(item.title)+'">'+
      '<div class="bobo-detail-image">'+intro+'</div>'+
      '<button type="button" class="bobo-detail-close" data-bobo-close aria-label="Chiudi dettagli">×</button>'+
      '<div class="bobo-detail-content"><h2>'+text(item.title)+'</h2>'+
      '<div class="bobo-detail-meta">'+meta(item)+'</div>'+
      '<p class="bobo-genres">'+text(genres)+'</p>'+
      '<p class="bobo-detail-copy">'+text(item.overview || 'Trama non disponibile nel catalogo.')+'</p>'+
      '<div class="bobo-detail-actions"><button type="button" class="bobo-btn bobo-btn-primary" data-bobo-play="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">'+
      (item.type === 'tv'?'▶ Scegli episodio':'▶ Riproduci')+'</button>'+
      '<button type="button" class="bobo-btn bobo-btn-secondary" data-bobo-close>Chiudi</button></div></div></article>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const close = modal.querySelector('.bobo-detail-close');
    if (close) close.focus();
  }
  function closeDetail() {
    const modal = document.getElementById('bobo-details');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.innerHTML = '';
    currentDetail = null;
    document.body.style.overflow = '';
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  function play(id,kind) {
    const item = getItem(id,kind);
    if (!item) return;
    closeDetail();
    if (kind === 'tv') openEpModal(item);
    else openPlayer({ kind:'movie', tmdbId:item.tmdb_id, title:item.title });
  }
  function init() {
    const main = document.querySelector('main');
    if (!main || document.getElementById('bobo-discover')) return;
    main.insertAdjacentHTML('afterbegin','<div id="bobo-discover"></div>');
    main.insertAdjacentHTML('beforeend','<button id="bobo-more" type="button" hidden>Carica altri</button>');
    document.body.insertAdjacentHTML('beforeend','<div id="bobo-details" hidden></div>');

    document.getElementById('bobo-more').addEventListener('click', function () {
      shown += PAGE_SIZE;
      renderResults();
    });
    document.addEventListener('click', function(evt) {
      const target = evt.target;
      if (!target || typeof target.closest !== 'function') return;
      const closed = target.closest('[data-bobo-close]');
      if (closed || (target.id === 'bobo-details')) { closeDetail(); return; }
      const scrolling = target.closest('[data-bobo-scroll]');
      if (scrolling) {
        const rail = document.getElementById('bobo-rail-'+scrolling.getAttribute('data-bobo-scroll'));
        if (rail) rail.scrollBy({left: (Number(scrolling.dataset.direction)||1)*rail.clientWidth*.85,behavior:'smooth'});
        return;
      }
      const playing = target.closest('[data-bobo-play]');
      if (playing) { play(playing.dataset.boboPlay,playing.dataset.boboType); return; }
      const opening = target.closest('[data-bobo-id]');
      if (opening) { detail(getItem(opening.dataset.boboId,opening.dataset.boboType)); }
    });
    document.addEventListener('keydown',function(evt) {
      if (evt.key === 'Escape') closeDetail();
    });
    update();
  }

  window.renderGrid = function(items) {
    lastResults = items;
    shown = PAGE_SIZE;
    renderResults();
  };
  window.renderCurrentTab = function() {
    originalRenderCurrentTab();
    update();
  };
  window.onSearch = function(evt) {
    originalOnSearch(evt);
    update();
  };
  window.onCardClick = function(id,kind) {
    detail(getItem(id,kind));
  };
  const originalSwitchTab = window.switchTab;
  window.switchTab = function(kind) {
    renderedKey = '';
    originalSwitchTab(kind);
    update();
  };
  document.addEventListener('DOMContentLoaded',init);
})();
