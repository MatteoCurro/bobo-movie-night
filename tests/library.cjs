const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(values = {}) {
  const map = new Map(Object.entries(values));
  const events = [];
  const window = {dispatchEvent(e){events.push(e);}};
  const sandbox = {
    window,
    localStorage:{
      getItem(k){return map.has(k)?map.get(k):null;},
      setItem(k,v){map.set(k,String(v));}
    },
    CustomEvent:class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail;}},
    Date,JSON
  };
  vm.runInNewContext(fs.readFileSync('bobo-library.js','utf8'),sandbox,{filename:'bobo-library.js'});
  return {library:window.BoboLibrary,map,events};
}
const first=setup();
const movie={type:'movie',tmdb_id:88111,title:'Prova Film',poster:'https://image.tmdb.org/t/p/w500/abcd.jpg'};
const show={type:'tv',tmdb_id:22333,title:'Prova Serie'};
assert.equal(first.library.read().length,0);
assert.equal(first.library.toggle(movie).saved,true);
assert.equal(first.library.toggle(show).saved,true);
assert.equal(first.library.has('tv',22333),true);
assert.equal(first.library.read().length,2);
const backup=first.library.exportText();
assert.equal(first.library.toggle(movie).saved,false);
assert.equal(first.library.has('movie',88111),false);
const reloaded=setup(Object.fromEntries(first.map.entries()));
assert.equal(reloaded.library.read().length,1,'Favorites persist across browser sessions');
assert.equal(reloaded.library.importText(backup),2);
assert.equal(reloaded.library.has('movie',88111),true);
assert.equal(reloaded.library.importText(backup),2,'Reimport is idempotent');
assert.throws(()=>reloaded.library.importText('{"format":"invalid","items":[]}'),/backup/);
assert.equal(reloaded.library.toggle({type:'movie',tmdb_id:'no',title:'x'}).saved,false);
assert.equal(reloaded.events.some(e=>e.type==='bobo:favorites-change'),true);
console.log('OK: favorite save, remove, persist, import/export, duplicate protection.');
