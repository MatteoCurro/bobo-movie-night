/* Awards discovery using only our archived winner records. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const params=new URLSearchParams(location.search);
 const escape=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const img=v=>typeof v==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/[a-zA-Z0-9/_.-]+$/.test(v)?v:'';
 let archive=[], event=['Oscar','Cannes'].includes(params.get('event'))?params.get('event'):'Oscar';
 let category=params.get('category')||'';
 let visible=30, results=[];
 function groups(){return archive.filter(g=>g.event===event&&g.count>0);}
 function sync(){
   document.querySelectorAll('[data-awards-event]').forEach(button=>
     button.setAttribute('aria-pressed',String(button.dataset.awardsEvent===event)));
   const list=groups();
   const select=$('bobo-awards-category');
   const categories=list.slice().sort((a,b)=>a.category.localeCompare(b.category,'it'));
   select.innerHTML='<option value="">Tutte le categorie</option>'+
     categories.map(g=>'<option value="'+escape(g.category)+'">'+escape(g.category)+' ('+g.count+')</option>').join('');
   if(category&&!categories.some(g=>g.category===category))category='';
   select.value=category;
   const featured=$('bobo-awards-featured');
   const highlights=list.filter(g=>/Miglior film$|Palma d.oro|Miglior regia|animazione|internazionale/i.test(g.category))
     .sort((a,b)=>b.count-a.count).slice(0,5);
   featured.hidden=!highlights.length;
   featured.innerHTML=highlights.map(g=>'<button type="button" data-awards-category="'+escape(g.category)+'"'+
     ' aria-pressed="'+String(category===g.category)+'">'+
     '<span>'+escape(g.category)+'</span><strong>'+g.count+'</strong><small>film vincitori</small></button>').join('');
   const unique=new Map();
   for(const g of list)if(!category||g.category===category)
     for(const item of g.films||[])if(item&&Number(item.id)>0&&!unique.has(item.id))unique.set(item.id,item);
   results=[...unique.values()].sort((a,b)=>(Number(b.year)||0)-(Number(a.year)||0)||
     (Number(b.vote)||0)-(Number(a.vote)||0));
   $('bobo-awards-current').textContent=category||'Tutti i vincitori · '+event;
   $('bobo-awards-count').textContent=results.length+(results.length===1?' film':' film');
   visible=30;
   render();
   const newUrl=new URL(location.href);
   newUrl.searchParams.set('event',event);
   if(category)newUrl.searchParams.set('category',category);else newUrl.searchParams.delete('category');
   history.replaceState(null,'',newUrl.pathname+newUrl.search);
 }
 function tile(item){
   const src=img(item.poster);
   const name=escape(item.title||'Film');
   const id=Number(item.id);
   return '<a class="bobo-awards-tile" href="watch.html?type=movie&id='+id+'" aria-label="Apri '+name+'">'+
     '<span class="bobo-awards-poster">'+(src?'<img src="'+escape(src)+'" alt="" loading="lazy" decoding="async">':
       '<span class="bobo-awards-poster-placeholder" aria-hidden="true">✳</span>')+
     '</span><strong>'+name+'</strong><small>'+escape(item.year||'')+
     (Number(item.vote)>0?' · ★ '+Number(item.vote).toFixed(1):'')+'</small></a>';
 }
 function render(){
   const grid=$('bobo-awards-grid');
   $('bobo-awards-status').hidden=true;
   grid.innerHTML=results.length?results.slice(0,visible).map(tile).join(''):
     '<p class="bobo-discover-empty">'+(event==='Cannes' ? 'I vincitori di Cannes sono in fase di verifica: non sono ancora presenti dati affidabili in questa raccolta.' : 'Nessun vincitore indicizzato per questa selezione.')+' <a href="discover.html">Altre idee su Discover</a>.</p>';
   const more=$('bobo-awards-more');
   more.hidden=visible>=results.length;
   more.textContent='Mostra altri '+Math.min(30,results.length-visible)+' film';
 }
 document.addEventListener('click',evt=>{
   const eventButton=evt.target.closest('[data-awards-event]');
   if(eventButton){event=eventButton.dataset.awardsEvent;category='';sync();return;}
   const categoryButton=evt.target.closest('[data-awards-category]');
   if(categoryButton){category=categoryButton.dataset.awardsCategory;sync();}
 });
 $('bobo-awards-category').addEventListener('change',e=>{category=e.target.value;sync();});
 $('bobo-awards-more').addEventListener('click',()=>{visible+=30;render();});
 fetch('data/cinema/explore.json',{cache:'no-cache'}).then(r=>{
   if(!r.ok)throw Error('awards index');
   return r.json();
 }).then(doc=>{
   if(doc.schema!==1||!Array.isArray(doc.awards))throw Error('bad awards index');
   archive=doc.awards;
   sync();
 }).catch(()=>{
   $('bobo-awards-status').textContent='L’archivio dei premi è momentaneamente non disponibile. Puoi continuare da Discover.';
 });
}());