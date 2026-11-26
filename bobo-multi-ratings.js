/* Licensed, independent audience and critic scores. Never synthesize or guess. */
(function(){
  'use strict';
  function run(){
    const host=document.getElementById('watch-multi-ratings');
    const section=document.getElementById('watch-critic-section');
    if(!host||!section)return;
    const params=new URLSearchParams(location.search),type=params.get('type'),id=params.get('id');
    if(!['movie','tv'].includes(type)||!/^\d{1,10}$/.test(id||''))return;
    const names={imdb:'IMDb',metacritic:'Metacritic',rotten_tomatoes:'Rotten Tomatoes'};
    const scales={imdb:10,metacritic:100,rotten_tomatoes:100};
    fetch('data/multi-ratings.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
      if(!data||data.schema!==1||data.source!=='amodb')return;
      const scores=data.items?.[type+':'+id]?.scores||{};
      const fragment=document.createDocumentFragment();
      for(const [key,name] of Object.entries(names)){
        const row=scores[key];
        if(!row||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||
           row.value>scales[key]||row.scale!==scales[key])continue;
        const card=document.createElement('div');
        card.className='bobo-multi-rating';
        const label=document.createElement('strong');
        label.textContent=name;
        const value=document.createElement('span');
        value.textContent=String(row.value).replace('.',',')+'/'+scales[key];
        card.append(label,value);
        if(Number.isSafeInteger(row.votes)&&row.votes>=0){
          const votes=document.createElement('small');
          votes.textContent=row.votes.toLocaleString('it-IT')+' voti';
          card.appendChild(votes);
        }
        fragment.appendChild(card);
      }
      if(!fragment.childNodes.length)return;
      host.replaceChildren(fragment);
      host.hidden=false;
      section.hidden=false;
      const note=document.getElementById('watch-multi-ratings-note');
      if(note)note.hidden=false;
    }).catch(()=>{/* Ratings are optional and never affect other reviews. */});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();