(()=>{'use strict';
const $=id=>document.getElementById(id);
const username=new URLSearchParams(location.search).get('username');
if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username||'')){
 $('user').textContent='Username non valido.';return;
}
async function api(route){
 const r=await fetch('api.php?route='+route,{cache:'no-store',credentials:'include'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Richiesta non riuscita');return data;
}
(async()=>{
 try{
  const me=await api('me');if(me.role!=='admin')throw Error('Accesso admin richiesto');
  const result=await api('admin/favorites&username='+encodeURIComponent(username));
  $('user').textContent='Raccolta di '+result.username;
  $('stats').textContent=result.count+' titoli salvati · '+result.favorites.filter(x=>x.type==='movie').length+' film · '+result.favorites.filter(x=>x.type==='tv').length+' serie';
  if(!result.count){$('list').innerHTML='<p class="empty">Questo utente non ha ancora salvato titoli.</p>';return;}
  for(const item of result.favorites){
   if(!['movie','tv'].includes(item.type)||!/^[0-9]{1,12}$/.test(String(item.tmdb_id)))continue;
   const card=document.createElement('article');card.className='card';
   const link=document.createElement('a');link.className='poster';
   link.href='https://movie.curromatteo.it/watch.html?type='+item.type+'&id='+encodeURIComponent(item.tmdb_id);
   if(/^https:\/\/image\.tmdb\.org\//.test(item.poster||'')){
    const image=document.createElement('img');image.src=item.poster;image.alt='';image.loading='lazy';image.decoding='async';
    image.addEventListener('error',()=>{image.remove();const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent='Locandina non disponibile';link.appendChild(fallback);},{once:true});link.appendChild(image);
   }else{const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent='BOBO';link.appendChild(fallback);}
   const meta=document.createElement('div');meta.className='meta';
   const title=document.createElement('strong');title.textContent=item.title||'Titolo senza nome';
   const detail=document.createElement('small');detail.textContent=(item.type==='tv'?'SERIE TV':'FILM')+(item.year?' · '+item.year:'');
   meta.append(title,detail);card.append(link,meta);$('list').appendChild(card);
  }
 }catch(e){$('user').textContent='Non puoi consultare questa raccolta: '+e.message;}
})();
})();
