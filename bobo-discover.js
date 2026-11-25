/* Uses exactly the same Bobo poster/rail primitives as the catalog. */
(function () {
  'use strict';
  const host=document.getElementById('discover-sections');
  if(!host)return;
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const validImage=value=>typeof value==='string'&&
    /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[a-zA-Z0-9_/.-]+$/.test(value);
  function tile(item){
    if(!item||!['movie','tv'].includes(item.type)||!Number.isSafeInteger(Number(item.tmdb_id))||
       Number(item.tmdb_id)<1||!validImage(item.poster))return '';
    const href='watch.html?type='+encodeURIComponent(item.type)+'&id='+encodeURIComponent(item.tmdb_id);
    const kind=item.type==='tv'?'Serie TV':'Film';
    const rating=Number(item.vote);
    const score=rating>=1&&rating<=10?'★ '+rating.toFixed(1):'';
    const title=escape(item.title||'Titolo');
    const year=escape(item.year||'');
    return '<div class="bobo-item-wrap bobo-discover-item">'+
      '<a class="bobo-tile" href="'+href+'" aria-label="Apri la scheda di '+title+'">'+
      '<span class="bobo-tile-art">'+
      '<img src="'+escape(item.poster)+'" loading="lazy" decoding="async" alt="">'+
      '<span class="bobo-tile-tag">'+kind+'</span>'+
      '<span class="bobo-poster-hover" aria-hidden="true"><strong>'+title+'</strong>'+
      '<span class="bobo-poster-hover-meta">'+year+(score?' · '+escape(score):'')+
      ' · <span class="bobo-kind">'+kind+'</span></span>'+
      '<span class="bobo-poster-hover-hint">ⓘ Apri la scheda</span></span></span>'+
      '<span class="bobo-tile-title">'+title+'</span>'+
      '<span class="bobo-tile-meta">'+year+(score?' · '+escape(score):'')+'</span>'+
      '</a></div>';
  }
  function shelf(section,i){
    if(!section||!Array.isArray(section.items))return '';
    const cards=section.items.map(tile).filter(Boolean);
    if(!cards.length)return '';
    const rail='bobo-discover-rail-'+i;
    const title=escape(section.title||'Da scoprire');
    return '<section class="bobo-shelf bobo-discover-section" aria-labelledby="bobo-discover-heading-'+i+'">'+
      '<div class="bobo-shelf-head"><h2 id="bobo-discover-heading-'+i+'">'+title+'</h2></div>'+
      '<p class="bobo-discover-subtitle">'+escape(section.subtitle||'')+'</p>'+
      '<div class="bobo-rail-frame">'+
      '<button type="button" class="bobo-arrow bobo-arrow--left" data-discover-scroll="'+rail+
      '" data-direction="-1" aria-label="Scorri '+title+' verso sinistra">‹</button>'+
      '<div class="bobo-rail bobo-discover-rail" id="'+rail+'">'+cards.join('')+'</div>'+
      '<button type="button" class="bobo-arrow bobo-arrow--right" data-discover-scroll="'+rail+
      '" data-direction="1" aria-label="Scorri '+title+' verso destra">›</button></div></section>';
  }
  function syncButtons(rail){
    const frame=rail.closest('.bobo-rail-frame');
    if(!frame)return;
    const max=rail.scrollWidth-rail.clientWidth;
    frame.querySelectorAll('[data-discover-scroll]').forEach(button=>{
      button.hidden=max<=4;
      button.disabled=Number(button.dataset.direction)<0?rail.scrollLeft<=3:rail.scrollLeft>=max-3;
    });
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-discover-scroll]');
    if(!button)return;
    const rail=document.getElementById(button.dataset.discoverScroll);
    if(!rail)return;
    rail.scrollBy({left:(Number(button.dataset.direction)||1)*rail.clientWidth*.8,behavior:'smooth'});
  });
  fetch('data/editorial.json',{cache:'no-store'}).then(response=>{
    if(!response.ok)throw new Error('Feed unavailable');
    return response.json();
  }).then(feed=>{
    if(!feed||feed.schema!==1||!Array.isArray(feed.sections))throw new Error('Invalid feed');
    const output=feed.sections.map(shelf).filter(Boolean).join('');
    host.innerHTML=output||'<p class="bobo-discover-empty">Le selezioni sono in aggiornamento. <a href="index.html">Esplora il catalogo</a>.</p>';
    host.querySelectorAll('.bobo-discover-rail').forEach(rail=>{
      rail.addEventListener('scroll',()=>syncButtons(rail),{passive:true});
      if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>syncButtons(rail)).observe(rail);
      syncButtons(rail);
    });
  }).catch(()=>{
    host.innerHTML='<p class="bobo-discover-empty">Non siamo riusciti a caricare le selezioni. <a href="index.html">Esplora il catalogo</a>.</p>';
  });
}());
