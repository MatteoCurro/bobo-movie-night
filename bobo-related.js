(function(){'use strict';
const p=new URLSearchParams(location.search),kind=p.get('type'),id=p.get('id');
if(!['movie','tv'].includes(kind)||!/^[0-9]{1,10}$/.test(id||''))return;
const host=document.getElementById('watch-related-items');
if(!host)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
fetch('data/editorial.json',{cache:'force-cache'}).then(r=>r.ok?r.json():Promise.reject(Error('missing'))).then(feed=>{
const rows=feed.related&&feed.related[kind+':'+id];
if(!Array.isArray(rows)||rows.length<3)return;
const tiles=rows.slice(0,8).filter(x=>x&&['movie','tv'].includes(x.type)&&Number.isInteger(Number(x.tmdb_id))&&/^https:\/\/image\.tmdb\.org\/t\/p\//.test(x.poster||'')).map(x=>
'<a class="watch-related-tile" href="watch.html?type='+encodeURIComponent(x.type)+'&id='+encodeURIComponent(x.tmdb_id)+'"><img src="'+esc(x.poster)+'" alt="" loading="lazy"><strong>'+esc(x.title)+'</strong><small>'+esc(x.year||'')+' · '+(x.type==='tv'?'Serie TV':'Film')+'</small></a>').join('');
if(!tiles)return;host.innerHTML=tiles;document.getElementById('watch-related-section').hidden=false;
}).catch(()=>{});
})();