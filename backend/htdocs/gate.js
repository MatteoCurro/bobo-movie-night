(function(){
'use strict';
const KEY='bobo_friends_welcome_v1',COOKIE='bobo_friends_welcome_v1';
const AGE=30*24*3600;
const ok=()=>{
  const c=document.cookie.match(/(?:^|;\s*)bobo_friends_welcome_v1=(\d+)/);
  if(c&&Number(c[1])>Date.now()/1000-AGE)return true;
  try{const t=Number(localStorage.getItem(KEY));return t>0&&Date.now()-t<AGE*1000;}catch(_){return false;}
};
if(ok())return;
const css=document.createElement('style');css.textContent=`
#bobo-account-gate{position:fixed;inset:0;z-index:2147483647;background:#09141a;display:grid;place-items:center;padding:18px;color:#e6f3f0;font-family:system-ui,Arial,sans-serif}
#bobo-account-gate .card{max-width:470px;width:100%;padding:28px;background:#162732;border:1px solid #4b6c74;border-radius:12px;box-shadow:0 20px 70px #0009}
#bobo-account-gate h2{font-size:27px;margin:5px 0 12px;letter-spacing:-.04em}#bobo-account-gate p{color:#a3bec2}#bobo-account-gate label{display:block;margin:22px 0 8px;font-weight:600}
#bobo-account-gate input{font:inherit;width:100%;padding:13px;color:white;background:#0c1820;border:1px solid #67888d;border-radius:6px}
#bobo-account-gate button{font:inherit;margin-top:14px;padding:12px 24px;border:0;border-radius:6px;background:#a6dfd3;color:#082124;font-weight:700;cursor:pointer}
#bobo-account-gate .error{color:#f5aaaa;min-height:22px;font-size:13px}`;
document.head.appendChild(css);
function start(){
  if(ok())return;
  const questions=[{question:'Come si chiama il cane di Bobo?',answers:['faiva']},{question:'Cosa fa Bobo una volta a settimana?',answers:['arrampica','arrampicata']}];
  const q=questions[new Date().getDate()%questions.length];
  const root=document.createElement('div');root.id='bobo-account-gate';
  root.innerHTML='<section class="card" role="dialog" aria-modal="true" aria-label="Domanda iniziale Bobo"><h2>bobo. / friends edition</h2><p>Un piccolo check prima di entrare nel club.</p><form><label for="bobo-gate-answer"></label><input id="bobo-gate-answer" autocomplete="off" required><button type="submit">Entra ↗</button><p class="error" role="status"></p></form></section>';
  root.querySelector('label').textContent=q.question;
  root.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();const ans=root.querySelector('input').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
    if(!q.answers.includes(ans)){root.querySelector('.error').textContent='Non è la risposta che cercavamo.';return;}
    const t=Date.now();try{localStorage.setItem(KEY,String(t));}catch(_){ }
    document.cookie=COOKIE+'='+Math.floor(t/1000)+'; Domain=curromatteo.it; Path=/; Max-Age='+AGE+'; Secure; SameSite=Lax';
    root.remove();css.remove();
  });
  document.body.appendChild(root);root.querySelector('input').focus();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
