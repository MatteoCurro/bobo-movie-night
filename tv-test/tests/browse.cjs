/* No dependencies: exercise actual lightweight browse filter logic in a TV-like state. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('tv-test/app/src/main/assets/tv.js','utf8');
const defsStart=src.indexOf('const detailPromises=new Map()');
const defsEnd=src.indexOf('const $=s=>',defsStart);
const logicStart=src.indexOf('function browseGenreOptions(type){');
const logicEnd=src.indexOf('function searchScreen(){',logicStart);
assert(defsStart>0&&defsEnd>defsStart&&logicStart>0&&logicEnd>logicStart);

const item=(id,title,year,vote,genreIds,votes,type='movie')=>({
 type,tmdb_id:id,title,year,vote,genreIds,votes,poster:'/abcdef12345.jpg'
});
const data=[
 item(1,'Azione 2025',2025,7.7,[0],1200),
 item(2,'Azione 1996',1996,8.5,[0],20),
 item(3,'Commedia 2022',2022,7.0,[1],500),
 item(4,'Dramma 2015',2015,8.0,[2],250),
 item(5,'Animazione 1982',1982,8.2,[3],350),
 item(6,'Serie TV',2024,7.9,[2],300,'tv')
];
const ctx={
 console,Map,Math,Set,Number,Object,Array,String,
 status:{
  indexReady:true,view:'movie',movies:data.filter(x=>x.type==='movie'),
  series:data.filter(x=>x.type==='tv'),
  browseFilters:{movie:{genre:'all',era:'all',sort:'suggested'},
    tv:{genre:'all',era:'all',sort:'suggested'}},
  browseLimit:{movie:36,tv:36}
 },
 homeFeed:null,
 app:{innerHTML:''},
 esc:String,
 poster:x=>'<button class="poster">'+x.title+'</button>',
 rail:()=>'',document:{querySelectorAll:()=>[]},
 $:()=>null,ensure:()=>{}
};
vm.createContext(ctx);
vm.runInContext(src.slice(defsStart,defsEnd),ctx);
vm.runInContext("genreDictionary=['Azione','Commedia','Dramma','Animazione']",ctx);
vm.runInContext(src.slice(logicStart,logicEnd),ctx);
assert.equal(ctx.browseResultList('movie').length,5);
assert.equal(ctx.browseResultList('tv').length,1);
assert.equal(ctx.browseResultList('movie')[0].tmdb_id,1,
 'confidence-weighted suggestions prioritize a well-reviewed, widely-rated title');
assert.match(ctx.browse('movie'),/data-filter="genre"/);
assert.match(ctx.browse('movie'),/data-filter="era"/);
assert.match(ctx.browse('movie'),/data-filter="sort"/);
ctx.status.browseFilters.movie.genre='Azione';
assert.equal(ctx.browseResultList('movie').length,2);
ctx.status.browseFilters.movie.era='2020';
assert.equal(ctx.browseResultList('movie').length,1);
assert.equal(ctx.browseResultList('movie')[0].tmdb_id,1);
ctx.status.browseFilters.movie.genre='all';
ctx.status.browseFilters.movie.era='1990';
assert.equal(ctx.browseResultList('movie').length,1);
assert.equal(ctx.browseResultList('movie')[0].tmdb_id,2);
ctx.status.browseFilters.movie.era='classic';
assert.equal(ctx.browseResultList('movie').length,0);
ctx.status.browseFilters.movie.era='all';
ctx.status.browseFilters.movie.sort='title';
assert.equal(ctx.browseResultList('movie')[0].title,'Animazione 1982');
ctx.status.browseFilters.tv.genre='Dramma';
assert.equal(ctx.browseResultList('tv').length,1);
// Pagination integration: clear visibility, incremental update and correct final removal.
ctx.status.browseFilters.movie={genre:'all',era:'all',sort:'suggested'};
ctx.status.browseLimit.movie=36;
ctx.status.movies=Array.from({length:80},(_,i)=>item(i+100,'Titolo '+i,2022,7.2,[0],300));
vm.runInContext('browseCache.clear()',ctx);
const initialPage=ctx.browse('movie');
assert.match(initialPage,/Visualizzati 36 di 80 titoli/);
assert.match(initialPage,/Mostra altri 36 titoli/);
const appended=[];
const posterEls=Array.from({length:80},()=>({focus(){this.focused=true;}}));
const grid={
 insertAdjacentHTML(where,markup){appended.push([where,markup]);},
 querySelectorAll(){return posterEls;}
};
const counter={textContent:''};
const more={textContent:'',removed:false,remove(){this.removed=true;}};
ctx.$=selector=>({'#browse-results':grid,'#browse-count':counter,'.tv-more':more}[selector]||null);
ctx.moreBrowse('movie');
assert.equal(ctx.status.browseLimit.movie,72);
assert.match(counter.textContent,/Visualizzati 72 di 80/);
assert.match(more.textContent,/Mostra altri 8 titoli/);
assert.equal(posterEls[36].focused,true,'first newly loaded poster receives focus');
assert.equal(appended.length,1);
ctx.moreBrowse('movie');
assert.equal(ctx.status.browseLimit.movie,80);
assert.match(counter.textContent,/Visualizzati 80 di 80/);
assert.equal(more.removed,true,'load-more button removed when results are exhausted');
assert.equal(appended.length,2);

console.log('TV filters and pagination passed: genre, decades, sorting, 36-at-a-time loading and progress.');
