/* Dedicated film/series page for Bobo Movie Night. No third-party API key required. */
(function () {
  'use strict';

  const STORAGE_PROVIDER = 'bobo_provider_v3';
  const STORAGE_AUTO_NEXT = 'bobo_auto_next_enabled';
  const STORAGE_AUTO_LIMIT = 'bobo_auto_next_limit';
  function readOption(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; }
    catch (_) { return fallback; }
  }
  function saveOption(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }
  const params = new URLSearchParams(location.search);
  const type = params.get('type');
  const id = params.get('id');
  const validRequest = (type === 'movie' || type === 'tv') && /^\d{1,10}$/.test(id || '');

  let item = null;
  let seasons = [];
  let selectedSeason = 1;
  let selectedEpisode = 1;
  let playing = false;
  let consecutiveEpisodes = 1;
  let observedPlayback = false;
  let autoNextEnabled = readOption(STORAGE_AUTO_NEXT, 'true') === 'true';
  let autoNextLimit = Math.max(2, Math.min(5, Number(readOption(STORAGE_AUTO_LIMIT, '5')) || 5));
  let provider = (function () {
    try {
      const value = localStorage.getItem(STORAGE_PROVIDER);
      return value === 'vidsrc' ? 'vidsrc' : 'vix';
    } catch (_) { return 'vix'; }
  }());

  const byId = function (name) { return document.getElementById(name); };
  function label(kind) { return kind === 'tv' ? 'Serie TV' : 'Film'; }
  function imageURL(url) {
    return typeof url === 'string' && /^https:\/\/image\.tmdb\.org\//.test(url) ? url : '';
  }
  function showError(message) {
    byId('watch-loading').hidden = true;
    byId('watch-hero').hidden = true;
    byId('watch-error').hidden = false;
    byId('watch-error-reason').textContent = message;
  }
  function episodeData(info) {
    if (!Array.isArray(info.seasons)) return [];
    return info.seasons.map(function (s) {
      return { n: Number(s.n), episodes: Math.floor(Number(s.episodes)) };
    }).filter(function (s) {
      return Number.isInteger(s.n) && s.n >= 0 && Number.isInteger(s.episodes) && s.episodes > 0 && s.episodes <= 1000;
    }).sort(function (a,b) { return a.n-b.n; });
  }
  function available(s,e) {
    const season = seasons.find(function (x) { return x.n === s; });
    return !!season && Number.isInteger(e) && e > 0 && e <= season.episodes;
  }
  function adjacent(delta) {
    const index = seasons.findIndex(function (s) { return s.n === selectedSeason; });
    if (index < 0) return null;
    const same = selectedEpisode + delta;
    if (available(selectedSeason,same)) return { season:selectedSeason,episode:same };
    const neighbour = seasons[index+(delta > 0 ? 1 : -1)];
    if (!neighbour) return null;
    return { season:neighbour.n,episode:delta > 0 ? 1 : neighbour.episodes };
  }
  function selectionFromQuery() {
    if (!seasons.length) return;
    const seasonQuery = params.get('s');
    const episodeQuery = params.get('e');
    const s = seasonQuery !== null && /^\d+$/.test(seasonQuery) ? Number(seasonQuery) : NaN;
    const e = episodeQuery !== null && /^\d+$/.test(episodeQuery) ? Number(episodeQuery) : NaN;
    const firstNormal = seasons.find(function (s) { return s.n > 0; }) || seasons[0];
    selectedSeason = available(s,e) ? s : firstNormal.n;
    selectedEpisode = available(s,e) ? e : 1;
  }
  function updateQuery() {
    const url = new URL(location.href);
    if (type === 'tv') {
      url.searchParams.set('s',String(selectedSeason));
      url.searchParams.set('e',String(selectedEpisode));
    }
    history.replaceState(null,'',url.toString());
  }
  function episodeHeading() {
    return selectedSeason === 0 ? 'Speciali · Episodio '+selectedEpisode :
      'Stagione '+selectedSeason+' · Episodio '+selectedEpisode;
  }
  function playerURL(automatic) {
    if (!item) return '';
    const tid = encodeURIComponent(String(item.tmdb_id));
    if (provider === 'vidsrc') {
      return type === 'movie'
        ? 'https://vidsrc-embed.ru/embed/movie?tmdb='+tid+'&ds_lang=it'
        : 'https://vidsrc-embed.ru/embed/tv?tmdb='+tid+'&season='+selectedSeason+'&episode='+selectedEpisode+'&ds_lang=it';
    }
    return type === 'movie'
      ? 'https://vixsrc.to/movie/'+tid+'?lang=it'
      : 'https://vixsrc.to/tv/'+tid+'/'+selectedSeason+'/'+selectedEpisode+'?lang=it'+
          (automatic ? '&autoplay=true' : '');
  }
  function updateAutoStatus(note) {
    const node = byId('watch-auto-next-status');
    if (!node) return;
    const active = playing && type === 'tv' && provider === 'vix' && autoNextEnabled;
    node.hidden = !active;
    if (active) {
      node.textContent = note || 'Riproduzione consecutiva: episodio '+consecutiveEpisodes+
        ' di '+autoNextLimit+' (il passaggio avviene solo alla fine del video).';
    }
  }
  function resetSequence() {
    consecutiveEpisodes = 1;
    observedPlayback = false;
    updateAutoStatus();
  }
  function pausePlayer() {
    playing = false;
    resetSequence();
    const iframe = byId('watch-iframe');
    iframe.src = 'about:blank';
    byId('watch-play-section').hidden = true;
  }
  function playNow(scroll, automatic) {
    if (!item) return;
    playing = true;
    observedPlayback = false;
    const frame = byId('watch-iframe');
    // Vix explicitly requires an origin Referer for embedded playback.
    frame.referrerPolicy = 'origin';
    byId('watch-play-section').hidden = false;
    byId('watch-current-episode').textContent = type === 'tv' ? episodeHeading() : item.title;
    byId('watch-previous').hidden = type !== 'tv';
    byId('watch-next').hidden = type !== 'tv';
    frame.src = playerURL(Boolean(automatic));
    updateEpisodeNavigation();
    updateAutoStatus();
    if (scroll) byId('watch-play-section').scrollIntoView({ behavior:'smooth',block:'start' });
  }
  function updateEpisodeNavigation() {
    const prev = byId('watch-previous');
    const next = byId('watch-next');
    prev.disabled = !adjacent(-1);
    next.disabled = !adjacent(1);
  }
  function selectEpisode(s,e,autoplay,automatic) {
    if (!available(s,e)) return;
    if (!automatic) resetSequence();
    selectedSeason = s;
    selectedEpisode = e;
    updateQuery();
    renderEpisodeNavigation();
    if (autoplay) playNow(true,Boolean(automatic));
    else if (playing) playNow(false);
  }
  function onPlayerMessage(event) {
    const frame = byId('watch-iframe');
    if (!frame || event.origin !== 'https://vixsrc.to' ||
        event.source !== frame.contentWindow || !playing || provider !== 'vix') return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.type !== 'PLAYER_EVENT' ||
        !msg.data || typeof msg.data !== 'object') return;
    const kind = msg.data.event;
    if (kind === 'play' || kind === 'timeupdate') {
      observedPlayback = true;
      return;
    }
    if (kind !== 'ended' || !observedPlayback || type !== 'tv' || !autoNextEnabled) return;
    // An ended event can be delivered more than once by an iframe.
    observedPlayback = false;
    if (consecutiveEpisodes >= autoNextLimit) {
      updateAutoStatus('Limite raggiunto: '+autoNextLimit+' episodi consecutivi. Seleziona un episodio per ripartire.');
      return;
    }
    const next = adjacent(1);
    if (!next) {
      updateAutoStatus('Ultimo episodio disponibile: la riproduzione consecutiva è terminata.');
      return;
    }
    consecutiveEpisodes += 1;
    selectEpisode(next.season,next.episode,true,true);
  }
  function renderEpisodeNavigation() {
    if (!seasons.length) return;
    const seasonHost = byId('watch-season-buttons');
    seasonHost.replaceChildren();
    seasons.forEach(function (s) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'season-button';
      button.setAttribute('aria-pressed', String(s.n === selectedSeason));
      button.textContent = s.n === 0 ? 'Speciali' : 'Stagione '+s.n;
      const small = document.createElement('small');
      small.textContent = '('+s.episodes+')';
      button.appendChild(small);
      button.addEventListener('click',function () {
        if (s.n === selectedSeason) return;
        selectedSeason = s.n;
        selectedEpisode = 1;
        updateQuery();
        if (playing) pausePlayer();
        renderEpisodeNavigation();
      });
      seasonHost.appendChild(button);
    });

    const current = seasons.find(function (s) { return s.n === selectedSeason; });
    const episodeHost = byId('watch-episode-list');
    episodeHost.replaceChildren();
    if (!current) return;
    for (let e=1;e<=current.episodes;e++) {
      const button = document.createElement('button');
      button.className = 'episode-card';
      button.type = 'button';
      if (e === selectedEpisode) button.setAttribute('aria-current','true');
      const number = document.createElement('span');
      number.className = 'episode-number';
      number.textContent = String(e);
      const content = document.createElement('span');
      const heading = document.createElement('strong');
      heading.textContent = 'Episodio '+e;
      const description = document.createElement('small');
      description.textContent = e === selectedEpisode ? 'Selezionato · Riproduci' : 'Riproduci episodio';
      content.append(heading,description);
      button.append(number,content);
      button.addEventListener('click',function () { selectEpisode(selectedSeason,e,true); });
      episodeHost.appendChild(button);
    }
    byId('watch-episode-progress').textContent = (selectedSeason===0 ? 'Speciali' : 'S'+selectedSeason)+' · E'+selectedEpisode;
    byId('watch-start').textContent = '▶ Riproduci S'+selectedSeason+' E'+selectedEpisode;
    updateEpisodeNavigation();
  }
  function renderTitle(info) {
    item = info;
    seasons = type === 'tv' ? episodeData(info) : [];
    if (type === 'tv' && !seasons.length) seasons = [{ n:1,episodes:1 }];
    selectionFromQuery();
    if (type === 'tv') updateQuery();
    byId('watch-loading').hidden = true;
    byId('watch-error').hidden = true;
    byId('watch-hero').hidden = false;
    byId('watch-title').textContent = info.title || 'Titolo senza nome';
    document.title = (info.title || 'Dettagli') + ' · Bobo Movie Night';
    byId('watch-kind').textContent = label(type);
    const meta = [];
    if (info.year) meta.push(String(info.year));
    if (Number(info.vote)>0) meta.push('★ '+Number(info.vote).toFixed(1)+'/10');
    if (type === 'movie' && info.runtime) meta.push(info.runtime+' min');
    if (type === 'tv') meta.push(seasons.length+' stagioni');
    byId('watch-meta').textContent = meta.join('  ·  ');
    byId('watch-genres').textContent = (info.genres||[]).join(' · ');
    const overview = info.overview || 'Trama non disponibile nel catalogo.';
    byId('watch-overview').textContent = overview;
    byId('watch-about-body').textContent = overview;
    byId('watch-info-section').hidden = false;
    const picture = imageURL(info.backdrop) || imageURL(info.poster);
    if (picture) {
      const image = document.createElement('img');
      image.src = picture;
      image.alt = '';
      image.decoding = 'async';
      byId('watch-backdrop').replaceChildren(image);
    }
    if (type === 'tv') {
      byId('watch-episodes-section').hidden = false;
      renderEpisodeNavigation();
      byId('watch-start').textContent = '▶ Riproduci S'+selectedSeason+' E'+selectedEpisode;
    }
  }
  async function loadTitle() {
    if (!validRequest) {
      showError('Indirizzo non valido: manca un ID TMDB o il tipo di contenuto.');
      return;
    }
    try {
      const cached = sessionStorage.getItem('bobo_selected_title');
      if (cached) {
        const info = JSON.parse(cached);
        if (String(info.tmdb_id) === id && info.type === type) {
          renderTitle(info);
          return;
        }
      }
    } catch (_) { /* Session storage unavailable; fetch catalog normally. */ }
    try {
      const file = type === 'movie' ? 'data/movies.json' : 'data/tv.json';
      const response = await fetch(file);
      if (!response.ok) throw Error('HTTP '+response.status);
      const catalog = await response.json();
      const info = (catalog.items || []).find(function (x) { return String(x.tmdb_id) === id; });
      if (!info) {
        showError('Il titolo non è presente nel catalogo sincronizzato.');
        return;
      }
      renderTitle(Object.assign({}, info, { type:type }));
    } catch (err) {
      console.error('[Bobo] Cannot load title',err);
      showError('Errore durante il caricamento del catalogo. Riprova aggiornando la pagina.');
    }
  }
  function settings(isOpen) {
    const modal = byId('watch-settings');
    modal.hidden = !isOpen;
    if (isOpen) {
      const selected = document.querySelector('input[name="watch-provider"][value="'+provider+'"]');
      if (selected) { selected.checked = true; selected.focus(); }
    } else byId('watch-settings-trigger').focus();
  }
  function setup() {
    byId('watch-start').addEventListener('click',function () { resetSequence(); playNow(true); });
    byId('watch-hide-player').addEventListener('click',pausePlayer);
    byId('watch-previous').addEventListener('click',function () {
      const target = adjacent(-1);
      if (target) selectEpisode(target.season,target.episode,true);
    });
    byId('watch-next').addEventListener('click',function () {
      const target = adjacent(1);
      if (target) selectEpisode(target.season,target.episode,true);
    });
    byId('watch-open-external').addEventListener('click',function () {
      if (item) window.open(playerURL(),'_blank','noopener,noreferrer');
    });
    byId('watch-copy').addEventListener('click',async function () {
      try {
        await navigator.clipboard.writeText(location.href);
        this.textContent = '✓ Link copiato';
        this.blur();
      } catch (_) {
        window.prompt('Copia questo indirizzo:',location.href);
      }
    });
    byId('watch-auto-next-enabled').checked = autoNextEnabled;
    byId('watch-auto-next-limit').value = String(autoNextLimit);
    byId('watch-auto-next-enabled').addEventListener('change',function () {
      autoNextEnabled = this.checked;
      saveOption(STORAGE_AUTO_NEXT,autoNextEnabled);
      resetSequence();
    });
    byId('watch-auto-next-limit').addEventListener('change',function () {
      autoNextLimit = Math.max(2,Math.min(5,Number(this.value)||5));
      saveOption(STORAGE_AUTO_LIMIT,autoNextLimit);
      resetSequence();
    });
    window.addEventListener('message',onPlayerMessage);
    byId('watch-settings-trigger').addEventListener('click',function () { settings(true); });
    byId('watch-settings-close').addEventListener('click',function () { settings(false); });
    byId('watch-settings').addEventListener('click',function (event) {
      if (event.target === this) settings(false);
    });
    document.querySelectorAll('input[name="watch-provider"]').forEach(function (radio) {
      radio.addEventListener('change',function () {
        provider = this.value === 'vidsrc' ? 'vidsrc' : 'vix';
        try { localStorage.setItem(STORAGE_PROVIDER,provider); } catch (_) {}
        resetSequence();
        if (playing) playNow(false);
        settings(false);
      });
    });
    document.addEventListener('keydown',function (event) {
      if (event.key === 'Escape' && !byId('watch-settings').hidden) settings(false);
    });
    loadTitle();
  }
  document.addEventListener('DOMContentLoaded',setup);
}());
