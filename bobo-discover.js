(function(){'use strict';
const host=document.getElementById('discover-sections');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=s=>typeof s==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\//.test(s)?s:'';
const url=x=>'watch.html?type='+encodeURIComponent(x.type)+'&id='+encodeURIComponent(x.tmdb_id);
function tile(x){if(!x||!['movie','tv'].includes(x.type)||!Number.isInteger(Number(x.tmdb_id)))return '';
const poster=image(x.poster);if(!poster)return '';
return '<a class="discover-tile" href="'+url(x)+'" aria-label="Apri '+esc(x.title)+'">'+
'<div class="discover-art"><img src="'+esc(poster)+'" loading="lazy" alt="">'+
(x.vote?'<span class="discover-score">★ '+esc(Number(x.vote).toFixed(1))+'</span>':'')+
'</div><strong>'+esc(x.title)+'</strong><small>'+esc(x.year||'')+' · '+(x.type==='tv'?'Serie TV':'Film')+'</small></a>';}
fetch('data/editorial.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('unavailable');return r.json()})
.then(data=>{if(data.schema!==1||!Array.isArray(data.sections))throw Error('invalid');
const html=data.sections.map((s,i)=>{if(!Array.isArray(s.items))return '';
const cards=s.items.map(tile).filter(Boolean).join('');if(!cards)return '';
return '<section class="discover-section" aria-labelledby="discover-heading-'+i+'"><div class="discover-section-title"><h2 id="discover-heading-'+i+'">'+esc(s.title)+'</h2></div><p>'+esc(s.subtitle)+'</p><div class="discover-rail">'+cards+'</div></section>';}).join('');
host.innerHTML=html||'<p class="discover-empty">Le selezioni sono in aggiornamento. Esplora intanto il catalogo.</p>';})
.catch(()=>{host.innerHTML='<p class="discover-empty">Le selezioni non sono ancora disponibili. <a href="index.html">Esplora il catalogo</a>.</p>';});
})();