/* Basic parse test for the inline homepage script, without a DOM or network. */
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(x=>x.trim());
assert.ok(scripts.length>0,'Expected inline homepage script');
scripts.forEach((source,i)=>new vm.Script(source,{filename:'index-inline-'+i+'.js'}));
assert.ok(html.includes('<script src="bobo-players.js"></script>'));
console.log('OK: homepage inline JavaScript parses and loads the central registry.');
