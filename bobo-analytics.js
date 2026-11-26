/* Bobo first-party, aggregate-only telemetry. No analytics cookies, user IDs,
 * IP addresses, search terms, query strings or navigation histories are sent.
 * Compatible with a static frontend and the separately hosted PHP account API.
 */
(function(){
'use strict';
const origin='https://movieaccount.curromatteo.it/api.php?route=track';
const pages={
 'index.html':'home','':'home','discover.html':'discover','watch.html':'watch',
 'favorites.html':'favorites','person.html':'person','director.html':'director',
 'awards.html':'awards','informazioni.html':'info'
};
const page=pages[location.pathname.split('/').pop()];
if(!page)return;
const params=new URLSearchParams(location.search);
const kind=params.get('type'),id=params.get('id');
const media=(page==='watch'&&(kind==='movie'||kind==='tv')&&/^[1-9][0-9]{0,11}$/.test(id||''))
 ?kind+':'+id:'';
function track(event,extras){
 if(document.visibilityState==='hidden' && event!=='play_start')return;
 const data={event,page};
 const title=extras?.title||media;
 if((event==='title_view'||event==='play_start')&&/^(movie|tv):[1-9][0-9]{0,11}$/.test(title||''))data.title=title;
 else if(event==='title_view'||event==='play_start')return;
 try{
  fetch(origin,{method:'POST',mode:'cors',credentials:'include',cache:'no-store',
   keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
   .catch(()=>{});
 }catch(_){}
}
window.BoboAnalytics=Object.freeze({track});
function ready(){
 if(document.visibilityState==='hidden')return;
 track('page_view');
 if(media)track('title_view',{title:media});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});
else ready();
let searchTimer=0,lastSearch=0;
document.addEventListener('input',event=>{
 const target=event.target;
 if(!(target instanceof HTMLInputElement))return;
 if(!target.matches('input[type="search"],#search-input,#bobo-fav-search'))return;
 clearTimeout(searchTimer);
 if(target.value.trim().length<3)return;
 searchTimer=setTimeout(()=>{
  const now=Date.now();
  if(now-lastSearch>20000){lastSearch=now;track('search_used');}
 },1300);
},{passive:true});
document.addEventListener('click',event=>{
 if(event.target instanceof Element &&
   event.target.closest('[data-bobo-favorite],[data-bobo-fav],[data-remove],.bobo-favorite-btn,.bobo-fav-toggle')){
    track('favorites_action');
 }
},{passive:true});
})();
