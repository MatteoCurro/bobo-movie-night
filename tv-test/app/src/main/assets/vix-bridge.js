(function(){
'use strict';
if(window.__BoboTVVideoBridge||window===window.top)return;
window.__BoboTVVideoBridge=true;
const BOBO='https://movie.curromatteo.it';
const VIX=/^https:\/\/(?:[a-z0-9-]+\.)*vixsrc\.to$/i;
let current=null, lastReport=0, observer=null;
function video(){
 if(current&&current.isConnected)return current;
 let found=document.querySelector('video');
 if(!found){
  for(const node of document.querySelectorAll('*')){
   if(node.shadowRoot){found=node.shadowRoot.querySelector('video');if(found)break;}
  }
 }
 return found||null;
}
function state(){
 const v=video();
 return v?{supported:true,paused:v.paused,playing:!v.paused&&!v.ended,
   time:Number.isFinite(v.currentTime)?v.currentTime:null,
   duration:Number.isFinite(v.duration)?v.duration:null}:
  {supported:false,reason:'no-html5-video-in-vix-frame'};
}
function post(obj){
 try{window.top.postMessage(obj,BOBO);}catch(e){}
}
function report(name){
 const now=Date.now();
 if(name==='timeupdate'&&now-lastReport<850)return;
 lastReport=now;
 post(Object.assign({type:'BOBO_TV_MEDIA_STATE',event:name},state()));
}
function attach(){
 const v=video();
 if(!v||current===v)return;
 current=v;
 post(Object.assign({type:'BOBO_TV_BRIDGE_READY'},state()));
 for(const name of ['play','playing','pause','timeupdate','seeked','ended','durationchange','loadedmetadata']){
  v.addEventListener(name,()=>{if(current===v)report(name);});
 }
 report('attached');
}
function forward(msg){
 let n=0;
 for(const sub of document.querySelectorAll('iframe')){
  try{
   const url=new URL(sub.src,document.baseURI);
   if(VIX.test(url.origin)&&sub.contentWindow){
    sub.contentWindow.postMessage(msg,url.origin);
    n++;
   }
  }catch(e){}
 }
 return n;
}
window.addEventListener('message',function(ev){
 if(ev.source!==window.parent)return;
 const fromBobo=ev.origin===BOBO;
 const fromVix=VIX.test(ev.origin);
 if(!fromBobo&&!fromVix)return;
 const msg=ev.data;
 if(!msg||msg.type!=='BOBO_TV_COMMAND'||!['toggle','pause','play','seek','status'].includes(msg.action))return;
 const v=video();
 if(!v){
  if(!forward(msg))post({type:'BOBO_TV_BRIDGE_ACK',supported:false,reason:'no-html5-video-in-vix-frame',cmdId:msg.cmdId});
  return;
 }
 function ack(){post(Object.assign({type:'BOBO_TV_BRIDGE_ACK',cmdId:msg.cmdId},state()));}
 function fail(){post({type:'BOBO_TV_BRIDGE_ACK',supported:false,reason:'media-command-rejected',cmdId:msg.cmdId});}
 try{
  if(msg.action==='status'){ack();return;}
  if(msg.action==='seek'){
   const delta=Math.max(-7200,Math.min(7200,Number(msg.delta)||0));
   v.currentTime=Math.max(0,Math.min(Number.isFinite(v.duration)?Math.max(0,v.duration-.2):Infinity,v.currentTime+delta));
   ack();return;
  }
  if(msg.action==='pause'||(msg.action==='toggle'&&!v.paused)){v.pause();ack();return;}
  const p=v.play();
  if(p&&typeof p.then==='function')p.then(ack,fail);else ack();
 }catch(e){fail();}
});
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',start,{once:true});
}else start();
function start(){
 attach();
 if(document.documentElement){
  observer=new MutationObserver(()=>{attach();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
 }
 const interval=setInterval(attach,1600);
 setTimeout(()=>clearInterval(interval),120000);
}
}());