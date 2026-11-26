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
  let heroSlides = [];
  let heroIndex = 0;
  let heroTimer = null;
  let heroPauseUntil = 0;
  let peopleSearchIndex; // undefined until first relevant search; null when unavailable
  let peopleSearchPromise = null;
  let peopleMatches = [];
  const normalizeName = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
  function matchingPeople(query) {
    if (!Array.isArray(peopleSearchIndex) || query.length < 2) return [];
    const needle = normalizeName(query);
    if (needle.length < 2) return [];
    const matches = peopleSearchIndex.filter(function(person) {
      return Array.isArray(person) && Number(person[0]) > 0 &&
        normalizeName(person[1]).includes(needle);
    });
    matches.sort(function(a,b) {
      function rank(person) {
        const name = normalizeName(person[1]);
        return (name === needle ? 0 : name.startsWith(needle) ? 1 :
          name.includes(' ' + needle) ? 2 : 3);
      }
      return rank(a) - rank(b) ||
        (Array.isArray(b[3]) ? b[3].length : 0) - (Array.isArray(a[3]) ? a[3].length : 0) ||
        String(a[1]).localeCompare(String(b[1]), 'it');
    });
    return matches.slice(0, 6);
  }
  async function loadPeopleForSearch() {
    if (peopleSearchIndex !== undefined || peopleSearchPromise) return peopleSearchPromise;
    peopleSearchPromise = (async function() {
      try {
        const response = await fetch('data/cinema/person-search.json', {cache:'no-cache'});
        if (!response.ok) throw new Error('People index unavailable');
        const payload = await response.json();
        peopleSearchIndex = payload && payload.schema === 1 && Array.isArray(payload.people) ?
          payload.people : null;
      } catch (_) { peopleSearchIndex = null; }
      if (ready() && unifiedFilters.q.length >= 2) renderUnified();
    })();
    return peopleSearchPromise;
  }
  function renderPeopleMatches() {
    const host = document.getElementById('bobo-people-matches');
    if (!host) return;
    if (!unifiedFilters.q || unifiedFilters.q.length < 2) {
      host.hidden = true; host.innerHTML = ''; return;
    }
    if (peopleSearchIndex === undefined) {
      host.hidden = false;
      host.innerHTML = '<p class="bobo-people-loading" role="status">Ricerca interpreti…</p>';
      return;
    }
    if (!peopleMatches.length) {
      host.hidden = true; host.innerHTML = ''; return;
    }
    host.hidden = false;
    host.innerHTML = '<div class="bobo-people-heading"><h2>Attori e autori</h2>'+
      '<span>Profili collegati al catalogo</span></div>'+
      '<div class="bobo-people-rail">'+peopleMatches.map(function(person) {
        const photo = safeImage(person[2]);
        const face = photo ? '<img src="'+text(photo)+'" alt="" loading="lazy" decoding="async">' :
          '<span aria-hidden="true">◉</span>';
        const count = Array.isArray(person[3]) ? person[3].length : 0;
        return '<a class="bobo-person-search-card" href="person.html?id='+encodeURIComponent(person[0])+'">'+
          '<span class="bobo-person-search-photo">'+face+'</span><span class="bobo-person-search-details">'+
          '<strong>'+text(person[1])+'</strong><small>'+count+' '+(count === 1 ? 'opera collegata' : 'opere collegate')+
          '</small><span class="bobo-person-search-open">Apri la scheda ↗</span></span></a>';
      }).join('')+'</div>';
  }
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
  function isAnime(item) {
    if (!item) return false;
    if (item.original_language === 'ja' &&
        (item.genres || []).some(g => /animazione|animation/i.test(g))) return true;
    return !!(discovery && Array.isArray(discovery.anime) &&
      discovery.anime.some(row => row.type === item.type && String(row.tmdb_id) === String(item.tmdb_id)));
  }
  function typeTag(item) { return isAnime(item) ? 'Anime' : (item.type === 'tv' ? 'Serie TV' : 'Film'); }
  function applyUnifiedFilters(items) {
    const f = unifiedFilters;
    const query = normalizeName(f.q);
    peopleMatches = matchingPeople(f.q);
    const participating = new Set();
    peopleMatches.forEach(function(person) {
      (person[3] || []).forEach(function(key) { participating.add(String(key)); });
    });
    let out = items.filter(function(item) {
      if (f.type === 'anime' ? !isAnime(item) : (f.type !== 'all' && item.type !== f.type)) return false;
      if (f.genre && !(item.genres || []).includes(f.genre)) return false;
      if (f.year) {
        const year = Number(item.year);
        if (String(f.year).startsWith('decade:')) {
          if (!Number.isInteger(year) || Math.floor(year / 10) * 10 !== Number(String(f.year).slice(7))) return false;
        } else if (year !== Number(f.year)) return false;
      }
      if (query && !normalizeName(item.title).includes(query) &&
        !participating.has(item.type + ':' + item.tmdb_id)) return false;
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
    const decades = [...new Set(list.filter(x => x.type === 'movie')
      .map(x => Number(x.year)).filter(y => y >= 1900 && y <= currentYear)
      .map(y => Math.floor(y / 10) * 10))].sort((a,b) => b-a);
    yearSelect.innerHTML = '<option value="">Tutti i periodi</option>' +
      '<optgroup label="Decenni">' +
      decades.map(y => '<option value="decade:'+y+'">Anni '+(y % 100 === 0 ? y : String(y).slice(2))+
        ' ('+y+'–'+(y+9)+')</option>').join('') + '</optgroup>'+
      '<optgroup label="Anni">' +
      years.map(function(value) { return '<option value="'+text(value)+'">'+text(value)+'</option>'; }).join('')+
      '</optgroup>';
    const selectedYear = String(unifiedFilters.year || '');
    yearSelect.value = selectedYear.startsWith('decade:') ?
      (decades.includes(Number(selectedYear.slice(7))) ? selectedYear : '') :
      (years.includes(Number(selectedYear)) ? selectedYear : '');
    if (selectedYear && !yearSelect.value) unifiedFilters.year = '';
    document.getElementById('filter-sort').value = unifiedFilters.sort;
    document.getElementById('bobo-type-filter').value = unifiedFilters.type;
    document.getElementById('filter-bar').classList.remove('disabled');
  }
  function renderUnified() {
    update();
    if (!ready()) return;
    if (isHome()) {
      peopleMatches = [];
      renderPeopleMatches();
      return;
    }
    lastResults = applyUnifiedFilters(allItems());
    renderPeopleMatches();
    shown = PAGE_SIZE;
    document.getElementById('section-title').textContent = unifiedFilters.q
      ? 'Risultati per "'+unifiedFilters.q+'"' : 'Esplora il catalogo';
    renderResults();
  }

  function safeImage(value) {
    return typeof value === 'string' && /^https:\/\/image\.tmdb\.org\//.test(value) ? value : '';
  }
  function tmdbBackdropSize(value,size) {
    const image=safeImage(value);
    return image ? image.replace(/\/t\/p\/(?:w\d+|original)\//,'/t/p/'+size+'/') : '';
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
  // Read-only bridge for the favorites extension; the catalog remains owned here.
  window.BoboCatalogAPI=Object.freeze({
    getItem:function(kind,id){return getItem(id,kind);},
    items:function(kind){return catalogs[kind]||[];}
  });
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
      '<span class="bobo-tile-art">'+art+'<span class="bobo-tile-tag">'+typeTag(item)+'</span>'+
      '<span class="bobo-poster-hover" aria-hidden="true"><strong>'+text(item.title)+'</strong>'+
      '<span class="bobo-poster-hover-meta">'+meta(item)+'</span>'+
      '<span class="bobo-poster-hover-hint">ⓘ Dettagli</span></span></span>'+
      '<span class="bobo-tile-title">'+text(item.title)+'</span>'+
      '<span class="bobo-tile-meta">'+text(item.type === 'tv' ? seasonSummary(item) : (item.year||''))+
      (item.vote ? ' · ★ '+text(Number(item.vote).toFixed(1)) : '')+'</span></button>';
  }
  function shelf(id, title, items, subtitle) {
    const list = items.slice(0, 16);
    if (list.length < 4) return '';
    const platform=id.startsWith('new-on-') ? id.slice('new-on-'.length) : '';
    return '<section class="bobo-shelf" aria-label="'+text(title)+'"'+
      (platform ? ' data-bobo-platform="'+text(platform)+'"' : '')+'>'+
      '<div class="bobo-shelf-head"><h2>'+text(title)+'</h2>'+
      (subtitle ? '<small class="bobo-shelf-source">'+text(subtitle)+'</small>' : '')+
      '</div><div class="bobo-rail-frame">'+
      '<button class="bobo-arrow bobo-arrow--left" type="button" data-bobo-scroll="'+text(id)+'" data-direction="-1" aria-label="Scorri '+text(title)+' verso sinistra">‹</button>'+
      '<div class="bobo-rail" id="bobo-rail-'+text(id)+'">'+list.map(posterTile).join('')+'</div>'+
      '<button class="bobo-arrow bobo-arrow--right" type="button" data-bobo-scroll="'+text(id)+'" data-direction="1" aria-label="Scorri '+text(title)+' verso destra">›</button></div></section>';
  }
  function chooseFeedFeature() {
    if (!discovery || !discovery.streaming) return null;
    if (heroSlides.length) return heroSlides[heroIndex];
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
    // Curate six real arrivals; start with a new one on each page refresh.
    for (let i=options.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      const tmp=options[i];options[i]=options[j];options[j]=tmp;
    }
    let previous='';
    try { previous=localStorage.getItem('bobo_last_feed_hero')||''; } catch (_) {}
    if (options.length>1 && options[0].type+':'+options[0].tmdb_id===previous) {
      options.push(options.shift());
    }
    heroSlides=options.slice(0,Math.min(6,options.length));
    heroIndex=0;
    featuredFromFeed=heroSlides[0];
    try {localStorage.setItem('bobo_last_feed_hero',featuredFromFeed.type+':'+featuredFromFeed.tmdb_id);}catch(_){}
    return featuredFromFeed;
  }
  function setHeroSlide(index,manual) {
    const host=document.getElementById('bobo-discover');
    const stage=host&&host.querySelector('.bobo-feature');
    if (!stage || !heroSlides.length || !isHome()) return;
    heroIndex=(index+heroSlides.length)%heroSlides.length;
    featuredFromFeed=heroSlides[heroIndex];
    if(manual)heroPauseUntil=Date.now()+18000;
    stage.outerHTML=hero(featuredFromFeed,true);
  }
  function shuffleFeedFeature() {
    if(heroSlides.length) setHeroSlide(heroIndex+1,true);
  }
  function updateRailButtons(rail) {
    if(!rail)return;
    const frame=rail.closest('.bobo-rail-frame');
    if(!frame)return;
    const left=frame.querySelector('.bobo-arrow--left');
    const right=frame.querySelector('.bobo-arrow--right');
    const overflow=rail.scrollWidth-rail.clientWidth>3;
    if(left){left.hidden=!overflow;left.disabled=rail.scrollLeft<=2;}
    if(right){right.hidden=!overflow;right.disabled=rail.scrollLeft>=rail.scrollWidth-rail.clientWidth-2;}
  }
  function startHeroRotation() {
    if(heroTimer)clearInterval(heroTimer);
    if(heroSlides.length<2)return;
    heroTimer=setInterval(function() {
      if(!isHome() || document.hidden || Date.now()<heroPauseUntil)return;
      const heroNode=document.querySelector('#bobo-discover .bobo-feature');
      if(!heroNode || heroNode.matches(':hover') || heroNode.contains(document.activeElement))return;
      setHeroSlide(heroIndex+1,false);
    },11000);
  }
  function hero(item,isFeed) {
    if (!item) return '';
    const image = safeImage(item.backdrop);
    const large = tmdbBackdropSize(image,'w1280');
    const medium = tmdbBackdropSize(image,'w780');
    const img = image ? '<img src="'+text(large)+'" srcset="'+text(medium)+' 780w, '+text(large)+' 1280w" sizes="(max-width:780px) 100vw, 1280px" alt="" fetchpriority="high" loading="eager" decoding="async">' : '';
    return '<section class="bobo-feature" aria-label="In primo piano">'+img+
      '<div class="bobo-feature-body"><div class="bobo-eyebrow">'+
      (isFeed ? 'Radar streaming / Novità in Italia' : 'Bobo Movie Night · In primo piano')+'</div>'+
      '<h1>'+text(item.title)+'</h1><div class="bobo-feature-meta">'+meta(item)+'</div>'+
      '<p class="bobo-feature-description">'+text(item.overview||'Scopri il titolo e tutti i dettagli.')+'</p>'+
      '<div class="bobo-feature-actions"><button type="button" class="bobo-btn bobo-btn-primary" data-bobo-play="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">▶ Apri scheda</button>'+
      '<button type="button" class="bobo-btn bobo-btn-secondary" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'">ⓘ Dettagli</button>'+
      '</div></div>'+
      (isFeed && heroSlides.length>1 ? '<div class="bobo-hero-nav" aria-label="Slideshow">'+
        '<button type="button" data-bobo-slide-prev aria-label="Titolo precedente">‹</button>'+
        '<div class="bobo-hero-dots">'+heroSlides.map(function(_,i) {
          return '<button type="button" data-bobo-hero-index="'+i+'" aria-label="Mostra titolo '+(i+1)+'"'+
            (i===heroIndex?' aria-current="true"':'')+'></button>';
        }).join('')+'</div>'+
        '<button type="button" data-bobo-slide-next aria-label="Titolo successivo">›</button>'+
        '</div>' : '')+
      '</section>';
  }
  function renderHome() {
    const all=allItems();
    const host=document.getElementById('bobo-discover');
    if(!host||!all.length)return;
    const key='editorial:' + catalogs.movie.length + ':' + catalogs.tv.length +
      ':' + (discovery&&discovery.generated_at||'');
    if(renderedKey===key)return;
    renderedKey=key;
    const good=quality(all);
    const fresh=recent(all);
    const rails=[],already=new Set();
    const feature=chooseFeedFeature()||featured(all);
    if(feature)already.add(feature.type+':'+feature.tmdb_id);
    const pickUnique=items=>{
      const result=[],local=new Set();
      for(const item of items||[]){
        if(!item||!item.tmdb_id||!item.poster)continue;
        const id=item.type+':'+item.tmdb_id;
        if(already.has(id)||local.has(id))continue;
        local.add(id);result.push(item);
        if(result.length>=12)break;
      }
      if(result.length<4)return [];
      result.forEach(item=>already.add(item.type+':'+item.tmdb_id));
      return result;
    };
    function addRail(id,title,items,subtitle){
      const unique=pickUnique(items);
      const html=shelf(id,title,unique,subtitle);
      if(html)rails.push(html);
      return !!html;
    }
    const stream=discovery&&discovery.streaming;
    let radar=false;
    if(stream){
      const weekly=resolveDiscovery(stream.items||[]);
      const monthly=(stream.platforms||[]).filter(platform=>
        platform&&platform.id&&platform.label&&resolveDiscovery(platform.items||[]).length>=4);
      if(weekly.length>=4||monthly.length)radar=true;
      if(radar)rails.push('<div class="bobo-feed-group"><span>01 / Radar</span>'+
        '<h2>Le novità che contano.</h2>'+
        '<p>Una selezione delle nuove disponibilità italiane, senza ripetere gli stessi titoli in ogni riga.</p></div>');
      addRail('it-weekly','Novità della settimana',weekly,'Le nuove disponibilità in Italia');
      // Compact platform overview: no separate near-identical weekly film/series rails.
      monthly.slice(0,3).forEach(platform=>
        addRail('new-on-'+platform.id,platform.label+' · Da recuperare',
          resolveDiscovery(platform.items),'Selezione mensile'));
    }
    if(!radar&&discovery&&Array.isArray(discovery.trending)){
      addRail('weekly-trending','Di tendenza',resolveDiscovery(discovery.trending),
        'Quello che il pubblico sta seguendo');
    }
    // A magazine-like break between streaming rails and catalogue content.
    rails.push('<section class="bobo-home-crossroads" aria-label="Scopri una storia diversa">'+
      '<div class="bobo-home-random"><span class="bobo-home-micro">BOBO / SERATA A SORPRESA</span>'+
      '<h2>E se la scelta fosse una sorpresa?</h2>'+
      '<p>Un film con un buon voto, una storia ancora da scoprire. Nessun quiz, un solo click.</p>'+
      '<button type="button" data-bobo-surprise>✳ Sorprendimi</button></div>'+
      '<div class="bobo-home-explore"><span class="bobo-home-micro">BOBO / ALTRI PERCORSI</span>'+
      '<h2>Non soltanto locandine.</h2>'+
      '<p>Segui le persone dietro ai film e attraversa i grandi premi del cinema.</p>'+
      '<div class="bobo-home-crosslinks"><a href="discover.html">Scopri Discover ↗</a>'+
      '<a href="awards.html">Film premiati ↗</a></div></div></section>');
    rails.push('<div class="bobo-feed-group bobo-feed-group-secondary">'+
      '<span>02 / Dal catalogo</span><h2>Una buona storia è sempre una scoperta.</h2></div>');
    const goodMovies=good.filter(item=>item.type==='movie');
    const goodSeries=good.filter(item=>item.type==='tv');
    addRail('films-loved','Film da non perdere',goodMovies,'Le valutazioni migliori nel nostro catalogo');
    addRail('series-loved','Serie da scoprire',goodSeries,'Le storie più apprezzate');
    addRail('recently-added','Uscite recenti',fresh,
      'Film e serie selezionati tra le novità');
    const anime=validItems(all).filter(isAnime)
      .sort((a,b)=>(Number(b.vote)||0)-(Number(a.vote)||0)||(b.year||0)-(a.year||0));
    addRail('anime-it','Anime da conoscere',anime,
      'Animazione giapponese · Verifica la lingua nel player');
    const genres=[
      ['action','Azione e avventura',['azione','avventura']],
      ['thriller','Thriller e mistero',['thriller','mistero','giallo']],
      ['crime','Storie crime',['crime','poliziesco','criminale']],
      ['comedy','Un po’ di leggerezza',['commedia']],
      ['scifi','Altri mondi',['fantascienza','science fiction']],
      ['fantasy','Fantasia senza limiti',['fantasy']],
      ['drama','Grandi emozioni',['dramma']],
      ['animation','Il cinema animato',['animazione']],
      ['horror','Brividi sul divano',['horror','orrore']],
      ['romance','Storie d’amore',['romance','romantico','sentimentale']],
      ['docu','Storie vere',['documentario']],
      ['family','Da guardare insieme',['famiglia','family']]
    ];
    const week=Math.floor(Date.now()/604800000);
    const selection=[0,4,8].map((offset,i)=>genres[(week+i*3+offset)%genres.length]);
    const chosen=new Set();
    selection.forEach(row=>{
      if(chosen.has(row[0]))return;
      chosen.add(row[0]);
      addRail('genre-'+row[0],row[1],
        good.filter(item=>genresMatch(item,row[2])));
    });
    host.innerHTML=hero(feature,Boolean(feature&&discovery&&discovery.streaming))+
      rails.filter(Boolean).join('')+
      '<p class="bobo-source-note">Le piattaforme segnalano una disponibilità italiana, non garantiscono la lingua del player. <a href="discover.html">Altre idee su Discover</a>.</p>';
    startHeroRotation();
    requestAnimationFrame(()=>document.querySelectorAll('.bobo-rail').forEach(updateRailButtons));
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
    if (!rows.length) grid.innerHTML = '<div class="state-box"><p>'+
      (peopleMatches.length ? 'Nessun titolo associato tra quelli indicizzati.' : 'Nessun titolo trovato.')+
      '</p></div>';
    else grid.innerHTML = rows.map(function(item) {
      const image = safeImage(item.poster);
      const poster = image ? '<img src="'+text(image)+'" loading="lazy" decoding="async" alt="">' : '';
      return '<button type="button" class="bobo-result" data-bobo-id="'+text(item.tmdb_id)+'" data-bobo-type="'+text(item.type)+'" aria-label="Dettagli: '+text(item.title)+'">'+
        '<span class="bobo-result-poster">'+poster+'<span class="bobo-tile-tag">'+typeTag(item)+'</span>'+
        '<span class="bobo-poster-hover" aria-hidden="true"><strong>'+text(item.title)+'</strong>'+
        '<span class="bobo-poster-hover-meta">'+meta(item)+'</span>'+
        '<span class="bobo-poster-hover-hint">ⓘ Dettagli</span></span></span>'+
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
  let settingsReturnFocus = null;
  function renderSettingsProviders() {
    const container = document.getElementById('bobo-settings-providers');
    if (!container || !window.BoboPlayers) return;
    container.replaceChildren();
    for (const source of window.BoboPlayers.list()) {
      const label = document.createElement('label');
      label.className = 'bobo-provider-choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'bobo-settings-provider';
      input.value = source.id;
      input.checked = source.id === window.BoboPlayers.selected();
      const info = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = source.name;
      const note = document.createElement('small');
      note.textContent = source.audio === 'it-preferred'
        ? 'Preferenza audio italiano, quando disponibile'
        : source.audio === 'it-requested'
          ? 'Richiede audio ITA · doppiaggio da verificare per ogni titolo'
          : source.subtitle
            ? 'Audio italiano non verificato · sottotitoli ITA se presenti'
            : 'Audio italiano non verificato';
      info.append(title, note);
      label.append(input, info);
      container.appendChild(label);
    }
  }
  function openSettings() {
    const modal = document.getElementById('bobo-settings');
    if (!modal) return;
    settingsReturnFocus = document.activeElement;
    renderSettingsProviders();
    const autoToggle = modal.querySelector('#bobo-settings-auto-next');
    const autoLimit = modal.querySelector('#bobo-settings-auto-limit');
    try {
      autoToggle.checked = localStorage.getItem('bobo_auto_next_enabled') !== 'false';
      const value = Number(localStorage.getItem('bobo_auto_next_limit') || 5);
      autoLimit.value = String([2,3,4,5].includes(value) ? value : 5);
    } catch (_) { autoToggle.checked = true; autoLimit.value = '5'; }
    autoLimit.disabled = !autoToggle.checked;
    modal.hidden = false;
    const selected = modal.querySelector('input[name="bobo-settings-provider"]:checked');
    if (selected) selected.focus();
  }
  function closeSettings() {
    const modal = document.getElementById('bobo-settings');
    if (modal) modal.hidden = true;
    const button = settingsReturnFocus || document.getElementById('bobo-settings-open');
    settingsReturnFocus = null;
    if (button && typeof button.focus === 'function') button.focus();
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
      '<p>Seleziona la sorgente. La preferenza vale anche nelle schede dei film e rimane memorizzata su questo dispositivo. VixSrc e VidCore possono richiedere audio italiano, ma la traccia va verificata per ciascun titolo.</p>'+
      '<div id="bobo-settings-providers" role="radiogroup" aria-label="Sorgenti di riproduzione"></div>'+
      '<div class="bobo-auto-settings"><h3>Serie TV · riproduzione consecutiva</h3>'+
      '<label class="bobo-auto-option"><input id="bobo-settings-auto-next" type="checkbox"><span>Passa al prossimo episodio quando VixSrc segnala la fine del video</span></label>'+
      '<label for="bobo-settings-auto-limit">Numero massimo di episodi consecutivi, compreso il primo</label>'+
      '<select id="bobo-settings-auto-limit"><option value="2">2 episodi</option><option value="3">3 episodi</option><option value="4">4 episodi</option><option value="5">5 episodi</option></select>'+
      '<p>La riproduzione consecutiva automatica funziona con VixSrc; gli altri player possono richiedere il passaggio manuale.</p></div>'+
      '</div></div>');
    button.addEventListener('click', openSettings);
    const modal = document.getElementById('bobo-settings');
    modal.addEventListener('click',function(event) {
      if (event.target === modal || event.target.closest('[data-close-settings]')) closeSettings();
    });
    modal.querySelector('#bobo-settings-providers').addEventListener('change',function(event) {
      const radio = event.target;
      if (!radio || radio.name !== 'bobo-settings-provider' || !radio.checked) return;
      if (!window.BoboPlayers || !window.BoboPlayers.get(radio.value)) return;
      const previous = window.BoboPlayers.selected();
      const id = window.BoboPlayers.select(radio.value);
      if (typeof setProvider === 'function') setProvider(id);
      if (id !== previous && typeof playerState !== 'undefined' &&
          playerState && typeof loadProvider === 'function') loadProvider(id);
      closeSettings();
    });
    if (window.BoboPlayers) {
      renderSettingsProviders();
      window.BoboPlayers.onUpdate(renderSettingsProviders);
    }
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
      if (event.key === 'Escape' && !modal.hidden) {
        event.stopPropagation();
        closeSettings();
      }
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
    const peopleHost = document.createElement('section');
    peopleHost.id = 'bobo-people-matches';
    peopleHost.className = 'bobo-people-matches';
    peopleHost.hidden = true;
    main.insertBefore(peopleHost, document.querySelector('.section-header'));
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
      '<option value="movie">Solo film</option><option value="tv">Solo serie TV</option>'+
      '<option value="anime">Anime</option></select>';
    filtersBar.insertBefore(typeField,filtersBar.firstChild);
    document.getElementById('bobo-type-filter').addEventListener('change',function() {
      unifiedFilters.type = this.value;
      renderUnified();
    });
    if (location.hash === '#tv') unifiedFilters.type = 'tv';
    if (location.hash === '#movies') unifiedFilters.type = 'movie';
    window.addEventListener('hashchange',function () {
      const requested=location.hash==='#tv'?'tv':location.hash==='#movies'?'movie':'all';
      if(requested!==unifiedFilters.type){
        unifiedFilters.type=requested;
        const select=document.getElementById('bobo-type-filter');
        if(select)select.value=requested;
        renderUnified();
      }
    });
    document.getElementById('search-input').placeholder = 'Cerca un film, una serie o un attore…';
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
      if(target.closest('[data-bobo-surprise]')){
        const pool=quality(catalogs.movie||[]).filter(item=>
          item.type==='movie'&&item.overview&&Number(item.vote)>=6.8&&
          Number(item.year)>=1970&&Number(item.year)<=currentYear&&item.poster);
        if(pool.length){
          let previous='';
          try{previous=sessionStorage.getItem('bobo_last_surprise')||'';}catch(_){}
          const choices=pool.filter(item=>String(item.tmdb_id)!==previous);
          const selected=(choices.length?choices:pool)[Math.floor(Math.random()*
            (choices.length||pool.length))];
          try{sessionStorage.setItem('bobo_last_surprise',String(selected.tmdb_id));}catch(_){}
          detail(selected);
        }
        return;
      }
      const closed = target.closest('[data-bobo-close]');
      if (closed || (target.id === 'bobo-details')) { closeDetail(); return; }
      const scrolling = target.closest('[data-bobo-scroll]');
      if (scrolling) {
        const rail = document.getElementById('bobo-rail-'+scrolling.getAttribute('data-bobo-scroll'));
        if (rail) {
          rail.scrollBy({left: (Number(scrolling.dataset.direction)||1)*rail.clientWidth*.85,behavior:'smooth'});
          updateRailButtons(rail);
        }
        return;
      }
      if (target.closest('[data-bobo-slide-prev]')) { setHeroSlide(heroIndex-1,true); return; }
      if (target.closest('[data-bobo-slide-next]')) { setHeroSlide(heroIndex+1,true); return; }
      const directSlide=target.closest('[data-bobo-hero-index]');
      if(directSlide) { setHeroSlide(Number(directSlide.dataset.boboHeroIndex),true); return; }
      if (target.closest('[data-bobo-hero-shuffle]')) { shuffleFeedFeature(); return; }
      const playing = target.closest('[data-bobo-play]');
      if (playing) { play(playing.dataset.boboPlay,playing.dataset.boboType); return; }
      const opening = target.closest('[data-bobo-id]');
      if (opening) { detail(getItem(opening.dataset.boboId,opening.dataset.boboType)); }
    });
    document.addEventListener('scroll',function(evt) {
      if(evt.target?.classList?.contains('bobo-rail'))updateRailButtons(evt.target);
    },true);
    window.addEventListener('resize',function() {
      document.querySelectorAll('.bobo-rail').forEach(updateRailButtons);
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
    updateDecadeShortcutState();
    unifiedFilters.sort = document.getElementById('filter-sort').value;
    renderUnified();
  };
  window.onSearch = function(evt) {
    unifiedFilters.q = evt.target.value.trim();
    if (unifiedFilters.q.length >= 2) void loadPeopleForSearch();
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
