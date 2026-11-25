(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const notice=msg=>$('notice').textContent=msg;
 // Only return to known Bobo pages, never to an arbitrary external URL.
 const query=new URLSearchParams(location.search);
 function safeReturn(value){
  try {
   const u=new URL(value);
   if(u.protocol==='https:' && u.hostname==='movie.curromatteo.it' &&
      (u.pathname==='/' || ['/index.html','/favorites.html','/watch.html'].includes(u.pathname)))
     return u.href;
  } catch (_) {}
  return 'https://movie.curromatteo.it/favorites.html';
 }
 let savedReturn=null;
 try {savedReturn=sessionStorage.getItem('bobo_return_url');}catch(_){}
 const requestedReturn=query.get('return');
 const home=safeReturn(requestedReturn||savedReturn);
 const settingsMode=query.get('view')==='settings';
 if(requestedReturn)try {sessionStorage.setItem('bobo_return_url',home);}catch(_){}
 $('back-to-bobo').href=home;
 $('go-to-favorites').href=home;
 $('after-verification').href=home;
 let pendingToken = null;
 function openTab(name){
   document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));
   document.querySelectorAll('[data-form]').forEach(form=>form.hidden=form.dataset.form!==name);
 }

 async function fetchRegistrationMode(){
  try{
   const status=await api('health');
   const required=status.registration_mode==='invite';
   $('invite-field').hidden=!required;
   $('rg-invite').required=required;
  }catch(_){ /* Login and reset remain usable when health is temporarily unavailable. */ }
 }
 async function api(route,payload,method='POST'){
  const response=await fetch('api.php?route='+encodeURIComponent(route),{
   method:payload===undefined?'GET':method,credentials:'include',cache:'no-store',
   headers:payload===undefined?{}:{'Content-Type':'application/json'},
   body:payload===undefined?undefined:JSON.stringify(payload)
  });
  const body=await response.json();
  if(!response.ok)throw Error(body.error || 'Errore dal servizio');
  return body;
 }
 function showRecovery(code){
  $('recovery-code').textContent=code;
  $('recovery-panel').hidden=false;
 }
 async function refresh(){
  try{
   const me=await api('me');
   $('anonymous').hidden=true;$('logged').hidden=false;
   $('profile').textContent=me.username;
   $('account-email').textContent=me.email ? 'Email: '+me.email : 'Email non configurata';
   $('admin-link').hidden=me.role!=='admin';
   $('newsletter-test-panel').hidden=me.role!=='admin';
   try{
     const current=await api('newsletter');
     $('newsletter-opt-in').checked=Boolean(current.subscribed);
     $('newsletter-status').textContent=current.subscribed?'Riepilogo settimanale attivo.':'Non iscritto: riceverai solo email di servizio.';
   }catch(_){$('newsletter-status').textContent='Preferenza temporaneamente non disponibile.';}
  }catch(_){$('anonymous').hidden=false;$('logged').hidden=true;}
 }
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>openTab(btn.dataset.tab)));
 $('login').addEventListener('submit',async e=>{
  e.preventDefault();try{await api('login',{username:$('li-user').value,password:$('li-pass').value});$('li-pass').value='';notice('Accesso effettuato.');await refresh();if(!settingsMode)location.assign(home);}catch(err){notice(err.message)}
 });
 $('register').addEventListener('submit',async e=>{
  e.preventDefault();try{
   const input={username:$('rg-user').value,email:$('rg-email').value,password:$('rg-pass').value};
   if(!$('invite-field').hidden)input.invite=$('rg-invite').value;
   const result=await api('register',input);
   $('rg-pass').value='';notice(result.message||'Controlla la tua email per confermare l’account.');openTab('login');
  }catch(err){notice(err.message)}
 });
 $('resend-verification').addEventListener('click',async()=>{
  const email=$('rg-email').value.trim();
  if(!email){notice('Inserisci prima l’indirizzo email nel modulo di registrazione.');return;}
  try{const result=await api('resend-verification',{email});notice(result.message);}
  catch(err){notice(err.message)}
 });
 $('forgot').addEventListener('submit',async e=>{
  e.preventDefault();try{const result=await api('request-reset',{email:$('fg-email').value});
   notice(result.message);}catch(err){notice(err.message)}
 });
 $('reset').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!pendingToken){notice('Link mancante o scaduto. Richiedi una nuova email.');return;}
  try{await api('reset-password',{token:pendingToken,new_password:$('rs-pass').value});
    pendingToken=null;$('rs-pass').value='';notice('Password aggiornata, ora sei connesso.');
    openTab('login');await refresh();}catch(err){notice(err.message)}
 });
 $('recover').addEventListener('submit',async e=>{
  e.preventDefault();try{const result=await api('recover',{username:$('rc-user').value,recovery_code:$('rc-code').value,new_password:$('rc-pass').value});$('rc-pass').value='';$('rc-code').value='';showRecovery(result.recovery_code);notice('Password aggiornata.');await refresh();}catch(err){notice(err.message)}
 });
 $('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('recovery-code').textContent);notice('Codice copiato.')}catch(_){notice('Seleziona e copia il codice manualmente.')}});
 $('dismiss-code').addEventListener('click',()=>{$('recovery-panel').hidden=true;$('recovery-code').textContent='';});
 $('newsletter-form').addEventListener('submit',async event=>{
  event.preventDefault();const checked=$('newsletter-opt-in').checked;const button=$('newsletter-save');button.disabled=true;
  try{
   const result=await api('newsletter',{subscribed:checked},'PUT');
   $('newsletter-status').textContent=result.subscribed?
     'Iscrizione confermata: riceverai il riepilogo ogni settimana.':
     'Iscrizione annullata: nessuna newsletter verrà inviata.';
  }catch(err){$('newsletter-status').textContent=err.message;await refresh();}
  finally{button.disabled=false;}
 });

 $('newsletter-test-send').addEventListener('click',async()=>{
  const button=$('newsletter-test-send');button.disabled=true;
  $('newsletter-test-status').textContent='Invio in corso…';
  try{
   const result=await api('admin/newsletter/test',{});
   $('newsletter-test-status').textContent=result.message||'Email di prova inviata.';
  }catch(err){$('newsletter-test-status').textContent=err.message;}
  finally{button.disabled=false;}
 });
 $('logout').addEventListener('click',async()=>{try{await api('logout',{});}catch(_){}$('recovery-panel').hidden=true;notice('Sessione terminata');await refresh();});
 $('import').addEventListener('click',()=>$('file').click());
 $('file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>512000)throw Error('Backup troppo grande');const data=JSON.parse(await file.text());
   if(!Array.isArray(data.items))throw Error('Backup Bobo non valido');
   const current=await api('favorites');
   const map=new Map(current.items.map(x=>[x.type+':'+x.tmdb_id,x]));
   for(const item of data.items){
     if(!item||!['movie','tv'].includes(item.type)||!/^[1-9][0-9]{0,11}$/.test(String(item.tmdb_id)))continue;
     const key=item.type+':'+item.tmdb_id;if(!map.has(key))map.set(key,item);
   }
   const merged=Array.from(map.values());
   if(merged.length>500)throw Error('La raccolta non può superare 500 titoli');
   const result=await api('favorites',{items:merged},'PUT');
   notice(result.count+' titoli salvati senza duplicati.');await refresh();
  }catch(err){notice(err.message)}finally{e.target.value='';}
 });
 $('export').addEventListener('click',async()=>{try{const result=await api('favorites');
   const blob=new Blob([JSON.stringify({format:'bobo-favorites',version:2,items:result.items},null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bobo-account-preferiti.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(err){notice(err.message)}});
 async function processEmailLink(){
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const verify = hash.get('verify');
  const reset = hash.get('reset');
  if(!verify && !reset)return;
  history.replaceState(null,'','account.html');
  if(verify){
    notice('Verifica dell’indirizzo email in corso…');
    try{const result=await api('verify-email',{token:verify});
      showRecovery(result.recovery_code);
      notice('Email confermata. Account attivo! Salva anche il codice di emergenza.');
      await refresh();
    }catch(err){notice('Conferma non riuscita: '+err.message+' · Richiedi una nuova email dalla registrazione.');}
  } else {
    pendingToken=reset;
    openTab('reset');
    notice('Inserisci una nuova password: questo link è valido per 30 minuti.');
  }
 }
 refresh();
 fetchRegistrationMode();
 processEmailLink();
})();
