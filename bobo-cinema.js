/* Bobo cinema archive: credits on watch pages, biographies on actor pages.
 * Reads only incremental local JSON shards; no browser API keys or bulk downloads. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const filmType = params.get('type');
  const filmId = params.get('id');
  const personId = params.get('id');
  const directorMode = !!document.querySelector('[data-person-mode="director"]');
  const validId = value => /^[0-9]{1,10}$/.test(value || '') && Number(value) > 0;
  const byId = id => document.getElementById(id);
  const image = value => typeof value === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\//.test(value) ? value : '';
  const safeDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const d = new Date(value + 'T12:00:00Z');
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('it-IT', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(d);
  };
  function node(tag, css, text) {
    const el = document.createElement(tag);
    if (css) el.className = css;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function profileLink(person, director = false) {
    const a = node('a', 'bobo-person-link');
    a.href = (director ? 'director.html?id=' : 'person.html?id=') + encodeURIComponent(person.id);
    return a;
  }
  async function shard(group, number) {
    const suffix = (Number(number) % 128).toString(16).padStart(2, '0');
    const response = await fetch('data/cinema/' + group + '/' + suffix + '.json', {cache:'no-cache'});
    if (!response.ok) return null;
    const data = await response.json();
    return data && data.schema === 1 && data.items && typeof data.items === 'object' ? data.items : null;
  }
  function renderCredits(entry) {
    const section = byId('watch-cast-section');
    const castHost = byId('watch-cast-grid');
    const crewHost = byId('watch-crew');
    if (!section || !castHost || !entry) return;
    const actors = Array.isArray(entry.cast) ? entry.cast : [];
    const crew = Array.isArray(entry.crew) ? entry.crew : [];
    for (const person of crew.filter(x => x && validId(String(x.id))).slice(0, 8)) {
      const link = profileLink(person, person.job === 'Director');
      link.textContent = person.name || 'Persona';
      const label = person.job === 'Director' ? 'Regia' :
        person.job === 'Creator' ? 'Ideazione' : 'Sceneggiatura';
      const group = node('span', 'bobo-crew-item');
      group.append(node('strong', '', label + ': '), link);
      crewHost.append(group);
    }
    for (const person of actors.filter(x => x && validId(String(x.id))).slice(0, 16)) {
      const link = profileLink(person);
      link.classList.add('bobo-actor');
      const portrait = image(person.photo);
      const frame = node('span', 'bobo-actor-photo');
      if (portrait) {
        const img = node('img');
        img.src = portrait;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        frame.append(img);
      } else frame.append(node('span', 'bobo-actor-placeholder', '◉'));
      link.append(frame, node('strong', '', person.name || 'Interprete'));
      if (person.character) link.append(node('small', '', person.character));
      castHost.append(link);
    }
    section.hidden = !castHost.children.length && !crewHost.children.length;
  }
  function renderAwards(entry) {
    const section = byId('watch-awards-section');
    const host = byId('watch-awards-list');
    if (!section || !host || !entry) return;
    const awards = Array.isArray(entry.awards) ? entry.awards : [];
    for (const award of awards.slice(0, 30)) {
      if (!award || !['Oscar', 'Cannes'].includes(award.event) ||
          !['won', 'nominated'].includes(award.outcome)) continue;
      const card = node('div', 'bobo-award');
      const top = node('div', 'bobo-award-top');
      top.append(node('strong', '', award.event));
      top.append(node('span', 'bobo-award-status ' +
        (award.outcome === 'won' ? 'is-winner' : ''), award.outcome === 'won' ? 'Vinto' : 'Candidatura'));
      const names = {
        'Best Picture': 'Miglior film',
        'Best Director': 'Miglior regia',
        'Best Actor': 'Miglior attore protagonista',
        'Best Actress': 'Miglior attrice protagonista',
        'Best Supporting Actor': 'Miglior attore non protagonista',
        'Best Supporting Actress': 'Miglior attrice non protagonista',
        'Best Animated Feature': 'Miglior film d’animazione',
        'Best International Feature Film': 'Miglior film internazionale',
        'Best Foreign Language Film': 'Miglior film straniero',
        'Best Original Screenplay': 'Miglior sceneggiatura originale',
        'Best Adapted Screenplay': 'Miglior sceneggiatura non originale',
        'Best Cinematography': 'Miglior fotografia',
        'Best Film Editing': 'Miglior montaggio',
        'Best Visual Effects': 'Migliori effetti visivi',
        'Best Original Score': 'Miglior colonna sonora originale',
        'Best Original Song': 'Miglior canzone originale',
        'Best Score': 'Miglior colonna sonora',
        'Best Visual/Special Effects': 'Migliori effetti visivi',
        'Best Sound Mixing': 'Miglior sonoro',
        'Best Sound Editing': 'Miglior montaggio sonoro',
        'Best Cinematography (Color)': 'Miglior fotografia',
        'Best Cinematography (Black and White)': 'Miglior fotografia',
        'Best Production Design (Color)': 'Miglior scenografia',
        'Best Production Design (Black and White)': 'Miglior scenografia',
        'Best Costume Design (Color)': 'Migliori costumi',
        'Best Costume Design (Black and White)': 'Migliori costumi',
        'Best Makeup and Hairstyling': 'Miglior trucco e acconciatura',
        'Best Original Musical/Secondary Score Category': 'Miglior colonna sonora',
        'Best Animated Short': "Miglior cortometraggio d'animazione",
        'Best Live Action Short (Comedy or One Reel or Regular)': 'Miglior cortometraggio',
        'Best Original Story': 'Miglior soggetto originale',
        'Best Documentary Short': 'Miglior cortometraggio documentario',
        'Unique and Artistic Production': 'Premio alla produzione artistica',
        'Oscar al miglior attore': 'Miglior attore protagonista',
        'Oscar al miglior attore non protagonista': 'Miglior attore non protagonista',
        'Oscar al miglior casting': 'Miglior casting',
        'Oscar al miglior film': 'Miglior film',
        "Oscar al miglior film d'animazione": "Miglior film d'animazione",
        'Oscar al miglior montaggio': 'Miglior montaggio',
        'Oscar al miglior regista': 'Miglior regia',
        'Oscar alla migliore canzone': 'Miglior canzone originale',
        'Oscar alla migliore colonna sonora': 'Miglior colonna sonora',
        'Oscar alla migliore fotografia': 'Miglior fotografia',
        'Oscar alla migliore sceneggiatura non originale': 'Miglior sceneggiatura non originale',
        'Oscar alla migliore sceneggiatura originale': 'Miglior sceneggiatura originale'
      };
      card.append(top, node('p', '', names[award.category] || award.category || 'Riconoscimento'));
      if (award.recipient) card.append(node('small', '', award.recipient));
      if (award.year) card.append(node('small', '', ' · ' + award.year));
      const category = names[award.category] || award.category || '';
      if (category) {
        const awardsLink = node('a', 'bobo-award-source', 'Esplora i film premiati →');
        awardsLink.href = 'awards.html?event=' + encodeURIComponent(award.event) +
          '&category=' + encodeURIComponent(category);
        card.append(awardsLink);
      }
      host.append(card);
    }
    section.hidden = !host.children.length;
  }
  async function watch() {
    if (!byId('watch-cast-section') || !['movie', 'tv'].includes(filmType) || !validId(filmId)) return;
    try {
      const records = await shard('credits', filmId);
      const entry = records && records[filmType + ':' + filmId];
      renderCredits(entry);
      renderAwards(entry);
    } catch (e) { console.warn('Bobo: archivio cinema temporaneamente non disponibile', e); }
  }
  function workCard(work) {
    if (!work || !['movie', 'tv'].includes(work.type) || !validId(String(work.tmdb_id))) return null;
    const a = node('a', 'bobo-work');
    a.href = 'watch.html?type=' + encodeURIComponent(work.type) + '&id=' + encodeURIComponent(work.tmdb_id);
    const poster = image(work.poster);
    if (poster) {
      const img = node('img');
      img.src = poster;
      img.alt = '';
      img.loading = 'lazy';
      a.append(img);
    } else a.append(node('span', 'bobo-work-placeholder', '🎬'));
    a.append(node('strong', '', work.title || 'Titolo'));
    const description = [work.year, work.type === 'tv' ? 'Serie TV' : 'Film', work.character || work.role]
      .filter(Boolean).join(' · ');
    a.append(node('small', '', description));
    return a;
  }
  function addFact(host, title, value) {
    if (value === null || value === undefined || value === '') return;
    const span = node('span', 'bobo-person-fact');
    span.append(node('strong', '', title + ': '), document.createTextNode(String(value)));
    host.append(span);
  }
  function ageAt(birth, end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null;
    const b = new Date(birth + 'T12:00:00Z');
    const e = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? new Date(end+'T12:00:00Z') : new Date();
    if (Number.isNaN(b.getTime()) || Number.isNaN(e.getTime()) || e < b) return null;
    let years = e.getUTCFullYear() - b.getUTCFullYear();
    if (e.getUTCMonth() < b.getUTCMonth() ||
      (e.getUTCMonth() === b.getUTCMonth() && e.getUTCDate() < b.getUTCDate())) years--;
    return years >= 0 && years < 125 ? years : null;
  }
  function stat(host, value, caption) {
    if (value == null || value === '') return;
    const el = node('div', 'bobo-person-stat');
    el.append(node('strong', '', String(value)), node('span', '', caption));
    host.append(el);
  }
  async function renderDirectory() {
    try {
      const response = await fetch('data/cinema/explore.json', {cache:'no-cache'});
      if (!response.ok) return;
      const data = await response.json();
      if (data.schema !== 1 || !data.featured) return;
      const rows = directorMode ? data.featured.directors : data.featured.actors;
      if (!Array.isArray(rows) || !rows.length) return;
      const host = byId('person-directory-cards');
      host.textContent = '';
      for (const item of rows) {
        if (!validId(String(item.id))) continue;
        const link = node('a', 'bobo-person-directory-card');
        link.href = (directorMode ? 'director' : 'person') + '.html?id=' + encodeURIComponent(item.id);
        if (image(item.photo)) {
          const img = node('img'); img.src = image(item.photo);
          img.alt = ''; img.loading = 'lazy'; link.append(img);
        }
        link.append(node('strong', '', item.name), node('span', '',
          item.works + (item.works === 1 ? ' opera nel catalogo' : ' opere nel catalogo')));
        host.append(link);
      }
      if (data.week && byId('person-directory-week'))
        byId('person-directory-week').textContent = 'Selezione ' + data.week;
    } catch (_) { /* Leave useful fallback links on failure. */ }
  }
  function renderCareer(person, stats) {
    const section=byId('person-highlights');
    const host=byId('person-highlights-grid');
    if(!section||!host)return;
    const first=directorMode?(stats.first_directed||stats.first_indexed):stats.first_indexed;
    const highest=directorMode?(stats.best_directed||stats.most_appreciated):stats.most_appreciated;
    const items=[
      {data:first, label:directorMode?'Prima regia indicizzata':'Prima opera indicizzata',
       context:'Il primo titolo che risulta nel catalogo Bobo'},
      {data:highest, label:'Il più apprezzato nel catalogo',
       context:'Tra le opere con una valutazione disponibile'}
    ];
    const seen=new Set();
    for(const item of items){
      const film=item.data;
      if(!film||!['movie','tv'].includes(film.type)||!validId(String(film.id||film.tmdb_id)))continue;
      const id=Number(film.id||film.tmdb_id),key=film.type+':'+id;
      if(seen.has(key))continue;seen.add(key);
      const a=node('a','bobo-person-landmark');
      a.href='watch.html?type='+encodeURIComponent(film.type)+'&id='+encodeURIComponent(id);
      const poster=image(film.poster);
      if(poster){const img=node('img');img.src=poster;img.alt='';img.loading='lazy';a.append(img);}
      const text=node('span','bobo-person-landmark-content');
      text.append(node('small','bobo-person-landmark-tag',item.label),
        node('strong','',film.title||'Titolo'),
        node('span','',String(film.year||'')));
      if(item.label.includes('apprezzato')&&Number(film.vote)>0)
        text.append(node('small','bobo-person-landmark-rating','★ '+Number(film.vote).toFixed(1)+'/10'));
      text.append(node('span','bobo-person-landmark-caption',item.context));
      a.append(text);host.append(a);
    }
    section.hidden=!host.children.length;
    const dnaSection=byId('person-dna-section');
    const dnaHost=byId('person-dna-bars');
    if(!dnaSection||!dnaHost||!directorMode)return;
    const genres=Array.isArray(stats.genres)?stats.genres:[];
    for(const row of genres.slice(0,4)){
      const pct=Number(row.percent);
      if(!row||typeof row.name!=='string'||row.name.length>60||
        !Number.isFinite(pct)||pct<=0||pct>100)continue;
      const wrap=node('div','bobo-person-genre');
      const label=node('div','bobo-person-genre-label');
      label.append(node('strong','',row.name),node('span','',Math.round(pct)+'%'));
      const track=node('span','bobo-person-genre-track');
      const fill=node('span','bobo-person-genre-fill');
      fill.style.width=Math.round(pct)+'%';
      track.append(fill);
      wrap.append(label,track);dnaHost.append(wrap);
    }
    dnaSection.hidden=!dnaHost.children.length;
  }
  function renderPerson(person) {
    byId('person-loading').hidden = true;
    byId('person-content').hidden = false;
    const name = person.name || 'Persona';
    byId('person-title').textContent = name;
    document.title = name + ' · Bobo Movie Night';
    if (byId('person-breadcrumb-current')) byId('person-breadcrumb-current').textContent = name;
    const stats = person.stats || {};
    byId('person-role').textContent = directorMode ? 'BOBO / REGIA E AUTORI' :
      (stats.acting ? 'BOBO / CAST E INTERPRETI' : 'BOBO / PERSONE DEL CINEMA');
    const face = byId('person-photo');
    const photo = image(person.photo);
    if (photo) {
      const img = node('img'); img.src = photo; img.alt = name; face.append(img);
    } else face.append(node('span','bobo-person-placeholder','◉'));
    const facts = byId('person-facts');
    addFact(facts, 'Nato/a', safeDate(person.birthday));
    addFact(facts, 'Luogo', person.place_of_birth);
    if (person.deathday) addFact(facts, 'Scomparsa', safeDate(person.deathday));
    const age = ageAt(person.birthday,person.deathday);
    if (age !== null) addFact(facts, person.deathday ? 'Età alla scomparsa' : 'Età', age + ' anni');
    if (Number(person.height_cm) >= 120 && Number(person.height_cm) <= 230)
      addFact(facts, 'Altezza', Math.round(Number(person.height_cm)) + ' cm');
    renderCareer(person, stats);
    const statHost = byId('person-stats');
    const full = Array.isArray(person.filmography) && person.filmography.length ?
      person.filmography : (person.known_for || []);
    const works = full.filter(w => w && ['movie','tv'].includes(w.type) && validId(String(w.tmdb_id)));
    const display = directorMode && works.some(w => w.role === 'Regia') ?
      works.filter(w => ['Regia','Ideazione','Sceneggiatura'].includes(w.role)) : works;
    const count = Number(stats.works) || works.length;
    stat(statHost, count || '—', count === 1 ? 'Opera collegata' : 'Opere collegate');
    const first = Number(stats.first_year);
    const last = Number(stats.last_year);
    if (first >= 1880 && last >= first)
      stat(statHost, first === last ? String(first) : first + '–' + last, 'Arco temporale nel catalogo');
    const directed = Number(stats.directing || 0);
    const acted = Number(stats.acting || 0);
    if (directorMode && directed) stat(statHost, directed, 'Titoli diretti indicizzati');
    else if (acted) stat(statHost, acted, 'Titoli come interprete');
    else if (Number(stats.writing) > 0) stat(statHost, stats.writing, 'Titoli come autore');
    const bio = (person.biography || '').trim();
    if (bio && person.biography_language !== 'en') {
      byId('person-biography').textContent = bio;
      byId('person-bio-section').hidden = false;
      if (person.biography_translation === 'automatic')
        byId('person-language-note').hidden = false;
    } else byId('person-pending').hidden = false;
    const seen = new Set();
    const cards = display.filter(w => {
      const key = w.type + ':' + w.tmdb_id;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(workCard).filter(Boolean);
    const listing = byId('person-works');
    const more = byId('person-works-more');
    let rendered = 0;
    function next() {
      for(const card of cards.slice(rendered, rendered + 20)) listing.append(card);
      rendered = Math.min(cards.length, rendered + 20);
      more.hidden = rendered >= cards.length;
      if (!more.hidden) more.textContent = 'Mostra altre opere (' + (cards.length - rendered) + ')';
    }
    more.onclick = next;
    next();
    byId('person-works-section').hidden = !cards.length;
    if (directorMode) {
      byId('person-works-heading').textContent = 'Dietro la macchina da presa';
      byId('person-works-caption').textContent =
        'Regie, ideazioni e altre partecipazioni documentate nel catalogo';
    }
  }
  async function person() {
    if (!byId('person-main')) return;
    if (!params.has('id')) {
      byId('person-loading').hidden = true;
      byId('person-directory').hidden = false;
      if (directorMode) {
        document.title = 'Registi · Bobo Movie Night';
        byId('person-breadcrumb-current').textContent = 'Registi';
      } else document.title = 'Attori e interpreti · Bobo Movie Night';
      void renderDirectory();
      return;
    }
    if (!validId(personId)) {
      byId('person-loading').textContent = 'Identificativo persona non valido.';
      return;
    }
    try {
      const records = await shard('people', personId);
      const data = records && records[personId];
      if (!data) {
        byId('person-loading').textContent = 'Scheda ancora in preparazione. Scopri altri interpreti in Discover.';
        return;
      }
      renderPerson(data);
    } catch (e) {
      byId('person-loading').textContent = 'Non è stato possibile caricare la scheda. Riprova più tardi.';
    }
  }
  void watch();
  void person();
})();