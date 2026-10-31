import {vertex,crystalVertex,crystalFragment,display} from './crystal-shaders.js';
import {SHAPES,shapeById,createShape} from './models.js';
import * as oil from './oil-shaders.js';
import * as julia from './julia-shaders.js';
import * as bulb from './bulb-shaders.js';
import {HandLens} from './hand-lens.js';
import {applyHandLens,readHandLens} from './hand-pose.js';
import {keepHandFocus,fieldFocusSamples,fieldDepthFragment} from './hand-focus.js';
import {fieldCameraPose} from './field-camera.js';
import {lensPose,stepLens} from './lens.js';
import {stepCamera} from './cinematographer.js';
import {stepGrowth} from './living-growth.js';
import {createFocusCloud,trackFocus,FOCUS_BAND} from './autofocus.js';
const $=id=>document.getElementById(id);
const canvas=$('art');
const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const params=new URLSearchParams(location.search);
const requestedSeed=Number.parseInt(params.get('seed')||'1',10);
const state={angle:.12,tilt:-.1,phase:0,focus:11.1,aperture:.64,transmission:.72,distanceToEye:11.5,seed:Number.isFinite(requestedSeed)?Math.max(0,Math.min(999,requestedSeed-1)):0,speed:.15,compression:.5,lensDrift:false,drift:.28,cinema:params.get('cinema')!=='0'&&!reduced,growth:params.get('growth')!=='0',quality:1,playing:!reduced&&params.get('paused')!=='1',frame:0,samples:0,dirty:true};
let handLens,handMix=0,lastPose=null,handOwnership=false;
let rig={time:0,blend:state.cinema?1:0};
let lensRig={time:0,blend:0};
let growthClock={time:0,blend:state.growth?1:0};
let focusCloud=[],focusTracker={index:-1},previousFieldPose=null;
let fieldFocusCloud=[],fieldProbe=null,lastFieldProbe=-Infinity;
let selected=shapeById(params.get('shape')),pending=true,request=0,worker,front=0;
const fields={oil,julia,bulb},fieldPrograms=new Map();
let programs,geometry,targets,dragging=false,lastX=0,lastY=0,lastTime=0,toastTimer,renderHandle,geometryTimer;
function fail(message){$('loading').hidden=true;$('error').textContent=message;$('error').hidden=false;document.body.dataset.renderer='failed';}
function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log);}return s;}
function program(source,vertexSource=vertex){const p=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertexSource),fs=compile(gl.FRAGMENT_SHADER,source);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return {p,uniforms:new Map()};}
function uniform(prog,name,value){if(!prog.uniforms.has(name))prog.uniforms.set(name,gl.getUniformLocation(prog.p,name));const loc=prog.uniforms.get(name);if(Array.isArray(value))gl.uniform2fv(loc,value);else gl.uniform1f(loc,value);}
function sampler(prog,name,unit){gl.uniform1i(gl.getUniformLocation(prog.p,name),unit);}
function reset(){state.samples=0;state.dirty=true;}
function resize(){if(!gl||!programs)return;const field=selected.engine==='field';const precision=(handLens?.active||handMix>0)&&!field?gl.RGBA32F:gl.RGBA16F;const cap=field?(state.quality===1.5?1600:state.quality===1?1200:900):(state.quality===1.5?2000:state.quality===1?1450:900);const scale=Math.min(devicePixelRatio*state.quality,cap/Math.max(innerWidth,innerHeight));const w=Math.max(1,Math.round(innerWidth*scale)),h=Math.max(1,Math.round(innerHeight*scale));if(canvas.width===w&&canvas.height===h&&targets&&targets.length===2&&targets[0].precision===precision)return;canvas.width=w;canvas.height=h;if(targets)for(const t of targets){gl.deleteFramebuffer(t.fbo);gl.deleteTexture(t.texture);}targets=Array.from({length:2},()=>{const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,field?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,field?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,precision,w,h,0,gl.RGBA,precision===gl.RGBA32F?gl.FLOAT:gl.HALF_FLOAT,null);const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('The graphics device cannot create the light buffer.');gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);return {texture,fbo,precision};});gl.bindFramebuffer(gl.FRAMEBUFFER,null);reset();}
function releaseGeometry(){if(geometry){for(const buffer of geometry.buffers)gl.deleteBuffer(buffer);gl.deleteVertexArray(geometry.vao);geometry=null;}}
function installGeometry(model){
 clearTimeout(geometryTimer);
 focusCloud=createFocusCloud(model);focusTracker={index:-1};releaseGeometry();
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);
 const buffers=[model.positions,model.radii,model.facets,model.normals,model.development].map((data,i)=>{const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,i===4?4:i===0||i===3?3:1,gl.FLOAT,false,0,0);return buffer;});
 gl.bindVertexArray(null);geometry={vao,buffers,count:model.count};canvas.dataset.grains=model.count;pending=false;reset();
}
function updateURL(push=false){const url=new URL(location.href);url.searchParams.set('shape',selected.id);url.searchParams.set('seed',state.seed+1);history[push?'pushState':'replaceState'](null,'',url);}
function selectShape(id,push=true){
 clearTimeout(geometryTimer);
 selected=shapeById(id);lastPose=null;const token=++request;pending=true;document.body.dataset.renderer='loading';
 $('loading').hidden=false;$('loading').style.opacity='1';$('error').hidden=true;
 $('shape').value=selected.id;$('form-name').textContent=selected.name;$('form-description').textContent=selected.description;
 $('form-number').textContent=String(SHAPES.indexOf(selected)+1).padStart(2,'0')+' / '+SHAPES.length;
 document.title='Lumen / '+selected.name;canvas.dataset.shape=selected.id;delete canvas.dataset.sharpSamples;
 previousFieldPose=null;fieldFocusCloud=[];lastFieldProbe=-Infinity;state.angle=selected.angle??.12;state.tilt=selected.tilt??-.1;state.distanceToEye=11.5;state.focus=11.1;$('focus').value=state.focus;$('focus-value').value='Centre';
 syncGrowth();syncCinema();resize();reset();if(push)updateURL(true);
 try{
  if(selected.engine==='field'){
   if(!fieldPrograms.has(selected.id))fieldPrograms.set(selected.id,program(fields[selected.id].specimen,fields[selected.id].vertex));
   releaseGeometry();focusCloud=[];canvas.dataset.grains='0';pending=false;
  }else if(worker){
   document.body.dataset.bootStage='geometry';
   worker.postMessage({id:selected.id,seed:state.seed+1,request:token});
   geometryTimer=setTimeout(()=>{
    if(token!==request||!pending)return;
    worker.terminate();worker=null;document.body.dataset.geometryRecovery='main-thread';selectShape(selected.id,false);
   },6000);
  }
  else setTimeout(()=>{if(token!==request)return;try{installGeometry(createShape(selected.id,state.seed+1));}catch(error){fail(error.message);}},20);
 }catch(error){fail(error.message);}
}
function cycle(direction){selectShape(SHAPES[(SHAPES.indexOf(selected)+direction+SHAPES.length)%SHAPES.length].id);}
function sampleFieldFocus(now){
 if(!previousFieldPose||now-lastFieldProbe<220)return;
 if(!fieldProbe){
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,32,32,0,gl.RGBA,gl.FLOAT,null);
  const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('The graphics device cannot sample surface depth.');
  fieldProbe={texture,fbo,pixels:new Float32Array(32*32*4),program:program(fieldDepthFragment)};
 }
 const probe=fieldProbe;gl.bindVertexArray(null);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,probe.fbo);gl.viewport(0,0,32,32);gl.useProgram(probe.program.p);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[1-front].texture);sampler(probe.program,'image',0);gl.drawArrays(gl.TRIANGLES,0,3);
 gl.readPixels(0,0,32,32,gl.RGBA,gl.FLOAT,probe.pixels);
 fieldFocusCloud=fieldFocusSamples(probe.pixels,32,previousFieldPose,{width:canvas.width,height:canvas.height});lastFieldProbe=now;
}
function drawField(pose,moving){
 if(moving)state.samples=Math.min(state.samples,32);
 const prog=fieldPrograms.get(selected.id);gl.bindVertexArray(null);gl.disable(gl.BLEND);gl.useProgram(prog.p);
 gl.bindFramebuffer(gl.FRAMEBUFFER,targets[front].fbo);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[1-front].texture);sampler(prog,'previous',0);
 const mapped={...pose,seed:state.seed%12,frame:state.frame};
 for(const key of ['angle','tilt','phase','focus','aperture','transmission','distanceToEye','seed','frame','lens'])uniform(prog,key,mapped[key]);
 const prior=previousFieldPose??pose;
 for(const key of ['angle','tilt','distanceToEye','lens','focus','aperture'])uniform(prog,'previous'+key[0].toUpperCase()+key.slice(1),prior[key]);
 uniform(prog,'rayCount',state.quality===1.5?4:state.quality===1?2:1);
 uniform(prog,'resolution',[canvas.width,canvas.height]);uniform(prog,'blend',state.samples/(state.samples+1));gl.drawArrays(gl.TRIANGLES,0,3);
 const output=programs.oilDisplay;gl.useProgram(output.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[front].texture);sampler(output,'image',0);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawArrays(gl.TRIANGLES,0,3);front=1-front;previousFieldPose={...pose};
}
function render(now){
 renderHandle=requestAnimationFrame(render);
 if(document.hidden||pending){lastTime=now;return;}
 const dt=Math.min((now-(lastTime||now))/1000,.1);lastTime=now;
 const moving=state.playing&&!dragging&&(state.cinema||rig.blend>0||selected.growth&&(state.growth||growthClock.blend>0)||state.lensDrift||lensRig.blend>0||state.speed>0||state.drift>0);
 const field=selected.engine==='field';
 const camera=stepCamera(rig,field?{...state,speed:state.speed*.4}:state,dt,moving);
 rig=camera.rig;state.angle=camera.angle;state.phase=camera.phase;
 lensRig=stepLens(lensRig,state.lensDrift,dt,moving&&!handLens?.active);
 const cameraPose=field?fieldCameraPose({...state,angle:camera.angle,phase:camera.phase},rig.time,rig.blend):camera.pose;
 let pose=lensPose(cameraPose,state.compression,lensRig,selected.engine);
 growthClock=stepGrowth(growthClock,!!selected.growth&&state.growth,dt,moving);
 pose.growthTime=growthClock.time;pose.growthBlend=growthClock.blend;
 const handChanged=handLens?.tick(dt);
 const previousHandMix=handMix;const handTarget=handLens?.active?1:0;
 handMix+=(handTarget-handMix)*(1-Math.exp(-dt/.4));if(Math.abs(handMix-handTarget)<.0001)handMix=handTarget;
 if(handChanged||handMix!==previousHandMix)state.dirty=true;
 if(previousHandMix>0&&handMix===0)resize();
 if(!moving&&!state.dirty&&(selected.engine!=='field'||state.samples>=256))return;
 pose.focusBand=0;
 if(rig.blend>0&&selected.engine==='grains'&&handMix<.999){
  const tracked=trackFocus(focusTracker,focusCloud,pose,{width:canvas.width,height:canvas.height},dt,moving);
  pose.focus+=(tracked.focus-pose.focus)*rig.blend;
  pose.focusBand=FOCUS_BAND*rig.blend;
  canvas.dataset.sharpSamples=tracked.sharpSamples;
 }
 if(handMix>0){
  pose=applyHandLens(pose,handLens.controls,handMix,selected.engine);
  if(field)sampleFieldFocus(now);
  const protectedFocus=keepHandFocus(field?fieldFocusCloud:focusCloud,pose,{width:canvas.width,height:canvas.height},selected.engine);
  pose.focus+=(protectedFocus.focus-pose.focus)*handMix;
  pose.focusBand+=protectedFocus.focusBand*handMix;
  canvas.dataset.sharpSamples=protectedFocus.sharpSamples;
  canvas.dataset.focusSurfaces=protectedFocus.visible;
 }
 lastPose={...pose};
 gl.viewport(0,0,canvas.width,canvas.height);
 if(selected.engine==='field')drawField(pose,moving||handChanged||handMix!==previousHandMix);else{
 const prog=programs.specimen;gl.useProgram(prog.p);gl.bindFramebuffer(gl.FRAMEBUFFER,targets[0].fbo);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 uniform(prog,'handSampling',handMix);
 for(const key of ['angle','tilt','phase','focus','aperture','transmission','distanceToEye','roll','lightTurn','focusBand','growthTime','growthBlend','lens','lensScale'])uniform(prog,key,pose[key]);uniform(prog,'resolution',[canvas.width,canvas.height]);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.bindVertexArray(geometry.vao);uniform(prog,'lightPass',0);gl.drawArrays(gl.POINTS,0,geometry.count);gl.bindFramebuffer(gl.FRAMEBUFFER,targets[1].fbo);gl.clear(gl.COLOR_BUFFER_BIT);uniform(prog,'lightPass',1);gl.drawArrays(gl.POINTS,0,geometry.count);gl.bindVertexArray(null);gl.disable(gl.BLEND);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(programs.display.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[0].texture);sampler(programs.display,'image',0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,targets[1].texture);sampler(programs.display,'highlights',1);uniform(programs.display,'frame',state.frame);gl.drawArrays(gl.TRIANGLES,0,3);}
 state.frame++;state.samples++;state.dirty=false;
 if(document.body.dataset.renderer!=='ready'){document.body.dataset.renderer='ready';$('loading').style.opacity='0';const token=request;setTimeout(()=>{if(token===request)$('loading').hidden=true;},600);}
 canvas.dataset.frames=state.frame;canvas.dataset.samples=state.samples;canvas.dataset.focus=pose.focus.toFixed(4);canvas.dataset.aperture=pose.aperture.toFixed(4);canvas.dataset.lensScale=pose.lensScale.toFixed(3);canvas.dataset.lens=pose.lens.toFixed(4);canvas.dataset.eye=pose.distanceToEye.toFixed(3);
 if(state.frame%15===1){canvas.dataset.cameraTime=rig.time.toFixed(3);canvas.dataset.angle=pose.angle.toFixed(3);canvas.dataset.cinema=String(state.cinema);canvas.dataset.growthTime=growthClock.time.toFixed(3);} canvas.dataset.resolution=`${canvas.width} × ${canvas.height}`;
}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function play(){state.playing=!state.playing;syncPlay();reset();}
function syncPlay(){$('play').setAttribute('aria-label',state.playing?'Pause motion':'Resume motion');$('play').title=state.playing?'Pause motion (Space)':'Resume motion (Space)';$('play').innerHTML=state.playing?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6z"/></svg>';$('state-label').textContent=handLens?.active?'Hand lens · Open, pinch, push and pull':state.playing?(state.cinema?(state.growth&&selected.growth?'Cinematographer · Living growth':'Cinematographer'):(state.growth&&selected.growth?'Living growth':'A living study of light')):'A moment held in light';}
function syncCinema(){
 for(const id of ['cinema','cinema-studio'])$(id).setAttribute('aria-pressed',String(state.cinema));
 $('cinema-status').textContent=state.cinema?'On':'Off';
 $('cinema').title=`Cinematographer ${state.cinema?'on':'off'} (C)`;
 $('cinema-helper').textContent=handLens?.active?'Your hand controls focus and aperture. The orbit and light can continue.':state.cinema?(selected.engine==='field'?'A steady macro focus plane, gentle iris breathing, and a slow orbit.':'Focus, aperture, spectral light, and orbit drift around your settings.'):'Your slider settings hold steady as the specimen turns.';
 syncPlay();
}
function toggleCinema(){
 state.cinema=!state.cinema;
 if(!state.playing)rig.blend=state.cinema?1:0;
 syncCinema();reset();
 const url=new URL(location.href);url.searchParams.set('cinema',state.cinema?'1':'0');history.replaceState(null,'',url);
 toast(state.cinema?'Cinematographer on':'Manual camera');
}
function syncGrowth(){
 $('growth').hidden=!selected.growth;document.querySelector('.growth-card').hidden=!selected.growth;
 for(const id of ['growth','growth-studio'])$(id).setAttribute('aria-pressed',String(state.growth));
 $('growth-status').textContent=state.growth?'On':'Off';
 $('growth').title=`Living growth ${state.growth?'on':'off'} (G)`;
 syncPlay();
}
function toggleGrowth(){
 if(!selected.growth)return;
 state.growth=!state.growth;
 if(!state.playing)growthClock.blend=state.growth?1:0;
 syncGrowth();reset();
 const url=new URL(location.href);url.searchParams.set('growth',state.growth?'1':'0');history.replaceState(null,'',url);
 toast(state.growth?'Living growth on':'Growth resting');
}
function studio(open){if(open)handLens?.panel(false);$('studio').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));}
function immersive(value,giveFocus=true){document.body.classList.toggle('immersive',value);$('restore').hidden=!value;for(const el of document.querySelectorAll('.chrome'))el.inert=value;if(value){studio(false);handLens?.panel(false);}if(giveFocus)canvas.focus({preventScroll:true});}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s fullscreen command.');}}
function capture(){
 const filename=`lumen-${selected.id}-${state.seed+1}-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
 canvas.toBlob(blob=>{if(!blob){toast('The image could not be saved.');return;}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Photograph saved');},'image/png');
}
for(const name of ['focus','aperture','transmission','speed','drift','compression']){$(name).addEventListener('input',e=>{state[name]=Number(e.target.value);const value=$(name+'-value');value.value=name==='compression'?(state.compression<.35?'Wide':state.compression>.65?'Compressed':'Balanced'):name==='focus'?state.focus.toFixed(2):name==='transmission'?`${Math.round(state[name]*100)}%`:name==='aperture'?(state[name]<.07?'Deep':state[name]>.8?'Dreamlike':'Shallow'):(state[name]===0?'Still':state[name]<.4?'Slow':'Flowing');reset();});}
$('lens-drift').onclick=()=>{state.lensDrift=!state.lensDrift;if(!state.playing)lensRig.blend=state.lensDrift?1:0;$('lens-drift').setAttribute('aria-pressed',state.lensDrift);$('lens-status').textContent=state.lensDrift?'On':'Off';reset();};
$('growth').onclick=toggleGrowth;$('growth-studio').onclick=toggleGrowth;
$('cinema').onclick=toggleCinema;$('cinema-studio').onclick=toggleCinema;
$('quality').addEventListener('change',e=>{state.quality=Number(e.target.value);resize();});$('play').onclick=play;$('settings').onclick=()=>studio($('studio').hidden);$('close').onclick=()=>studio(false);$('hide').onclick=()=>immersive(true);$('restore').onclick=()=>immersive(false);$('fullscreen').onclick=fullscreen;$('capture').onclick=capture;
$('new').onclick=()=>{state.seed=(state.seed+1)%1000;selectShape(selected.id,false);updateURL();toast(`Specimen ${String(state.seed+1).padStart(3,'0')}`);};
$('shape').onchange=e=>selectShape(e.target.value);$('previous').onclick=()=>cycle(-1);$('next').onclick=()=>cycle(1);
addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);state.seed=Math.max(0,Math.min(999,(parseInt(q.get('seed'),10)||1)-1));selectShape(q.get('shape'),false);});
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!dragging)return;state.angle+=(e.clientX-lastX)*.006;state.tilt+=(e.clientY-lastY)*.006;lastX=e.clientX;lastY=e.clientY;reset();});function release(){dragging=false;}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
canvas.addEventListener('wheel',e=>{e.preventDefault();const old=state.distanceToEye;state.distanceToEye=Math.max(9.4,Math.min(15.5,old+e.deltaY*.005));state.focus+=state.distanceToEye-old;state.focus=Math.min(16,Math.max(8.5,state.focus));$('focus').value=state.focus;reset();},{passive:false});
addEventListener('keydown',e=>{
 if(e.repeat)return;
 if(e.key==='Escape'){immersive(false);studio(false);handLens?.panel(false);return;}
 if(e.target.matches('input,select,textarea'))return;
 if(e.code==='Space'&&!e.target.closest('button,a')){e.preventDefault();play();}
 if(e.key.toLowerCase()==='h')immersive(!document.body.classList.contains('immersive'));
 if(e.key.toLowerCase()==='f')fullscreen();
 if(e.key.toLowerCase()==='s')capture();
 if(e.key.toLowerCase()==='c')toggleCinema();
 if(e.key.toLowerCase()==='g')toggleGrowth();
 if(e.key==='ArrowRight'||e.key===']'){e.preventDefault();cycle(1);}
 if(e.key==='ArrowLeft'||e.key==='['){e.preventDefault();cycle(-1);}
});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(renderHandle);handLens?.stop();fail('The graphics session was interrupted. Reload this page to gather light again.');});addEventListener('resize',resize);
document.addEventListener('fullscreenchange',()=>{const active=!!document.fullscreenElement;$('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');});
handLens=new HandLens({readLens:()=>readHandLens(lastPose??lensPose(state,state.compression,lensRig,selected.engine),selected.engine),closeStudio:()=>studio(false),onChange:()=>{
 const owned=!!handLens?.active;
 if(owned!==handOwnership){handOwnership=owned;for(const id of ['focus','aperture','lens-drift'])$(id).disabled=owned;resize();reset();syncCinema();}
}});
if(params.get('embed')==='1')immersive(true,false);
try{document.body.dataset.bootStage='graphics';if(!gl)throw Error('This artwork needs a browser with WebGL 2 enabled.');if(!gl.getExtension('EXT_color_buffer_float'))throw Error('This artwork needs floating point graphics buffers. Try a recent desktop browser.');programs={specimen:program(crystalFragment,crystalVertex),display:program(display),oilDisplay:program(oil.display,oil.vertex)};
 for(const group of [...new Set(SHAPES.map(s=>s.group))]){const optgroup=document.createElement('optgroup');optgroup.label=group;for(const shape of SHAPES.filter(s=>s.group===group)){const option=document.createElement('option');option.value=shape.id;option.textContent=shape.name;optgroup.append(option);}$('shape').append(optgroup);}
 try{const workerPath=typeof LUMEN_SHAPE_WORKER==='undefined'?'./shape-worker.js':LUMEN_SHAPE_WORKER;worker=new Worker(new URL(workerPath,import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.request!==request)return;clearTimeout(geometryTimer);if(data.error)fail(data.error);else installGeometry(data.model);};worker.onerror=()=>{clearTimeout(geometryTimer);worker.terminate();worker=null;selectShape(selected.id,false);};}catch{worker=null;}
 selectShape(selected.id,false);requestAnimationFrame(render);}catch(error){console.error(error);fail(error.message);}
