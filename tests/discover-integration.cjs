/* Regression guard: Discover is a Bobo page, never a standalone microsite. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const pages=['index.html','watch.html','favorites.html','discover.html'];
const nav=read('bobo-friends.js');
assert.match(nav,/\{name:'Discover',url:'discover\.html'\}/,'Discover must be in the canonical navigation');
assert.match(nav,/file==='discover\.html'&&dest==='discover\.html'/,'Discover must be marked active');
for(const page of pages){
 const html=read(page);
 assert.match(html,/src="bobo-friends\.js"/,'Shared navigation must load on '+page);
 assert.match(html,/href="bobo-retro\.css"/,'Shared design system must load on '+page);
 assert.match(html,/href="bobo-polish\.css"/,'Shared polish must load on '+page);
}
const discover=read('discover.html');
assert.match(discover,/<header class="site-header">/);
assert.match(discover,/class="brand"/);
assert.match(discover,/href="bobo-ui\.css"/);
assert.match(discover,/href="bobo-cloud\.css"/);
assert.match(discover,/src="bobo-library\.js"/);
assert.match(discover,/src="bobo-cloud\.js"/);
assert.doesNotMatch(discover,/discover-header|discover-brand|font-family:\s*Inter/);
assert.doesNotMatch(read('index.html'),/aria-label="Scopri film e serie selezionati"/,
  'No independent header link: use shared nav');
assert.match(read('bobo-cloud.js'),/allowed=\[[^\]]*'discover\.html'/,
  'Discover must be a valid post-login return destination');
const css=read('bobo-discover.css');
assert.doesNotMatch(css,/:root\s*\{|\.discover-header\s*\{|font-family:\s*Inter/);
const generator=read('scripts/build_editorial.py');
assert.match(generator,/editorial-history\.json/);
for(const js of ['bobo-friends.js','bobo-discover.js','bobo-cloud.js','bobo-related.js']){
 new Function(read(js)); // syntax-check without executing browser code
}
const dataset=JSON.parse(read('data/editorial.json'));
assert.equal(dataset.schema,1);
assert.ok(dataset.sections.length>=3,'Discover should have at least three populated sections');
assert.ok(dataset.sections.some(s=>(s.items||[]).length>=4));
assert.ok(dataset.sections.every(s=>(s.items||[]).every(x=>x.vote_count>=200)),
  'No low-sample 10/10 picks may appear in editorial sections');
console.log('Discover integration: navigation, visual identity, accounts, cards and feed OK');
