/* Offline guard: verified language links must be documented, scoped and safe. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('watch.html','utf8');
assert.match(html,/id="watch-official-audio"/);
assert.match(html,/src="bobo-official-audio.js"/);
const data=JSON.parse(fs.readFileSync('data/verified-audio.json','utf8'));
assert.equal(data.schema,1);
assert.ok(Object.keys(data.items).length>=3);
for(const [key,row] of Object.entries(data.items)){
  assert.match(key,/^(tv|movie):\d+$/);
  assert.equal(row.audio,'it');
  assert.ok(['movie','series'].includes(row.scope));
  assert.equal(row.provider,'Crunchyroll');
  assert.match(row.url,/^https:\/\/www\.crunchyroll\.com\/it\//);
  assert.equal(row.url,row.evidence,'Only label a title when its official source advertises Italian audio');
}
new vm.Script(fs.readFileSync('bobo-official-audio.js','utf8'));
console.log('Official ITA: title-specific evidence and safe direct provider links passed');
