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
  let discovery = null;
  let featuredFromFeed = null;
  async function loadDiscovery() {
    try {
      const response = await fetch('data/discovery.json',{cache:'no-store'});
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload || payload.schema !== 1 || payload.region !== 'IT') return;
      discovery = payload;
      renderedKey = '';
      if (ready() && isHome()) renderHome();
    } catch (_) { /* Optional feed: normal category browsing remains available. */ }
  }
  function resolveDiscovery(entries) {
    if (!Array.isArray(entries)) return [];
    const result = [], seen = new Set();
    entries.forEach(function(row) {
      if (!row || !['movie','tv'].includes(row.type)) return;
      const target = getItem(row.tmdb_id,row.type);
      const key = row.type+':'+row.tmdb_id;
      if (target && !seen.has(key)) { result.push(target); seen.add(key); }
    });
    return result;
  }

  const unifiedFilters = { q: '', genre: '', year: '', sort: 'year_desc', type: 'all' };
  function allItems() {
    return (catalogs.movie || []).concat(catalogs.tv || []);
  }
  function ready() { return loaded.movie && loaded.tv; }
  function seasonSummary(item) {
    if (item.type !== 'tv') return '';
    const seasons = (item.seasons || []).filter(function(s) { return Number(s.n) > 0 && Number(s.episodes) > 0; });
    const episodes = seasons.reduce(function(total,season) { return total + Number(season.episodes || 0); }, 0);
    return seasons.length + (seasons.length === 1 ? ' stagione' : ' stagioni') +
      (episodes ? ' · ' + episodes + (episodes === 1 ? ' episodio' : ' episodi') : '');
  }
  function typeTag(item) { return item.type === 'tv' ? 'Serie TV' : 'Film'; }
  function applyUnifiedFilters(items) {
    const f = unifiedFilters;
    const query = f.q.toLocaleLowerCase('it');
    let out = items.filter(function(item) {
      if (f.type !== 'all' && item.type !== f.type) return false;
      if (f.genre && !(item.genres || []).includes(f.genre)) return false;
      if (f.year && Number(item.year) !== Number(f.year)) return false;
      if (query && !(String(item.title || '').toLocaleLowerCase('it').includes(query))) return false;
      return true;
    });
    const sorters = {
      year_desc: (a,b) => (b.year||0)-(a.year||0) || (b.vote||0)-(a.vote||0),
      year_asc: (a,b) => (a.year||0)-(b.year||0),
      vote_desc: (a,b) => (b.vote||0)-(a.vote||0),
      vote_asc: (a,b) => (a.vote||0)-(b.vote||0)
    };
    return out.sort(sorters[f.sort] || sorters.year_desc);
  }
  function filterOptions() {
    if (!ready()) return;
    const list = allItems();
    const genre = [...new Set(list.flatMap(function(item) { return item.genres || []; }).filter(Boolean))]
      .sort(function(a,b) { return a.localeCompare(b,'it'); });
    const years = [...new Set(list.map(function(item) { return item.year; }).filter(Boolean))]
      .sort(function(a,b) { return b-a; });
    const genreSelect = document.getElementById('filter-genre');
    genreSelect.innerHTML = '<option value="">Tutti i generi</option>' +
      genre.map(function(value) { return '<option value="'+text(value)+'">'+text(value)+'</option>'; }).join('');
    genreSelect.value = genre.includes(unifiedFilters.genre) ? unifiedFilters.genre : '';
    const yearSelect = document.getElementById('filter-year');
    yearSelect.innerHTML = '<option value="">Tutti gli anni</option>' +
      years.map(function(value) { return '<option value="'+text(value)+'">'+text(value)+'</option>'; }).join('');
    yearSelect.value = years.includes(Number(unifiedFilters.year)) ? unifiedFilters.year : '';
    document.getElementById('filter-sort').value = unifiedFilters.sort;
    document.getElementById('bobo-type-filter').value = unifiedFilters.type;
    document.getElementById('filter-bar').classList.remove('disabled');
  }
  function renderUnified() {
    update();
    if (!ready()) return;
    if (isHome()) return;
    lastResults = applyUnifiedFilters(allItems());
    shown = PAGE_SIZE;
    document.getElementById('section-title').textContent = unifiedFilters.q
      ? 'Risultati per "'+unifiedFilters.q+'"' : 'Esplora il catalogo';
    renderResults();
  }

  function safeImage(value) {
    return typeof value === 'string' && /^https:\/\/image\.tmdb\.org\//.test(value) ? value : '';
  }
  function text(value) { return escH(String(value == null ? '' : value)); }
  function typeName(kind) { return kind === 'tv' ? 'Serie TV' : 'Film'; }
  function isHome() {
    const f = unifiedFilters;
    return !f.q && !f.genre && !f.year && f.type === 'all' && f.sort === 'year_desc';
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
    bits.push('<span class="bobo-kind">'+typeTag(item)+'</span>');
    if (item.type === 'tv') bits.push('<span>'+text(seasonSummary(item))+'</span>');
    return bits.join('<span aria-hidden="true">•</span>');
  }
  function posterTile(item) {
    const image = safeImage(item.poster);
    const art = image ? '<img src="'+text(image)+'" loading="lazy" alt="" decoding="async">' :
      '<span class="bobo-fallback">'+text(item.title)+'</span>';
    return '<button type="button" class="bobo-tile" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'" aria-label="Dettagli: '+text(item.title)+'">'+
      '<span class="bobo-tile-art">'+art+'<span class="bobo-tile-tag">'+typeTag(item)+'</span></span>'+
      '<span class="bobo-tile-title">'+text(item.title)+'</span>'+
      '<span class="bobo-tile-meta">'+text(item.type === 'tv' ? seasonSummary(item) : (item.year||''))+
      (item.vote ? ' · ★ '+text(Number(item.vote).toFixed(1)) : '')+'</span></button>';
  }
  function shelf(id, title, items, subtitle) {
    const list = items.slice(0, 16);
    if (list.length < 4) return '';
    return '<section class="bobo-shelf" aria-label="'+text(title)+'">'+
      '<div class="bobo-shelf-head"><h2>'+text(title)+'</h2>'+
      (subtitle ? '<small class="bobo-shelf-source">'+text(subtitle)+'</small>' : '')+
      '<div class="bobo-shelf-nav">'+
      '<button class="bobo-arrow" type="button" data-bobo-scroll="'+text(id)+'" data-direction="-1" aria-label="Scorri a sinistra">‹</button>'+
      '<button class="bobo-arrow" type="button" data-bobo-scroll="'+text(id)+'" data-direction="1" aria-label="Scorri a destra">›</button></div></div>'+
      '<div class="bobo-rail" id="bobo-rail-'+text(id)+'">'+list.map(posterTile).join('')+'</div></section>';
  }
  function chooseFeedFeature() {
    if (!discovery || !discovery.streaming) return null;
    const stream = discovery.streaming;
    const candidates = resolveDiscovery(stream.items || []);
    (stream.platforms || []).forEach(function(platform) {
      candidates.push.apply(candidates,resolveDiscovery(platform.items || []));
    });
    const unique = new Map();
    candidates.forEach(function(item) {
      if (item && item.backdrop && item.overview && Number(item.vote || 0) >= 5) {
        unique.set(item.type+':'+item.tmdb_id,item);
      }
    });
    const options = Array.from(unique.values());
    if (!options.length) return null;
    if (featuredFromFeed && options.some(function(item) {
      return item.type === featuredFromFeed.type &&
        String(item.tmdb_id) === String(featuredFromFeed.tmdb_id);
    })) return featuredFromFeed;
    let last = '';
    try { last = localStorage.getItem('bobo_last_feed_hero') || ''; } catch (_) {}
    const pool = options.length > 1 ? options.filter(function(item) {
      return item.type+':'+item.tmdb_id !== last;
    }) : options;
    const selection = pool[Math.floor(Math.random()*pool.length)] || options[0];
    featuredFromFeed = selection;
    try { localStorage.setItem('bobo_last_feed_hero',selection.type+':'+selection.tmdb_id); } catch (_) {}
    return selection;
  }
  function shuffleFeedFeature() {
    if (!discovery || !discovery.streaming) return;
    featuredFromFeed = null;
    renderedKey = '';
    renderHome();
  }
  function hero(item,isFeed) {
    if (!item) return '';
    const image = safeImage(item.backdrop);
    const img = image ? '<img src="'+text(image)+'" alt="" fetchpriority="high" decoding="async">' : '';
    return '<section class="bobo-feature" aria-label="In primo piano">'+img+
      '<div class="bobo-feature-body"><div class="bobo-eyebrow">'+
      (isFeed ? 'Radar streaming / Novità in Italia' : 'Bobo Movie Night · In primo piano')+'</div>'+
      '<h1>'+text(item.title)+'</h1><div class="bobo-feature-meta">'+meta(item)+'</div>'+
      '<p class="bobo-feature-description">'+text(item.overview||'Scopri il titolo e tutti i dettagli.')+'</p>'+
      '<div class="bobo-feature-actions"><button type="button" class="bobo-btn bobo-btn-primary" data-bobo-play="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">▶ Apri scheda</button>'+
      '<button type="button" class="bobo-btn bobo-btn-secondary" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">ⓘ Dettagli</button>'+
      (isFeed ? '<button type="button" class="bobo-btn bobo-btn-secondary bobo-shuffle" data-bobo-hero-shuffle aria-label="Mostra un altro titolo dalle novità streaming">↻ Un\u0027altra idea</button>' : '')+
      '</div></div></section>';
  }
  function renderHome() {
    const all = allItems();
    const host = document.getElementById('bobo-discover');
    if (!host || !all.length) return;
    const key = 'all:' + catalogs.movie.length + ':' + catalogs.tv.length;
    if (renderedKey === key) return;
    renderedKey = key;
    const good = quality(all);
    const fresh = recent(all);
    const promoted = validItems(all).filter(function(x) { return x.overview && x.year >= currentYear-3; })
      .sort(function(a,b) { return ((b.vote||0)*1.4+(b.year||0)*.6)-((a.vote||0)*1.4+(a.year||0)*.6); });
    const rails = [];
    const stream = discovery && discovery.streaming;
    if (stream) {
      const weekly = resolveDiscovery(stream.items || []);
      const monthly = (stream.platforms || []).filter(function(platform) {
        return platform && platform.id && platform.label &&
          resolveDiscovery(platform.items || []).length >= 4;
      });
      if (weekly.length >= 4 || monthly.length) {
        rails.push('<div class="bobo-feed-group"><span>01 / Streaming radar</span>'+
          '<h2>Appena arrivati, pronti da scoprire.</h2>'+
          '<p>Nuove disponibilità sui servizi italiani, incrociate con i titoli presenti nel nostro catalogo.</p></div>');
      }
      rails.push(shelf('it-weekly','Novità della settimana',
        weekly,'Streaming in Italia · Ultimi 7 giorni'));
      monthly.forEach(function(platform) {
        rails.push(shelf('new-on-'+platform.id,
          'Novità del mese · '+platform.label,
          resolveDiscovery(platform.items),
          'Catalogo italiano · Streamingfilter'));
      });
      const weeklyMovies = weekly.filter(function(item) { return item.type === 'movie'; });
      const weeklySeries = weekly.filter(function(item) { return item.type === 'tv'; });
      rails.push(shelf('weekly-movies','Film appena segnalati',weeklyMovies,
        'Novità sulle piattaforme italiane'));
      rails.push(shelf('weekly-series','Serie appena segnalate',weeklySeries,
        'Novità sulle piattaforme italiane'));
    }
    if (discovery && discovery.source === 'TMDB+JustWatch' && !(stream && stream.platforms && stream.platforms.length)) {
      rails.push(shelf('weekly-trending','Di tendenza questa settimana',
        resolveDiscovery(discovery.trending),'Classifica TMDB · ultimi 7 giorni'));
      (discovery.platforms || []).forEach(function(platform) {
        if (!platform || !platform.id || !platform.label) return;
        rails.push(shelf('it-'+platform.id,
          'Titoli recenti su '+platform.label,
          resolveDiscovery(platform.items),
          'Disponibilità in Italia · TMDB / JustWatch'));
      });
    }
    rails.push('<div class="bobo-feed-group bobo-feed-group-secondary">'+
      '<span>02 / Dal catalogo</span><h2>Qualcosa per stasera.</h2></div>');
    rails.push(
      shelf('highlights','In evidenza',promoted),
      shelf('new','Le uscite recenti',fresh),
      shelf('rated','I più apprezzati',good),
      shelf('movies','Film da scoprire',promoted.filter(function(item) { return item.type === 'movie'; })),
      shelf('series','Serie TV da scoprire',promoted.filter(function(item) { return item.type === 'tv'; })),
      shelf('short','Un film prima di dormire',good.filter(function(item) {
        return item.type === 'movie' && Number(item.runtime) >= 65 && Number(item.runtime) <= 105;
      })),
      shelf('classics','Voglia di anni 2000?',good.filter(function(item) {
        return Number(item.year) >= 1998 && Number(item.year) <= 2009;
      }))
    );
    const genreRows = [
      ['action','Azione e avventura',['azione','avventura']],
      ['thriller','Thriller e mistero',['thriller','mistero','giallo']],
      ['crime','Storie crime',['crime','poliziesco','criminale']],
      ['comedy','Commedie',['commedia']],
      ['scifi','Fantascienza',['fantascienza','science fiction']],
      ['fantasy','Mondi fantastici',['fantasy']],
      ['drama','Storie drammatiche',['dramma']],
      ['animation','Animazione',['animazione']],
      ['horror','Per una serata horror',['horror','orrore']],
      ['romance','Storie d’amore',['romance','romantico','sentimentale']],
      ['docu','Documentari',['documentario']],
      ['family','Da guardare insieme',['famiglia','family']]
    ];
    genreRows.forEach(function(row) {
      const picks = good.filter(function(x) { return genresMatch(x,row[2]); });
      rails.push(shelf(row[0],row[1],picks));
    });
    const feedHero = chooseFeedFeature();
    host.innerHTML = hero(feedHero || featured(all),Boolean(feedHero)) + rails.join('') +
      (discovery && discovery.streaming && discovery.streaming.items && discovery.streaming.items.length ?
        '<p class="bobo-source-note">Novità streaming Italia: selezione basata sulle aggiunte segnalate da '+
        '<a href="https://streamingfilter.com/it/novita" target="_blank" rel="noopener noreferrer">Streamingfilter</a>, '+
        'incrociate con il catalogo Bobo. Non rappresentano disponibilità garantita presso un singolo servizio.</p>' : '')+
      (discovery && discovery.platforms && discovery.platforms.length ?
        '<p class="bobo-source-note">Selezioni delle piattaforme: disponibilità italiana segnalata da TMDB/JustWatch, non data di ingresso nel servizio. Il player esterno è indipendente dalle piattaforme indicate.</p>' : '');
  }
  function renderResults() {
    const more = document.getElementById('bobo-more');
    if (isHome()) {
      const grid = document.getElementById('grid');
      if (grid) grid.innerHTML = '';
      more.hidden = true;
      return;
    }
    const grid = document.getElementById('grid');
    const rows = lastResults.slice(0,shown);
    if (!rows.length) grid.innerHTML = '<div class="state-box"><p>Nessun titolo trovato.</p></div>';
    else grid.innerHTML = rows.map(function(item) {
      const image = safeImage(item.poster);
      const poster = image ? '<img src="'+text(image)+'" loading="lazy" decoding="async" alt="">' : '';
      return '<button type="button" class="bobo-result" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">'+
        '<span class="bobo-result-poster">'+poster+'<span class="bobo-tile-tag">'+typeTag(item)+'</span></span>'+
        '<span class="bobo-result-title">'+text(item.title)+'</span>'+
        '<span class="bobo-result-meta">'+text(item.type === 'tv' ? seasonSummary(item) : (item.year||''))+
        (item.vote ? ' · ★ '+text(Number(item.vote).toFixed(1)) : '')+'</span></button>';
    }).join('');
    document.getElementById('section-count').textContent = lastResults.length + ' titoli';
    more.hidden = shown >= lastResults.length;
    if (!more.hidden) more.textContent = 'Carica altri (' + Math.min(PAGE_SIZE,lastResults.length-shown) + ')';
  }
  function update() {
    const host = document.getElementById('bobo-discover');
    if (!host) return;
    const loadedBoth = ready();
    const home = isHome();
    host.hidden = !home;
    document.querySelector('.section-header').hidden = home;
    document.getElementById('grid').hidden = home;
    const more = document.getElementById('bobo-more');
    if (home) {
      more.hidden = true;
      if (loadedBoth) renderHome();
      else host.innerHTML='<p class="bobo-wait">Caricamento film e serie TV…</p>';
    } else {
      if (!loadedBoth) more.hidden = true;
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
      'ⓘ Vai alla scheda completa'+'</button>'+
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
  function goToPage(item, season, episode) {
    if (!item) return;
    try { sessionStorage.setItem('bobo_selected_title', JSON.stringify(item)); }
    catch (_) { /* A normal fetch on the dedicated page will work without storage. */ }
    const url = new URL('watch.html', location.href);
    url.searchParams.set('type',item.type);
    url.searchParams.set('id',String(item.tmdb_id));
    if (item.type === 'tv' && season && episode) {
      url.searchParams.set('s',String(season));
      url.searchParams.set('e',String(episode));
    }
    location.assign(url.toString());
  }
  function play(id,kind) {
    const item = getItem(id,kind);
    if (!item) return;
    closeDetail();
    goToPage(item);
  }
  function openSettings() {
    const modal = document.getElementById('bobo-settings');
    if (!modal) return;
    const value = localStorage.getItem('bobo_provider_v3') === 'vidsrc' ? 'vidsrc' : 'vix';
    const selected = modal.querySelector('input[value="'+value+'"]');
    if (selected) selected.checked = true;
    const autoToggle = modal.querySelector('#bobo-settings-auto-next');
    const autoLimit = modal.querySelector('#bobo-settings-auto-limit');
    try {
      autoToggle.checked = localStorage.getItem('bobo_auto_next_enabled') !== 'false';
      const value = Number(localStorage.getItem('bobo_auto_next_limit') || 5);
      autoLimit.value = String([2,3,4,5].includes(value) ? value : 5);
    } catch (_) { autoToggle.checked = true; autoLimit.value = '5'; }
    autoLimit.disabled = !autoToggle.checked;
    modal.hidden = false;
    if (selected) selected.focus();
  }
  function closeSettings() {
    const modal = document.getElementById('bobo-settings');
    if (modal) modal.hidden = true;
    const button = document.getElementById('bobo-settings-open');
    if (button) button.focus();
  }
  function initSettings() {
    const toggle = document.querySelector('.provider-toggle');
    if (toggle) toggle.hidden = true;
    const head = document.querySelector('header');
    if (!head) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'bobo-settings-open';
    button.title = 'Impostazioni riproduzione';
    button.setAttribute('aria-label','Impostazioni riproduzione');
    button.textContent = '⚙';
    head.appendChild(button);
    document.body.insertAdjacentHTML('beforeend',
      '<div id="bobo-settings" hidden><div class="bobo-settings-box" role="dialog" aria-modal="true" aria-label="Impostazioni riproduzione">'+
      '<div class="bobo-settings-head"><h2>Impostazioni riproduzione</h2><button type="button" data-close-settings aria-label="Chiudi impostazioni">×</button></div>'+
      '<p>Vix è il provider predefinito. Seleziona un altro player soltanto se desideri provare un\u0027alternativa.</p>'+
      '<label class="bobo-provider-choice"><input type="radio" name="bobo-settings-provider" value="vix"><span><strong>Vix</strong><small>Provider consigliato</small></span></label>'+
      '<label class="bobo-provider-choice"><input type="radio" name="bobo-settings-provider" value="vidsrc"><span><strong>VidSrc</strong><small>Sperimentale; potrebbero esserci reindirizzamenti</small></span></label>'+
      '<div class="bobo-auto-settings"><h3>Serie TV · riproduzione consecutiva</h3>'+
      '<label class="bobo-auto-option"><input id="bobo-settings-auto-next" type="checkbox"><span>Passa al prossimo episodio quando Vix segnala la fine del video</span></label>'+
      '<label for="bobo-settings-auto-limit">Numero massimo di episodi consecutivi, compreso il primo</label>'+
      '<select id="bobo-settings-auto-limit"><option value="2">2 episodi</option><option value="3">3 episodi</option><option value="4">4 episodi</option><option value="5">5 episodi</option></select>'+
      '<p>Funziona nel player incorporato Vix. Attivo per impostazione predefinita.</p></div>'+
      '</div></div>');
    button.addEventListener('click',openSettings);
    const modal = document.getElementById('bobo-settings');
    modal.addEventListener('click',function(event) {
      if (event.target === modal || event.target.closest('[data-close-settings]')) closeSettings();
    });
    modal.querySelectorAll('input[name="bobo-settings-provider"]').forEach(function(radio) {
      radio.addEventListener('change',function() {
        if (typeof setProvider === 'function') setProvider(radio.value);
        else localStorage.setItem('bobo_provider_v3',radio.value);
        closeSettings();
      });
    });
    const autoToggle = modal.querySelector('#bobo-settings-auto-next');
    const autoLimit = modal.querySelector('#bobo-settings-auto-limit');
    autoToggle.addEventListener('change',function() {
      try { localStorage.setItem('bobo_auto_next_enabled',String(this.checked)); } catch (_) {}
      autoLimit.disabled = !this.checked;
    });
    autoLimit.addEventListener('change',function() {
      const value = [2,3,4,5].includes(Number(this.value)) ? this.value : '5';
      try { localStorage.setItem('bobo_auto_next_limit',value); } catch (_) {}
    });
    document.addEventListener('keydown',function(event) {
      if (event.key === 'Escape' && !modal.hidden) closeSettings();
    });
  }

  function init() {
    const main = document.querySelector('main');
    if (!main || document.getElementById('bobo-discover')) return;
    main.insertAdjacentHTML('afterbegin','<div id="bobo-discover"></div>');
    main.insertAdjacentHTML('beforeend','<button id="bobo-more" type="button" hidden>Carica altri</button>');
    document.body.insertAdjacentHTML('beforeend','<div id="bobo-details" hidden></div>');
    initSettings();
    const tabs = document.querySelector('.tabs');
    if (tabs) tabs.hidden = true;
    const filtersBar = document.getElementById('filter-bar');
    const dock = document.createElement('section');
    dock.className = 'bobo-filter-dock';
    dock.setAttribute('aria-label','Filtra il catalogo');
    dock.innerHTML = '<div class="bobo-filter-dock-head"><span>Esplora / tutti i titoli</span><span>SELECT · 001</span></div>';
    main.insertBefore(dock,document.getElementById('bobo-discover'));
    dock.appendChild(filtersBar);
    const typeField = document.createElement('div');
    typeField.className = 'filter-group';
    typeField.innerHTML = '<label for="bobo-type-filter">Tipologia</label>'+
      '<select id="bobo-type-filter"><option value="all">Film e serie</option>'+
      '<option value="movie">Solo film</option><option value="tv">Solo serie TV</option></select>';
    filtersBar.insertBefore(typeField,filtersBar.firstChild);
    document.getElementById('bobo-type-filter').addEventListener('change',function() {
      unifiedFilters.type = this.value;
      renderUnified();
    });
    if (location.hash === '#tv') unifiedFilters.type = 'tv';
    if (location.hash === '#movies') unifiedFilters.type = 'movie';
    document.getElementById('search-input').placeholder = 'Cerca film e serie TV…';
    loadDiscovery();
    Promise.all([ensureLoaded('movie'), ensureLoaded('tv')]).then(function() {
      filterOptions();
      renderUnified();
    });
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
      if (target.closest('[data-bobo-hero-shuffle]')) { shuffleFeedFeature(); return; }
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

  window.renderGrid = function() { renderUnified(); };
  window.renderCurrentTab = function() { filterOptions(); renderUnified(); };
  window.populateFilterOptions = function() { filterOptions(); };
  window.onFilterChange = function() {
    unifiedFilters.genre = document.getElementById('filter-genre').value;
    unifiedFilters.year = document.getElementById('filter-year').value;
    unifiedFilters.sort = document.getElementById('filter-sort').value;
    renderUnified();
  };
  window.onSearch = function(evt) {
    unifiedFilters.q = evt.target.value.trim();
    renderUnified();
  };
  window.onCardClick = function(id,kind) { detail(getItem(id,kind)); };
  window.switchTab = function(kind) {
    unifiedFilters.type = kind === 'tv' ? 'tv' : kind === 'movie' ? 'movie' : 'all';
    const select = document.getElementById('bobo-type-filter');
    if (select) select.value = unifiedFilters.type;
    renderUnified();
  };
  document.addEventListener('DOMContentLoaded',init);
})();
