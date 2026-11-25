/* Home and detail-page hero image CDN sizes must not silently regress. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const homeAnchor="  document.addEventListener('DOMContentLoaded',init);";
let home=fs.readFileSync('bobo-ui.js','utf8');
assert(home.includes(homeAnchor));
home=home.replace(homeAnchor,"  globalThis.__renderHomeHero=hero;\n"+homeAnchor);
const homeContext={
  window:{},document:{addEventListener(){}},console,
  escH(value){return String(value).replaceAll('&','&amp;').replaceAll('"','&quot;');}
};
vm.runInNewContext(home,homeContext,{filename:'bobo-ui.js'});
const html=homeContext.__renderHomeHero({
  type:'movie',tmdb_id:42,title:'Un film',year:2026,
  backdrop:'https://image.tmdb.org/t/p/w342/Back123.jpg',overview:'Una storia.'
},false);
assert.match(html,/src="https:\/\/image\.tmdb\.org\/t\/p\/w1280\/Back123\.jpg"/);
assert.match(html,/srcset="https:\/\/image\.tmdb\.org\/t\/p\/w780\/Back123\.jpg 780w, https:\/\/image\.tmdb\.org\/t\/p\/w1280\/Back123\.jpg 1280w"/);
assert.match(html,/sizes="\(/);
assert.match(html,/fetchpriority="high"/);

const watchAnchor="  document.addEventListener('DOMContentLoaded',setup);";
let watch=fs.readFileSync('bobo-watch.js','utf8');
assert(watch.includes(watchAnchor));
watch=watch.replace(watchAnchor,"  globalThis.__renderWatchHero=renderTitle;\n"+watchAnchor);
const nodes={};
const document={
  title:'',
  getElementById(id){return nodes[id] ||= {hidden:false,textContent:'',children:[],replaceChildren(...children){this.children=children;}};},
  createElement(tag){return {tagName:tag.toUpperCase(),src:'',srcset:'',sizes:'',loading:'',fetchPriority:'',decoding:'',alt:''};},
  addEventListener(){}
};
const watchContext={
  document,window:{},location:{href:'https://movie.curromatteo.it/watch.html?type=movie&id=42',search:'?type=movie&id=42'},
  localStorage:{getItem(){return null;}},URL,URLSearchParams,console
};
vm.runInNewContext(watch,watchContext,{filename:'bobo-watch.js'});
const info={
  tmdb_id:42,title:'Un film',year:2026,vote:7.5,type:'movie',
  backdrop:'https://image.tmdb.org/t/p/w342/Back123.jpg',
  poster:'https://image.tmdb.org/t/p/w342/Poster123.jpg',
  genres:['Avventura'],overview:'Trama'
};
watchContext.__renderWatchHero(info);
let hero=nodes['watch-backdrop'].children[0];
assert.match(hero.src,/\/w1280\/Back123\.jpg$/);
assert.match(hero.srcset,/\/w780\/Back123\.jpg 780w, .*\/w1280\/Back123\.jpg 1280w$/);
assert.equal(hero.sizes,'100vw');
assert.equal(hero.fetchPriority,'high');
watchContext.__renderWatchHero({...info,backdrop:''});
hero=nodes['watch-backdrop'].children[0];
assert.match(hero.src,/\/w780\/Poster123\.jpg$/,'Poster fallback must use a supported TMDB poster size');
assert.match(hero.srcset,/\/w500\/Poster123\.jpg 500w, .*\/w780\/Poster123\.jpg 780w$/);
assert(!hero.srcset.includes('w1280'),'Poster must not request a non-existent w1280 variant');
console.log('OK: responsive w780/w1280 home and detail hero, correct poster fallback and priority.');