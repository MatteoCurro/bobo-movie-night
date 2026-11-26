/* Smoke test of the actual home renderer: no duplicate visible film tiles. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const homeAnchor="  document.addEventListener('DOMContentLoaded',init);";
let source=fs.readFileSync('bobo-ui.js','utf8');
assert(source.includes(homeAnchor));
source=source.replace(homeAnchor,"  globalThis.__testHome=renderHome;\n"+homeAnchor);

const genres=['Azione','Commedia','Fantascienza','Thriller','Animazione','Dramma'];
const movie=Array.from({length:100},(_,i)=>({
  type:'movie',tmdb_id:i+101,title:'Film '+i,poster:'https://image.tmdb.org/t/p/w342/Poster123.jpg',
  backdrop:'https://image.tmdb.org/t/p/w342/Backdrop123.jpg',
  year:2026-(i%14),vote:9-(i%20)*.1,overview:'Una storia.',
  runtime:104,genres:[genres[i%genres.length]],original_language:'it'
}));
const tv=Array.from({length:70},(_,i)=>({
  type:'tv',tmdb_id:i+501,title:'Serie '+i,poster:'https://image.tmdb.org/t/p/w342/Poster123.jpg',
  backdrop:'https://image.tmdb.org/t/p/w342/Backdrop123.jpg',
  year:2026-(i%12),vote:9-(i%17)*.1,overview:'Una storia.',
  genres:[genres[i%genres.length]],seasons:[]
}));
const host={innerHTML:''};
const document={
  addEventListener(){},
  getElementById(id){return id==='bobo-discover'?host:null;},
  querySelectorAll(){return [];},
  hidden:false
};
const context={
  window:{},document,location:{hash:'',href:'https://example.invalid/index.html'},
  catalogs:{movie,tv},loaded:{movie:true,tv:true},escH:v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;'),
  localStorage:{getItem(){return '';},setItem(){}},
  sessionStorage:{getItem(){return '';},setItem(){}},
  requestAnimationFrame(){},clearInterval(){},setInterval(){return 1;},
  console,Date,Math,URL,URLSearchParams
};
vm.runInNewContext(source,context,{filename:'bobo-ui.js'});
assert.equal(typeof context.__testHome,'function');
context.__testHome();
const output=host.innerHTML;
assert(output.includes('bobo-home-crossroads'));
assert(output.includes('data-bobo-surprise'));
assert(output.includes('awards.html'));
assert(output.includes('discover.html'));
assert(!output.includes('Anime più recenti'));
assert(!output.includes('Film appena segnalati'));
assert(!output.includes('Viaggia nel tempo'));
const tiles=[...output.matchAll(/class="bobo-tile" data-bobo-id="(\d+)" data-bobo-type="([^"]+)"/g)]
  .map(match=>match[2]+':'+match[1]);
assert(tiles.length>12, 'Home needs useful film rows');
assert.equal(new Set(tiles).size,tiles.length,'No repeated tiles across home rails');
const rails=(output.match(/class="bobo-shelf"/g)||[]).length;
assert(rails>=3&&rails<=12,'Home must stay concise: '+rails+' rails');
assert(output.includes('bobo-feature'),'Existing native hero must remain');
console.log('Home: magazine cards, no repeated posters, concise shelves and working entry points OK');
