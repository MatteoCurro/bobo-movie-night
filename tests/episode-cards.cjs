/* Regression test for the episode enrichment -> title -> preview -> poster fallback UI.
 * No browser dependencies; the page script runs inside a minimal mock DOM.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Element {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();
    this.children=[];this.events={};this.className='';this.attributes={};
    this.src='';this.hidden=false;this.disabled=false;this.textContent='';
    this.classList={
      add: value=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),value])].join(' ');},
      remove: value=>{this.className=this.className.split(' ').filter(x=>x && x!==value).join(' ');}
    };
  }
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  appendChild(item){this.append(item);return item;}
  replaceChildren(...items){this.children=[];this.append(...items);}
  addEventListener(name,handler){this.events[name]=handler;}
  setAttribute(name,value){this.attributes[name]=value;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
}
const nodes={};
const document={
  getElementById(name){return nodes[name] ||= new Element();},
  createElement(name){return new Element(name);},
  addEventListener(){},
};
const location={search:'?type=tv&id=700',href:'https://movie.curromatteo.it/watch.html?type=tv&id=700'};
const history={replaceState(a,b,url){location.href=url;}};
const context={
  document,location,history,
  window:{},
  URL,URLSearchParams,console,
  localStorage:{getItem(){return null;}}
};
let code=fs.readFileSync('bobo-watch.js','utf8');
const anchor="  document.addEventListener('DOMContentLoaded',setup);";
assert(code.includes(anchor),'Watch script testing seam absent');
code=code.replace(anchor,[
  "  globalThis.__episodeTests={",
  "    init(info,data){item=info;seasons=episodeData(info);episodeStills=data;selectedSeason=1;selectedEpisode=1;playing=false;},",
  "    render:renderEpisodeNavigation,heading:episodeHeading,load:loadEpisodeIndex,",
  "    updateArrows:updateSeasonArrows,scrollSeasons:scrollSeasons",
  "  };",anchor
].join('\n'));
vm.runInNewContext(code,context,{filename:'bobo-watch.js'});
const api=context.__episodeTests;
const poster='https://image.tmdb.org/t/p/w342/Poster123.jpg';
const info={tmdb_id:700,type:'tv',title:'Test series',poster,seasons:[{n:1,episodes:3},{n:2,episodes:1}]};
api.init(info,{
  '1':{
    '1':{name:'Pilot senza fotogramma'},
    '2':{name:'Il secondo episodio',image:'https://image.tmdb.org/t/p/w342/Still123.jpg'}
  },
  '2':{'1':{name:'Finale di stagione'}}
});
api.render();
let cards=nodes['watch-episode-list'].children;
assert.equal(cards.length,3);
assert.equal(cards[0].children[0].tagName,'IMG');
assert.match(cards[0].children[0].src,/\/w500\/Poster123\.jpg$/,'Missing still uses an adequately sharp poster background');
assert.equal(cards[0].children[2].children[0].textContent,'Pilot senza fotogramma','Title-only episodes have their names');
assert.match(cards[0].children[2].children[1].textContent,/^E1 /,'Keep episode number');
assert.equal(api.heading(),'Stagione 1 · Episodio 1 · Pilot senza fotogramma');
assert.match(cards[1].children[0].src,/\/w300\/Still123\.jpg$/,'Higher-resolution still takes precedence');
const still=cards[1].children[0];
still.events.error.call(still);
assert.match(still.src,/\/w500\/Poster123\.jpg$/,'Failed still falls back to series poster');
assert.match(still.className,/--poster/);
assert(cards[1].className.includes('episode-card--poster'));
still.events.error.call(still);
assert.equal(cards[1].children[0].tagName,'SPAN','Broken poster restores numeric tile');
assert(!cards[1].className.includes('with-preview'));
const seasonButtons=nodes['watch-season-buttons'].children;
seasonButtons[1].events.click();
cards=nodes['watch-episode-list'].children;
assert.equal(cards.length,1);
assert.equal(cards[0].children[2].children[0].textContent,'Finale di stagione');
assert.match(location.href,/s=2&e=1/,'Season navigation keeps URL parameters');
// The season scroller should only reveal arrows when its content overflows.
const seasonRail=nodes['watch-season-buttons'];
const back=nodes['watch-season-prev'],forward=nodes['watch-season-next'];
seasonRail.scrollWidth=720;seasonRail.clientWidth=240;seasonRail.scrollLeft=0;
seasonRail.scrollBy=function(options){this.scrollLeft+=options.left;};
api.updateArrows();
assert.equal(back.hidden,false);
assert.equal(forward.hidden,false);
assert.equal(back.disabled,true);
assert.equal(forward.disabled,false);
api.scrollSeasons(1);
assert(seasonRail.scrollLeft>0,'Season arrow must scroll the actual row');
seasonRail.scrollLeft=480;
api.updateArrows();
assert.equal(back.disabled,false);
assert.equal(forward.disabled,true);
seasonRail.scrollWidth=240;seasonRail.clientWidth=240;
api.updateArrows();
assert.equal(back.hidden,true);
assert.equal(forward.hidden,true);
assert.match(fs.readFileSync('watch.html','utf8'),/id="watch-season-prev"/);
assert.match(fs.readFileSync('watch.html','utf8'),/id="watch-season-next"/);

api.init({...info,poster:''},{});
api.render();
cards=nodes['watch-episode-list'].children;
assert.equal(cards[0].children[0].tagName,'SPAN','No imagery keeps numeric tile');
// Complete names are not truncated in JS or CSS; grid row heights stretch.
const css=fs.readFileSync('bobo-watch.css','utf8');
assert.match(css,/\.episode-list\{align-items:stretch;/);
assert.match(css,/\.episode-card\{height:100%;/);
assert.match(css,/\.bobo-episode-copy strong\{display:block;white-space:normal;overflow:visible;/);
assert(!css.includes('line-clamp:2'),'No line-clamp may hide the full episode name');
assert.match(css,/\.episode-card::before\{content:"";position:absolute;/,'Dark overlay is attached to each episode card');
assert.match(css,/\.episode-card \.bobo-episode-still\{position:absolute;inset:0;/,'Episode still fills the full card');
assert.match(css,/\.episode-card\{height:100%;min-width:0;min-height:/,'Grid cards share row height');
const longName='L’episodio con un titolo particolarmente lungo che deve restare completamente leggibile, anche quando contiene una spiegazione estesa della trama, dei personaggi e delle conseguenze degli avvenimenti precedenti senza essere troncato.';
assert(longName.length>160);
api.init(info,{'1':{'1':{name:longName}}});
api.render();
assert.equal(nodes['watch-episode-list'].children[0].children[2].children[0].textContent,longName);
assert(api.heading().endsWith(longName),'Current episode must preserve the full name');
// A known series backdrop must replace the portrait poster when a still is absent.
api.init({...info,backdrop:'https://image.tmdb.org/t/p/w342/Backdrop123.jpg'},{});
api.render();
const backdropCard=nodes['watch-episode-list'].children[0];
assert.match(backdropCard.children[0].src,/\/w780\/Backdrop123\.jpg$/,'Series backdrop should fill an episode card');
backdropCard.children[0].events.error.call(backdropCard.children[0]);
assert.match(backdropCard.children[0].src,/\/w500\/Poster123\.jpg$/,'Broken backdrop uses series poster');

// Simulate loading a real per-title JSON index from the GitHub Pages data path.
api.init(info,{});
context.fetch=async url=>{
  assert.equal(url,'data/episodes/700.json');
  return {ok:true,json:async()=>({
    schema:1,type:'tv',tmdb_id:700,episode_images:{source:'tmdb',seasons:{'1':{'1':{name:longName}}}}
  })};
};
api.load().then(()=>{
  assert.equal(nodes['watch-episode-list'].children[0].children[2].children[0].textContent,longName);
  console.log('OK: episode cards, full titles, season carousel boundaries, per-series metadata and poster fallbacks.');
}).catch(error=>{console.error(error);process.exitCode=1});
