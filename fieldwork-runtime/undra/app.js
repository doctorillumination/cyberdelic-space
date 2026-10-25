import * as THREE from './vendor/three.module.js';
import { FIELD } from './fluid.js?v=2.20.0';
import { GPUFluid } from './gpu-fluid.js?v=2.24.2';
import { SurfaceCache, LightingCache } from './surface-cache.js?v=2.24.2';
import { vertex, tracer, stillTracer, exportTracer, fastExportTracer, shaderMode, display, depthOfField } from './shaders.js?v=2.24.2';
import { CAMERA_DISTANCE, cameraFrame, cameraRay, pointOnPlane, focusDistance, projectPoint } from './camera.js';
import { ArtworkRecorder, renderPlan } from './recorder.js?v=2.12.0';
import { danceDiagnostics } from './dance.js';
import { poolDiagnostics } from './coalescence.js?v=2.20.0';
import { HoldToGrow, BRUSH_RADIUS } from './play.js?v=2.20.0';
import { DoubleTapGesture } from './gesture.js?v=2.10.0';
import { palettes, blends, normalizeColour, materialFromHex, colourTheme } from './palette.js?v=2.12.0';
import { FramePacer, FrameFence, RefinementTiles, renderDimensions, compileGraphics, waitForGpu as awaitGpu } from './performance.js?v=2.24.2';
import { PlayObjects, MAX_OBJECTS, objectShader } from './objects.js?v=2.24.2';
const $ = id => document.getElementById(id);
const canvas = $('art');
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const learningLab = params.get('learn') === '1';
let waterLab = null;
let graphicsFailed=false;
addEventListener('error',()=>{graphicsFailed=true;});
addEventListener('glop-graphics-error',()=>{graphicsFailed=true;});
canvas.dataset.learningLab = String(learningLab);
const shapesLab = params.get('shapes') === '1';
const compatibility = params.get('safe') === '1';
const objectMode = shapesLab ? 'soft' : learningLab ? 'hard' : 'none';
canvas.dataset.objectShader = objectMode;
canvas.dataset.compatibility = String(compatibility);
document.querySelectorAll('[data-shapes-lab]').forEach(element => element.hidden = !shapesLab);
canvas.dataset.shapesLab = String(shapesLab);
if (shapesLab) canvas.setAttribute('aria-label',canvas.getAttribute('aria-label')+' Open Shapes to add experimental hard or soft objects. Hold a soft object to press it. Choose Move to drag it.');
let clean = true, introTimer = null, introFadeTimer = null;
const interfacePanels = [['settings','tune'],['colour-panel','colour'],['shapes-panel','shapes'],['sampling-panel','sampling'],['record-panel','record'],['about-panel','about'],['experiments-panel','experiments']];
const introStorageKey = 'glop-play-intro-v1';
let introSeen = false;
try { introSeen = localStorage.getItem(introStorageKey) === '1'; } catch {}
function dismissIntroHint() {
  clearTimeout(introTimer); clearTimeout(introFadeTimer);
  $('intro-hint').hidden = true;
  $('intro-hint').classList.remove('leaving');
  introSeen = true;
  try { localStorage.setItem(introStorageKey,'1'); } catch {}
}
function showIntroHint() {
  if (learningLab) return;
  if (introSeen || !clean) return;
  $('intro-hint').hidden = false;
  introTimer = setTimeout(() => {
    $('intro-hint').classList.add('leaving');
    introFadeTimer = setTimeout(dismissIntroHint,600);
  },7000);
}
function reflectInterface() {
  document.body.classList.toggle('clean',clean);
  $('interface-toggle').setAttribute('aria-expanded',String(!clean));
  $('interface-toggle').setAttribute('aria-label',clean ? 'Show controls' : 'Hide controls');
  $('interface-toggle').title = clean ? 'Show controls (H)' : 'Hide controls (H)';
  $('interface-label').textContent = clean ? 'Controls' : 'Hide controls';
  canvas.dataset.controlsVisible = String(!clean);
}
function setInterface(visible) {
  if(visible)waterLab?.setVisible(false);
  dismissIntroHint();
  clean = !visible;
  if (clean) {
    for (const [panel] of interfacePanels) setPanel(panel,false);
    if (document.activeElement.closest('header,footer,.panel')) $('interface-toggle').focus({preventScroll:true});
  }
  reflectInterface();
}
$('interface-toggle').onclick = () => setInterface(clean);
canvas.addEventListener('pointerdown',dismissIntroHint,{passive:true});
reflectInterface();
const settings = { flow: .18, viscosity: .65, tension: .58, ior: 1.33, scattering: 1.0 };
const cameraSettings = { tilt: 18, macro: true, softness: .45, focus: .5 };
let textureStrength = .15;
let viewFrame = cameraFrame(cameraSettings.tilt);
let colourState=normalizeColour(null);
try { colourState=normalizeColour(JSON.parse(localStorage.getItem('glop-colour-v1'))); } catch {}
const initialPalette=palettes[colourState.palette];
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
} catch (error) {
  $('loading').textContent = 'This artwork needs a browser with WebGL 2 graphics enabled.';
  throw error;
}
renderer.setPixelRatio(1);
renderer.autoClear = false;
renderer.debug.onShaderError=(gl,program,vertexShader,fragmentShader)=>{
  const detail=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join('\n');
  console.error('Graphics shader failed:',detail);
  throw new Error('A graphics shader could not compile. '+detail.slice(0,1200));
};
if (!renderer.getContext().getExtension('EXT_color_buffer_float')) {
  $('loading').textContent = 'Floating-point graphics are unavailable on this device.';
  throw new Error('Floating-point graphics required');
}
const objects=new PlayObjects();
const maxTargetSize=Math.min(renderer.capabilities.maxTextureSize,renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE),...renderer.getContext().getParameter(renderer.getContext().MAX_VIEWPORT_DIMS));
let fluid = new GPUFluid(renderer, Number(params.get('seed')) || 7351,learningLab?126:undefined,objects.uniforms,{objectMode});
canvas.dataset.count = String(fluid.count);
const scene = new THREE.Scene(), camera = new THREE.Camera();
const uniforms = {
  uParticles: { value: fluid.texture }, uGrid: { value: fluid.grid.texture }, uBounds: { value: fluid.bounds.texture }, uSurface: { value: null }, uIndirect: { value: null },
  uPrevious: { value: null }, uResolution: { value: new THREE.Vector2() },
  uFrame: { value: 1 }, uBlend: { value: 0 }, uView: { value: 7.1 }, uLive: { value: true },
  uIor: { value: settings.ior }, uTension: { value: settings.tension }, uScattering: { value: settings.scattering },
  uFloor: { value: new THREE.Vector3(...initialPalette.floor) },
  uAbsorption: { value: new THREE.Vector3(...initialPalette.absorption) },
  uLiquidTint: { value: new THREE.Vector3(...initialPalette.tint) },
  uPaletteMix:{value:0},uBlendDirection:{value:new THREE.Vector2()},uBlendSharpness:{value:3},
  uFloorLabA:{value:new THREE.Vector3()},uFloorLabB:{value:new THREE.Vector3()},uFloorLabC:{value:new THREE.Vector3()},
  uAbsorptionB:{value:new THREE.Vector3()},uAbsorptionC:{value:new THREE.Vector3()},
  uTintB:{value:new THREE.Vector3()},uTintC:{value:new THREE.Vector3()},
  uBounces: { value: 12 }, uAASamples: { value: 1 }, uShadowSamples: { value: 4 }, uTextureStrength: { value: textureStrength },
  uExactOptics:{value:false},uFilm:{value:false},uRayEpsilon:{value:.0012},uTotalSamples:{value:0},uSampleOffset:{value:0},uIndirectSamples:{value:3},uLightingSpan:{value:FIELD}
};
Object.assign(uniforms,objects.uniforms,{
  uCameraOrigin: { value: new THREE.Vector3() }, uCameraForward: { value: new THREE.Vector3() },
  uCameraRight: { value: new THREE.Vector3(1,0,0) }, uCameraUp: { value: new THREE.Vector3() },
  uCameraDistance: { value: CAMERA_DISTANCE }, uFocusDistance: { value: CAMERA_DISTANCE }, uLensRadius: { value: 0 }
});
const cache = new SurfaceCache(renderer, uniforms,768,undefined,objectMode);
uniforms.uSurface.value = cache.texture;
const lightingCache = new LightingCache(renderer,uniforms,objectMode);
uniforms.uIndirect.value = lightingCache.texture;
const liveMaterials = Object.fromEntries([1,2,4,8].map(samples=>[samples,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:shaderMode(tracer,{samples,objects:objectMode}),uniforms})]));
const traceMaterial = new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:objectShader(stillTracer,objectMode),uniforms});
const exportBatch=4;
const videoMaterials = Object.fromEntries(['fast','precision'].map(style=>[style,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:shaderMode(tracer,{exact:style==='precision',film:true,samples:exportBatch,objects:objectMode}),uniforms})]));
const framePacer=new FramePacer(),frameFence=new FrameFence(renderer.getContext());
const refinementTiles=new RefinementTiles(compatibility?128:256);
if(compatibility)framePacer.setRate(30);
const displayUniforms = { uImage: { value: null }, uClean: { value: null }, uBeautyMix: { value: 0 }, uResolution: { value: new THREE.Vector2() },uSmoothEdges:{value:true} };
const displayMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: display, uniforms: displayUniforms });
const dofUniforms = {
  uSource: { value: null }, uResolution: { value: new THREE.Vector2() }, uFocusDistance: uniforms.uFocusDistance,
  uLensRadius: uniforms.uLensRadius, uCameraDistance: uniforms.uCameraDistance, uView: uniforms.uView
};
const dofMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: depthOfField, uniforms: dofUniforms });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), traceMaterial);
quad.frustumCulled = false;
scene.add(quad);
let running = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let frame = 0, samples = 0, last = performance.now(), simDebt = 0;
let quality = 'balanced', view = 7.1, renderWidth = 0, renderHeight = 0, liveWidth = 0, liveHeight = 0;
let liveBounce = 3, shapeSoft = true, softTouch = 'press', shapeSoftness = .92, jellyFinish = 'opal', jellyClarity = .68;
let liveSamples = 1, refinement = 1024, dancing = true, danceEnergy = .55, danceStrength = 0, resizePending = false;
let targets = [], liveTarget, dofTarget, surfaceDirty = true, cleanDirty = true, lightingDirty=true, lastLighting=-Infinity, lastLightingFrame=-2, lightingRefresh='smooth';
let fps = 0, fpsFrames = 0, fpsTime = performance.now(), started = false;
let stillReady=false,stillPreparing=false;
let baseline = null, lastPicked = -1;
let videoState = null, videoTargets = [];
const pointer = { active: false, hover: false, selected: -1, object: -1, height: 0, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, offsetX: 0, offsetY: 0, timestamp: performance.now(),id:null,type:'mouse',mode:'empty',gather:false,screenX:0,screenY:0,pressStart:0,pressHeight:0 };
const tapGesture = new DoubleTapGesture();
const holdGesture = new HoldToGrow();
const wrap = v => v - FIELD * Math.round(v / FIELD);
const recorder = new ArtworkRecorder(canvas, { onState: reflectRecording, onSave: saveVideo, onError: notify, prepare: prepareVideo, renderFrame: renderVideoFrame, restore: restoreVideo });
function makeTarget(w,h,halfFloat=false) {
  const type = !halfFloat && renderer.getContext().getExtension('OES_texture_float_linear') ? THREE.FloatType : THREE.HalfFloatType;
  return new THREE.WebGLRenderTarget(w,h,{ type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
}
function resetAccumulation(geometryChanged = false) {
  samples = 0;
  refinementTiles.reset();
  cleanDirty = true;
  lightingDirty = true;
  surfaceDirty ||= geometryChanged;
  $('samples').textContent = '';
  if (!running) $('status').textContent = 'REFINING LIGHT';
}
function measurePerformance() {
  fpsFrames = 0;
  fpsTime = performance.now();
  $('performance').textContent = `Measuring ${liveSamples}× live sampling…`;
}
function updateCamera() {
  viewFrame = cameraFrame(cameraSettings.tilt);
  uniforms.uCameraOrigin.value.fromArray(viewFrame.origin);
  uniforms.uCameraForward.value.fromArray(viewFrame.forward);
  uniforms.uCameraRight.value.fromArray(viewFrame.right);
  uniforms.uCameraUp.value.fromArray(viewFrame.up);
  uniforms.uFocusDistance.value = focusDistance(viewFrame,cameraSettings.focus,view,innerWidth/innerHeight);
  uniforms.uLensRadius.value = cameraSettings.macro ? cameraSettings.softness*1.8 : 0;
  canvas.dataset.tilt = String(viewFrame.tilt);
  canvas.dataset.depthOfField = String(cameraSettings.macro);
  canvas.dataset.focusDistance = uniforms.uFocusDistance.value.toFixed(3);
  resetAccumulation();
}
function resize() {
  if (recorder.state !== 'idle') { resizePending = true; return; }
  frameFence.clear();framePacer.reset();
  const w = innerWidth, h = innerHeight;
  view = w / h < .7 ? 8 : 7.1;
  const dimensions=renderDimensions(w,h,{dpr:devicePixelRatio || 1,quality,safe:compatibility,maxSize:maxTargetSize});
  renderer.setSize(...dimensions.display,false);
  [renderWidth,renderHeight]=dimensions.render;
  uniforms.uPrevious.value=null;
  targets.forEach(t => t.dispose());
  liveTarget?.dispose();
  dofTarget?.dispose();
  targets = [];
  liveWidth = renderWidth;
  liveHeight = renderHeight;
  liveTarget = makeTarget(liveWidth,liveHeight,true);
  liveTarget.texture.generateMipmaps = true;
  liveTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
  dofTarget = makeTarget(liveWidth,liveHeight,true);
  dofUniforms.uResolution.value.set(liveWidth,liveHeight);
  cache.resize(compatibility?768:quality === 'ultra' ? 1280 : quality === 'high' ? 1152 : 1024);
  uniforms.uSurface.value = cache.texture;
  uniforms.uResolution.value.set(renderWidth,renderHeight);
  uniforms.uView.value = view;
  uniforms.uAASamples.value = liveSamples;
  uniforms.uTotalSamples.value=0;uniforms.uSampleOffset.value=0;uniforms.uExactOptics.value=false;uniforms.uFilm.value=false;uniforms.uRayEpsilon.value=.0012;uniforms.uIndirectSamples.value=liveBounce;uniforms.uLightingSpan.value=FIELD;
  lightingCache.resize(compatibility?256:quality === 'ultra' ? 768 : quality === 'high' ? 640 : 512);uniforms.uIndirect.value=lightingCache.texture;
  displayUniforms.uSmoothEdges.value=true;
  uniforms.uShadowSamples.value = 4;
  displayUniforms.uResolution.value.set(w,h);
  canvas.dataset.resolution = `${liveWidth} x ${liveHeight}`;
  canvas.dataset.stillResolution = `${renderWidth} x ${renderHeight}`;
  canvas.dataset.temporalWeight = '0';
  canvas.dataset.physics = 'gpu';
  canvas.dataset.quality = quality;
  canvas.dataset.textureStrength = String(textureStrength);
  canvas.dataset.lightingResolution = `${lightingCache.size} x ${lightingCache.size}`;
  canvas.dataset.liveSamples = String(liveSamples);
  canvas.dataset.refinement = String(refinement);
  updateCamera();
  resetAccumulation(true);
  measurePerformance();
}
function reflectState() {
  if(running && targets.length){uniforms.uPrevious.value=null;targets.forEach(target=>target.dispose());targets=[];}
  document.body.classList.toggle('paused',!running);
  $('play-icon').textContent = running ? 'Ⅱ' : '▷';
  $('play-label').textContent = running ? 'Pause' : 'Resume';
  $('play').setAttribute('aria-label',running ? 'Pause motion' : 'Resume motion');
  $('play').title = running ? 'Pause motion (Space)' : 'Resume motion (Space)';
  $('status').textContent = running ? (dancing ? 'DANCING SURFACE' : 'LIVING SURFACE') : 'REFINING LIGHT';
  canvas.dataset.running = String(running);
  canvas.dataset.dance = String(dancing);
  $('dance').setAttribute('aria-pressed',String(dancing));
}
function toggle() {
  finishInteraction();
  running = !running;
  last = performance.now();
  framePacer.reset();
  simDebt = 0;
  resetAccumulation();
  reflectState();
}
function notify(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  setTimeout(() => $('notice').hidden = true, 2400);
}
function renew() {
  finishInteraction();
  objects.clear();reflectObjects();
  waterLab?.ensureBlock();
  fluid.reset(Math.floor(Math.random() * 2147483647));
  reflectAmount();
  danceStrength = 0;
  pointer.selected = -1;
  baseline = null; lastPicked = -1;
  tapGesture.cancel();
  resetAccumulation(true);
  notify('A new field, a new arrangement.');
}
function changeAmount(count) {
  if ((count === fluid.baseCount && fluid.count === fluid.baseCount) || recorder.state !== 'idle') return;
  finishInteraction();
  frameFence.clear();
  const previous = fluid;
  fluid = new GPUFluid(renderer,fluid.seed,count,objects.uniforms,{objectMode});
  waterLab?.attach(fluid);
  waterLab?.readings();
  uniforms.uParticles.value = fluid.texture;
  uniforms.uGrid.value = fluid.grid.texture;
  uniforms.uBounds.value = fluid.bounds.texture;
  previous.dispose();
  pointer.active = pointer.hover = false; pointer.selected = -1; pointer.height = 0; pointer.vx = pointer.vy = 0;
  baseline = null; lastPicked = -1; tapGesture.cancel();
  danceStrength = simDebt = 0;
  last = performance.now();
  reflectAmount();
  canvas.classList.remove('grabbing');
  canvas.dataset.picked = '-1';
  delete canvas.dataset.dragStats; delete canvas.dataset.motion;
  delete canvas.dataset.droplets; delete canvas.dataset.pools; delete canvas.dataset.coalescence;
  resetAccumulation(true);
  notify(`${count} drops. A fresh arrangement.`);
}
function advanceDance(dt) {
  danceStrength += ((dancing ? danceEnergy : 0)-danceStrength)*(1-Math.exp(-dt*(dancing ? 1.8 : 8)));
}
function dance() {
  finishInteraction();
  dancing = !dancing;
  if(dancing){pointer.gather=false;reflectTool();}
  if (dancing && !running) { running = true; last = performance.now(); simDebt = 0; }
  resetAccumulation();
  reflectState();
}
function reflectRecording({ state, done, total, samples:videoSamples, frameSamples=0,progress=done,label='1080p',eta }) {
  const busy = state !== 'idle';
  document.body.classList.toggle('recording',busy);
  document.body.classList.toggle('rendering',busy);
  $('recording-status').hidden = !busy;
  $('recording-time').textContent = state === 'preparing' ? `Preparing ${label} render` : state === 'saving' ? 'Saving MP4' : `${label} · ${done} / ${total} frames`;
  $('render-progress').value = progress || 0;
  $('render-progress').max = total || 1;
  const estimate=eta===null?'Rendering each frame…':`${eta<60?Math.ceil(eta)+' seconds':Math.ceil(eta/60)+' minutes'} remaining`;
  $('render-eta').textContent = !busy ? '' : `${Math.floor(frameSamples || 0)} / ${videoSamples} samples · ${estimate}`;
  $('record-label').textContent = {rendering:'Stop',idle:'Record',saving:'Saving',stopping:'Finishing',preparing:'Preparing'}[state];
  $('record').disabled = ['saving','stopping'].includes(state);
  $('record').setAttribute('aria-label',busy ? 'Stop video render' : 'Video render settings');
  $('record').title = busy ? 'Finish and save the frames rendered so far' : 'Choose resolution, quality, and clip length';
  document.querySelectorAll('#settings input,#settings button,#shapes-panel button,#shapes-panel input,#colour-panel input,#colour-panel button,#colour-panel select,#sampling-panel select,#copy-diagnostics,#record-panel select,#start-render,[data-sampling]').forEach(control => control.disabled = busy);
  for (const id of ['play','dance','gather','renew','capture','fullscreen','experiments']) $(id).disabled = busy;
  waterLab?.setBusy(busy);
  if (learningLab) $('tension').disabled = true;
  canvas.dataset.recording = state;
  canvas.dataset.renderProgress = `${done || 0}/${total || 0}`;
  if (busy) { $('status').textContent = `RENDERING ${label.toUpperCase()}`; $('samples').textContent=''; canvas.dataset.mode = 'offline-render'; }
  if (state === 'idle') { resizePending = false; reflectState();reflectObjects(); }
}
async function prepareVideo(plan) {
  finishInteraction();
  frameFence.clear();
  running = false;
  simDebt = 0;
  pointer.selected = -1; pointer.active = pointer.hover = false; pointer.vx = pointer.vy = 0;
  tapGesture.cancel();
  canvas.classList.remove('grabbing');
  fluid.cancelImpact();
  videoState = { checkpoint:fluid.checkpoint(), objects:objects.checkpoint(), danceStrength, view };
  if(waterLab)waterLab.lastDistribution=-Infinity;
  reflectState();
  $('status').textContent = `RENDERING ${plan.label.toUpperCase()}`;
  targets.forEach(target=>target.dispose());targets=[];liveTarget?.dispose();dofTarget?.dispose();liveTarget=dofTarget=null;
  renderer.setSize(plan.width,plan.height,false);
  videoTargets = [makeTarget(plan.width,plan.height,true),makeTarget(plan.width,plan.height,true)];
  uniforms.uView.value = view;
  uniforms.uAASamples.value = exportBatch;uniforms.uTotalSamples.value=plan.samples;uniforms.uSampleOffset.value=0;
  uniforms.uFilm.value=true;uniforms.uExactOptics.value=plan.style==='precision';uniforms.uRayEpsilon.value=plan.resolution==='4k'?.0004:.0006;
  uniforms.uShadowSamples.value=16;uniforms.uIndirectSamples.value={32:6,64:8,256:12}[plan.samples];
  uniforms.uResolution.value.set(plan.width,plan.height);
  uniforms.uFocusDistance.value = focusDistance(viewFrame,cameraSettings.focus,view,plan.width/plan.height);
  cache.resize(plan.resolution==='4k'?2048:1600); uniforms.uSurface.value = cache.texture;
  uniforms.uLightingSpan.value=20;lightingCache.resize(plan.resolution==='4k'?2048:1280);uniforms.uIndirect.value=lightingCache.texture;
  displayUniforms.uSmoothEdges.value=false;
  canvas.dataset.renderResolution = `${plan.width} x ${plan.height}`;
  canvas.dataset.renderSamples = String(plan.samples);
  canvas.dataset.renderFps = String(plan.fps);
  canvas.dataset.renderOptics=plan.style;canvas.dataset.renderStyle=plan.style;canvas.dataset.renderBitrate=String(plan.bitrate);
  quad.material=videoMaterials[plan.style];renderer.setRenderTarget(videoTargets[0]);
  await compileGraphics(renderer,scene,camera);
}
async function renderVideoFrame(index,plan,{shouldStop,onSample}) {
  if (index) {
    const dt=1/plan.fps;
    advanceDance(dt);
    const physicsSettings = {...settings,dance:danceStrength}, steps=120/plan.fps;
    for (let step=0;step<steps;step++){objects.step(1/120);waterLab?.beforeStep(fluid.time*1000);fluid.step(1/120,physicsSettings,pointer);}
  }
  fluid.rebuildGrid();
  uniforms.uParticles.value = fluid.texture; uniforms.uGrid.value = fluid.grid.texture;
  if(!await cache.rebuildTiled(waitForGpu,shouldStop))return false;
  if(!await lightingCache.rebuildTiled(waitForGpu,shouldStop))return false;
  for(let offset=0;offset<plan.samples;offset+=exportBatch){
    if(shouldStop())return false;
    const batch=offset/exportBatch,output=videoTargets[batch%2],previous=videoTargets[(batch+1)%2];
    uniforms.uLive.value=true;uniforms.uSampleOffset.value=offset;uniforms.uPrevious.value=previous.texture;uniforms.uBlend.value=offset/(offset+exportBatch);
    quad.material=videoMaterials[plan.style];renderer.setRenderTarget(output);renderer.setScissorTest(true);
    const tileSize=192;
    for(let y=0;y<plan.height;y+=tileSize)for(let x=0;x<plan.width;x+=tileSize){
      if(shouldStop()){renderer.setScissorTest(false);return false;}
      renderer.setScissor(x,y,Math.min(tileSize,plan.width-x),Math.min(tileSize,plan.height-y));
      renderer.render(scene,camera);
      await waitForGpu();
      const rows=Math.ceil(plan.height/tileSize),columns=Math.ceil(plan.width/tileSize),tile=Math.floor(y/tileSize)*columns+Math.floor(x/tileSize)+1;
      onSample(offset+exportBatch*tile/(rows*columns));
    }
    renderer.setScissorTest(false);
    displayUniforms.uImage.value=displayUniforms.uClean.value=output.texture;
    displayUniforms.uBeautyMix.value=0;displayUniforms.uResolution.value.set(plan.width,plan.height);
    quad.material=displayMaterial;renderer.setRenderTarget(null);renderer.render(scene,camera);
    onSample(offset+exportBatch);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(debug && index===0){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(blob)try{const response=await fetch(`/api/capture?seed=${fluid.seed}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});if(response.ok)canvas.dataset.renderReference=(await response.json()).filename;}catch{}
  }
  return true;
}
const waitForGpu=()=>awaitGpu(renderer.getContext());
function restoreVideo() {
  renderer.setScissorTest(false);
  if (videoState) { fluid.restore(videoState.checkpoint);objects.restore(videoState.objects);reflectObjects(); danceStrength = videoState.danceStrength; view=videoState.view; }
  if(waterLab){waterLab.body=objects.bodies[0] ?? null;waterLab.lastDistribution=-Infinity;}
  videoTargets.forEach(target => target.dispose()); videoTargets=[]; videoState=null;
  last=performance.now(); simDebt=0;
  // Restore the preview dimensions while leaving live playback paused.
  const previous = recorder.state; recorder.state='idle'; resize(); recorder.state=previous;
  resetAccumulation(true);
}
async function saveVideo(blob,seed) {
  const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
  if (['localhost','127.0.0.1'].includes(location.hostname)) {
    try {
      const response = await fetch(`/api/video?seed=${seed}`,{ method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      if (response.ok) {
        const result = await response.json();
        canvas.dataset.lastVideo = result.filename;
        notify('Video saved in the captures folder.');
        return;
      }
    } catch {}
  }
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `undra-${seed}-${Date.now()}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url),60000);
  notify('Video download started.');
}
function record() {
  if (recorder.state !== 'idle' && recorder.state !== 'saving') { recorder.stop(); return; }
  if (recorder.state !== 'idle') return;
  setPanel('record-panel',$('record-panel').hidden);
}
function videoOptions(){return {duration:Number($('duration').value),fps:Number($('record-fps').value),samples:Number($('render-samples').value),resolution:$('render-resolution').value,style:$('render-style').value,seed:fluid.seed};}
function updateVideoSummary(){const plan=renderPlan(videoOptions());$('render-summary').textContent=`${plan.width.toLocaleString()} × ${plan.height.toLocaleString()} · ${plan.fps} fps · ${plan.samples} samples per pixel`;}
function startVideo(){if(recorder.supported)setPanel('record-panel',false);void recorder.start(videoOptions());}
async function capture() {
  $('capture').disabled = true;
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('Capture failed');
    if (['localhost','127.0.0.1'].includes(location.hostname)) {
      try {
        const response = await fetch(`/api/capture?seed=${fluid.seed}`,{ method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
        if (response.ok) { notify('Image saved in the captures folder.'); return; }
      } catch {}
    }
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `undra-${fluid.seed}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url),10000);
    notify('Image download started.');
  } catch { notify('The image could not be saved. Try again.'); }
  finally { $('capture').disabled = false; }
}
function setPanel(name,show) {
  if (name === 'shapes-panel' && show && !shapesLab) return;
  for (const [panel,button] of interfacePanels) {
    if (panel !== name && !show) continue;
    const open = panel === name && show;
    $(panel).hidden = !open;
    $(button).setAttribute('aria-expanded',String(open));
  }
}
$('play').onclick = toggle;
$('dance').onclick = dance;
$('record').onclick = record;
$('start-render').onclick=startVideo;
$('close-record').onclick=()=>setPanel('record-panel',false);
for(const id of ['duration','record-fps','render-samples','render-resolution','render-style'])$(id).onchange=updateVideoSummary;
updateVideoSummary();
$('renew').onclick = renew;
$('capture').onclick = capture;
$('colour').onclick = () => setPanel('colour-panel',$('colour-panel').hidden);
$('open-colour').onclick = () => {setPanel('colour-panel',true);$('mix-colours').focus({preventScroll:true});};
$('close-colour').onclick = () => {setPanel('colour-panel',false);$('colour').focus({preventScroll:true});};
function reflectObjects(){
  $('shape-count').textContent=`${objects.bodies.length} / ${MAX_OBJECTS} shapes`;
  document.querySelectorAll('[data-shape]').forEach(button=>button.disabled=!shapesLab || objects.bodies.length>=MAX_OBJECTS || recorder.state!=='idle');
  $('clear-shapes').disabled=objects.bodies.length===0 || recorder.state!=='idle';
  canvas.dataset.objectCount=String(objects.bodies.length);
}
$('shapes').onclick=()=>setPanel('shapes-panel',$('shapes-panel').hidden);
$('close-shapes').onclick=()=>setPanel('shapes-panel',false);
document.querySelectorAll('[data-shape]').forEach(button=>button.onclick=()=>{
  if(!shapesLab || recorder.state!=='idle')return;
  finishInteraction();const body=objects.add(button.dataset.shape,{soft:shapeSoft,softness:shapeSoftness,finish:jellyFinish,clarity:jellyClarity});if(!body)return;
  takeOverDance();if(!running){running=true;last=performance.now();simDebt=0;reflectState();}
  reflectObjects();resetAccumulation(true);
});
document.querySelectorAll('[data-body-type]').forEach(button=>button.onclick=()=>{
  shapeSoft=button.dataset.bodyType==='soft';
  document.querySelectorAll('[data-body-type]').forEach(b=>{const selected=(b.dataset.bodyType==='soft')===shapeSoft;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  canvas.dataset.newBodyType=shapeSoft?'soft':'hard';
});
document.querySelectorAll('[data-soft-touch]').forEach(button=>button.onclick=()=>{
  finishInteraction();softTouch=button.dataset.softTouch;
  document.querySelectorAll('[data-soft-touch]').forEach(b=>{const selected=b.dataset.softTouch===softTouch;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
});
$('shape-softness').oninput=event=>{
  shapeSoftness=Number(event.target.value);
  for(const body of objects.bodies)if(body.soft)body.softness=shapeSoftness;
  $('shape-softness-out').value=Math.round(shapeSoftness*100)+'%';
  for(const body of objects.bodies)if(body.soft)body.sleeping=false;
  resetAccumulation();
};
document.querySelectorAll('button[data-jelly-finish]').forEach(button=>button.onclick=()=>{
  jellyFinish=button.dataset.jellyFinish;
  const finish=['opal','sorbet','satin'].indexOf(jellyFinish);
  for(const body of objects.bodies)if(body.soft)body.finish=finish;
  objects.sync();
  document.querySelectorAll('button[data-jelly-finish]').forEach(b=>{const selected=b.dataset.jellyFinish===jellyFinish;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  canvas.dataset.jellyFinish=jellyFinish;resetAccumulation(true);
});
$('jelly-clarity').oninput=event=>{
  jellyClarity=Number(event.target.value);
  for(const body of objects.bodies)if(body.soft)body.clarity=jellyClarity;
  objects.sync();$('jelly-clarity-out').value=Math.round(jellyClarity*100)+'%';
  canvas.dataset.jellyClarity=String(jellyClarity);resetAccumulation(true);
};
$('bounce-quality').onchange=event=>{liveBounce=Number(event.target.value);uniforms.uIndirectSamples.value=liveBounce;resetAccumulation();measurePerformance();};
$('clear-shapes').onclick=()=>{if(recorder.state!=='idle')return;finishInteraction();fluid.cancelImpact();objects.clear();reflectObjects();resetAccumulation(true);};
$('tune').onclick = () => setPanel('settings',$('settings').hidden);
$('sampling').onclick = () => setPanel('sampling-panel',$('sampling-panel').hidden);
$('close-sampling').onclick = () => setPanel('sampling-panel',false);
$('close-settings').onclick = () => setPanel('settings',false);
$('experiments').onclick=()=>setPanel('experiments-panel',$('experiments-panel').hidden);
$('close-experiments').onclick=()=>setPanel('experiments-panel',false);
$('about').onclick = () => setPanel('about-panel',$('about-panel').hidden);
$('close-about').onclick = () => setPanel('about-panel',false);
async function fullscreen() {
  if (recorder.state !== 'idle') { notify('Finish the recording before changing the frame.'); return; }
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { notify('Full screen is unavailable in this browser.'); }
}
$('fullscreen').onclick = fullscreen;
$('texture').addEventListener('input',event => {
  textureStrength = Number(event.target.value);
  uniforms.uTextureStrength.value = textureStrength;
  $('texture-out').value = `${Math.round(textureStrength*100)}%`;
  canvas.dataset.textureStrength = String(textureStrength);
  resetAccumulation();
});
for (const key of Object.keys(settings)) $(key).addEventListener('input',event => {
  settings[key] = Number(event.target.value);
  $(key + '-out').value = settings[key].toFixed(2);
  uniforms.uIor.value = settings.ior;
  uniforms.uTension.value = settings.tension;
  uniforms.uScattering.value = settings.scattering;
  resetAccumulation(key === 'tension');
});
for(const [key,preset] of Object.entries(palettes)){
  const button=document.createElement('button');
  button.className='colour-swatch';button.dataset.palette=key;
  button.setAttribute('aria-label',preset.name);button.title=preset.name;
  button.style.setProperty('--swatch',preset.hex);
  const dot=document.createElement('span'),label=document.createElement('span');
  dot.className='colour-dot';dot.setAttribute('aria-hidden','true');label.textContent=preset.name;
  button.append(dot,label);$('single-colours').append(button);
  button.onclick=()=>{colourState.palette=key;colourState.mixed=false;applyColour();};
}
for(const [key,blend] of Object.entries(blends))$('blend-preset').add(new Option(blend.name,key));
const customBlendOption=new Option('Your blend','custom');customBlendOption.disabled=true;
$('blend-preset').add(customBlendOption);
function applyColour(save=true){
  const solid=palettes[colourState.palette],materials=colourState.colors.map(materialFromHex);
  const first=colourState.mixed?materials[0]:solid;
  uniforms.uFloor.value.fromArray(first.floor);uniforms.uAbsorption.value.fromArray(first.absorption);uniforms.uLiquidTint.value.fromArray(first.tint);
  for(const [index,letter] of ['A','B','C'].entries())uniforms['uFloorLab'+letter].value.fromArray(materials[index].lab);
  uniforms.uAbsorptionB.value.fromArray(materials[1].absorption);uniforms.uAbsorptionC.value.fromArray(materials[2].absorption);
  uniforms.uTintB.value.fromArray(materials[1].tint);uniforms.uTintC.value.fromArray(materials[2].tint);
  const angle=colourState.direction*Math.PI/180;
  uniforms.uPaletteMix.value=colourState.mixed?1:0;
  uniforms.uBlendDirection.value.set(Math.cos(angle),Math.sin(angle));
  uniforms.uBlendSharpness.value=16-14.6*colourState.softness;
  $('mix-colours').checked=colourState.mixed;$('single-colours').hidden=colourState.mixed;$('mixed-colours').hidden=!colourState.mixed;
  $('blend-preset').value=colourState.blend;
  colourState.colors.forEach((color,index)=>$('colour-'+(index+1)).value=color);
  $('blend-softness').value=String(colourState.softness);$('blend-softness-out').value=Math.round(colourState.softness*100)+'%';
  $('blend-direction').value=String(colourState.direction);$('blend-direction-out').value=Math.round(colourState.direction)+'°';
  const [a,b,c]=colourState.colors;
  const preview=`linear-gradient(${90+colourState.direction}deg,${a},${b},${c})`;
  $('colour-preview').style.background=preview;
  document.documentElement.style.setProperty('--active-colour',colourState.mixed?preview:solid.hex);
  const theme=colourTheme(colourState);
  for(const [key,value] of Object.entries(theme))document.documentElement.style.setProperty('--'+key,value);
  document.body.style.backgroundColor=colourState.mixed?b:colourState.palette==='green'?'#789543':solid.hex;
  document.querySelector('meta[name="theme-color"]').content=colourState.mixed?b:colourState.palette==='green'?'#668629':solid.hex;
  document.querySelectorAll('#single-colours [data-palette]').forEach(button => {
    const selected=!colourState.mixed && button.dataset.palette===colourState.palette;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
  canvas.dataset.palette=colourState.mixed?'blend':colourState.palette;
  canvas.dataset.colour=JSON.stringify(colourState);
  if(save)try{localStorage.setItem('glop-colour-v1',JSON.stringify(colourState));}catch{}
  resetAccumulation();
}
$('mix-colours').onchange=event=>{colourState.mixed=event.target.checked;applyColour();};
$('blend-preset').onchange=event=>{
  if(!blends[event.target.value])return;
  colourState.blend=event.target.value;colourState.colors=[...blends[colourState.blend].colors];applyColour();
};
for(let index=0;index<3;index++)$('colour-'+(index+1)).oninput=event=>{
  colourState.colors[index]=event.target.value;colourState.blend='custom';applyColour();
};
$('blend-softness').oninput=event=>{colourState.softness=Number(event.target.value);applyColour();};
$('blend-direction').oninput=event=>{colourState.direction=Number(event.target.value);applyColour();};
applyColour(false);
$('motion-fps').onchange=event=>{framePacer.setRate(event.target.value);canvas.dataset.motionLimit=String(framePacer.fps);measurePerformance();};
$('motion-fps').value=String(framePacer.fps);
$('lighting-refresh').onchange=event=>{lightingRefresh=event.target.value;lightingDirty=true;canvas.dataset.lightingRefresh=lightingRefresh;measurePerformance();};
const graphics=renderer.getContext(),graphicsInfo=graphics.getExtension('WEBGL_debug_renderer_info');
const graphicsDevice=graphicsInfo?graphics.getParameter(graphicsInfo.UNMASKED_RENDERER_WEBGL):graphics.getParameter(graphics.RENDERER);
canvas.dataset.device=graphicsDevice;
$('device-info').textContent=graphicsDevice;
$('copy-diagnostics').onclick=async()=>{
  const details=JSON.stringify({version:'2.24.2',device:graphicsDevice,browser:navigator.userAgent,viewport:[innerWidth,innerHeight],displayScale:devicePixelRatio,quality,liveSamples,liveBounce,softTouch,shapeSoft,shapeSoftness,motionLimit:framePacer.fps,lightingRefresh,...canvas.dataset},null,2);
  try{await navigator.clipboard.writeText(details);notify('Performance details copied.');}catch{notify('Your browser could not copy the details.');}
};
$('quality').onchange = event => { quality = event.target.value; resize(); };
$('refinement').onchange = event => {
  refinement = Number(event.target.value);
  canvas.dataset.refinement = String(refinement);
  if (!running) $('status').textContent = samples >= refinement ? 'LIGHT SETTLED' : 'REFINING LIGHT';
};
let samplingRequest=0;
document.querySelectorAll('[data-sampling]').forEach(button => button.onclick = async () => {
  const requested=Number(button.dataset.sampling),request=++samplingRequest;
  $('performance').textContent=`Preparing ${requested}× sampling…`;
  quad.material=liveMaterials[requested];
  try{await compileGraphics(renderer,scene,camera);}catch(error){notify(error.message);return;}
  if(request!==samplingRequest || recorder.state!=='idle')return;
  liveSamples = requested;
  uniforms.uAASamples.value = liveSamples;
  canvas.dataset.liveSamples = String(liveSamples);
  $('sampling-label').textContent = `${liveSamples}×`;
  document.querySelectorAll('[data-sampling]').forEach(b => {
    b.classList.toggle('selected',b === button);
    b.setAttribute('aria-pressed',String(b === button));
  });
  resetAccumulation();
  measurePerformance();
});
$('energy').addEventListener('input',event => {
  danceEnergy = Number(event.target.value);
  $('energy-out').value = `${Math.round(danceEnergy*100)}%`;
});
$('amount').addEventListener('input',event => {
  $('amount-out').value = `${event.target.value} drops`;
});
$('amount').addEventListener('change',event => changeAmount(Number(event.target.value)));
$('gather').onclick = () => {
  if(recorder.state!=='idle')return;
  finishInteraction();
  pointer.gather=!pointer.gather;
  if(pointer.gather)takeOverDance();
  reflectTool();
  notify(pointer.gather?'Drag anywhere to gently gather nearby drops.':'Drag a drop, or hold empty space to grow one.');
};
for (const key of ['tilt','softness','focus']) $(key).addEventListener('input',event => {
  cameraSettings[key] = Number(event.target.value);
  $(key+'-out').value = key === 'tilt' ? `${cameraSettings[key].toFixed(0)}°` : `${Math.round(cameraSettings[key]*100)}%`;
  updateCamera();
});
$('macro').addEventListener('change',event => {
  cameraSettings.macro = event.target.checked;
  $('macro-options').hidden = !cameraSettings.macro;
  updateCamera();
});
function pointerRay(event) {
  const rect = canvas.getBoundingClientRect();
  return cameraRay(viewFrame,(event.clientX-rect.left)/rect.width,1-(event.clientY-rect.top)/rect.height,view,rect.width/rect.height);
}
function pointerPosition(event,height=pointer.selected >= 0 || pointer.object>=0 ? pointer.height : 0) {
  const point = pointOnPlane(pointerRay(event),height);
  return { x: point[0], y: point[1] };
}
function reflectAmount() {
  canvas.dataset.count=String(fluid.count);
  $('drop-count').textContent=`${fluid.count} drops`;
}
function reflectTool() {
  $('gather').setAttribute('aria-pressed',String(pointer.gather));
  canvas.dataset.tool=pointer.gather?'gather':'play';
  canvas.classList.toggle('gather-tool',pointer.gather);
  $('gesture-help').textContent=pointer.gather?'DRAG ANYWHERE TO GATHER · CHOOSE GATHER AGAIN TO RETURN':'HOLD EMPTY SPACE TO GROW · DRAG TO GATHER · DOUBLE-TAP TO SPLIT';
  updatePlayCue();
}
function takeOverDance() {
  if(!dancing)return;
  dancing=false;reflectState();
  notify('Your turn. Choose Dance to watch again.');
}
function finishGrowth() {
  holdGesture.cancel();
  if(fluid.growing){fluid.finishDrop();resetAccumulation(true);}
  canvas.dataset.growth='idle';
}
function finishInteraction(preserveTap=false) {
  finishGrowth();if(preserveTap!==true)tapGesture.cancel();
  if(debug && pointer.mode==='press'){
    const body=objects.bodies.find(b=>b.id===pointer.object);
    if(body)canvas.dataset.pressStats=JSON.stringify({id:body.id,type:pointer.type,dentDepth:body.dentDepth,deformation:body.compression,volumeRatio:body.volumeRatio,seconds:(performance.now()-pointer.pressStart)/1000});
  }
  const id=pointer.id;
  pointer.active=false;pointer.selected=-1;pointer.object=-1;pointer.height=0;pointer.vx=pointer.vy=0;pointer.id=null;pointer.mode='empty';
  if(pointer.type==='touch')pointer.hover=false;
  canvas.classList.remove('grabbing');
  if(id!==null && canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  $('play-cue').hidden=true;
}
function updatePlayCue(sample=null) {
  const cue=$('play-cue'),holding=pointer.active && pointer.mode==='hold';
  const brush=pointer.gather && (pointer.active || (pointer.hover && pointer.type!=='touch'));
  cue.hidden=!(holding || brush);
  if(cue.hidden)return;
  if(sample)pointer.lastSample=sample;
  else if(holding)sample=pointer.lastSample;
  let radius=brush?BRUSH_RADIUS:(sample?.radius || .2);
  const [u,v]=projectPoint(viewFrame,[pointer.x+radius,pointer.y,0],view,innerWidth/innerHeight);
  const [cx,cy]=projectPoint(viewFrame,[pointer.x,pointer.y,0],view,innerWidth/innerHeight);
  const diameter=Math.max(44,Math.hypot((u-cx)*innerWidth,(v-cy)*innerHeight)*2);
  cue.style.left=`${pointer.screenX}px`;cue.style.top=`${pointer.screenY}px`;cue.style.width=cue.style.height=`${diameter}px`;
  cue.classList.toggle('brush',brush);cue.classList.toggle('active',pointer.active);
  cue.style.setProperty('--progress',String(sample?.progress || 0));
  $('play-cue-label').textContent=brush?'Gather':sample?.phase==='waiting'?'Hold to grow':'Release to keep';
}
function advanceInteraction(now) {
  if(!pointer.active || pointer.mode!=='hold'){updatePlayCue();return;}
  const sample=holdGesture.sample(now);
  if(!sample){pointer.mode='empty';updatePlayCue();return;}
  if(sample.phase==='start'){
    const id=fluid.beginDrop(pointer.x,pointer.y);
    if(id<0){finishInteraction();notify('This field is full. Choose New field to start fresh.');return;}
    pointer.selected=lastPicked=id;canvas.dataset.picked=String(id);pointer.offsetX=pointer.offsetY=0;baseline=null;tapGesture.cancel();
    takeOverDance();reflectAmount();
    resetAccumulation(true);
  }
  if(sample.radius)fluid.growDrop(sample.radius);
  canvas.dataset.growth=sample.phase;
  updatePlayCue(sample);
}
function updatePointer(event) {
  if (recorder.state !== 'idle' || (pointer.active && event.pointerId!==pointer.id) || (!pointer.active && event.isPrimary===false)) return;
  const p = pointerPosition(event), now = performance.now(), dt = Math.max(.008,(now - pointer.timestamp) / 1000);
  pointer.vx = Math.max(-6,Math.min(6,(p.x - pointer.x) / dt));
  pointer.vy = Math.max(-6,Math.min(6,(p.y - pointer.y) / dt));
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.timestamp = now;
  pointer.screenX=event.clientX;pointer.screenY=event.clientY;pointer.type=event.pointerType;
  if(pointer.mode==='hold' && holdGesture.move(event.clientX,event.clientY)){
    const grew=!!fluid.growing;finishGrowth();pointer.mode=grew?'drag':'empty';
  }
  if(pointer.active && event.pointerType==='touch')tapGesture.move(event.clientX,event.clientY);
  pointer.targetX = p.x + pointer.offsetX;
  pointer.targetY = p.y + pointer.offsetY;
  pointer.hover = true;
  updatePlayCue();
}
canvas.addEventListener('pointerdown',event => {
  if (recorder.state !== 'idle' || pointer.active || event.button!==0 || event.isPrimary===false) return;
  const ray = pointerRay(event), floorPoint = pointOnPlane(ray), picked = pointer.gather?{id:-1}:fluid.pickRay(ray,floorPoint);
  const objectHit=objects.pickRay(ray),waterDistance=picked.id>=0?(picked.height-ray.origin[2])/ray.direction[2]:Infinity;
  const object=objectHit && objectHit.distance<waterDistance?objectHit:null;
  if(!object && waterLab?.select(picked))return;
  pointer.object=object?.id ?? -1;
  pointer.height = object?object.height:picked.id >= 0 ? picked.height : 0;
  const p = pointerPosition(event,pointer.height);
  canvas.setPointerCapture(event.pointerId);
  pointer.active = true;
  pointer.id=event.pointerId;pointer.type=event.pointerType;pointer.screenX=event.clientX;pointer.screenY=event.clientY;
  pointer.mode=object?(object.soft && softTouch==='press' && !event.shiftKey?'press':'object'):pointer.gather?'brush':picked.id>=0?'drag':'hold';
  if(pointer.mode==='hold')holdGesture.start(event.clientX,event.clientY,performance.now(),event.pointerType);
  pointer.hover = true;
  pointer.selected = object?-1:picked.id;
  lastPicked = pointer.selected;
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.vx = pointer.vy = 0;
  pointer.timestamp = performance.now();
  if(event.pointerType==='touch' && pointer.mode==='drag')tapGesture.start(event.clientX,event.clientY,pointer.timestamp);
  else tapGesture.cancel();
  pointer.pressX=p.x;pointer.pressY=p.y;pointer.pressStart=performance.now();pointer.pressHeight=object?.height ?? 0;
  pointer.offsetX = object?object.x-p.x:picked.id >= 0 ? wrap(picked.x - p.x) : 0;
  pointer.offsetY = object?object.y-p.y:picked.id >= 0 ? wrap(picked.y - p.y) : 0;
  pointer.targetX = p.x + pointer.offsetX;
  pointer.targetY = p.y + pointer.offsetY;
  canvas.classList.toggle('grabbing',picked.id >= 0 || !!object);
  canvas.dataset.picked = String(pointer.selected);
  canvas.dataset.objectPicked=String(pointer.object);
  if (picked.id >= 0 || pointer.gather || object)takeOverDance();
  if (debug) baseline = fluid.inspect();
  if (!running) { running = true; last = performance.now(); reflectState(); }
  resetAccumulation();
  updatePlayCue({phase:'waiting',progress:0,radius:0});
});
canvas.addEventListener('pointermove',updatePointer);
canvas.addEventListener('pointerenter',event => {
  if (recorder.state !== 'idle' || pointer.active || event.isPrimary===false) return;
  const p = pointerPosition(event);
  pointer.x = p.x; pointer.y = p.y; pointer.vx = pointer.vy = 0; pointer.hover = true; pointer.timestamp = performance.now();
  pointer.type=event.pointerType;pointer.screenX=event.clientX;pointer.screenY=event.clientY;updatePlayCue();
});
canvas.addEventListener('pointerleave',() => { if (!pointer.active){pointer.hover=false;updatePlayCue();} });
canvas.addEventListener('contextmenu',event=>event.preventDefault());
function releasePointer(event) {
  if (recorder.state !== 'idle' || !pointer.active || event.pointerId!==pointer.id) return;
  finishGrowth();
  if(event.type==='pointerup' && event.pointerType==='touch' && pointer.mode==='drag'){
    if(tapGesture.release(event.clientX,event.clientY,performance.now()) && pointer.selected>=0)fluid.burst(pointer.selected);
  }else tapGesture.cancel();
  if (debug && baseline && lastPicked >= 0) {
    const current = fluid.inspect(), ox = baseline[lastPicked * 4], oy = baseline[lastPicked * 4 + 1];
    let farMotion = 0, farCount = 0;
    for (let i = 0; i < fluid.count; i++) {
      if (Math.hypot(wrap(baseline[i * 4] - ox),wrap(baseline[i * 4 + 1] - oy)) > 2.5) {
        farMotion += Math.hypot(wrap(current[i * 4] - baseline[i * 4]),wrap(current[i * 4 + 1] - baseline[i * 4 + 1]));
        farCount++;
      }
    }
    canvas.dataset.dragStats = JSON.stringify({ id: lastPicked, selectedMotion: Math.hypot(wrap(current[lastPicked * 4] - ox),wrap(current[lastPicked * 4 + 1] - oy)), farMeanMotion: farMotion / Math.max(1,farCount), finite: [...current].every(Number.isFinite) });
    baseline = null;
  }
  finishInteraction(event.type==='pointerup' && event.pointerType==='touch' && pointer.mode==='drag');
  if (event.type === 'pointerup') {
    const p = pointerPosition(event,0);
    pointer.x = p.x; pointer.y = p.y;
  }
  pointer.vx = pointer.vy = 0;
  canvas.classList.remove('grabbing');
  updatePlayCue();
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,releasePointer);
canvas.addEventListener('dblclick',event => {
  if(recorder.state!=='idle')return;
  event.preventDefault();
  if(pointer.gather)return;
  const ray=pointerRay(event),picked=fluid.pickRay(ray,pointOnPlane(ray));
  if(picked.id<0)return;
  const object=objects.pickRay(ray);if(object && object.distance<(picked.height-ray.origin[2])/ray.direction[2])return;
  fluid.burst(picked.id);
  if(!running){running=true;last=performance.now();simDebt=0;reflectState();}
  resetAccumulation();
});
addEventListener('keydown',event => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (event.key === 'Escape') {
    const openPanel = interfacePanels.find(([panel]) => !$(panel).hidden);
    if (openPanel) {
      setPanel(openPanel[0],false);
      $(openPanel[1]).focus({preventScroll:true});
    } else if (!clean) setInterface(false);
    return;
  }
  if (['INPUT','SELECT'].includes(document.activeElement.tagName)) return;
  if (event.key.toLowerCase() === 'h') { setInterface(clean); return; }
  if (recorder.state !== 'idle') return;
  if(event.key.toLowerCase()==='g'){$('gather').click();return;}
  if (event.code === 'Space') {
    if (document.activeElement.tagName === 'BUTTON') return;
    event.preventDefault(); toggle();
  }
  if (event.key.toLowerCase() === 'r') renew();
  if (event.key.toLowerCase() === 'f') fullscreen();
});
addEventListener('resize',()=>{finishInteraction();resize();});
addEventListener('blur',finishInteraction);
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishInteraction();});
canvas.addEventListener('webglcontextlost',event => {
  event.preventDefault();
  $('loading').hidden = false;
  $('loading').style.opacity = 1;
  $('loading').textContent = 'Graphics paused. Reload to restore the artwork.';
  canvas.dataset.error='WebGL context lost';
  window.dispatchEvent(new Event('glop-graphics-error'));
  recorder.fail('Graphics were reset during rendering. Reload the artwork and try again.');
});
addEventListener('pagehide',() => recorder.stop());
function drawLive() {
  uniforms.uResolution.value.set(liveWidth,liveHeight);
  uniforms.uLive.value = true;
  uniforms.uBlend.value = 0;
  quad.material = liveMaterials[liveSamples];
  renderer.setRenderTarget(liveTarget);
  renderer.render(scene,camera);
  if (cameraSettings.macro && cameraSettings.softness > 0) {
    dofUniforms.uSource.value = liveTarget.texture;
    quad.material = dofMaterial;
    renderer.setRenderTarget(dofTarget);
    renderer.render(scene,camera);
  }
  cleanDirty = false;
}
function render(now) {
  if(graphicsFailed)return;
  requestAnimationFrame(render);
  if(renderer.getContext().isContextLost())return;
  waterLab?.tick(now);
  if (recorder.state !== 'idle') { last=now; simDebt=0; return; }
  if (document.hidden) { last = now; simDebt = 0; return; }
  if (!running && samples >= refinement && !cleanDirty) { $('status').textContent = 'LIGHT SETTLED'; last = now; return; }
  if(!framePacer.ready(now) || !frameFence.ready())return;
  const dt = Math.min((now - last) / 1000,.05);
  last = now;
  if (running) {
    advanceInteraction(now);
    advanceDance(dt);
    const physicsSettings = { ...settings, dance: danceStrength };
    simDebt += dt;
    let steps = 0;
    while (simDebt >= 1 / 120 && steps < 6) {
      objects.step(1/120,pointer.active && pointer.mode==='object'?{id:pointer.object,x:pointer.targetX,y:pointer.targetY}:null,
        pointer.active && pointer.mode==='press'?{id:pointer.object,x:pointer.x,y:pointer.y,height:pointer.pressHeight,originX:pointer.pressX,originY:pointer.pressY,elapsed:(now-pointer.pressStart)/1000}:null);
      waterLab?.beforeStep(now);
      fluid.step(1 / 120,physicsSettings,pointer);
      simDebt -= 1 / 120;
      steps++;
    }
    if(Number(canvas.dataset.count)!==fluid.count)reflectAmount();
    if (steps) { fluid.rebuildGrid(); surfaceDirty = true; }
    pointer.vx *= Math.exp(-dt * 16);
    pointer.vy *= Math.exp(-dt * 16);
  }
  uniforms.uParticles.value = fluid.texture;
  uniforms.uGrid.value = fluid.grid.texture;
  if (surfaceDirty) { cache.rebuild(); surfaceDirty = false; cleanDirty = true; }
  if(lightingDirty || (running && (lightingRefresh==='full' || (frame-lastLightingFrame>=2 && now-lastLighting>=1000/30)))){lightingCache.rebuild();lightingDirty=false;lastLighting=now;lastLightingFrame=frame;}
  canvas.dataset.lightingRefresh=lightingRefresh;canvas.dataset.motionLimit=String(framePacer.fps);
  if (running || cleanDirty) drawLive();
  const cleanTexture = cameraSettings.macro && cameraSettings.softness > 0 ? dofTarget.texture : liveTarget.texture;
  displayUniforms.uClean.value = cleanTexture;
  displayUniforms.uImage.value = cleanTexture;
  displayUniforms.uBeautyMix.value = 0;
  if (!running) {
    if(!stillReady){
      if(!stillPreparing){
        stillPreparing=true;quad.material=traceMaterial;
        void compileGraphics(renderer,scene,camera).then(()=>{stillReady=true;}).catch(error=>{canvas.dataset.error=error.message;window.dispatchEvent(new Event('glop-graphics-error'));});
      }
      return;
    }
    if(!targets.length)targets=[makeTarget(renderWidth,renderHeight),makeTarget(renderWidth,renderHeight)];
    const output = targets[samples % 2], previous = targets[(samples + 1) % 2];
    uniforms.uLive.value = false;
    uniforms.uResolution.value.set(renderWidth,renderHeight);
    uniforms.uPrevious.value = previous.texture;
    uniforms.uFrame.value = samples + 1;
    uniforms.uBlend.value = samples ? samples / (samples + 1) : 0;
    quad.material = traceMaterial;
    renderer.setRenderTarget(output);
    renderer.setScissorTest(true);
    try{
      for(let work=0;work<(compatibility?1:4);work++){
        const tile=refinementTiles.next(renderWidth,renderHeight);
        renderer.setScissor(tile.x,tile.y,tile.width,tile.height);renderer.render(scene,camera);
        if(tile.complete){samples++;break;}
      }
    }
    finally{renderer.setScissorTest(false);}
    displayUniforms.uImage.value = samples?targets[(samples-1)%2].texture:cleanTexture;
    displayUniforms.uBeautyMix.value = Math.min(1,samples / 96);
  }
  displayUniforms.uResolution.value.set(running ? liveWidth : renderWidth,running ? liveHeight : renderHeight);
  quad.material = displayMaterial;
  renderer.setRenderTarget(null);
  renderer.render(scene,camera);
  frameFence.submit();
  frame++;
  fpsFrames++;
  if (now - fpsTime > 1000) {
    fps = fpsFrames * 1000 / (now - fpsTime);
    fpsFrames = 0; fpsTime = now;
    canvas.dataset.fps = fps.toFixed(1);
    canvas.dataset.gpuQueueSkips=String(frameFence.skipped);
    canvas.dataset.seed = String(fluid.seed);
    canvas.dataset.samples = String(samples);
    canvas.dataset.running = String(running);
    canvas.dataset.mode = running ? 'crisp-live' : 'progressive-path-tracing';
    if (debug) {
      canvas.dataset.softTouch=softTouch;canvas.dataset.pointerMode=pointer.mode;canvas.dataset.bounceQuality=String(liveBounce);
      canvas.dataset.objects=JSON.stringify(objects.bodies.map(body=>{
        const [u,v]=projectPoint(viewFrame,[body.x,body.y,body.size[2]*2],view,innerWidth/innerHeight);
        const {deformation,...visible}=body;
        return {...visible,screenX:u*innerWidth,screenY:(1-v)*innerHeight};
      }));
      canvas.dataset.breakup=JSON.stringify(fluid.pendingBurst);
      const state = fluid.inspect(), count = fluid.count;
      canvas.dataset.finite = String([...state].every(Number.isFinite));
      canvas.dataset.pickX = lastPicked >= 0 ? String(state[lastPicked * 4]) : '';
      canvas.dataset.pickY = lastPicked >= 0 ? String(state[lastPicked * 4 + 1]) : '';
      let speed = 0, peak = 0;
      for (let i = 0; i < count; i++) { const s = Math.hypot(state[count*8+i*4],state[count*8+i*4+1]); speed += s; peak = Math.max(peak,s); }
      canvas.dataset.motion = JSON.stringify({ meanSpeed: speed/count, peakSpeed: peak, time: fluid.time });
      canvas.dataset.coalescence = JSON.stringify(danceDiagnostics(state,fluid.topology));
      const pools = fluid.inspectPools();
      canvas.dataset.pools = JSON.stringify(poolDiagnostics(state,pools));
      canvas.dataset.droplets = JSON.stringify(Array.from({length:count},(_,id) => {
        const x=state[id*4],y=state[id*4+1],r=state[id*4+2];
        const [u,v]=projectPoint(viewFrame,[x,y,r*.87],view,innerWidth/innerHeight);
        return {id,root:Math.round(pools[id*4]),count:pools[id*4+1],x,y,r,screenX:u*innerWidth,screenY:(1-v)*innerHeight};
      }));
    }
    $('samples').textContent = running ? '' : `${samples.toLocaleString()} / ${refinement.toLocaleString()} SAMPLES`;
    $('performance').textContent = running ? `${Math.round(fps)} fps · ${liveWidth.toLocaleString()} × ${liveHeight.toLocaleString()} · ${liveSamples}× live · ${framePacer.fps} fps limit` : `Refining · ${renderWidth.toLocaleString()} × ${renderHeight.toLocaleString()}`;
  }
  if (!started) {
    started = true;
    $('loading').style.opacity = '0';
    setTimeout(() => $('loading').hidden = true,500);
    showIntroHint();
  }
}
async function startArtwork(){
if(learningLab){
  const {WaterLab,conductorMaterial}=await import('./experiments/water-lab.js?v=2.23.6');
  for(const material of [...Object.values(liveMaterials),traceMaterial,...Object.values(videoMaterials),lightingCache.liveMaterial,lightingCache.fastExportMaterial,lightingCache.exportMaterial])conductorMaterial(material);
  waterLab=new WaterLab({canvas,fluid,objects,settings,onChange:()=>{uniforms.uTension.value=settings.tension;for(const key of ['flow','viscosity','tension']){$(key).value=settings[key];$(key+'-out').value=settings[key].toFixed(2);}reflectObjects();resetAccumulation(true);},onTakeOver:()=>{finishInteraction();takeOverDance();},onReset:renew,onPause:toggle,onOpen:()=>setInterface(false),getRunning:()=>running,getFrame:()=>viewFrame,getView:()=>view});
  $('tension').title='Use the detergent experiment to change surface tension.';
  addEventListener('pagehide',()=>waterLab.dispose(),{once:true});
}
resize();
reflectAmount();reflectTool();reflectObjects();
reflectState();
reflectRecording({ state: 'idle', done:0, total:0, samples:16, eta:null });
canvas.dataset.offlineSupported = String(recorder.supported);
// Let the browser compile the active programs without blocking the page's UI.
for(const [label,targetScene,targetCamera,mesh,material] of [
  ['Preparing water',fluid.scene,fluid.camera,fluid.quad,fluid.stepMaterial],
  ['Preparing the surface',cache.scene,cache.camera,cache.quad,cache.material],
  ['Gathering light',lightingCache.scene,lightingCache.camera,lightingCache.quad,lightingCache.liveMaterial],
  ['Bending light',scene,camera,quad,liveMaterials[1]]
]){
  canvas.dataset.startupStage=label;$('loading').textContent=label+'…';
  mesh.material=material;
  await compileGraphics(renderer,targetScene,targetCamera);
}
canvas.dataset.startupStage='ready';
requestAnimationFrame(render);
}
void startArtwork().catch(error=>{
  canvas.dataset.error=error.message;
  $('loading').hidden=false;
  $('loading').textContent='The artwork could not start. Reload to try again.';
  window.dispatchEvent(new Event('glop-graphics-error'));
  console.error(error);
});
