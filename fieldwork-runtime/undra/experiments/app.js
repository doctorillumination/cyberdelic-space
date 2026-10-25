import * as THREE from '../vendor/three.module.js';
import { vertex,tracer,shaderMode,display } from '../shaders.js?v=2.24.2';
import { GPUFluid } from '../gpu-fluid.js?v=2.24.2';
import { SurfaceCache,LightingCache } from '../surface-cache.js?v=2.24.2';
import { cameraFrame,cameraRay,pointOnPlane,CAMERA_DISTANCE } from '../camera.js';
import { palettes } from '../palette.js';
import { FramePacer,FrameFence,compileGraphics } from '../performance.js?v=2.24.2';
import { AudioInput } from './audio.js?v=2.22.0';
import { GPUWaves,coupleDroplets,WAVE_DT } from './waves.js?v=2.22.0';
import { surfactant } from './education-physics.js?v=2.22.0';
import { SpectralWater } from './spectral-water.js?v=2.22.0';
import { poolShader,causticShader } from './pool-shader.js?v=2.22.0';
const $=id=>document.getElementById(id),canvas=$('art'),params=new URLSearchParams(location.search);
let study=params.get('study')==='droplets'?'droplets':'pool',running=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let strength=.6,speed=2.8,linger=.55,visible=true,view=7.1,last=performance.now(),debt=0,ambientClock=0,steadyClock=0,waterDepth=.025,detergent=Math.max(0,Math.min(20,Number(params.get('detergent')) || 0)),lightingAt=-1,disposed=false;
const audio=new AudioInput($('player'),message=>{$('audio-status').textContent=message;canvas.dataset.audioSource=audio.kind;});
const frame=cameraFrame(18),pointer={active:false,hover:false,selected:-1,object:-1,x:0,y:0,vx:0,vy:0,targetX:0,targetY:0,gather:false};
let pointerId=null,pointerTime=0,lastTouch=-1;
let renderer,waves,poolWaves,dropletWaves,fluid,cache,lighting,renderTarget,caustics,causticMaterial,poolMaterial,dropMaterial,displayMaterial;
const pacer=new FramePacer(60);let fence;
const scene=new THREE.Scene(),camera=new THREE.Camera(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));quad.frustumCulled=false;scene.add(quad);
const uniform={uWaves:{value:null},uSpan:{value:32},uTexel:{value:1/512},uDepth:{value:.25},uCaustics:{value:null},uTime:{value:0},uView:{value:view},uResolution:{value:new THREE.Vector2()},uFloor:{value:new THREE.Vector3()},uTint:{value:new THREE.Vector3()},uAbsorption:{value:new THREE.Vector3()},uCameraOrigin:{value:new THREE.Vector3(...frame.origin)},uCameraForward:{value:new THREE.Vector3(...frame.forward)},uCameraRight:{value:new THREE.Vector3(...frame.right)},uCameraUp:{value:new THREE.Vector3(...frame.up)}};
const displayUniform={uImage:{value:null},uClean:{value:null},uBeautyMix:{value:0},uResolution:{value:new THREE.Vector2()},uSmoothEdges:{value:true}};
let dropUniform=null,forceDraw=true,audioPulses=0;
let graphicsFailed=false;
addEventListener('error',event=>fail(new Error(event.message || 'Graphics could not start.')));
function fail(error){
  graphicsFailed=true;
  $('loading').hidden=false;$('loading').textContent=error.message || 'The artwork could not start.';canvas.dataset.error=error.message;
  const link=document.createElement('a');link.href='../diagnostics/';link.textContent=' Open graphics diagnostics';$('loading').append(link);
  try{localStorage.setItem('glop-last-graphics-error',JSON.stringify({time:new Date().toISOString(),route:location.pathname+location.search,...canvas.dataset}));}catch{}
}
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.autoClear=false;renderer.setPixelRatio(1);
  renderer.debug.onShaderError=(gl,program,vertexShader,fragmentShader)=>{throw new Error('Graphics shader failed: '+gl.getShaderInfoLog(fragmentShader));};
  if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('This study needs WebGL 2 floating-point graphics.');
  fence=new FrameFence(renderer.getContext());poolWaves=new SpectralWater(renderer);waves=poolWaves;uniform.uWaves.value=waves.texture;
  caustics=new THREE.WebGLRenderTarget(512,512,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
  causticMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:causticShader,uniforms:uniform});uniform.uCaustics.value=caustics.texture;
  poolMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:poolShader,uniforms:uniform});
  displayMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:display,uniforms:displayUniform});
}catch(error){fail(error);throw error;}
function makeDroplets(){
  if(fluid)return;
  fluid=new GPUFluid(renderer,7351,126,null,{objectMode:'none'});coupleDroplets(fluid,waves);
  dropUniform={...fluid.uniforms,uParticles:{value:fluid.texture},uGrid:{value:fluid.grid.texture},uBounds:{value:fluid.bounds.texture},uSurface:{value:null},uIndirect:{value:null},uPrevious:{value:null},uResolution:uniform.uResolution,uView:uniform.uView,uFrame:{value:1},uBlend:{value:0},uLive:{value:true},uExactOptics:{value:false},uFilm:{value:false},uRayEpsilon:{value:.0012},uIor:{value:1.33},uTension:{value:.58},uScattering:{value:1},uFloor:uniform.uFloor,uAbsorption:uniform.uAbsorption,uLiquidTint:uniform.uTint,uPaletteMix:{value:0},uBlendDirection:{value:new THREE.Vector2(1,0)},uBlendSharpness:{value:3},uFloorLabA:{value:new THREE.Vector3()},uFloorLabB:{value:new THREE.Vector3()},uFloorLabC:{value:new THREE.Vector3()},uAbsorptionB:{value:new THREE.Vector3()},uAbsorptionC:{value:new THREE.Vector3()},uTintB:{value:new THREE.Vector3()},uTintC:{value:new THREE.Vector3()},uBounces:{value:6},uAASamples:{value:1},uTotalSamples:{value:0},uSampleOffset:{value:0},uShadowSamples:{value:4},uTextureStrength:{value:.06},uIndirectSamples:{value:3},uLightingSpan:{value:20},uCameraOrigin:uniform.uCameraOrigin,uCameraForward:uniform.uCameraForward,uCameraRight:uniform.uCameraRight,uCameraUp:uniform.uCameraUp,uCameraDistance:{value:CAMERA_DISTANCE},uFocusDistance:{value:CAMERA_DISTANCE},uLensRadius:{value:0}};
  cache=new SurfaceCache(renderer,dropUniform,640,undefined,'none');dropUniform.uSurface.value=cache.texture;
  lighting=new LightingCache(renderer,dropUniform,'none');lighting.resize(192);dropUniform.uIndirect.value=lighting.texture;
  dropMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:shaderMode(tracer,{samples:1,objects:'none'}),uniforms:dropUniform});
  cache.rebuild();lighting.rebuild();
}
function setStudy(next){
  study=next==='droplets'?'droplets':'pool';
  waves=study==='pool'?poolWaves:(dropletWaves ??=new GPUWaves(renderer));if(study==='droplets')makeDroplets();
  uniform.uSpan.value=waves.span;uniform.uTexel.value=1/waves.size;uniform.uWaves.value=waves.texture;
  pointer.active=false;pointerId=null;canvas.dataset.study=study;$('depth-control').hidden=study!=='pool';$('pool-detergent-control').hidden=study!=='pool';forceDraw=true;lightingAt=-1;
  $('study-title').textContent=study==='pool'?'Ripple pool.':'Singing droplets.';
  $('study-intro').textContent=study==='pool'?'A shallow sheet of water. Music makes waves; your touch leaves a ripple.':'Little beads catching a passing wave. Music nudges and stretches the water.';
  document.querySelectorAll('[data-study]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.study===study)));
  const url=new URL(location.href);url.searchParams.set('study',study);history.replaceState(null,'',url);
}
function setColour(key){const palette=palettes[key] || palettes.green;uniform.uFloor.value.fromArray(palette.floor);uniform.uTint.value.fromArray(palette.tint);uniform.uAbsorption.value.fromArray(palette.absorption);forceDraw=true;lightingAt=-1;}
for(const [key,palette] of Object.entries(palettes)){const option=document.createElement('option');option.value=key;option.textContent=palette.name;$('colour').append(option);}
$('colour').value='green';setColour('green');
function resize(){
  const width=innerWidth,height=innerHeight,scale=Math.min(devicePixelRatio || 1,1.5,Math.sqrt(1800000/(width*height)));
  renderer.setSize(Math.max(2,Math.round(width*scale)),Math.max(2,Math.round(height*scale)),false);
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());uniform.uResolution.value.copy(size);displayUniform.uResolution.value.copy(size);
  view=Math.min(7.1,22/(width/height));uniform.uView.value=view;
  renderTarget?.dispose();renderTarget=new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
  displayUniform.uImage.value=displayUniform.uClean.value=renderTarget.texture;
  fence.clear();pacer.reset();forceDraw=true;canvas.dataset.resolution=`${size.x} x ${size.y}`;
}
function setControls(show){visible=show;$('panel').hidden=!show;$('controls').textContent=show?'Hide controls':'Controls';$('controls').setAttribute('aria-expanded',String(show));}
function setRunning(value){running=value;last=performance.now();debt=0;$('pause').textContent=running?'Pause':'Resume';canvas.dataset.running=String(running);forceDraw=true;}
$('controls').onclick=()=>setControls(!visible);
$('pause').onclick=()=>setRunning(!running);
$('reset').onclick=()=>{waves.reset();fluid?.reset();lastTouch=-1;lightingAt=-1;forceDraw=true;};
$('colour').onchange=event=>setColour(event.target.value);
$('strength').oninput=event=>{strength=Number(event.target.value);$('strength-out').value=Math.round(strength*100)+'%';forceDraw=true;};
$('pool-detergent').value=String(detergent);
function reflectDetergent(){const state=surfactant(detergent);$('pool-detergent-out').value=detergent.toFixed(1)+' mM';$('pool-gamma').textContent=(state.gamma*1000).toFixed(1)+' mN/m';}
reflectDetergent();$('pool-detergent').oninput=event=>{detergent=Number(event.target.value);reflectDetergent();};
$('depth').oninput=event=>{waterDepth=Number(event.target.value)/1000;poolWaves.depth=waterDepth;uniform.uDepth.value=waterDepth/.1;$('depth-out').value=(waterDepth*100).toFixed(1)+' cm';forceDraw=true;};
$('speed').oninput=event=>{speed=Number(event.target.value);$('speed-out').value=speed<2.4?'Slow':speed>3.5?'Lively':'Gentle';};
$('linger').oninput=event=>{linger=Number(event.target.value);$('linger-out').value=Math.round(linger*100)+'%';};
document.querySelectorAll('[data-study]').forEach(button=>button.onclick=()=>{try{setStudy(button.dataset.study);}catch(error){fail(error);}});
$('ambient').onclick=()=>{audio.ambient();$('player').hidden=true;ambientClock=0;};
$('stop').onclick=()=>{audio.stop();$('player').hidden=true;};
function audioFailure(error){audio.stop();$('audio-status').textContent=error.name==='NotAllowedError'?'No audio connected. Choose a file or try sharing a playing tab.':error.message;}
async function busyAudio(action){
  if(audio.busy)return;audio.busy=true;$('music').disabled=$('share').disabled=true;
  try{await action();}catch(error){audioFailure(error);}
  finally{audio.busy=false;$('music').disabled=false;$('share').disabled=!navigator.mediaDevices?.getDisplayMedia;}
}
$('music').onchange=event=>{const file=event.target.files[0];if(!file)return;void busyAudio(async()=>{await audio.file(file);$('player').hidden=false;});event.target.value='';};
$('player').onerror=()=>{if(audio.kind==='file' || audio.url)audioFailure(new Error('This music file could not play. Try MP3, M4A, or WAV.'));};
$('share').onclick=()=>void busyAudio(async()=>{await audio.tab();$('player').hidden=true;});
if(!navigator.mediaDevices?.getDisplayMedia){$('share').disabled=true;$('share-help').textContent='Choose a music file on this device. Sharing audio from another tab is unavailable in this browser.';}
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('audio-status').textContent='Full screen is unavailable here. Hide Controls for an open view.';}};
function touch(event){
  const rect=canvas.getBoundingClientRect(),point=pointOnPlane(cameraRay(frame,(event.clientX-rect.left)/rect.width,1-(event.clientY-rect.top)/rect.height,view,rect.width/rect.height),study==='pool'?waterDepth/.1:.28);
  const now=performance.now(),dt=Math.max(.008,(now-pointerTime)/1000);pointer.vx=Math.max(-4,Math.min(4,(point[0]-pointer.x)/dt));pointer.vy=Math.max(-4,Math.min(4,(point[1]-pointer.y)/dt));
  pointer.x=pointer.targetX=point[0];pointer.y=pointer.targetY=point[1];pointerTime=now;
  if(running && waves.time-lastTouch>.06){waves.impulse(point[0],point[1],.65+strength*.8);lastTouch=waves.time;}
  $('hint').hidden=true;
}
canvas.onpointerdown=event=>{if(pointerId!==null)return;pointerId=event.pointerId;canvas.setPointerCapture(pointerId);pointer.active=pointer.hover=true;pointerTime=performance.now();touch(event);};
canvas.onpointermove=event=>{if(event.pointerId!==pointerId)return;touch(event);};
function release(){pointer.active=pointer.hover=false;pointerId=null;pointer.vx=pointer.vy=0;}
canvas.onpointerup=release;canvas.onpointercancel=release;canvas.onlostpointercapture=release;
window.addEventListener('blur',release);
window.addEventListener('resize',()=>{release();resize();});
document.addEventListener('visibilitychange',()=>{last=performance.now();debt=0;release();pacer.reset();});
window.addEventListener('keydown',event=>{
  if(event.target.closest('input,select,audio,button,a'))return;
  if(event.key.toLowerCase()==='h'){event.preventDefault();setControls(!visible);}
  if(event.code==='Space'){event.preventDefault();setRunning(!running);}
  if(event.key==='Escape')setControls(false);
});
function render(now){
  if(disposed || graphicsFailed)return;requestAnimationFrame(render);
  if(renderer.getContext().isContextLost())return;
  if(document.hidden || (!running && !forceDraw)){last=now;return;}
  if(!pacer.ready(now) || !fence.ready())return;
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
  const energy=audio.sample(dt);$('level').style.width=Math.round(energy.level*100)+'%';
  if(running){
    debt+=dt;ambientClock+=dt;
    if(audio.kind==='ambient' && ambientClock>1.15){waves.impulse(0,0,1.1+strength*1.4,.38);if(study==='pool')waves.impulse(0,0,.38+strength*.4,.18);ambientClock%=1.15;}
    steadyClock+=dt;
    if(energy.pulse>0){waves.impulse(0,0,energy.pulse*(1.2+strength*2.0),.42);audioPulses++;steadyClock=0;}
    if(study==='pool' && energy.midPulse>.05)waves.impulse(0,0,energy.midPulse*(.55+strength*1.3),.23);
    if(study==='pool' && energy.highPulse>.08)waves.impulse(0,0,energy.highPulse*(.18+strength*.5),.13);
    if(audio.kind!=='ambient' && energy.level>.08 && steadyClock>.65){waves.impulse(0,0,energy.level*(.5+strength),.34);steadyClock=0;}
    canvas.dataset.audioPulses=String(audioPulses);
    if(study==='pool'){waves.step({dt,speed,damping:1.2-linger*1.02,depth:waterDepth,surfaceTension:surfactant(detergent).gamma});waves.rebuild();debt=0;}
    else{

    let steps=0;
    while(debt>=WAVE_DT && steps<6){
      waves.step({speed,damping:1.6-linger*1.42});
      if(study==='droplets'){
        fluid.uniforms.uRipple.value=waves.texture;fluid.uniforms.uRippleGain.value=.35+strength*1.4;
        fluid.step(WAVE_DT,{flow:.04,viscosity:.65,tension:.58,dance:0},pointer);
      }
      debt-=WAVE_DT;steps++;
    }
    if(steps){
      fluid.rebuildGrid();dropUniform.uParticles.value=fluid.texture;cache.rebuild();
      if(waves.time-lightingAt>.20){lighting.rebuild();lightingAt=waves.time;}
    }
    }
  }
  uniform.uWaves.value=waves.texture;uniform.uDepth.value=waterDepth/.1;uniform.uTime.value=waves.time;
  if(study==='pool'){quad.material=causticMaterial;renderer.setRenderTarget(caustics);renderer.render(scene,camera);quad.material=poolMaterial;renderer.setRenderTarget(null);renderer.render(scene,camera);}
  else{
    if(lightingAt<0){cache.rebuild();lighting.rebuild();lightingAt=waves.time;}
    dropUniform.uFrame.value++;quad.material=dropMaterial;renderer.setRenderTarget(renderTarget);renderer.render(scene,camera);
    quad.material=displayMaterial;renderer.setRenderTarget(null);renderer.render(scene,camera);
  }
  fence.submit();forceDraw=false;$('loading').hidden=true;
  canvas.dataset.audioSource=audio.kind;canvas.dataset.audioLevel=energy.level.toFixed(3);canvas.dataset.waveTime=waves.time.toFixed(2);canvas.dataset.waveGrid=String(waves.size);canvas.dataset.waveModel=study==='pool'?'gravity-capillary-spectrum':'surface-parcels';canvas.dataset.waterDepth=String(waterDepth);
}
function dispose(){
  if(disposed)return;disposed=true;audio.dispose();fence.clear();poolWaves.dispose();dropletWaves?.dispose();fluid?.dispose();
  for(const item of [cache,lighting]){item?.target.dispose();item?.material.dispose();item?.quad.geometry.dispose();}
  lighting?.fastExportMaterial.dispose();lighting?.exportMaterial.dispose();dropMaterial?.dispose();poolMaterial.dispose();causticMaterial.dispose();caustics.dispose();displayMaterial.dispose();renderTarget?.dispose();quad.geometry.dispose();renderer.dispose();
}
window.addEventListener('pagehide',dispose,{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted && disposed)location.reload();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();setRunning(false);audio.stop();fail(new Error('Graphics paused. Reload to return to the study.'));});
async function startStudy(){
  resize();setStudy(study);setRunning(running);canvas.dataset.audioSource='ambient';
  for(const [label,material] of study==='pool'?[['Gathering light',causticMaterial],['Bending light',poolMaterial]]:[['Bending light',dropMaterial]]){
    canvas.dataset.startupStage=label;$('loading').textContent=label+'…';quad.material=material;
    await compileGraphics(renderer,scene,camera);
  }
  canvas.dataset.startupStage='ready';requestAnimationFrame(render);setTimeout(()=>$('hint').hidden=true,9000);
}
void startStudy().catch(fail);
