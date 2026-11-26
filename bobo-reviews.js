/* Bobo: compact, attributed TMDB community-review previews from our own archive. */
(function () {
  'use strict';
  function init() {
    const section=document.getElementById('watch-reviews-section');
    const rail=document.getElementById('watch-reviews-list');
    if(!section || !rail)return;
    const params=new URLSearchParams(location.search);
    const type=params.get('type'), id=params.get('id');
    if(!['movie','tv'].includes(type) || !/^\d{1,10}$/.test(id||''))return;
    fetch('data/reviews.json',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error('Review archive unavailable');
      return response.json();
    }).then(data=>{
      if(data?.schema!==1 || data.source!=='TMDB')return;
      const entry=data.items?.[type+':'+id];
      const reviews=entry?.reviews;
      if(!Array.isArray(reviews)||!reviews.length)return;
      const block=document.createDocumentFragment();
      reviews.slice(0,3).forEach(review=>{
        if(!review || review.language!=='it' ||
           !/^https:\/\/www\.themoviedb\.org\/review\/[a-f\d]{20,40}$/i.test(review.url||''))return;
        const card=document.createElement('article');
        card.className='bobo-review-card';
        const heading=document.createElement('div');
        heading.className='bobo-review-head';
        const author=document.createElement('strong');
        author.textContent=String(review.author||'Utente TMDB').slice(0,64);
        heading.appendChild(author);
        if(Number.isFinite(review.rating) && review.rating>=0 && review.rating<=10){
          const score=document.createElement('span');
          score.className='bobo-review-rating';
          score.textContent='★ '+Number(review.rating).toLocaleString('it-IT')+'/10';
          heading.appendChild(score);
        }
        const quote=document.createElement('p');
        quote.textContent=String(review.excerpt||'').slice(0,150);
        const footer=document.createElement('div');
        footer.className='bobo-review-foot';
        const date=document.createElement('time');
        if(/^\d{4}-\d{2}-\d{2}$/.test(review.created_at||'')){
          date.dateTime=review.created_at;
          date.textContent=review.created_at.split('-').reverse().join('/');
        }
        const link=document.createElement('a');
        link.href=review.url;
        link.rel='noopener noreferrer';link.target='_blank';
        link.textContent='Leggi su TMDB';
        footer.append(date,link);
        card.append(heading,quote,footer);
        block.appendChild(card);
      });
      if(!block.childNodes.length)return;
      rail.replaceChildren(block);
      section.hidden=false;
    }).catch(()=>{/* Archive is an optional editorial enhancement. */});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
