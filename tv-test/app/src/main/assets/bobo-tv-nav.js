(function(){
"use strict";
if(window.BoboTVNav || location.hostname!=="movie.curromatteo.it")return;
var css = [
'html.bobo-tv-mode{scroll-padding:100px 25px;scroll-behavior:smooth}',
'html.bobo-tv-mode :is(a,button,input,select,textarea,[tabindex],.card):focus-visible,html.bobo-tv-mode .card:focus{outline:4px solid #bdff56!important;outline-offset:4px!important;box-shadow:0 0 0 7px rgba(9,18,20,.9),0 0 26px rgba(189,255,86,.55)!important;scroll-margin:95px 28px;position:relative;z-index:20}',
'html.bobo-tv-mode :is(.bobo-tile,.bobo-result,.episode-card,.bobo-fav-open):focus{outline:4px solid #bdff56!important;outline-offset:3px!important;transform:scale(1.035);position:relative;z-index:21}',
'html.bobo-tv-mode .bobo-item-wrap:focus-within{position:relative;z-index:25}',
'html.bobo-tv-mode .bobo-item-wrap:focus-within .bobo-poster-hover{display:flex!important;position:absolute;inset:0;flex-direction:column;justify-content:flex-end;padding:12px 10px 55px;background:linear-gradient(180deg,rgba(5,9,12,.15),rgba(5,9,12,.95));color:#fff;opacity:1!important;visibility:visible!important;transform:none!important;pointer-events:none}',
'html.bobo-tv-mode .bobo-item-wrap:focus-within > :is(.bobo-quick-open,.bobo-save-corner){display:block!important;opacity:1!important;visibility:visible!important;transform:none!important}',
'html.bobo-tv-mode .bobo-item-wrap:focus-within .bobo-tile-tag{opacity:1!important}',
'html.bobo-tv-mode #watch-iframe:focus{outline:5px solid #bdff56!important;outline-offset:-5px}'
].join('');
var style=document.createElement('style');style.id='bobo-tv-nav-css';style.textContent=css;
document.head.appendChild(style);document.documentElement.classList.add('bobo-tv-mode');
var SELECTOR='a[href],button,input:not([type=hidden]),select,textarea,[role=button],[tabindex]:not([tabindex="-1"]),.card[onclick],#watch-iframe';
var remembered=null, remoteFocus=false, ticking=false;
function rect(el){var b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,top:b.top,bottom:b.bottom,w:b.width,h:b.height};}
function visible(el){
 if(!el||!el.isConnected||el.disabled||el.closest('[hidden],[inert]'))return false;
 var b=rect(el),s=getComputedStyle(el);
 return b.w>3&&b.h>3&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
}
function modal(){
 return Array.from(document.querySelectorAll('[aria-modal=true],#bobo-details,#bobo-settings,#watch-settings,.modal-bg.active')).filter(visible).pop()||null;
}
function prepare(){
 document.querySelectorAll('.card[onclick]').forEach(function(el){if(!el.hasAttribute('tabindex')){el.tabIndex=0;el.setAttribute('role','button');}});
 var iframe=document.getElementById('watch-iframe');if(iframe&&!iframe.hasAttribute('tabindex'))iframe.tabIndex=0;
}
function candidates(){
 prepare();
 return Array.from((modal()||document).querySelectorAll(SELECTOR)).filter(function(el){
  if(!visible(el))return false;
  if(el.matches('.bobo-quick-open,.bobo-save-corner')&&!el.closest('.bobo-item-wrap:focus-within'))return false;
  if(el.hasAttribute('data-bobo-scroll'))return false;
  return true;
 });
}
function ensureScroll(el){
 try{el.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});}catch(e){el.scrollIntoView(false);}
 var b=rect(el);if(!modal()&&b.top<90&&b.bottom>0)window.scrollBy({top:b.top-110,behavior:'smooth'});
}
function focus(el){
 if(!el)return false;
 try{el.focus({preventScroll:true});}catch(e){el.focus();}
 if(document.activeElement!==el)return false;
 remembered=el;ensureScroll(el);return true;
}
function initial(){
 var list=candidates();if(!list.length)return false;
 if(modal())return focus(list[0]);
 var preferred=document.querySelector('#watch-start,.bobo-favorite-rail .bobo-fav-open,.bobo-rail .bobo-tile,.bobo-rail .bobo-result,.bobo-tile,.bobo-result,#search-input');
 return focus(preferred&&list.includes(preferred)?preferred:list[0]);
}
function nav(direction){
 var list=candidates();if(!list.length){window.scrollBy({top:innerHeight*.7,behavior:'smooth'});return false;}
 var cur=document.activeElement;
 if(!list.includes(cur)){if(remembered&&list.includes(remembered))cur=remembered;else return initial();}
 var p=rect(cur),horizontal=direction==='left'||direction==='right',positive=direction==='right'||direction==='down';
 var rail=horizontal?cur.closest('.bobo-rail,.bobo-favorite-rail,.season-list'):null;
 function score(el){
  if(el===cur)return null;
  var r=rect(el),d=horizontal?r.x-p.x:r.y-p.y,cross=horizontal?Math.abs(r.y-p.y):Math.abs(r.x-p.x);
  if(positive?d<=2:d>=-2)return null;
  d=Math.abs(d);
  return {el:el,score:d+1.9*cross+cross*cross/(d+75)};
 }
 var eligible=list.filter(function(el){return !rail||el.closest('.bobo-rail,.bobo-favorite-rail,.season-list')===rail;});
 var ranked=eligible.map(score).filter(Boolean).sort(function(a,b){return a.score-b.score;});
 if(!ranked.length&&rail)ranked=list.map(score).filter(Boolean).sort(function(a,b){return a.score-b.score;});
 if(ranked.length)return focus(ranked[0].el);
 if(!horizontal)window.scrollBy({top:(positive?1:-1)*innerHeight*.6,behavior:'smooth'});
 return false;
}
function back(){
 var m=modal();
 if(m){
  var c=m.querySelector('.bobo-detail-close,[data-close-settings],#watch-settings-close,[aria-label="Chiudi"]');
  if(c&&visible(c)){c.click();return true;}
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  return true;
 }
 if(document.fullscreenElement){document.exitFullscreen().catch(function(){});return true;}
 var exit=document.getElementById('watch-theater-exit');
 if(exit&&visible(exit)){exit.click();return true;}
 var section=document.getElementById('watch-play-section'),hide=document.getElementById('watch-hide-player');
 if(section&&!section.hidden&&hide&&visible(hide)){hide.click();return true;}
 return false;
}
function handle(e){
 if(e.key==='Escape'||e.key==='Backspace'){
  if(e.key==='Backspace'&&e.target&&e.target.matches('input,textarea'))return;
  if(back()){e.preventDefault();e.stopImmediatePropagation();}
  return;
 }
 var el=document.activeElement;
 if(el&&el.tagName==='IFRAME')return; // Leave D-pad controls to Vix.
 if(e.key==='Enter'){
  if(el&&el.matches('input,select,textarea'))return;
  if(el&&visible(el)&&el.matches('a,button,[role=button],.card[onclick]')){
   e.preventDefault();e.stopImmediatePropagation();el.click();
  }
  return;
 }
 if(!/^Arrow(Up|Down|Left|Right)$/.test(e.key))return;
 if(el&&(el.tagName==='SELECT'||el.matches('input[type=range]')))return;
 if(el&&el.matches('input,textarea')&&(e.key==='ArrowLeft'||e.key==='ArrowRight'))return;
 e.preventDefault();e.stopImmediatePropagation();remoteFocus=true;nav(e.key.slice(5).toLowerCase());
}
document.addEventListener('keydown',handle,true);
document.addEventListener('focusin',function(e){remembered=e.target;if(remoteFocus&&visible(e.target))ensureScroll(e.target);},true);
new MutationObserver(function(){
 if(ticking)return;ticking=true;
 setTimeout(function(){ticking=false;prepare();if(document.activeElement===document.body&&candidates().length)initial();},350);
}).observe(document.body||document.documentElement,{childList:true,subtree:true});
window.BoboTVNav={back:back,navigate:nav,focusInitial:initial,version:'0.2'};
setTimeout(function(){if(!document.activeElement||document.activeElement===document.body)initial();},900);
}());