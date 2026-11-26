/* Regression: new platform brands must retain their label, shelf and storage wiring. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('bobo-enhance.js','utf8');
const css=fs.readFileSync('bobo-polish.css','utf8');
const home=fs.readFileSync('bobo-ui.js','utf8');
const watch=fs.readFileSync('watch.html','utf8');
const script=fs.readFileSync('bobo-reviews.js','utf8');
const platforms=['netflix','prime','disney','apple','paramount','skygo','now','hbo','rai','mediaset','crunchyroll'];
for(const name of platforms){
  assert.ok(source.includes(name+':{name:'),'Missing badge '+name);
  assert.ok(css.includes('.bobo-platform--'+name+' {'),'Missing brand-accent CSS '+name);
}
assert.match(source,/data\/enrichment\.json/,'Incremental per-title TMDB observations should decorate labels');
assert.match(source,/data\/catalog-ledger\.json/,'Historical provider observations must survive');
assert.match(source,/data\.platforms \|\| \[\]/,'Discovery TMDB shelves should also contribute labels');
assert.match(source,/\[preferred,\.\.\.ids\.filter/,'Matching platform shelf badge must be first');
assert.match(home,/data-bobo-platform/,'Platform name should remain attached to its home shelf');
assert.match(watch,/id="watch-reviews-list"/,'Reviews are displayed inside Bobo watch pages');
assert.match(watch,/bobo-reviews\.js/);
assert.match(script,/data\/reviews\.json/);
new Function(source);
new Function(script);
const config=JSON.parse(fs.readFileSync('data/player-sources.json','utf8'));
assert.equal(config.providers.vidcore.enabled,false,'English-only backup must be disabled');
console.log('Platform labels: 11 provider accents, permanent observations, shelf priority and review UI OK');
