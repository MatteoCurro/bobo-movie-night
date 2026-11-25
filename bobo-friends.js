/* Bobo Friends Edition: wordmark, quiet easter eggs and a friendly welcome question.
 * IMPORTANT: this front-end question is NOT authentication; all deployed files remain public.
 */
(function () {
  'use strict';

  const KEY = 'bobo_friends_welcome_v1';
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const WORDMARK = '<span class="bobo-wordmark-main">bobo<i>.</i></span>'+
    '<span class="bobo-wordmark-side"><span>MOVIE</span><b>NIGHT / CLUB</b></span>';

  function storedAccess() {
    try {
      const timestamp = Number(localStorage.getItem(KEY));
      return Number.isFinite(timestamp) && timestamp > 0 &&
        (Date.now() - timestamp) >= 0 && (Date.now() - timestamp) < MAX_AGE_MS;
    } catch (_) { return false; }
  }

  function normalizeAnswer(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('it').replace(/[^a-z]/g, '');
  }

  function unlock() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (_) {}
    document.documentElement.classList.add('bobo-unlocked');
    const gate = document.getElementById('bobo-gate');
    if (gate) gate.remove();
  }

  function wordmark() {
    const host = document.querySelector('header .logo, .site-header .brand');
    if (!host) return;
    host.classList.add('bobo-wordmark');
    host.innerHTML = WORDMARK;
    host.setAttribute('title','Bobo Movie Night');
    if (host.tagName !== 'A') {
      host.setAttribute('role','link');
      host.tabIndex = 0;
      host.addEventListener('click',function () { location.href = 'index.html'; });
      host.addEventListener('keydown',function (event) {
        if (event.key === 'Enter') location.href = 'index.html';
      });
    }
  }

  function siteNavigation() {
    const header=document.querySelector('header');
    if(!header)return;
    const original=header.querySelector('nav');
    if(original)original.remove();
    const oldLink=header.querySelector('.bobo-library-nav');
    if(oldLink)oldLink.remove();
    let nav=header.querySelector('.bobo-site-nav');
    if(!nav){
      nav=document.createElement('nav');
      nav.className='bobo-site-nav';
      nav.setAttribute('aria-label','Navigazione principale');
      const pages=[
        {name:'Home',url:'index.html'},
        {name:'Film',url:'index.html#movies'},
        {name:'Serie TV',url:'index.html#tv'},
        {name:'Preferiti',url:'favorites.html'}
      ];
      pages.forEach(p=>{
        const a=document.createElement('a');
        a.href=p.url;a.textContent=p.name;
        nav.appendChild(a);
      });
      const search=header.querySelector('.search-wrap');
      if(search)header.insertBefore(nav,search);
      else {
        const settings=header.querySelector('#watch-settings-trigger,.settings-trigger,#bobo-settings-open');
        if(settings)header.insertBefore(nav,settings);
        else header.appendChild(nav);
      }
    }
    function markActive(){
      const file=location.pathname.split('/').pop()||'index.html';
      const home=file==='index.html';
      nav.querySelectorAll('a').forEach(a=>{
        const dest=a.getAttribute('href');
        const current=(file==='favorites.html'&&dest==='favorites.html')||
          (home&&dest==='index.html'&&!['#tv','#movies'].includes(location.hash))||
          (home&&dest==='index.html#movies'&&location.hash==='#movies')||
          (home&&dest==='index.html#tv'&&location.hash==='#tv');
        if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
      });
    }
    markActive();
    window.addEventListener('hashchange',markActive);
  }

  function welcomeQuestion() {
    // Two deliberately simple inside jokes; this is not a secret or password check.
    const questions = [
      { question: 'Come si chiama il cane di Bobo?', answers: ['faiva'], hint: 'Un nome, cinque lettere.' },
      { question: 'Cosa fa Bobo una volta a settimana?', answers: ['arrampica','arrampicata'], hint: 'Una sola parola.' }
    ];
    const chosen = questions[new Date().getDate() % questions.length];
    const gate = document.createElement('div');
    gate.id = 'bobo-gate';
    gate.innerHTML =
      '<section class="bobo-gate-card" role="dialog" aria-modal="true" aria-labelledby="bobo-gate-question">'+
      '<div class="bobo-gate-kicker">Friends edition / 001</div>'+
      '<div class="bobo-wordmark">'+WORDMARK+'</div>'+
      '<h1>Un piccolo check prima del film.</h1>'+
      '<p class="bobo-gate-intro">Niente account, niente formalità. Solo una domanda per chi ci conosce.</p>'+
      '<form id="bobo-gate-form" autocomplete="off">'+
      '<label for="bobo-gate-input" id="bobo-gate-question">'+chosen.question+'</label>'+
      '<div class="bobo-gate-fields"><input id="bobo-gate-input" name="answer" type="text" placeholder="La tua risposta…" autocorrect="off" autocapitalize="none" spellcheck="false" required aria-describedby="bobo-gate-error">'+
      '<button type="submit">Entra ↗</button></div>'+
      '<p class="bobo-gate-error" id="bobo-gate-error" role="status"></p>'+
      '</form><div class="bobo-gate-meta">Un club piccolissimo. Il cinema molto grande.</div></section>';
    document.body.appendChild(gate);
    const input = document.getElementById('bobo-gate-input');
    document.getElementById('bobo-gate-form').addEventListener('submit',function(event) {
      event.preventDefault();
      if (chosen.answers.includes(normalizeAnswer(input.value))) { unlock(); return; }
      document.getElementById('bobo-gate-error').textContent =
        'Mmh, non proprio. '+chosen.hint;
      input.focus();
      input.select();
    });
    input.focus();
  }

  function footer() {
    if (document.querySelector('.bobo-footer')) return;
    const footer = document.createElement('footer');
    footer.className = 'bobo-footer';
    // Single-color outline drawings: ridge, carabiner and a very minimal sheepdog face.
    const icons = [
      { title:'La via giusta', message:'Il crux? Scegliere il prossimo film.',
        path:'<path d="m2 18 6-9 4 5 3-4 7 8"/><path d="m8 9 1.7 2.6L12 14"/>' },
      { title:'Sempre in sicura', message:'Prima si controlla il nodo, poi si preme play.',
        path:'<path d="M15 3a5 5 0 0 0-5 0L5.4 7.5a6 6 0 0 0 0 8.5l2.6 2.6a5 5 0 0 0 7 0l2.6-2.6a6 6 0 0 0 0-8.5L15 5"/><path d="m16.7 6.5-5.4 5.4"/>' },
      { title:'Faiva approved', message:'Faiva approva. Ma fuori si lavora meglio.',
        path:'<path d="m6 7-3-3v9l4 7h10l4-7V4l-3 3-4-2h-4L6 7Z"/><path d="M9 12h.01M15 12h.01"/><path d="m10 16 2 1 2-1"/>' }
    ];
    const buttons = icons.map(function (icon, index) {
      return '<button type="button" data-easter="'+index+'" title="'+icon.title+
        '" aria-label="'+icon.title+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+icon.path+'</svg></button>';
    }).join('');
    footer.innerHTML =
      '<div class="bobo-footer-copy"><i class="bobo-footer-signal" aria-hidden="true"></i>'+
      '<span>BOBO / MOVIE NIGHT</span><span>·</span><span>FRIENDS EDITION</span></div>'+
      '<div class="bobo-easter"><span class="bobo-easter-note" id="bobo-easter-note" aria-live="polite"></span>'+
      buttons+'</div>';
    document.body.appendChild(footer);
    let noteTimeout;
    footer.addEventListener('click',function(event) {
      const button = event.target.closest('[data-easter]');
      if (!button) return;
      const item = icons[Number(button.dataset.easter)];
      if (!item) return;
      const note = document.getElementById('bobo-easter-note');
      note.textContent = item.message;
      clearTimeout(noteTimeout);
      noteTimeout = setTimeout(function() { note.textContent = ''; }, 6500);
    });
  }


  const SMALL_SIGNS = {
    ridge: {
      label: 'A due passi dalla cima',
      message: 'Ancora un tiro e poi scegliamo il film.',
      svg: '<path d="m2 18 6-9 4 5 3-4 7 8"/><path d="m8 9 1.7 2.6L12 14"/>'
    },
    faiva: {
      label: 'Faiva sta osservando',
      message: 'Faiva dice: focus. Poi popcorn.',
      svg: '<path d="m6 7-3-3v9l4 7h10l4-7V4l-3 3-4-2h-4L6 7Z"/><path d="M9 12h.01M15 12h.01"/><path d="m10 16 2 1 2-1"/>'
    },
    carabiner: {
      label: 'Controllo del moschettone',
      message: 'Check del nodo completato. Premi play.',
      svg: '<path d="M15 3a5 5 0 0 0-5 0L5.4 7.5a6 6 0 0 0 0 8.5l2.6 2.6a5 5 0 0 0 7 0l2.6-2.6a6 6 0 0 0 0-8.5L15 5"/><path d="m16.7 6.5-5.4 5.4"/>'
    },
    whistle: {
      label: 'Un piccolo richiamo',
      message: 'Due fischi, uno stop, e il film comincia.',
      svg: '<circle cx="8" cy="15" r="4"/><path d="m12 14 5-5h4v5h-9"/><path d="M16 9V6"/>'
    }
  };

  /* Flat decorative micro-animations. No image/video downloads and reduced-motion friendly. */
  // Only the animated previews obtained from the user's Flaticon examples.
  // Do not fall back to the unrelated static silhouette set.
  const EASTER_ICONS={climb:[],dog:[]};
  const chosenIcons=new Set();
  async function loadFlaticonIcons() {
    try {
      const response=await fetch('assets/flaticon/manifest.json');
      if(!response.ok)return;
      const data=await response.json();
      if(!data || data.schema!==1 || !Array.isArray(data.icons))return;
      for(const icon of data.icons) {
        if(!['climb','dog'].includes(icon.category) ||
           !/^assets\/flaticon\/mono\/[a-z0-9-]+\.gif$/.test(icon.file))continue;
        EASTER_ICONS[icon.category].push(icon.file);
      }
      if(EASTER_ICONS.climb.length||EASTER_ICONS.dog.length){
        const footer=document.querySelector('.bobo-footer');
        if(footer && !footer.querySelector('.bobo-flaticon-credit')){
          const credit=document.createElement('a');
          credit.className='bobo-flaticon-credit';
          credit.href='https://www.flaticon.com/';
          credit.target='_blank';
          credit.rel='noopener noreferrer';
          credit.textContent='Animazioni: Freepik e Magnific via Flaticon';
          footer.appendChild(credit);
        }
      }
      addTinyScenes();
    } catch(_) { /* Decorative images must never affect the rest of Bobo. */ }
  }
  function pickEasterIcon(kind) {
    const list=EASTER_ICONS[kind] || [];
    if(!list.length)return null;
    const available=list.filter(name=>!chosenIcons.has(name));
    const pool=available.length?available:list;
    const choice=pool[Math.floor(Math.random()*pool.length)];
    if(choice)chosenIcons.add(choice);
    return choice;
  }
  function addTinyScenes() {
    const targets=[
      ['.bobo-feature','climb','hero'],
      ['.title-hero','dog','hero'],
      ['.bobo-feed-group:not(.bobo-feed-group-secondary)','dog','section'],
      ['.bobo-feed-group-secondary','climb','section'],
      ['.bobo-fav-heading','dog','favorites']
    ];
    for(const entry of targets){
      const host=document.querySelector(entry[0]);
      if(!host || host.querySelector('.bobo-mini-scene'))continue;
      const file=pickEasterIcon(entry[1]);
      if(!file)continue;
      const scene=document.createElement('span');
      scene.className='bobo-mini-scene bobo-mini-scene--'+entry[2];
      scene.setAttribute('aria-hidden','true');
      const img=document.createElement('img');
      img.src=file;
      img.alt='';
      img.loading='lazy';
      img.decoding='async';
      scene.appendChild(img);
      host.appendChild(scene);
    }
  }

  let eggToastTimer;
  function smallEasterEggs() {
    const positions = [
      ['.bobo-feature .bobo-eyebrow','ridge'],
      ['.bobo-filter-dock-head','whistle'],
      ['.hero-content .eyebrow','faiva'],
      ['.bobo-shelf[aria-label="Voglia di anni 2000?"] .bobo-shelf-head h2','carabiner'],
      ['.bobo-shelf[aria-label="Film da scoprire"] .bobo-shelf-head h2','faiva']
    ];
    positions.forEach(function(entry) {
      const host = document.querySelector(entry[0]);
      if (!host || host.querySelector('.bobo-tiny-egg')) return;
      const sign = SMALL_SIGNS[entry[1]];
      const el = document.createElement('button');
      el.className = 'bobo-tiny-egg';
      el.type = 'button';
      el.dataset.boboSign = entry[1];
      el.title = sign.label;
      el.setAttribute('aria-label',sign.label);
      el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'+sign.svg+'</svg>';
      host.appendChild(el);
    });
    addTinyScenes();
  }
  function showEasterMessage(message) {
    let toast = document.querySelector('.bobo-easter-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'bobo-easter-toast';
      toast.setAttribute('role','status');
      document.body.appendChild(toast);
    }
    toast.hidden = false;
    toast.textContent = message;
    clearTimeout(eggToastTimer);
    eggToastTimer = setTimeout(function() { toast.hidden = true; },5500);
  }
  function installSmallEasterEggs() {
    document.addEventListener('click',function(event) {
      const button = event.target.closest && event.target.closest('[data-bobo-sign]');
      if (!button) return;
      const sign = SMALL_SIGNS[button.dataset.boboSign];
      if (sign) showEasterMessage(sign.message);
    });
    smallEasterEggs();
    const main = document.querySelector('main');
    if (!main || typeof MutationObserver !== 'function') return;
    let queued = false;
    const observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function() {
        queued = false;
        smallEasterEggs();
      });
    });
    observer.observe(main,{ childList:true,subtree:true });
  }

  function start() {
    wordmark();
    siteNavigation();
    footer();
    installSmallEasterEggs();
    loadFlaticonIcons();
    if (storedAccess()) document.documentElement.classList.add('bobo-unlocked');
    else welcomeQuestion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
}());
