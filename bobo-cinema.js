/* Bobo cinema archive: credits on watch pages, biographies on actor pages.
 * Reads only incremental local JSON shards; no browser API keys or bulk downloads. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const filmType = params.get('type');
  const filmId = params.get('id');
  const personId = params.get('id');
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
  function profileLink(person) {
    const a = node('a', 'bobo-person-link');
    a.href = 'person.html?id=' + encodeURIComponent(person.id);
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
      const link = profileLink(person);
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
      card.append(top, node('p', '', award.category || 'Riconoscimento'));
      if (award.year) card.append(node('small', '', award.year));
      if (/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(award.source_url || '')) {
        const link = node('a', 'bobo-award-source', 'Fonte: Wikidata');
        link.href = award.source_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(link);
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
    const description = [work.year, work.type === 'tv' ? 'Serie TV' : 'Film', work.character]
      .filter(Boolean).join(' · ');
    a.append(node('small', '', description));
    return a;
  }
  function renderPerson(person) {
    byId('person-loading').hidden = true;
    byId('person-content').hidden = false;
    byId('person-title').textContent = person.name || 'Persona';
    document.title = (person.name || 'Persona') + ' · Bobo Movie Night';
    const photo = image(person.photo);
    if (photo) {
      const img = node('img');
      img.src = photo;
      img.alt = person.name || 'Ritratto';
      byId('person-photo').append(img);
    } else byId('person-photo').append(node('span', 'bobo-person-placeholder', '◉'));
    const bioFacts = [];
    const birth = safeDate(person.birthday);
    const death = safeDate(person.deathday);
    if (birth) bioFacts.push('Nascita: ' + birth);
    if (person.place_of_birth) bioFacts.push('Luogo di nascita: ' + person.place_of_birth);
    if (death) bioFacts.push('Morte: ' + death);
    byId('person-facts').textContent = bioFacts.join(' · ');
    const bio = (person.biography || '').trim();
    if (bio) {
      byId('person-biography').textContent = bio;
      byId('person-bio-section').hidden = false;
      if (person.biography_language === 'en')
        byId('person-language-note').hidden = false;
    }
    const listing = byId('person-works');
    const works = Array.isArray(person.filmography) && person.filmography.length ?
      person.filmography : (person.known_for || []);
    const found = new Set();
    for (const work of works) {
      const key = work.type + ':' + work.tmdb_id;
      if (found.has(key)) continue;
      found.add(key);
      const card = workCard(work);
      if (card) listing.append(card);
      if (listing.children.length >= 42) break;
    }
    byId('person-works-section').hidden = !listing.children.length;
    if (!bio && !person.checked_at) byId('person-pending').hidden = false;
  }
  async function person() {
    if (!byId('person-main')) return;
    if (!validId(personId)) {
      byId('person-loading').textContent = 'Identificativo persona non valido.';
      return;
    }
    try {
      const records = await shard('people', personId);
      const data = records && records[personId];
      if (!data) {
        byId('person-loading').textContent = 'Scheda ancora in preparazione. Torna al catalogo e riprova dopo il prossimo aggiornamento.';
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