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
  function spotlight(feed){
    const target=document.getElementById('discover-spotlight');
    const item=feed.sections?.flatMap(section=>section.items||[])
      .find(item=>item.type==='movie'&&validImage(item.poster)&&item.overview);
    if(!target||!item)return;
    const src=validImage(item.poster)?item.poster:'';
    const title=escape(item.title||'Film da scoprire');
    const href='watch.html?type=movie&id='+encodeURIComponent(item.tmdb_id);
    const description=escape(String(item.overview||'').slice(0,220));
    target.innerHTML='<div class="bobo-discover-feature-copy">'+
      '<span class="eyebrow">IL FILM CHE APRE LA SERATA</span>'+
      '<h2>'+title+'</h2>'+
      '<p>'+description+(String(item.overview||'').length>220?'…':'')+'</p>'+
      '<div class="bobo-discover-feature-meta">'+escape(item.year||'')+
      (Number(item.vote)>0?' · ★ '+Number(item.vote).toFixed(1):'')+'</div>'+
      '<a href="'+href+'" class="bobo-discover-feature-link">Entra nella storia ↗</a></div>'+
      '<a href="'+href+'" class="bobo-discover-feature-cover" aria-label="Apri '+title+'">'+
      '<img loading="lazy" decoding="async" src="'+escape(src)+'" alt=""></a>';
    target.hidden=false;
  }
  function personCard(person,mode){
    if(!person||!(Number(person.id)>0))return '';
    const name=escape(person.name||'');
    const href=(mode==='director'?'director':'person')+'.html?id='+encodeURIComponent(person.id);
    const photo=validImage(person.photo)?'<img loading="lazy" decoding="async" alt="" src="'+escape(person.photo)+'">':
      '<span aria-hidden="true">◉</span>';
    const related=(person.films||[]).slice(0,2).filter(item=>item&&Number(item.id)>0)
      .map(item=>'<a href="watch.html?type='+encodeURIComponent(item.type||'movie')+
        '&id='+encodeURIComponent(item.id)+'">'+escape(item.title||'Titolo')+'</a>').join(' · ');
    return '<article class="bobo-discover-person-card">'+
      '<a class="bobo-discover-person-face" href="'+href+'" aria-label="Apri '+name+'">'+photo+'</a>'+
      '<div class="bobo-discover-person-info"><a href="'+href+'" class="bobo-discover-person-name">'+name+'</a>'+
      '<small>'+escape(person.works||0)+' opere nel catalogo</small>'+
      '<p>'+related+'</p><a class="bobo-discover-person-link" href="'+href+'">Esplora la filmografia ↗</a></div></article>';
  }
  function peopleSelections(data){
    const host=document.getElementById('discover-people');
    if(!host||!data||!data.featured)return;
    const actors=(data.featured.actors||[]).slice(0,4);
    const directors=(data.featured.directors||[]).slice(0,3);
    const blocks=[];
    if(actors.length)blocks.push('<div class="bobo-discover-people-head"><div><span class="eyebrow">PERSONE / '+escape(data.week||'')+
      '</span><h2>Le facce che ti restano in mente.</h2>'+
      '<p>Interpreti scelti tra i titoli più presenti nel nostro archivio. Una nuova selezione ogni settimana.</p></div>'+
      '<a href="person.html">Tutti gli interpreti ↗</a></div>'+
      '<div class="bobo-discover-person-grid">'+actors.map(p=>personCard(p,'actor')).join('')+'</div>');
    if(directors.length)blocks.push('<div class="bobo-discover-people-head bobo-discover-people-head--directors">'+
      '<div><span class="eyebrow">DIETRO LE QUINTE</span><h2>La firma dietro il film.</h2>'+
      '<p>Registi da riscoprire attraverso le opere che hanno diretto.</p></div>'+
      '<a href="director.html">Esplora i registi ↗</a></div>'+
      '<div class="bobo-discover-person-grid bobo-discover-person-grid--directors">'+
      directors.map(p=>personCard(p,'director')).join('')+'</div>');
    host.innerHTML=blocks.join('');
    host.hidden=!blocks.length;
  }
  function awardsSelections(data){
    const host=document.getElementById('discover-awards');
    if(!host||!Array.isArray(data?.awards))return;
    const categories=data.awards.filter(group=>group.count>0).sort((a,b)=>b.count-a.count);
    const order=[
      ['Oscar','Miglior film'], ['Oscar','Miglior regia'],
      ['Oscar',"Miglior film d'animazione"],['Cannes',"Palma d'oro"]
    ];
    const chosen=order.map(([event,category])=>categories.find(g=>g.event===event&&g.category===category))
      .filter(Boolean);
    for(const group of categories){
      if(chosen.length>=4)break;
      if(!chosen.includes(group))chosen.push(group);
    }
    if(!chosen.length)return;
    const cards=chosen.map(g=>{
      const href='awards.html?event='+encodeURIComponent(g.event)+'&category='+encodeURIComponent(g.category);
      return '<a href="'+href+'" class="bobo-discover-award-card">'+
        '<span class="bobo-discover-award-event">'+escape(g.event)+'</span>'+
        '<strong>'+escape(g.category)+'</strong>'+
        '<span class="bobo-discover-award-count">'+g.count+' '+(g.count===1?'film':'film')+' nel catalogo</span>'+
        '<span class="bobo-discover-award-open">Esplora i vincitori ↗</span></a>';
    }).join('');
    host.innerHTML='<div class="bobo-discover-award-head"><div><span class="eyebrow">PREMI / ARCHIVIO</span>'+
      '<h2>Il cinema premiato.</h2>'+
      '<p>Oscar, Cannes, categorie e vincitori: raccolte consultabili, non un elenco di link.</p></div>'+
      '<a href="awards.html">Archivio dei premi ↗</a></div>'+
      '<div class="bobo-discover-award-grid">'+cards+'</div>';
    host.hidden=false;
  }
  Promise.allSettled([
    fetch('data/editorial.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('feed');return r.json();}),
    fetch('data/cinema/explore.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('explore');return r.json();})
  ]).then(([feedResult,exploreResult])=>{
    if(exploreResult.status==='fulfilled'&&exploreResult.value.schema===1){
      peopleSelections(exploreResult.value);
      awardsSelections(exploreResult.value);
    }
    if(feedResult.status!=='fulfilled'||feedResult.value.schema!==1||
       !Array.isArray(feedResult.value.sections)){
      host.innerHTML='<p class="bobo-discover-empty">Le selezioni sono in aggiornamento. <a href="index.html">Esplora il catalogo</a>.</p>';
      return;
    }
    spotlight(feedResult.value);
    const sections=feedResult.value.sections.filter(s=>s.items?.length).slice(0,6);
    const output=sections.map(shelf).filter(Boolean).join('');
    host.innerHTML=output||'<p class="bobo-discover-empty">Le selezioni sono in aggiornamento. <a href="index.html">Esplora il catalogo</a>.</p>';
    host.querySelectorAll('.bobo-discover-rail').forEach(rail=>{
      rail.addEventListener('scroll',()=>syncButtons(rail),{passive:true});
      if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>syncButtons(rail)).observe(rail);
      syncButtons(rail);
    });
  }).catch(()=>{
    host.innerHTML='<p class="bobo-discover-empty">Le selezioni sono momentaneamente indisponibili. <a href="index.html">Esplora il catalogo</a>.</p>';
  });
}());
