(function(){
'use strict';
if(window.__BoboTVVideoBridge||window===window.top)return;
window.__BoboTVVideoBridge=true;
const PARENT='https://movie.curromatteo.it';
let knownVideo=null,readySent=false;
function media(){
 if(knownVideo&&knownVideo.isConnected)return knownVideo;
 let v=document.querySelector('video');
 if(!v){
  for(const host of document.querySelectorAll('*')){
   if(host.shadowRoot){v=host.shadowRoot.querySelector('video');if(v)break;}
  }
 }
 knownVideo=v||null;
 return knownVideo;
}
function snapshot(){
 const v=media();
 return v?{supported:true,paused:v.paused,time:Number.isFinite(v.currentTime)?v.currentTime:0,
  duration:Number.isFinite(v.duration)?v.duration:null} : {supported:false,reason:'video-element-not-found'};
}
function post(data){
 try{window.parent.postMessage(data,PARENT);}catch(e){}
}
function discover(){
 if(readySent)return;
 const v=media();
 if(v){readySent=true;post({type:'BOBO_TV_BRIDGE_READY',supported:true});
  v.addEventListener('emptied',()=>{knownVideo=null;readySent=false;});}
}
window.addEventListener('message',function(ev){
 if(ev.source!==window.parent||ev.origin!==PARENT)return;
 const msg=ev.data;
 if(!msg||msg.type!=='BOBO_TV_COMMAND'||typeof msg.action!=='string')return;
 const v=media();
 if(!v){post({type:'BOBO_TV_BRIDGE_ACK',supported:false,reason:'video-element-not-found'});return;}
 function report(){post(Object.assign({type:'BOBO_TV_BRIDGE_ACK'},snapshot()));}
 try{
  if(msg.action==='seek'){
   const delta=Math.max(-600,Math.min(600,Number(msg.delta)||0));
   const goal=v.currentTime+delta;
   v.currentTime=Math.max(0,Math.min(Number.isFinite(v.duration)?Math.max(0,v.duration-0.2):Infinity,goal));
   report();return;
  }
  if(msg.action==='pause'){v.pause();report();return;}
  if(msg.action==='toggle'&&(!v.paused)){v.pause();report();return;}
  if(msg.action==='play'||msg.action==='toggle'){
   const result=v.play();
   if(result&&typeof result.then==='function')result.then(report,()=>post({type:'BOBO_TV_BRIDGE_ACK',supported:false,reason:'play-rejected'}));
   else report();
   return;
  }
  if(msg.action==='status'){report();return;}
 }catch(e){post({type:'BOBO_TV_BRIDGE_ACK',supported:false,reason:'media-control-failed'});}
});
document.addEventListener('DOMContentLoaded',function(){
 discover();
 new MutationObserver(discover).observe(document.documentElement||document.body,{childList:true,subtree:true});
},{once:true});
const probe=setInterval(()=>{discover();if(readySent)clearInterval(probe);},1200);
setTimeout(()=>clearInterval(probe),75000);
}());