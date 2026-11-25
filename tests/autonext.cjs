/* Zero-dependency behavioral test for Bobo's Vix episode switching.
 * Runs with Node.js in GitHub Actions, simulating postMessage and DOM swaps.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(id='') {
    this.id=id; this.listeners={}; this.hidden=false; this.disabled=false;
    this.src=''; this.value=''; this.textContent=''; this.checked=false;
    this.dataset={}; this.attributes={}; this.classList={add(){},remove(){}};
    this.contentWindow={owner:id, token:Math.random()};
    this.children=[]; this.tagName='DIV';
  }
  addEventListener(name,fn) { (this.listeners[name]??=[]).push(fn); }
  dispatch(name,evt={}) { (this.listeners[name]||[]).forEach(fn=>fn.call(this,evt)); }
  setAttribute(k,v) { this.attributes[k]=v; }
  removeAttribute(k) { if(k==='src')this.src=''; delete this.attributes[k]; }
  cloneNode() { const f=new Element(this.id); f.src=this.src; return f; }
  replaceWith(f) { nodes[this.id]=f; }
  replaceChildren(...items) { this.children=items; }
  appendChild(x) {this.children.push(x); return x;}
  append(...items) {this.children.push(...items);}
  querySelector() {return new Element('inner');}
  scrollIntoView() {}
  focus() {}
  blur() {}
}
const nodes={};
const signals={};
const document={
  title:'Test',fullscreenEnabled:true,fullscreenElement:null,
  getElementById(id) { return nodes[id] ||= new Element(id); },
  createElement(tag) { const e=new Element(); e.tagName=tag.toUpperCase(); return e; },
  querySelector() { return new Element(); },
  querySelectorAll() { return []; },
  addEventListener(type,handler) { (signals['document:'+type]??=[]).push(handler); },
  documentElement:{classList:{add(){},remove(){}}}
};
const loc={search:'?type=tv&id=1234',href:'https://movie.curromatteo.it/watch.html?type=tv&id=1234'};
const history={replaceState(a,b,url){loc.href=url;}};
const info={
  type:'tv',tmdb_id:1234,title:'Test Series',year:2026,poster:'',
  overview:'A test series',genres:['Dramma'],seasons:[
    {n:1,episodes:3},{n:2,episodes:3},{n:3,episodes:3}
  ]
};
const store={};
const ctx={
  window:{addEventListener(type,handler){(signals['window:'+type]??=[]).push(handler);}},
  document,location:loc,history,
  localStorage:{getItem(k){return store[k]??null;},setItem(k,v){store[k]=v;}},
  sessionStorage:{getItem(k){return k==='bobo_selected_title'?JSON.stringify(info):null;}},
  console,URL,URLSearchParams
};
const stage=document.getElementById('watch-player-stage');
stage.requestFullscreen=function(){document.fullscreenElement=stage;return Promise.resolve();};
document.getElementById('watch-iframe');
vm.runInNewContext(fs.readFileSync('bobo-watch.js','utf8'),ctx,{filename:'bobo-watch.js'});
assert.equal((signals['document:DOMContentLoaded']||[]).length,1);
signals['document:DOMContentLoaded'][0]();

function click(id) { const b=document.getElementById(id); assert(b.listeners.click?.length); b.dispatch('click'); }
function event(kind,src,origin='https://vixsrc.to') {
  (signals['window:message']||[]).forEach(fn=>fn({
    origin,
    source:src||document.getElementById('watch-iframe').contentWindow,
    data:{type:'PLAYER_EVENT',data:{event:kind,currentTime:43,duration:43,video_id:1}}
  }));
}
click('watch-start');
let frame=document.getElementById('watch-iframe');
assert.match(frame.src,/tv\/1234\/1\/1\?lang=it$/);
const firstWindow=frame.contentWindow;
click('watch-theater-button');
assert.equal(document.fullscreenElement,stage);

event('ended',null,'https://untrusted.invalid');
assert.match(document.getElementById('watch-iframe').src,/tv\/1234\/1\/1\?lang=it$/);
event('ended'); // Valid ended can arrive without earlier play/timeupdate.
const second=document.getElementById('watch-iframe');
assert.notEqual(second,frame,'The old iframe must be replaced, not merely re-addressed');
assert.notEqual(second.contentWindow,firstWindow);
assert.match(second.attributes.sandbox,/allow-scripts/);
assert.doesNotMatch(second.attributes.sandbox,/allow-popups|allow-top-navigation/);
assert.match(second.src,/tv\/1234\/1\/2\?lang=it&autoplay=true$/);
assert.match(loc.href,/s=1&e=2/);
assert.equal(document.fullscreenElement,stage,'Bobo theater must stay fullscreen');
frame=second;
event('ended',firstWindow);
assert.equal(document.getElementById('watch-iframe'),frame,'Old iframe events must be ignored');

for(let n=0;n<3;n++) {event('timeupdate');event('ended');}
frame=document.getElementById('watch-iframe');
assert.match(frame.src,/tv\/1234\/2\/2\?lang=it&autoplay=true$/);
const capped=frame;
event('play');event('ended');
assert.equal(document.getElementById('watch-iframe'),capped,'Five-episode cap must stop the sequence');
click('watch-next');
assert.match(document.getElementById('watch-iframe').src,/tv\/1234\/2\/3\?lang=it$/);
event('play');event('ended');
assert.match(document.getElementById('watch-iframe').src,/tv\/1234\/3\/1\?lang=it&autoplay=true$/);
console.log('OK: ended-only message, trusted Vix origin, sandbox popup protection, player swap, duplicate suppression, theater retained.');
