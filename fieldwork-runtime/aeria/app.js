import { VolumeGPU } from './volume-gpu.js';
import { cloudState, livingPoint, cloudUndersides } from './cloud-life.js';
import { CloudRenderer, vertexShader, previewShader } from './renderer.js';
const $ = (s) => document.querySelector(s);
const canvas = $('#sky');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
if (!gl) { $('#fallback').hidden = false; $('#welcome').hidden = true; }
else start().catch(error=>{console.error(error);$('#fallback').hidden=false;$('#fallback p').textContent='The sky could not start. Please try reloading or using a recent browser with graphics acceleration enabled.';$('#welcome').hidden=true;});
async function start() {
const vertex=vertexShader;
const fragment=previewShader;
function shader(type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const program = gl.createProgram(); gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)); gl.useProgram(program);
const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW); const attr = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
const uniforms = {}; for (const name of ['volume','noiseField','footprint','aspect','time','fullness','lightMode','sunAngle','sunDepth','pixels']) uniforms[name] = gl.getUniformLocation(program, name);
function texture3D(unit, name, w, h, d, data, repeat = false, components = 1) { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D,t); gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); for(const a of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,a,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE); gl.pixelStorei(gl.UNPACK_ALIGNMENT,1); gl.texImage3D(gl.TEXTURE_3D,0,components===4?gl.RGBA8:gl.R8,w,h,d,0,components===4?gl.RGBA:gl.RED,gl.UNSIGNED_BYTE,data); gl.uniform1i(uniforms[name],unit); return t; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15,1 | seed); t ^= t + Math.imul(t ^ t >>> 7,61 | t); return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
const noiseResponse=await fetch(new URL('./cloud-noise.bin',import.meta.url));
if(!noiseResponse.ok)throw new Error('Could not load the cloud density field.');
const noise=new Uint8Array(await noiseResponse.arrayBuffer());
if(noise.length!==64**3*4)throw new Error('The cloud density field is incomplete.');
texture3D(1,'noiseField',64,64,64,noise,true,4);
const NX=384, NY=256, NZ=96; const data=null, mask=null;
const volumeTexture = texture3D(0,'volume',NX,NY,NZ,data);
const maskTexture = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,maskTexture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,NX,NY,0,gl.RED,gl.UNSIGNED_BYTE,mask);gl.uniform1i(uniforms.footprint,2);
const geometry=new VolumeGPU(gl,volumeTexture,maskTexture,NX,NY,NZ);
const tracer=new CloudRenderer(gl,program);
let aspect = innerWidth/innerHeight, strokes=[], history=[], future=[], active=null, pending=[], dirty=true, brush=53, preset=0, fullness=1, sunAngle=-.65, sunDepth=-.62, quality=256, rainEnabled=false, rainAmount=.6, rainWind=.15, rainPaused=false, rainTime=0, weatherDirty=true, drift=true, lifeSpeed=1, driftTime=0, lastLifeBuild=0, lastLifeFrame=0, lastTime=performance.now(), pointer=null, saveTimer, toastTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function setResolution(){
 const cap=quality===64?1200000:quality===256?2200000:3600000;
 const scale=Math.min(devicePixelRatio||1,1.5,Math.sqrt(cap/(innerWidth*innerHeight)));
 const w=Math.round(innerWidth*scale),h=Math.round(innerHeight*scale);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;tracer.reset();weatherDirty=true;}
}
function resize(){aspect=innerWidth/innerHeight;setResolution();rebuild();}
function sphere(...args){geometry.sphere(...args);}
function billow(point, radius, seed, growth=1,strength=1){
 const r=rng(seed),worldRadius=radius*3.2*growth*(.88+r()*.24),x=point.x,y=point.y,z=(r()-.5)*.24;
 sphere(x,y,z,worldRadius,1.05,strength);
 for(let i=0;i<7;i++){
  const angle=r()*Math.PI*2,offset=.56+r()*.30,rr=worldRadius*(.31+r()*.29);
  const px=x+Math.cos(angle)*worldRadius*offset/(aspect*3.2),py=y+Math.sin(angle)*worldRadius*offset/3.2,pz=z+(r()-.5)*worldRadius;
  sphere(px,py,pz,rr,1,strength);
  for(let j=0;j<2;j++){
   const a=angle+(r()-.5)*1.6,small=rr*(.32+r()*.20),reach=rr*(.74+r()*.24);
   sphere(px+Math.cos(a)*reach/(aspect*3.2),py+Math.sin(a)*reach/3.2,pz+(r()-.5)*rr,small,1.1,strength);
  }
 }
}
function addPoint(point, stroke, grow=true){if(stroke.points.length>=2400)return;const seed=(stroke.seed+(stroke.points.length+1)*9137)>>>0;stroke.points.push(point);const radius=stroke.radius*(point.p || 1);if(grow&&!reducedMotion){pending.push({point,radius,seed,start:performance.now(),last:0});billow(point,radius,seed,.35);}else billow(point,radius,seed);dirty=true;}
function rebuild(){
 geometry.reset();pending=[];
 for(const s of strokes){
  const state=cloudState(s,driftTime,aspect);
  if(state.mass<.012)continue;
  for(let i=0;i<s.points.length;i++){
   const point=livingPoint(s.points[i],i,state,aspect);
   billow(point,s.radius*(point.p||1)*state.scale,(s.seed+(i+1)*9137)>>>0,1,state.mass);
  }
 }
 dirty=true;lastLifeBuild=driftTime;updateUI();
}
function upload(){
 if(!exporting)tracer.beginWork();geometry.flush(aspect,rainEnabled);
 dirty=false;weatherDirty=true;
}
// Keep enough headroom for input, compositing, and rain between volume updates.
let motionPixels=1000000,lastBudgetChange=0,busyFrames=0,measureStart=performance.now(),lastGpuSample=0,previousPresentations=0,previousVolumeFrames=0;
function tuneBudget(now){
 if(now-lastBudgetChange<1500)return;
 const limit=quality===64?650000:quality===256?1400000:2200000;
 if((tracer.gpuSample!==lastGpuSample&&tracer.gpuMs>12)||(!tracer.gpuSample&&busyFrames>6))motionPixels=Math.max(360000,motionPixels*.8);
 else if(tracer.gpuSample!==lastGpuSample&&tracer.gpuMs<8)motionPixels=Math.min(limit,motionPixels*1.1);
 motionPixels=Math.min(limit,motionPixels);lastGpuSample=tracer.gpuSample;lastBudgetChange=now;busyFrames=0;
}
let exporting=false, exportCancelled=false, sceneRevision=0, lastSignature='';
function settings(){return{aspect,time:lastLifeBuild,fullness,lightMode:preset,sunAngle,sunDepth,rainAmount:rainEnabled?rainAmount:0,rainWind,rainTime,hasClouds:strokes.length>0,renderPixels:exporting||!drift&&!active&&!pending.length?Infinity:motionPixels};}
function render(now){
 if(document.hidden||exporting)return;
 const delta=Math.min((now-lastTime)/1000,.15);lastTime=now;if(drift&&strokes.length&&!active&&!pending.length)driftTime+=delta*lifeSpeed;
 if(rainEnabled&&!rainPaused){rainTime+=delta;tracer.rain.update(delta,rainAmount,rainWind,aspect);}
 if(!tracer.ready()){busyFrames++;return;}
 const cpuStart=performance.now();
 const latestMask=geometry.pollMask();if(latestMask&&rainEnabled)tracer.rain.setSources(cloudUndersides(latestMask,NX,NY));
 tuneBudget(now);
 const remaining=[];
 for(const item of pending){
  const age=Math.min((now-item.start)/550,1);
  if(age-item.last>.08||age===1){billow(item.point,item.radius,item.seed,.35+.65*(1-(1-age)**3));item.last=age;dirty=true;}
  if(age<1)remaining.push(item);
 }
 pending=remaining;
 if(drift&&strokes.length&&!active&&!pending.length&&now-lastLifeFrame>=1000/30-2){rebuild();lastLifeFrame=now;}
 if(dirty){upload();sceneRevision++;}
 const interactive=Boolean(active||pending.length);
 setResolution();
 const signature=[canvas.width,canvas.height,fullness,preset,sunAngle,sunDepth,lastLifeBuild,sceneRevision,settings().renderPixels].join(',');
 const changed=signature!==lastSignature;
 if(changed||tracer.invalid){tracer.render(settings());lastSignature=signature;}
 else if(weatherDirty||rainEnabled&&!rainPaused&&(tracer.rain.model.drops.length||tracer.rain.model.sources.length)){tracer.present(settings());}
 weatherDirty=false;canvas.dataset.cpuMs=(performance.now()-cpuStart).toFixed(1);
 const status=$('#render-status');
 const message=!strokes.length?'':interactive?'Following your hand':drift?'A living sky':'A still moment';if(status.textContent!==message)status.textContent=message;
 status.dataset.settled=String(!interactive);
 if(now-measureStart>=1000){canvas.dataset.fps=((tracer.presentations-previousPresentations)*1000/(now-measureStart)).toFixed(1);canvas.dataset.cloudFps=((tracer.frames-previousVolumeFrames)*1000/(now-measureStart)).toFixed(1);previousPresentations=tracer.presentations;previousVolumeFrames=tracer.frames;measureStart=now;}
 canvas.dataset.gpuMs=tracer.gpuMs.toFixed(1);canvas.dataset.volumeResolution=`${tracer.width}x${tracer.height}`;
 canvas.dataset.frames=String(tracer.frames);
 canvas.dataset.renderer='stable-volume';
 canvas.dataset.quality=String(quality);
 canvas.dataset.strokes=String(strokes.length);
 canvas.dataset.rain=rainEnabled?'on':'off';canvas.dataset.rainPaused=String(rainPaused);canvas.dataset.rainTime=rainTime.toFixed(3);
 canvas.dataset.resolution=`${canvas.width}x${canvas.height}`;
 canvas.dataset.life=drift?'playing':'paused';canvas.dataset.lifeTime=driftTime.toFixed(3);
 canvas.dataset.rainDrops=String(tracer.rain.model.drops.length);canvas.dataset.rainSources=String(tracer.rain.model.sources.length);
}
let raf;function frame(now){render(now);raf=requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){saveState();cancelAnimationFrame(raf);}else{lastTime=performance.now();raf=requestAnimationFrame(frame);}});
function updateUI(){canvas.dataset.points=String(strokes.reduce((n,s)=>n+s.points.length,0));const any=strokes.length>0;document.body.classList.toggle('has-clouds',any);$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;$('#clear').disabled=!any;}
function saveState(){try{localStorage.setItem('cloudroom-v1',JSON.stringify({strokes,preset,fullness,sunAngle,sunDepth,quality,rainEnabled,rainAmount,rainWind,rainPaused,lifeVersion:2,living:drift,lifeSpeed,lifeTime:driftTime,brush}));}catch{toast('Your browser could not remember this sky. You can still save an image.');}}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(saveState,400);}
window.addEventListener('pagehide',saveState);
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);}
function undo(){finish();if(!history.length)return;future.push(strokes.slice());strokes=history.pop();rebuild();persist();}
function redo(){finish();if(!future.length)return;history.push(strokes.slice());strokes=future.pop();rebuild();persist();}
function getPoint(e){return{x:e.clientX/innerWidth,y:1-e.clientY/innerHeight,p:e.pointerType==='pen' ? .65+e.pressure*.65 : 1};}
function radius(){return (brush/850)*Math.min(innerWidth/650,1);}
function newStroke(){return{born:driftTime,seed:crypto.getRandomValues(new Uint32Array(1))[0],radius:radius(),points:[]};}
let pointerId=null;
function begin(e){if(exporting)return;if(e.button!==0||pointerId!==null)return;if(strokes.reduce((n,s)=>n+s.points.length,0)>2200){toast('A wonderfully full sky. Start fresh or undo a stroke to make room.');return;}canvas.focus({preventScroll:true});$('#light-panel').hidden=true;$('#light-toggle').setAttribute('aria-expanded','false');pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);history.push(strokes.slice());active=newStroke();strokes.push(active);future=[];addPoint(getPoint(e),active);pointer=getPoint(e);updateUI();}
function move(e){$('#cursor').style.left=e.clientX+'px';$('#cursor').style.top=e.clientY+'px';$('#cursor').style.display=e.pointerType==='touch'?'none':'block';if(!active||e.pointerId!==pointerId)return;const next=getPoint(e),dx=(next.x-pointer.x)*aspect,dy=next.y-pointer.y,distance=Math.hypot(dx,dy),spacing=active.radius*.38;const steps=Math.floor(distance/spacing);if(steps>0){const previous=pointer;const count=Math.min(steps,60);for(let i=1;i<=count;i++){const t=i/count;addPoint({x:previous.x+(next.x-previous.x)*t,y:previous.y+(next.y-previous.y)*t,p:next.p},active);}pointer=active.points.at(-1);} }
function finish(e){
 if(!active||e&&e.pointerId!==pointerId)return;
 const stroke=active,id=pointerId;stroke.born=driftTime;active=null;pointer=null;pointerId=null;
 if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);persist();
}
canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);canvas.addEventListener('pointerleave',()=>$('#cursor').style.display='none');canvas.addEventListener('contextmenu',e=>e.preventDefault());
function cursorSize(){const px=radius()*innerHeight*2;$('#cursor').style.width=px+'px';$('#cursor').style.height=px+'px';$('#brush').value=brush;}
$('#brush').addEventListener('input',e=>{brush=+e.target.value;cursorSize();persist();});$('#undo').onclick=undo;$('#redo').onclick=redo;
function syncLife(){
 $('#drift').setAttribute('aria-pressed',String(drift));$('#drift').setAttribute('aria-label',drift?'Pause cloud life':'Resume cloud life');
 $('#life-speed').value=lifeSpeed;$('#life-value').textContent=lifeSpeed<.7?'Gentle':lifeSpeed>1.4?'Playful':'Unhurried';
}
function toggleDrift(){drift=!drift;syncLife();persist();toast(drift?'The sky is breathing.':'A still moment.');}$('#drift').onclick=toggleDrift;
$('#life-speed').oninput=e=>{lifeSpeed=+e.target.value;syncLife();persist();};
$('#clear').onclick=()=>{finish();if(!strokes.length)return;history.push(strokes.slice());future=[];strokes=[];tracer.rain.clear();tracer.rain.setSources([]);rebuild();persist();toast('A fresh sky. Undo to bring it back.');};
async function save(){
 if(exporting)return;
 exporting=true;finish();rebuild();upload();sceneRevision++;exportCancelled=false;document.body.classList.add('exporting');$('#export-progress').hidden=false;
 const wasDrifting=drift;drift=false;
 const width=canvas.width,height=canvas.height,button=$('#save');button.disabled=true;
 const scale=Math.min(2,2400/Math.max(innerWidth,innerHeight));
 canvas.width=Math.round(innerWidth*scale);canvas.height=Math.round(innerHeight*scale);
 tracer.reset();toast('Keeping the light, just as you see it…');
 try{
  const frozen=settings();
  while(!tracer.ready()){if(exportCancelled)throw new Error('cancelled');await new Promise(requestAnimationFrame);}
  if(exportCancelled)throw new Error('cancelled');
  tracer.render(frozen);$('#export-label').textContent='Keeping your sky…';
  while(!tracer.ready()){if(exportCancelled)throw new Error('cancelled');await new Promise(requestAnimationFrame);}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Image export failed.');
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`aeria-${new Date().toLocaleDateString('en-CA')}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),5000);toast('A little piece of sky, kept.');
 }catch(error){if(error.message==='cancelled')toast('Image cancelled. Your sky is still here.');else{console.error(error);toast('The image could not be saved. Please try again.');}}
 finally{document.body.classList.remove('exporting');$('#export-progress').hidden=true;canvas.width=width;canvas.height=height;tracer.reset();exporting=false;drift=wasDrifting;button.disabled=false;lastTime=performance.now();}
}$('#save').onclick=save;$('#export-cancel').onclick=()=>exportCancelled=true;
function setLight(n){preset=n;document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.light===n)));$('#light-label').textContent=['Daylight','Golden hour','Blue hour'][n];persist();}document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>setLight(+b.dataset.light));
$('#light-toggle').onclick=()=>{const panel=$('#light-panel');panel.hidden=!panel.hidden;$('#light-toggle').setAttribute('aria-expanded',String(!panel.hidden));};
$('#sun-angle').oninput=e=>{sunAngle=+e.target.value;$('#sun-value').textContent=sunAngle<-.25?'Upper left':sunAngle>.25?'Upper right':'Overhead';persist();};$('#softness').oninput=e=>{fullness=+e.target.value;$('#softness-value').textContent=fullness<.85?'Wispy':fullness>1.2?'Full & soft':'Puffy';persist();};
$('#sun-depth').oninput=e=>{sunDepth=+e.target.value;syncLightLabels();persist();};
$('#render-quality').onchange=e=>{quality=+e.target.value;setResolution();persist();};
function syncLightLabels(){
 $('#depth-value').textContent=sunDepth<-.25?'Glowing edges':sunDepth>.25?'Soft front light':'Side light';
 $('#sun-value').textContent=sunAngle<-.25?'Upper left':sunAngle>.25?'Upper right':'Overhead';
 $('#softness-value').textContent=fullness<.85?'Wispy':fullness>1.2?'Full & soft':'Puffy';
}
function syncRain(){
 $('#rain').setAttribute('aria-pressed',String(rainEnabled));$('#rain').setAttribute('aria-label',rainEnabled?'Turn off rain':'Turn on rain');
 $('#rain-controls').hidden=!rainEnabled;
 $('#rain-motion').textContent=rainPaused?'Let it fall':'Pause rain';$('#rain-motion').setAttribute('aria-pressed',String(rainPaused));
 $('#rain-amount').value=rainAmount;$('#rain-wind').value=rainWind;
 $('#rain-value').textContent=rainAmount<.35?'Drizzle':rainAmount>.8?'Downpour':'Steady rain';
 $('#wind-value').textContent=Math.abs(rainWind)<.12?'Still':rainWind<0?'From the right':'From the left';
 weatherDirty=true;
}
function toggleRain(){rainEnabled=!rainEnabled;if(rainEnabled)dirty=true;if(!rainEnabled)tracer.rain.clear();if(rainEnabled&&reducedMotion)rainPaused=true;syncRain();persist();toast(rainEnabled?'A little weather.':'The rain has passed.');}
$('#rain').onclick=toggleRain;
$('#rain-amount').oninput=e=>{rainAmount=+e.target.value;syncRain();persist();};
$('#rain-wind').oninput=e=>{rainWind=+e.target.value;syncRain();persist();};
$('#rain-motion').onclick=()=>{rainPaused=!rainPaused;syncRain();persist();};
$('#help-toggle').onclick=()=>$('#about').showModal();$('#close-about').onclick=()=>$('#about').close();$('#about').addEventListener('click',e=>{if(e.target===$('#about')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
function quiet(){const q=document.body.classList.toggle('quiet');$('#show').hidden=!q;if(q){$('#light-panel').hidden=true;$('#light-toggle').setAttribute('aria-expanded','false');}}$('#hide').onclick=quiet;$('#show').onclick=quiet;
function makeCloud(){finish();const s=newStroke();s.radius=.072;history.push(strokes.slice());strokes.push(s);future=[];for(let i=0;i<15;i++){const t=i/14;addPoint({x:.5+(t-.5)*Math.min(.30,.45/aspect),y:.52+Math.sin(t*Math.PI)*.045,p:.9+Math.sin(t*Math.PI)*.3},s);}updateUI();persist();}
$('#first-cloud').onclick=makeCloud;$('#make-cloud').onclick=()=>{$('#about').close();makeCloud();};
document.addEventListener('keydown',e=>{if(exporting){if(e.key==='Escape')exportCancelled=true;return;}if($('#about').open||e.target.matches('input,select,textarea'))return;if(e.code==='Space'&&e.target.closest('button'))return;const mod=e.metaKey||e.ctrlKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}else if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}else if(e.code==='Space'){e.preventDefault();toggleDrift();}else if(e.key.toLowerCase()==='h'){quiet();}else if(e.key.toLowerCase()==='r'){toggleRain();}else if(e.key==='['||e.key===']'){brush=Math.max(20,Math.min(100,brush+(e.key===']'?5:-5)));cursorSize();persist();}else if(e.key==='Escape'){$('#light-panel').hidden=true;$('#light-toggle').setAttribute('aria-expanded','false');}});
try{const saved=JSON.parse(localStorage.getItem('cloudroom-v1'));if(saved&&Array.isArray(saved.strokes)&&saved.strokes.length<500){strokes=saved.strokes.filter(s=>Number.isFinite(s.seed)&&s.radius>0&&s.radius<.5&&Array.isArray(s.points)&&s.points.length<6000&&s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));preset=[0,1,2].includes(saved.preset)?saved.preset:0;fullness=Math.max(.6,Math.min(1.5,+saved.fullness||1));sunAngle=Number.isFinite(saved.sunAngle)?Math.max(-1,Math.min(1,saved.sunAngle)):-.65;sunDepth=Number.isFinite(saved.sunDepth)?Math.max(-1,Math.min(1,saved.sunDepth)):-.62;quality=[64,256,1024].includes(saved.quality)?saved.quality:256;drift=(saved.lifeVersion===2?saved.living!==false:true)&&!reducedMotion;lifeSpeed=Number.isFinite(saved.lifeSpeed)?Math.max(.25,Math.min(2,saved.lifeSpeed)):1;driftTime=Number.isFinite(saved.lifeTime)?Math.max(0,saved.lifeTime):0;rainEnabled=saved.rainEnabled===true;rainAmount=Number.isFinite(saved.rainAmount)?Math.max(.1,Math.min(1,saved.rainAmount)):.6;rainWind=Number.isFinite(saved.rainWind)?Math.max(-1,Math.min(1,saved.rainWind)):.15;rainPaused=saved.rainPaused===true||reducedMotion;brush=Math.max(20,Math.min(100,+saved.brush||53));}}catch{}
history=strokes.map((_,i)=>strokes.slice(0,i));
setLight(preset);$('#softness').value=fullness;$('#sun-angle').value=sunAngle;$('#sun-depth').value=sunDepth;$('#render-quality').value=quality;if(reducedMotion)drift=false;syncLightLabels();syncLife();syncRain();cursorSize();resize();window.addEventListener('resize',()=>{resize();cursorSize();});requestAnimationFrame(frame);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);toast('The sky is taking a breath. Reload to restore your drawing.');});
// Read-only diagnostics for visual QA and performance measurement.
window.cloudroom={get state(){return{strokes:strokes.length,points:strokes.reduce((n,s)=>n+s.points.length,0),preset,drift,rainEnabled,rainPaused,rainAmount,rainTime,frames:tracer.frames,quality,renderer:'stable-volume',resolution:[canvas.width,canvas.height],webglError:gl.getError()};}};
}
