const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const text=fs.readFileSync('bobo-library.js','utf8');
function boot(initial={}) {
  const map=new Map(Object.entries(initial));
  const events=[];
  const ctx={
    window:{dispatchEvent:e=>events.push(e)},
    localStorage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    TextEncoder,TextDecoder,
    btoa:s=>Buffer.from(s,'latin1').toString('base64'),
    atob:s=>Buffer.from(s,'base64').toString('latin1'),
    Date,JSON,Uint8Array
  };
  vm.runInNewContext(text,ctx,{filename:'bobo-library.js'});
  return {lib:ctx.window.BoboLibrary,map,events};
}
const original={type:'tv',tmdb_id:1234,title:'La prima serie',genres:['Fantasy']};
const device1=boot({'bobo-favorites-v1':JSON.stringify([original])});
assert.equal(device1.lib.profile(),'Ospite');
assert.equal(device1.lib.read().length,1,'Migrates old favorites into guest profile');
device1.lib.switchProfile('Matteo');
assert.equal(device1.lib.profile(),'Matteo');
assert.equal(device1.lib.read().length,0,'Named profile is an independent local collection');
device1.lib.toggle({type:'movie',tmdb_id:5678,title:'Il film',genres:['Commedia']});
device1.lib.toggle({type:'tv',tmdb_id:1111,title:'Un’altra serie',genres:['Giallo']});
assert.equal(device1.lib.read().length,2);
device1.lib.switchProfile('Ospite');
assert.equal(device1.lib.read().length,1);
const restarted=boot(Object.fromEntries(device1.map));
restarted.lib.switchProfile('matteo');
assert.equal(restarted.lib.read().length,2,'Favorites survive restarting the browser');
const recovery=restarted.lib.recoveryCode();
assert.match(recovery,/^BMF2\./);
const device2=boot();
assert.equal(device2.lib.profile(),'Ospite');
assert.equal(device2.lib.importRecoveryCode(recovery),2,'Portable recovery code imports entries on a new browser');
assert.equal(device2.lib.profile(),'Matteo','Recovery restores source profile name');
assert.equal(device2.lib.has('movie',5678),true);
assert.equal(device2.lib.importRecoveryCode(recovery),2,'Recovery repeated is idempotent');
assert.throws(()=>device2.lib.switchProfile(''),/nome|caratteri/i);
console.log('OK: legacy migration, local username isolation, persistence and cross-browser recovery.');
