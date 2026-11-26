(function(){
'use strict';
// Native-only update UI: no third-party APK URLs or JavaScript installers.
const pill=document.getElementById('tv-update-pill');
let available=false,downloading=false;
function toast(message){
 if(window.BoboTV?.toast)window.BoboTV.toast(message,3500);
}
function send(event){
 if(window.BoboNative&&typeof window.BoboNative.postMessage==='function')
  window.BoboNative.postMessage(JSON.stringify({event}));
 else toast('Aggiornamenti disponibili solo nell’app TV');
}
function check(){
 toast('Verifica aggiornamenti…');
 send('update-check');
}
function onNativeUpdate(data){
 if(!data||typeof data!=='object')return;
 const state=data.state||'';
 if(state==='available'){
  available=true;downloading=false;
  pill.hidden=false;pill.textContent='↑ Aggiorna · '+String(data.version||'nuova versione');
  toast('Nuova versione disponibile: seleziona Aggiorna');
 }else if(state==='downloading'){
  downloading=true;pill.hidden=false;pill.textContent='↓ Download in corso…';
 }else if(state==='install'){
  pill.textContent='Installa aggiornamento';
  toast('Conferma l’installazione nella schermata Android');
 }else if(state==='permission'){
  pill.textContent='Autorizza aggiornamento';
  toast('Consenti a Bobo di installare gli aggiornamenti');
 }else if(state==='latest'){
  if(data.interactive)toast('Bobo Movie Club TV è già aggiornato');
 }else if(state==='error'){
  downloading=false;
  if(available)pill.textContent='↻ Riprova aggiornamento';
  if(data.interactive||available)toast(data.message||'Aggiornamento non disponibile');
 }
}
pill.addEventListener('click',()=>{
 if(downloading)return;
 if(available)send('update-install');
 else check();
});
window.BoboTVUpdates={check,onNativeUpdate};
}());
