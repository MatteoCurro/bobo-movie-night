/* One coherent discovery experience for a title: verified cast reunions,
 * attributed connections, then the existing genre-based related suggestions. */
(function(){
  'use strict';
  const p=new URLSearchParams(location.search),kind=p.get('type'),id=p.get('id');
  if(!['movie','tv'].includes(kind)||!/^[0-9]{1,10}$/.test(id||'')||Number(id)<1)return;
  const host=document.getElementById('watch-related-items');
  const section=document.getElementById('watch-related-section');
  const togetherHost=document.getElementById('watch-together');
  const factHost=document.getElementById('watch-cinema-fact');
  if(!host||!section)return;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const image=v=>typeof v==='string'&&
    /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[a-zA-Z0-9_-]{4,200}\.(?:jpg|jpeg|png|webp)$/.test(v)?v:'';
  const valid=entry=>entry&&['movie','tv'].includes(entry.type)&&
    /^[0-9]{1,10}$/.test(String(entry.tmdb_id||''))&&Number(entry.tmdb_id)>0;
  const mediaKey=x=>x.type+':'+x.tmdb_id;
  const href=x=>'watch.html?type='+encodeURIComponent(x.type)+'&id='+encodeURIComponent(x.tmdb_id);
  function normalize(row){
    if(Array.isArray(row)){
      const [type,tmdb_id,title,year,file]=row;
      if(!/^[a-zA-Z0-9_-]{4,200}\.(?:jpg|jpeg|png|webp)$/.test(file||''))return null;
      return {type,tmdb_id,title,year,poster:'https://image.tmdb.org/t/p/w342/'+file};
    }
    return row;
  }
  async function read(url){
    try{
      const response=await fetch(url,{cache:'no-cache'});
      if(!response.ok)return null;
      const data=await response.json();
      return data&&data.schema===1?data:null;
    }catch(_){return null;}
  }
  function card(x){
    if(!valid(x)||!image(x.poster))return '';
    const title=esc(x.title||'Titolo'),year=esc(x.year||'');
    const reason=typeof x.reason==='string'?x.reason.slice(0,100):'';
    return '<a class="watch-related-tile" href="'+href(x)+'">'+
      '<img src="'+esc(x.poster)+'" alt="" loading="lazy" decoding="async">'+
      '<strong>'+title+'</strong><small>'+year+' · '+(x.type==='tv'?'Serie TV':'Film')+'</small>'+
      (reason?'<span class="bobo-connection-reason">'+esc(reason)+'</span>':'')+'</a>';
  }
  function reunion(pairs){
    if(!togetherHost||!Array.isArray(pairs))return;
    const entries=pairs.slice(0,2).filter(item=>valid(item&&item.work)&&
      Array.isArray(item.people)&&item.people.length>=2&&image(item.work.poster));
    if(!entries.length)return;
    togetherHost.innerHTML='<div class="bobo-together-heading"><strong>Dove li hai già visti insieme?</strong>'+
      '<span>Incroci tra i cast del nostro catalogo</span></div>'+
      '<div class="bobo-together-grid">'+entries.map(item=>{
        const names=item.people.slice(0,3).map(x=>esc(x.name||'Interprete')).join(' · ');
        const work=item.work;
        return '<a class="bobo-together-card" href="'+href(work)+'">'+
          '<img src="'+esc(work.poster)+'" alt="" loading="lazy" decoding="async">'+
          '<span><strong>'+names+'</strong><small>Compaiono anche in</small>'+
          '<b>'+esc(work.title||'Titolo')+'</b><small>Scopri il film ↗</small></span></a>';
      }).join('')+'</div>';
    togetherHost.hidden=false;
  }
  function fact(value){
    if(!factHost||typeof value!=='string'||!value.trim())return;
    factHost.textContent='';
    const label=document.createElement('span');
    label.className='bobo-cinema-fact-label';
    label.textContent='LO SAPEVI?';
    const text=document.createElement('p');
    text.textContent=value.slice(0,240);
    factHost.append(label,text);
    factHost.hidden=false;
  }
  function render(verified,generic){
    const used=new Set([kind+':'+id]),rows=[];
    for(const source of [verified,generic]){
      for(const raw of Array.isArray(source)?source:[]){
        const x=normalize(raw);
        if(!valid(x)||!image(x.poster)||used.has(mediaKey(x)))continue;
        used.add(mediaKey(x));
        rows.push(x);
        if(rows.length===8)break;
      }
      if(rows.length===8)break;
    }
    const html=rows.map(card).filter(Boolean).join('');
    if(!html)return;
    host.innerHTML=html;
    section.hidden=false;
    const note=document.getElementById('watch-related-note');
    if(note)note.textContent=verified&&verified.length?
      'Regia, interpreti e premi in comune. Completano la selezione i film affini per genere.':
      'Altri film e serie affini per genere, periodo e valutazioni.';
  }
  async function run(){
    const filmBucket=(Number(id)%128).toString(16).padStart(2,'0');
    const relBucket=(Number(id)%64).toString(16).padStart(2,'0');
    const [connections,related]=await Promise.all([
      read('data/cinema/connections/'+filmBucket+'.json'),
      read('data/related/'+relBucket+'.json')
    ]);
    const context=connections&&connections.items&&connections.items[kind+':'+id];
    if(context){
      reunion(context.together);
      fact(context.fact);
    }
    let generic=related&&related.items&&related.items[kind+':'+id];
    if(!Array.isArray(generic)||!generic.length){
      const editorial=await read('data/editorial.json');
      generic=editorial&&editorial.related&&editorial.related[kind+':'+id];
    }
    render(context&&context.connections,generic);
  }
  void run();
})();
