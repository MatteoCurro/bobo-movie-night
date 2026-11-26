/* Independent Italian editorial review links; no third-party article text copied. */
(function(){
  'use strict';
  function run(){
    const host=document.getElementById('watch-critic-list');
    const section=document.getElementById('watch-critic-section');
    if(!host||!section)return;
    const p=new URLSearchParams(location.search);
    const kind=p.get('type'),id=p.get('id');
    if(!['movie','tv'].includes(kind)||!/^\d{1,10}$/.test(id||''))return;
    const sources={comingsoon:'ComingSoon',cinematografo:'Cinematografo',movieplayer:'Movieplayer'};
    const hosts={comingsoon:'www.comingsoon.it',cinematografo:'www.cinematografo.it',movieplayer:'movieplayer.it'};
    fetch('data/critic-reviews.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
      if(!data||data.schema!==1)return;
      const records=data.items?.[kind+':'+id]||[];
      const fragment=document.createDocumentFragment();
      const seen=new Set();
      records.forEach(rec=>{
        if(!rec||!sources[rec.source]||seen.has(rec.url))return;
        let url;
        try{
          url=new URL(rec.url);
          if(url.protocol!=='https:'||url.hostname!==hosts[rec.source]||url.username||url.password||url.port)return;
        }catch(_){return;}
        if(rec.source==='comingsoon'&&!/^\/film\/[^/]+\/\d+\/recensione\/?$/.test(url.pathname))return;
        if(rec.source==='cinematografo'&&!/^\/recensioni\/[^/]+$/.test(url.pathname))return;
        if(rec.source==='movieplayer'&&!/^\/articoli\/[^/]+\/?$/.test(url.pathname))return;
        seen.add(rec.url);
        const card=document.createElement('a');
        card.className='bobo-critic-card';
        card.href=rec.url;
        card.rel='noopener noreferrer';
        card.target='_blank';
        const from=document.createElement('strong');
        from.className='bobo-critic-source';
        from.textContent=sources[rec.source];
        const title=document.createElement('span');
        title.textContent=String(rec.title||'Leggi la recensione').slice(0,180);
        const hint=document.createElement('small');
        hint.textContent='Leggi la recensione originale';
        card.append(from,title,hint);
        fragment.appendChild(card);
      });
      if(!fragment.childNodes.length)return;
      host.replaceChildren(fragment);
      section.hidden=false;
    }).catch(()=>{/* External articles never block the film card. */});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();