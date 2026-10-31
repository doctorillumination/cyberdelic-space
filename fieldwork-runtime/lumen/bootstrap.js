(()=>{
 const script=document.currentScript;
 const runtime=new URL(script?.dataset.runtime||'./app.js',document.baseURI);
 const loading=document.getElementById('loading'),error=document.getElementById('error');
 let elapsed=0,previous=performance.now(),recovering=false;
 function offerRetry(message){
  loading.hidden=true;error.hidden=false;recovering=true;
  const text=document.createElement('p');text.textContent=message;
  const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=()=>location.reload();
  error.replaceChildren(text,retry);document.body.dataset.startupRecovery='available';
 }
 const watch=setInterval(()=>{
  const now=performance.now(),dt=Math.min(2,(now-previous)/1000);previous=now;
  if(document.body.dataset.renderer==='ready'){
   clearInterval(watch);loading.hidden=true;
   if(recovering)error.hidden=true;
   document.body.dataset.startupRecovery='ready';return;
  }
  if(document.body.dataset.renderer==='failed'){
   clearInterval(watch);offerRetry(error.textContent||'The graphics session could not start. Try opening the artwork again.');return;
  }
  if(!document.hidden)elapsed+=dt;
  if(elapsed>=18&&!recovering)offerRetry('The artwork is taking longer than expected to open. Try again to reconnect to the sculpture.');
 },500);
 addEventListener('error',event=>{
  if(document.body.dataset.renderer!=='ready'&&event.error){document.body.dataset.renderer='failed';offerRetry('The artwork could not start: '+event.message);}
 });
 document.body.dataset.bootStage='scripts';
 import(runtime.href).catch(cause=>{
  console.error(cause);document.body.dataset.renderer='failed';
  offerRetry('The artwork could not start: '+cause.message);
 });
})();
