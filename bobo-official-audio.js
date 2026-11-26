/* Verified official audiovisual alternatives: titles only, never infer from TMDB genre. */
(function () {
  'use strict';
  function start() {
    const host = document.getElementById('watch-official-audio');
    if (!host) return;
    const params = new URLSearchParams(location.search);
    const type = params.get('type'), id = params.get('id');
    if (!['tv','movie'].includes(type) || !/^\d+$/.test(id||'')) return;
    fetch('data/verified-audio.json', {cache:'no-store'}).then(r=>{
      if (!r.ok) throw new Error('No verified audio index');
      return r.json();
    }).then(feed=>{
      if (!feed || feed.schema!==1 || !feed.items) return;
      const entry = feed.items[type+':'+id];
      if (!entry || entry.audio!=='it' || entry.provider!=='Crunchyroll' ||
          !/^https:\/\/www\.crunchyroll\.com\/it\//.test(entry.url||'')) return;
      const label=document.createElement('strong');
      label.textContent='Audio italiano documentato su '+entry.provider+' · ';
      const link=document.createElement('a');
      link.href=entry.url;
      link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Apri la visione ufficiale';
      const detail=document.createElement('small');
      detail.textContent=entry.scope==='series'
        ? ' Lingua dichiarata per la serie: verifica l’episodio e il tuo abbonamento.'
        : ' Lingua dichiarata per questo film: accesso soggetto a disponibilità e abbonamento.';
      host.replaceChildren(label,link,detail);
      host.hidden=false;
    }).catch(()=>{/* Optional editorial evidence never blocks Bobo playback. */});
  }
  document.addEventListener('DOMContentLoaded',start);
})();
