/* Per-title Bobo recommendations. Prefer the incremental, sharded archive;
 * editorial recommendations remain a safe fallback during initial backfill. */
(function(){'use strict';
const p=new URLSearchParams(location.search),kind=p.get('type'),id=p.get('id');
if(!['movie','tv'].includes(kind)||!/^[0-9]{1,10}$/.test(id||''))return;
const host=document.getElementById('watch-related-items');
const section=document.getElementById('watch-related-section');
if(!host||!section)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function normalize(row){
  if(Array.isArray(row)){
    const [type,tmdb_id,title,year,file]=row;
    if(!/^[a-zA-Z0-9_-]{4,200}\.(?:jpg|jpeg|png|webp)$/.test(file||''))return null;
    return {type,tmdb_id,title,year,poster:'https://image.tmdb.org/t/p/w342/'+file};
  }
  return row;
}
function render(rows){
  if(!Array.isArray(rows)||rows.length<3)return false;
  const tiles=rows.slice(0,8).map(normalize).filter(x=>
    x&&['movie','tv'].includes(x.type)&&Number.isSafeInteger(Number(x.tmdb_id))&&
    Number(x.tmdb_id)>0&&/^https:\/\/image\.tmdb\.org\/t\/p\//.test(x.poster||''))
    .map(x=>'<a class="watch-related-tile" href="watch.html?type='+encodeURIComponent(x.type)+'&id='+encodeURIComponent(x.tmdb_id)+'"><img src="'+esc(x.poster)+'" alt="" loading="lazy"><strong>'+esc(x.title)+'</strong><small>'+esc(x.year||'')+' · '+(x.type==='tv'?'Serie TV':'Film')+'</small></a>').join('');
  if(!tiles)return false;
  host.innerHTML=tiles;
  section.hidden=false;
  return true;
}
async function run(){
  const bucket=(Number(id)%64).toString(16).padStart(2,'0');
  try {
    const response=await fetch('data/related/'+bucket+'.json',{cache:'no-cache'});
    if(response.ok){
      const data=await response.json();
      if(data?.schema===1&&render(data.items?.[kind+':'+id]))return;
    }
  }catch(_){/* The incremental index is optional. */}
  try{
    const response=await fetch('data/editorial.json',{cache:'force-cache'});
    if(!response.ok)return;
    const data=await response.json();
    render(data?.related?.[kind+':'+id]);
  }catch(_){}
}
run();
})();