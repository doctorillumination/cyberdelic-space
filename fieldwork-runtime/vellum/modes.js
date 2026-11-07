/* One small interface for ink on paper and ink in volume. */
'use strict';
const volumeForms=['Branches','Gyre','Plume','Braid'];
const volumePalettes=[
  {name:'Vellum',colors:['#0461b3','#e86602','#044726']},
  {name:'Dusk',colors:['#303370','#c96652','#8c5e9e']},
  {name:'Forest',colors:['#105657','#698039','#8c4d29']},
  {name:'Mineral',colors:['#213b96','#9e3d2e','#bf9638']},
  {name:'Tidal',colors:['#0291a8','#f7292e','#ffa804']},
  {name:'Iris',colors:['#590eeb','#f51478','#0473fa']}
];
const boundedInteger=(value,fallback,max)=>Number.isFinite(Number(value))&&value!==null?Math.max(0,Math.min(max,Math.trunc(Number(value)))):fallback;
const volumeState={seed:Math.max(1,boundedInteger(query.get('vseed'),seed,2147483647)),form:boundedInteger(query.get('vform'),1,3),palette:boundedInteger(query.get('vpalette'),4,5),orbit:query.get('orbit')!=='0'};
let volumeFrame=null;
function sendVolume(action,extra={}){
  volumeFrame?.contentWindow?.postMessage({type:'vellum-volume',action,...extra},location.protocol==='file:'?'*':location.origin);
}
function syncModeURL(){
  const url=new URL(location.href);
  if(spatialMode==='3d')url.searchParams.set('mode','3d');else url.searchParams.delete('mode');
  for(const [key,value,fallback] of [['vseed',volumeState.seed,seed],['vform',volumeState.form,1],['vpalette',volumeState.palette,4]]){
    if(value===fallback)url.searchParams.delete(key);else url.searchParams.set(key,String(value));
  }
  if(volumeState.orbit)url.searchParams.delete('orbit');else url.searchParams.set('orbit','0');
  try{history.replaceState(null,'',url);}catch{/* Direct file viewing can restrict history changes. */}
}
function syncVolume(){
  if(!volumeFrame)return;
  sendVolume('configure',{...volumeState,active:spatialMode==='3d',running});
}
function volumeControls(){
  $('volume-form-name').textContent=volumeForms[volumeState.form];
  $('volume-form').setAttribute('aria-label',`Change 3D form, ${volumeForms[volumeState.form]}`);
  const palette=volumePalettes[volumeState.palette];
  $('volume-colors').setAttribute('aria-label',`Change ink colors, ${palette.name}`);
  $('volume-colors').title=`${palette.name} colors. Click for another palette.`;
  $('volume-colors').querySelectorAll('span').forEach((dot,i)=>dot.style.setProperty('--pigment',palette.colors[i]));
  $('volume-orbit').setAttribute('aria-pressed',String(volumeState.orbit));
  $('volume-orbit').setAttribute('aria-label',volumeState.orbit?'Pause camera orbit':'Resume camera orbit');
  $('volume-orbit').title=volumeState.orbit?'Pause camera orbit':'Resume camera orbit';
}
function ensureVolume(){
  if(volumeFrame)return;
  volumeFrame=document.createElement('iframe');volumeFrame.title='Vellum, flowing ink in three dimensions';volumeFrame.id='volume-frame';
  volumeFrame.src='volume/index.html?v=volume1';volumeFrame.addEventListener('load',syncVolume);
  $('volume-host').append(volumeFrame);document.body.dataset.volumeReady='loading';
}
function setView(mode){
  const next=mode==='3d'?'3d':'2d',previous=spatialMode;
  spatialMode=next;document.body.dataset.view=next;pointerUp();
  if(document.body.classList.contains('studio-open'))toggleStudio(false);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===next)));
  $('volume-host').hidden=next!=='3d';$('paper-tools').hidden=next==='3d';$('volume-tools').hidden=next!=='3d';
  $('studio-toggle').hidden=next==='3d';
  if(next==='3d'){
    cameraSource?.stop(false);document.documentElement.dataset.cameraState='off';document.body.classList.remove('camera-mode');
    $('camera-toggle').hidden=true;$('capture-portrait').hidden=true;
    $('another').textContent='New form';$('edition').textContent=String(volumeState.seed).padStart(3,'0');
    $('gesture-hint').textContent='Drag to rotate · Scroll to approach';
    ensureVolume();if(ready)noLoop();
  }else{
    $('edition').textContent=String(seed).padStart(3,'0');
    if(ready){cameraInterface();lastDraw=0;simulationDebt=0;loop();}
  }
  volumeControls();syncVolume();syncModeURL();
  if(previous!==next)announce(next==='3d'?'Ink in three dimensions':'Ink on paper');
}
function newVolumeSeed(){
  let next;do{next=crypto.getRandomValues(new Uint32Array(1))[0]%999999+1;}while(next===volumeState.seed);
  volumeState.seed=next;document.body.dataset.volumeReady='loading';$('edition').textContent=String(next).padStart(3,'0');syncVolume();syncModeURL();
}
function modeShortcut(key){
  if(key==='pause')togglePause();else if(key==='save')downloadPNG();
  else if(key==='hide')document.body.classList.toggle('hide-ui');
  else if(key==='escape'){document.body.classList.remove('hide-ui');toggleStudio(false);}
  else if(key==='fullscreen')$('fullscreen').click();
}
addEventListener('message',event=>{
  if(!volumeFrame||event.source!==volumeFrame.contentWindow||event.data?.type!=='vellum-volume-state')return;
  if(location.protocol!=='file:'&&event.origin!==location.origin)return;
  const message=event.data;
  if(message.state==='available')syncVolume();
  else if(message.state==='ready'||message.state==='loading'||message.state==='error'){
    document.body.dataset.volumeReady=message.state==='ready'?'true':message.state;
    if(message.state==='error'&&spatialMode==='3d')announce('The 3D view is unavailable in this browser. The square returns to ink on paper.');
  }else if(message.state==='print'&&spatialMode==='3d'&&typeof message.data==='string'&&message.data.startsWith('data:image/png;base64,')){
    showPrint(message.data,message.width,message.height,`vellum-3d-${volumeState.seed}-${message.steps}.png`);
  }else if(message.state==='shortcut'&&spatialMode==='3d')modeShortcut(message.key);
});
addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  $('volume-form').addEventListener('click',()=>{volumeState.form=(volumeState.form+1)%volumeForms.length;document.body.dataset.volumeReady='loading';volumeControls();syncVolume();syncModeURL();});
  $('volume-colors').addEventListener('click',()=>{volumeState.palette=(volumeState.palette+1)%volumePalettes.length;volumeControls();syncVolume();syncModeURL();});
  $('volume-orbit').addEventListener('click',()=>{volumeState.orbit=!volumeState.orbit;volumeControls();syncVolume();syncModeURL();});
  setView(spatialMode);
});
