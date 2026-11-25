(()=>{
'use strict';
const $=id=>document.getElementById(id);
async function api(route,body){
 const response=await fetch('api.php?route='+encodeURIComponent(route),{
   method:body?'POST':'GET',credentials:'include',
   headers:body?{'Content-Type':'application/json'}:{},
   body:body?JSON.stringify(body):undefined,cache:'no-store'
 });
 const data=await response.json();if(!response.ok)throw Error(data.error||'Errore HTTP '+response.status);
 return data;
}
const status=s=>$('status').textContent=s;
async function load(){
 try{
   const info=await api('me');if(info.role!=='admin')throw Error('Profilo non autorizzato');
   const result=await api('admin/users');
   $('login').hidden=true;$('dashboard').hidden=false;
   $('count').textContent='('+result.count+')';
   $('rows').replaceChildren();
   for(const user of result.users){
     const row=document.createElement('tr');
     for(const text of [user.username,user.email||'—',user.email_verified?'Sì':'No',user.role,user.created_at,String(user.favorites_count),user.newsletter_subscribed?'Iscritto':'No']){
       const cell=document.createElement('td');cell.textContent=text;row.appendChild(cell);
     }
     const detail=document.createElement('td'),link=document.createElement('a');
     link.href='admin-favorites.html?username='+encodeURIComponent(user.username);
     link.textContent='Vedi titoli ↗';detail.appendChild(link);row.appendChild(detail);
     $('rows').appendChild(row);
   }
   status('Dati aggiornati.');
 }catch(e){ $('login').hidden=false;$('dashboard').hidden=true;status(e.message); }
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();try{
   await api('login',{username:$('username').value,password:$('password').value});
   $('password').value='';await load();
 }catch(e){status(e.message)}
});
$('refresh').addEventListener('click',load);
$('newsletter-test').addEventListener('click',async()=>{
 const button=$('newsletter-test');
 button.disabled=true;
 status('Invio della newsletter di prova al tuo indirizzo verificato…');
 try{
   const result=await api('admin/newsletter/test',{});
   status(result.message||'Newsletter di prova inviata: controlla la tua casella email.');
 }catch(error){status('Prova non riuscita: '+error.message);}
 finally{button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
 try{await api('logout',{});}catch(_){};location.reload();
});
load();
})();
