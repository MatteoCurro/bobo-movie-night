/* BOBO Player Manager — tiny, dependency-free provider registry.
 * TMDB catalogue and accounts never depend on video providers.
 * External player pages are NOT evidence of availability or Italian dubbing.
 */
(function (root) {
  'use strict';
  const KEY = 'bobo_provider_v3';
  const CONFIG_KEY = 'bobo_player_sources_v1';
  const AUDIO_KEY = 'bobo_audio_checks_v1';
  const DEFAULTS = [
    { id: 'vix', name: 'VixSrc', base: 'https://vixsrc.to', family: 'vix', audio: 'it-preferred', subtitle: false, enabled: true, priority: 0 },
    { id: 'vidlink', name: 'VidLink', base: 'https://vidlink.pro', family: 'vidlink', audio: 'unverified', subtitle: false, enabled: true, priority: 1 },
    { id: 'vidsrc', name: 'VidSrc', base: 'https://vidsrc.sh', family: 'vidsrc', audio: 'unverified', subtitle: true, enabled: true, priority: 2 },
    { id: 'vidcore', name: 'VidCore · ITA test', base: 'https://vidcore.org', family: 'vidcore', audio: 'it-requested', subtitle: true, enabled: false, priority: 3 },
    { id: 'vidrift', name: 'VidRift', base: 'https://embed.vidrift.net', family: 'vidrift', audio: 'unverified', subtitle: true, enabled: false, priority: 4 },
    { id: 'vidrock', name: 'VidRock', base: 'https://vidrock.net', family: 'vidrock', audio: 'unverified', subtitle: false, enabled: false, priority: 5 }
  ];
  let records = DEFAULTS.map(p => ({ ...p }));
  let readyPromise = null;
  const listeners = new Set();

  function stored(k) {
    try { return root.localStorage.getItem(k); } catch (_) { return null; }
  }
  function save(k, v) {
    try { root.localStorage.setItem(k, v); } catch (_) {}
  }
  function safeBase(value) {
    try {
      const u = new URL(value);
      const host = u.hostname.toLowerCase();
      // All remote changes come from our own versioned same-origin config.
      // Never allow credentials, custom ports, local hosts or non-HTTPS schemes.
      if (u.protocol !== 'https:' || u.username || u.password || u.port ||
          u.pathname !== '/' || u.search || u.hash ||
          !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ||
          /(^|\.)localhost$|(^|\.)local$|(^|\.)internal$/.test(host) ||
          /(^|\.)\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
      return u.origin;
    } catch (_) { return null; }
  }
  function applyConfig(data) {
    if (!data || data.schema !== 1 || !data.providers ||
        typeof data.providers !== 'object' || Array.isArray(data.providers)) return false;
    const next = DEFAULTS.map(p => {
      const override = data.providers[p.id] || {};
      const base = safeBase(override.base);
      const priority = Number.isInteger(override.priority) && override.priority >= 0 &&
        override.priority <= 50 ? override.priority : p.priority;
      return { ...p, base: base || p.base,
        enabled: typeof override.enabled === 'boolean' ? override.enabled : p.enabled,
        priority };
    });
    if (!next.some(p => p.enabled)) return false;
    records = next;
    listeners.forEach(cb => { try { cb(list()); } catch (_) {} });
    return true;
  }
  function list() {
    return records.filter(p => p.enabled).sort((a, b) => a.priority - b.priority)
      .map(p => ({ ...p }));
  }
  function get(id) { return list().find(p => p.id === id) || null; }
  function selected() {
    const preferred = stored(KEY);
    return get(preferred) ? preferred : (list()[0] || {}).id || 'vix';
  }
  function select(id) {
    if (!get(id)) return selected();
    save(KEY, id);
    return id;
  }
  function next(id) {
    const candidates = list();
    const index = candidates.findIndex(p => p.id === id);
    return candidates.length ? candidates[(index + 1) % candidates.length].id : id;
  }
  function audioCheckKey(id, request) {
    if (!get(id) || !request) return '';
    const type = request.kind || request.type;
    const tid = Number(request.tmdbId ?? request.tmdb_id);
    if ((type !== 'tv' && type !== 'movie') || !Number.isSafeInteger(tid) || tid < 1) return '';
    if (type === 'movie') return id + ':movie:' + tid;
    const s = Number(request.season), e = Number(request.episode);
    if (!Number.isSafeInteger(s) || s < 0 || !Number.isSafeInteger(e) || e < 1) return '';
    return id + ':tv:' + tid + ':' + s + ':' + e;
  }
  function audioStatus(id, request) {
    const key = audioCheckKey(id, request);
    if (!key) return '';
    try {
      const data = JSON.parse(stored(AUDIO_KEY) || '{}');
      const entry = data[key];
      return entry && ['ita', 'sub-ita', 'original'].includes(entry.status) ? entry.status : '';
    } catch (_) { return ''; }
  }
  function reportAudio(id, request, status) {
    const key = audioCheckKey(id, request);
    if (!key || !['ita', 'sub-ita', 'original', ''].includes(status)) return false;
    try {
      const data = JSON.parse(stored(AUDIO_KEY) || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
      delete data[key];
      if (status) data[key] = { status, checked_at: new Date().toISOString() };
      // Only local, direct user checks. Never infer audio from TMDB genre or
      // a provider language parameter; do not sync these private observations.
      const keys = Object.keys(data);
      keys.slice(0, Math.max(0, keys.length - 500)).forEach(k => delete data[k]);
      save(AUDIO_KEY, JSON.stringify(data));
      return true;
    } catch (_) { return false; }
  }
  function sourceURL(id, request, autoplay) {
    const p = get(id);
    if (!p || !request) return '';
    const contentId = Number(request.tmdbId ?? request.tmdb_id);
    if (!Number.isSafeInteger(contentId) || contentId <= 0) return '';
    const type = request.kind || request.type;
    const tv = type === 'tv';
    if (!tv && type !== 'movie') return '';
    const s = Number(request.season), e = Number(request.episode);
    if (tv && (!Number.isSafeInteger(s) || s < 0 || !Number.isSafeInteger(e) || e < 1)) return '';
    const path = tv ? '/tv/' + contentId + '/' + s + '/' + e : '/movie/' + contentId;
    const rootUrl = p.base;
    switch (p.family) {
      case 'vix': return rootUrl + path + '?lang=it' + (autoplay ? '&autoplay=true' : '');
      case 'vidlink': return rootUrl + path + (autoplay ? '?autoplay=true' : '');
      case 'vidsrc': return rootUrl + '/embed' + path + '?ds_lang=it';
      // 'lang' is an audio-track preference, not evidence of an Italian dub.
      case 'vidcore': return rootUrl + '/embed' + path + '?lang=it' + (autoplay ? '&autoplay=true' : '');
      case 'vidrift': return rootUrl + '/embed' + path + '?sub=it';
      case 'vidrock': return rootUrl + path;
      default: return '';
    }
  }
  function init() {
    if (readyPromise) return readyPromise;
    try {
      const cached = JSON.parse(stored(CONFIG_KEY) || 'null');
      if (cached) applyConfig(cached);
    } catch (_) {}
    // This request is independent of catalogue and playback; failure is harmless.
    readyPromise = (async () => {
      if (typeof root.fetch !== 'function') return list();
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 1800) : null;
      try {
        const r = await root.fetch('data/player-sources.json', {
          cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined
        });
        if (!r.ok) return list();
        const data = await r.json();
        if (applyConfig(data)) save(CONFIG_KEY, JSON.stringify(data));
      } catch (_) { /* stale cache/defaults are a deliberate fallback */ }
      finally { if (timer) clearTimeout(timer); }
      return list();
    })();
    return readyPromise;
  }
  root.BoboPlayers = Object.freeze({
    init, list, get, selected, select, next, url: sourceURL, audioStatus, reportAudio,
    onUpdate: cb => { if (typeof cb === 'function') listeners.add(cb); }
  });
})(window);
