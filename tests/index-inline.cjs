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
const watch=fs.readFileSync('watch.html','utf8');
const watchScript=fs.readFileSync('bobo-watch.js','utf8');
const homeUI=fs.readFileSync('bobo-ui.js','utf8');
assert.ok(homeUI.includes('window.BoboPlayers.list()'),'Home settings must read the shared registry');
assert.ok(homeUI.includes('bobo-settings-providers'),'Home settings must show dynamic sources');
assert.ok(!homeUI.includes('name="bobo-settings-provider" value="vidsrc"'),'No stale VidSrc-only options');
assert.ok(!html.includes('id="provider-toggle"'),'Provider choices must not live in home header');
assert.ok(html.includes('onclick="openProviderSettings()"'),'Change source opens the shared settings');
assert.ok(!watch.includes('id="watch-source-select"'),'No duplicate selector under watch player');
assert.ok(watch.includes('id="watch-source-settings"'),'Watch player opens source settings');
assert.ok(watchScript.includes("settings(true); }"),'Source button must open watch settings');
console.log('OK: homepage inline script, one dynamic provider settings UI, and no duplicate player selectors.');
