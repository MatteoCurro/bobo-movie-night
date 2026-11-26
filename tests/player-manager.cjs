/* BOBO Player Manager behavior and URL contract; no external network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = JSON.parse(fs.readFileSync('data/player-sources.json', 'utf8'));
let storage = {};
const window = {
  localStorage: {
    getItem(k) { return storage[k] ?? null; },
    setItem(k,v) { storage[k] = String(v); }
  },
  fetch: async url => {
    assert.equal(url, 'data/player-sources.json');
    return { ok: true, json: async () => config };
  }
};
const context = { window, URL, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync('bobo-players.js', 'utf8'), context);
const P = window.BoboPlayers;
assert.equal(P.selected(), 'vix');
assert.deepEqual(Array.from(P.list(), p => p.id), ['vix','vidlink','vidsrc']);
assert.equal(P.url('vix',{type:'movie',tmdbId:550}), 'https://vixsrc.to/movie/550?lang=it');
assert.equal(P.url('vix',{type:'tv',tmdbId:1396,season:1,episode:2},true), 'https://vixsrc.to/tv/1396/1/2?lang=it&autoplay=true');
assert.equal(P.url('vidlink',{kind:'movie',tmdbId:550}), 'https://vidlink.pro/movie/550');
assert.equal(P.url('vidsrc',{type:'movie',tmdb_id:550}), 'https://vidsrc.sh/embed/movie/550?ds_lang=it');
assert.equal(P.url('vidsrc',{type:'tv',tmdbId:1396,season:1,episode:1}), 'https://vidsrc.sh/embed/tv/1396/1/1?ds_lang=it');
assert.equal(P.url('vix',{type:'movie',tmdbId:'<script>'}), '');
assert.equal(P.url('vidlink',{type:'tv',tmdbId:1396,season:1,episode:0}), '');
P.select('vidlink');
assert.equal(P.selected(), 'vidlink');
assert.equal(P.next('vidlink'), 'vidsrc');
assert.equal(P.next('vidsrc'), 'vix');
(async () => {
  await P.init();
  assert.equal(P.selected(), 'vidlink');
  assert.equal(P.get('vidrift'), null);
  // Next cache read never becomes a dependency for basic playback.
  assert.ok(storage.bobo_player_sources_v1);
  console.log('OK: shared provider registry, Italian-audio flags, safe IDs, remote config, and fallback order.');
})().catch(err=>{ console.error(err); process.exitCode=1; });
