/* Hover catalog regression suite: both shelf and search must retain their
   original touch presentation and real, independent click controls. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('bobo-ui.js','utf8');
const anchor="  document.addEventListener('DOMContentLoaded',init);";
assert(source.includes(anchor),'Bobo catalog test seam changed');
const instrumented=source.replace(anchor,[
  "  globalThis.__catalogTests={",
  "    tile:posterTile,shelf:shelf,results:renderResults,updateRail:updateRailButtons,",
  "    setResults(items){lastResults=items;shown=60;unifiedFilters.q='test';}",
  "  };",
  anchor
].join('\n'));
const nodes={};
const doc={
  getElementById(id){return nodes[id] ||= {innerHTML:'',textContent:'',hidden:false};},
  addEventListener(){}
};
const context={
  document:doc,window:{},console,URL,URLSearchParams,
  escH(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
};
vm.runInNewContext(instrumented,context,{filename:'bobo-ui.js'});
const ui=context.__catalogTests;
const base={tmdb_id:42,type:'movie',title:'Film dimostrativo',year:2026,vote:7.6,
  poster:'https://image.tmdb.org/t/p/w342/Poster123.jpg',overview:'Trama'};
const tv={...base,type:'tv',tmdb_id:43,title:'Serie dimostrativa',
  seasons:[{n:1,episodes:20},{n:2,episodes:8}]};
function assertTile(text) {
  assert.match(text,/class="bobo-poster-hover"/,'Hover details exist');
  assert.match(text,/class="bobo-poster-hover-meta"/,'Metadata available on hover');
  assert.match(text,/class="bobo-poster-hover-hint">ⓘ Dettagli/,'Detail action is communicated');
  assert.match(text,/class="bobo-tile-tag"/,'Type tag preserved');
  assert.match(text,/data-bobo-id="/,'Existing modal click routing is retained');
  assert.match(text,/class="bobo-tile-title"|class="bobo-result-title"/,'Touch layout keeps original title');
  assert.match(text,/class="bobo-tile-meta"|class="bobo-result-meta"/,'Touch layout keeps original metadata');
  // Absolutely no nested buttons: separate heart and open-page controls
  // are injected by bobo-enhance.js into a wrapper outside this button.
  assert.equal((text.match(/<button\b/g)||[]).length,1);
}
assertTile(ui.tile(base));
assertTile(ui.tile(tv));
const shelf=ui.shelf('trending','Novità',[base,tv,{...base,tmdb_id:44},{...base,tmdb_id:45}],'Fonte TMDB');
assert.match(shelf,/<div class="bobo-rail-frame">/);
assert.match(shelf,/class="bobo-arrow bobo-arrow--left"[^>]*data-direction="-1"/);
assert.match(shelf,/class="bobo-arrow bobo-arrow--right"[^>]*data-direction="1"/);
assert.match(shelf,/<div class="bobo-rail" id="bobo-rail-trending">/);
assert(!shelf.includes('bobo-shelf-nav'),'Buttons have moved out of the heading');
ui.setResults([base,tv]);
ui.results();
const grid=nodes.grid.innerHTML;
assert.match(grid,/class="bobo-result"/);
const sample=grid.match(/<button[^>]*class="bobo-result"[\s\S]*?<\/button>/);
assert(sample);
assertTile(sample[0]);

const buttons={left:{hidden:null,disabled:null},right:{hidden:null,disabled:null}};
const frame={querySelector(selector){return selector.includes('--left')?buttons.left:buttons.right;}};
const rail={closest(selector){assert.equal(selector,'.bobo-rail-frame');return frame;},
  scrollWidth:900,clientWidth:300,scrollLeft:0};
ui.updateRail(rail);
assert.equal(buttons.left.disabled,true);
assert.equal(buttons.right.disabled,false);
assert.equal(buttons.left.hidden,false);
rail.scrollLeft=600;
ui.updateRail(rail);
assert.equal(buttons.left.disabled,false);
assert.equal(buttons.right.disabled,true);
rail.scrollWidth=300;
ui.updateRail(rail);
assert.equal(buttons.left.hidden,true);
assert.equal(buttons.right.hidden,true);

const css=fs.readFileSync('bobo-polish.css','utf8');
const enhancer=fs.readFileSync('bobo-enhance.js','utf8');
assert.match(css,/@media \(hover:hover\) and \(pointer:fine\)/,
  'Overlay must be limited to actual mouse/trackpad input');
assert.match(css,/\.bobo-item-wrap .bobo-tile-title/);
assert.match(css,/\.bobo-poster-hover\{[\s\S]*?opacity:0;visibility:hidden/);
assert.match(css,/\.bobo-item-wrap:is\(:hover,:focus-within\) \.bobo-poster-hover/);
assert.match(css,/\.bobo-rail-frame>\.bobo-arrow\{/);
assert.match(css,/#watch-main \.title-backdrop\{[\s\S]*?mask-image:linear-gradient/);
assert.match(css,/#watch-main \.title-backdrop::after\{/);
assert.match(enhancer,/wrap\.appendChild\(favoriteButton\(kind,id,'bobo-save-corner'\)\)/);
assert.match(enhancer,/open\.className='bobo-quick-open'/);
assert.match(enhancer,/open\.dataset\.boboPlay=id/);
assert.match(enhancer,/wrap\.appendChild\(open\)/);
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/bobo-enhance\.js/);
console.log('OK: hover-only poster detail, touch fallback, separate actions, centered arrows and seamless hero fade.');