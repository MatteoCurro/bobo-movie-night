(()=>{'use strict';
const values=new URLSearchParams(location.hash.slice(1));
const id=values.get('id'),token=values.get('token');
history.replaceState(null,'',location.pathname);
const status=document.getElementById('status'),button=document.getElementById('unsubscribe');
if(!/^[a-f0-9]{24}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(token||'')){
 status.textContent='Il collegamento non è valido. Puoi modificare la preferenza dal tuo account.';button.hidden=true;return;
}
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Aggiornamento in corso…';
 try{
  const response=await fetch('api.php?route=newsletter/unsubscribe',{method:'POST',credentials:'omit',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({id,token})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Non è stato possibile aggiornare la preferenza');
  status.textContent='Iscrizione annullata. Non riceverai ulteriori riepiloghi settimanali.';button.hidden=true;
 }catch(err){status.textContent=err.message;button.disabled=false;}
});
})();
