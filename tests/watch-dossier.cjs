/* Regression for film dossier: chronological sections, source-checked quotes,
   grouping of creative credits and reviews. No browser or network required. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const watch=fs.readFileSync('watch.html','utf8');
const ids=['watch-cast-section','watch-awards-section','watch-opinions-section',
  'watch-related-section'];
let prev=-1;
for(const id of ids){
  const next=watch.indexOf('id="'+id+'"');
  assert(next>prev,'Natural watch section ordering: '+id);
  prev=next;
}
const parent=watch.indexOf('id="watch-opinions-section"');
const critic=watch.indexOf('id="watch-critic-section"');
const crowd=watch.indexOf('id="watch-reviews-section"');
const related=watch.indexOf('id="watch-related-section"');
const quote=watch.indexOf('id="watch-film-quote"');
const awards=watch.indexOf('id="watch-awards-section"');
const fact=watch.indexOf('id="watch-cinema-fact"');
assert(quote<awards&&awards<parent&&parent<related,'Quotes and awards before reviews; discovery last');
assert(parent<critic&&critic<crowd&&crowd<related,'Reviews must be grouped after awards');
assert(fact>related,'Trivia belongs in discovery, never between cast and reviews');
assert(watch.includes('Guarda il film'),'Hero must offer a prominent viewing action');
assert(watch.indexOf('id="watch-crew"')<watch.indexOf('id="watch-cast-grid"'),
  'Director before cast');
for(const id of ['watch-crew','watch-fact-year','watch-fact-runtime','watch-fact-genres',
  'watch-cast-grid','watch-cast-more','watch-film-quote','watch-film-quote-text',
  'watch-film-quote-context','watch-film-quote-source','watch-cinema-fact']){
  assert(watch.includes('id="'+id+'"'),'Dossier element '+id);
}
const quotes=JSON.parse(fs.readFileSync('data/cinema/film-quotes.json','utf8'));
assert.equal(quotes.schema,1);
assert(Object.keys(quotes.quotes).length>=4);
for(const [key,item] of Object.entries(quotes.quotes)){
  assert(/^movie:[1-9][0-9]{0,9}$/.test(key));
  assert(item.reviewed===true);
  assert(item.title.length>2&&item.speaker.length>1);
  assert(item.text.length>=12&&item.text.length<=140,'A single brief quote, not a screenplay');
  assert(item.context.length>=35,'A relevant editorial explanation is essential');
  assert(/^https:\/\/it\.wikiquote\.org\/wiki\/[^\s?#]+$/.test(item.source_url),
    'Verified film page, not an unauthenticated list');
}
const filmScript=fs.readFileSync('bobo-cinema.js','utf8');
assert(filmScript.includes("loadFilmQuote()"));
assert(filmScript.includes("observeOpinions()"));
assert(filmScript.includes("renderCredits(entry)"));
assert(filmScript.includes("renderQuote(payload.quotes[filmType+':'+filmId])"));
const watchScript=fs.readFileSync('bobo-watch.js','utf8');
assert(watchScript.includes("byId('watch-fact-year')"));
assert(watchScript.includes("byId('watch-cast-section')"));

// Execute the actual render functions against a small DOM substitute.
class Element{
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.hidden=false;this.textContent='';
    this.attributes={};this.classList={add:()=>{}};
  }
  append(...parts){this.children.push(...parts);}
  prepend(part){this.children.unshift(part);}
  setAttribute(n,v){this.attributes[n]=String(v);}
  getAttribute(n){return this.attributes[n]??null;}
}
const nodes={};
let ready=false;
const doc={
  getElementById(id){return ready?(nodes[id]??=new Element()):null;},
  createElement(tag){return new Element(tag);},
  querySelector(){return null;},
  createTextNode(s){return {textContent:s};}
};
let observer;
class MutationObserverStub{
  constructor(cb){observer=cb;}
  observe(){}
}
const anchor='  void watch();\n';
assert(filmScript.includes(anchor));
const context={
  document:doc,location:{search:'?type=movie&id=238'},URLSearchParams,
  MutationObserver:MutationObserverStub,console,Intl,Date
};
vm.runInNewContext(filmScript.replace(anchor,
  '  globalThis.__testing={renderCredits,renderQuote,observeOpinions};\n'+anchor),context);
const helpers=context.__testing;
assert(helpers);
ready=true;
const entry={crew:[{id:8,name:'Regista Test',job:'Director',
  photo:'https://image.tmdb.org/t/p/w342/director.jpg'},
  {id:9,name:'Sceneggiatore Test',job:'Writer'}],
cast:Array.from({length:13},(_,i)=>({id:i+1,name:'Attore '+(i+1),character:'Parte '+(i+1),
  photo:'https://image.tmdb.org/t/p/w342/abc.jpg'}))};
helpers.renderCredits(entry);
assert.equal(nodes['watch-crew'].children.length,2,'Regia and writing groups');
assert.equal(nodes['watch-crew'].children[0].children[0].textContent,'Regia');
const directorCard=nodes['watch-crew'].children[0].children[1].children[0];
assert(directorCard.href.includes('director.html?id=8'));
assert.equal(directorCard.children[0].children[0].src,
  'https://image.tmdb.org/t/p/w342/director.jpg','Director portrait is visible');
assert(directorCard.children[1].textContent.includes('Regista'));

assert.equal(nodes['watch-cast-grid'].children.length,13);
assert(nodes['watch-cast-grid'].children.slice(8).every(x=>x.hidden));
const more=nodes['watch-cast-more'];
assert(!more.hidden);
more.onclick();
assert(nodes['watch-cast-grid'].children.every(x=>!x.hidden));
assert.equal(more.getAttribute('aria-expanded'),'true');
more.onclick();
assert(nodes['watch-cast-grid'].children.slice(8).every(x=>x.hidden));
helpers.renderQuote(quotes.quotes['movie:238']);
assert.equal(nodes['watch-film-quote'].hidden,false);
assert(nodes['watch-film-quote-text'].textContent.includes('offerta'));
assert(nodes['watch-film-quote-source'].href.startsWith('https://it.wikiquote.org/'));
nodes['watch-film-quote'].hidden=true;
helpers.renderQuote({...quotes.quotes['movie:238'],source_url:'javascript:alert(1)'});
assert(nodes['watch-film-quote'].hidden,'Untrusted quote URLs must be rejected');
doc.getElementById('watch-critic-section').hidden=true;
doc.getElementById('watch-reviews-section').hidden=true;
helpers.observeOpinions();
assert(nodes['watch-opinions-section'].hidden);
nodes['watch-critic-section'].hidden=false;
observer();
assert.equal(nodes['watch-opinions-section'].hidden,false,'Ratings must reveal the shared chapter');
console.log('Watch dossier: story order, grouped cast, reviews and verified quotes OK');
