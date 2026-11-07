'use strict';
const $ = id => document.getElementById(id);
const F = InkFlow, W = 1600, H = 1000;
const defaults = {water: .60, flow: .55, pace: 1.8, wildness: .5, pigment: .65, grid: true};
const query = new URLSearchParams(location.search);
let spatialMode=query.get('mode')==='3d'?'3d':'2d';
let params = {...defaults}, seed = Math.max(1, Number(query.get('seed')) || 21);
let model, rng, particles = [], vortices = [], tick = 0, running = query.get('paused')!=='1'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
let tool = 'ink', selectedColor = 0, pointer = null, lastInkTick = -100, ready = false;
let designMode=query.get('design')==='camera'?'camera':F.designs.some(design=>design.id===query.get('design'))?query.get('design'):'auto';
let cameraSource=null,cameraPaths=[],cameraCurrents=[],cameraMotion=[],cameraEnergy=0,cameraCursor=0,cameraAge=0,cameraPreviousRunning=running,cameraPrimed=false,portraitInk;
let portraitMode=query.get('portrait')==='motion'?'motion':'still';
let paper, ground, dry, wet, wash, gestureInk, grain, ctx, canvas, fluid = null, filaments = null, droplets = null, lastDraw = 0, simulationDebt = 0, statusTimer, hasGestureInk=false;
const P = InkPigments, COLOUR_STEPS = 28;
const PAINT_RGB=P.palettes.map((_,palette)=>Array.from({length:COLOUR_STEPS},(_,shade)=>P.sample(palette,shade/COLOUR_STEPS).join(',')));
let paletteIndex = Math.max(0,P.presets.findIndex(preset=>preset.id===query.get('palette')));
let frameStats={start:0,frames:0,steps:0,simulation:0,presentation:0,samples:[]};
function resetFrameStats(){frameStats={start:0,frames:0,steps:0,simulation:0,presentation:0,samples:frameStats.samples};}
function recordFrame(start,steps,simulation,presentation){
  if(!running)return;
  if(!frameStats.start)frameStats.start=start;
  frameStats.frames++;frameStats.steps+=steps;frameStats.simulation+=simulation;frameStats.presentation+=presentation;
  const elapsed=start-frameStats.start;
  if(elapsed<1000)return;
  const sample={fps:frameStats.frames*1000/elapsed,simulationMs:frameStats.simulation/frameStats.frames,presentationMs:frameStats.presentation/frameStats.frames,stepsPerSecond:frameStats.steps*1000/elapsed};
  const output=$('fps');output.textContent=sample.fps.toFixed(0)+' FPS';
  frameStats.samples.push(sample);if(frameStats.samples.length>12)frameStats.samples.shift();
  if(query.has('profile'))output.dataset.samples=JSON.stringify(frameStats.samples);
  frameStats={start,frames:0,steps:0,simulation:0,presentation:0,samples:frameStats.samples};
}
function surface() {const c=document.createElement('canvas');c.width=W;c.height=H;return c;}
function setup() {
  pixelDensity(1);
  const renderer=createCanvas(W,H); renderer.parent('canvas-container');
  canvas=renderer.elt; canvas.id='artwork'; canvas.setAttribute('aria-label','Generative ink on warm paper. Drop ink on the paper, or choose Water and drag to stir the currents.');
  ctx=canvas.getContext('2d');
  paper=surface();ground=surface();dry=surface();wet=surface();wash=surface();gestureInk=surface();grain=surface();portraitInk=surface();
  canvas.addEventListener('pointerdown',pointerDown);
  canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);
  canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  initializeSystem(); ready=true;
  $('loading').hidden=true;
  frameRate(60);
  if(spatialMode==='2d'&&designMode==='camera'&&query.get('demo')==='1')cameraSource.demo();
  if(spatialMode==='3d')noLoop();
}
function cameraState(state,message){
  if(designMode!=='camera'||spatialMode==='3d')return;
  document.documentElement.dataset.cameraState=state;
  $('camera-toggle').disabled=state==='requesting';$('camera-toggle').textContent=state==='live'?'Stop camera':state==='requesting'?'Opening camera…':state==='held'?'New portrait':'Start camera';
  $('capture-portrait').hidden=portraitMode!=='still'||!['live','demo'].includes(state);$('capture-portrait').disabled=!cameraSource?.lastFrame;
  $('camera-note').textContent=message;$('gesture-hint').textContent=message;
  if(['live','demo','held'].includes(state))running=true;else running=false;
  if(ready)updatePause();
}
function cameraInterface(){
  if(spatialMode==='3d')return;
  const active=designMode==='camera';document.body.classList.toggle('camera-mode',active);$('camera-toggle').hidden=!active;$('camera-note').hidden=!active;$('another').textContent=active?'Clear ink':'New sheet';
  $('portrait-modes').hidden=!active;$('capture-portrait').hidden=true;
  $('studio-regenerate').textContent=active?'Clear ink':'Regenerate';
  canvas.setAttribute('aria-label',active?'An ink portrait drawn from local camera contours. Start the camera to begin, or use Ink and Water on the paper.':'Generative ink on warm paper. Drop ink on the paper, or choose Water and drag to stir the currents.');
  if(active)cameraState(cameraSource?.state??'off',cameraSource?.active?cameraSource.message:'Start the camera to make an ink portrait. Video stays on this device.');
  else setTool(tool);
  if(active&&!query.has('demo'))cameraSource.warmVision();
}
function paintPortrait(){if(model?.camera&&portraitInk)InkCamera.paint(portraitInk,model,paletteIndex,params.pigment);}
function cameraFrame(frame){
  if(!ready||spatialMode==='3d'||designMode!=='camera'||(!running&&cameraSource?.state!=='held'))return;
  model=InkCamera.model(seed,frame);model.transport=InkCamera.field(model);cameraPaths=frame.paths;cameraCurrents=frame.eddies;cameraMotion=model.motion.currents;cameraEnergy=model.motion.amount;
  if(fluid)fluid.makeField(model);if(droplets)droplets.model=model;
  if(!cameraPrimed&&frame.paths.length){
    droplets?.seedContours(frame.paths,tick);cameraPrimed=true;
    if(droplets&&!droplets.gl)droplets.render(tick,params,paletteIndex,wet.getContext('2d'));
  }
  paintPortrait();presentInk();
  particles=[];$('capture-portrait').disabled=false;
  canvas.dataset.cameraContours=String(frame.paths.length);canvas.dataset.cameraEdges=String(frame.edgePixels);
  canvas.dataset.cameraFrames=String(Number(canvas.dataset.cameraFrames??0)+1);canvas.dataset.cameraMotion=cameraEnergy.toFixed(3);
  canvas.dataset.portraitTracking=frame.detection??'edges';canvas.dataset.portraitAnalysisMs=String(Math.round(frame.analysisMs??0));
}
function clearPortraitInk(){
  if(!ready)return;const held=cameraSource?.state==='held'?cameraSource.lastFrame:null;cameraPaths=[];cameraCurrents=[];cameraMotion=[];cameraEnergy=0;cameraCursor=0;cameraAge=0;cameraPrimed=false;particles=[];portraitInk.getContext('2d').clearRect(0,0,W,H);
  model=InkCamera.model(seed);model.transport=F.transportField(model,192,120);if(fluid)fluid.reset(model);droplets?.reset(model);
  for(const surface of [wet,wash,dry,gestureInk])surface.getContext('2d').clearRect(0,0,W,H);
  hasGestureInk=false;if(held)cameraFrame(held);presentInk();
}
function setPortraitMode(mode){
  portraitMode=mode==='motion'?'motion':'still';cameraMotion=[];cameraEnergy=0;
  document.querySelectorAll('[data-portrait]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.portrait===portraitMode)));
  const url=new URL(location.href);url.searchParams.set('portrait',portraitMode);history.replaceState(null,'',url);cameraSource?.setMode(portraitMode);
}
function paperSurface() {
  const pr=F.randomSource(seed+997), pc=paper.getContext('2d'), image=pc.createImageData(W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
    const i=(y*W+x)*4, n=(pr()-.5)*7, cloud=(F.noise(x*.004,y*.004,seed)-.5)*6;
    const vignette=2.5*Math.pow(Math.hypot((x-W/2)/W,(y-H/2)/H),1.7);
    image.data[i]=242+n+cloud-vignette;image.data[i+1]=237+n+cloud-vignette;image.data[i+2]=223+n+cloud-vignette;image.data[i+3]=255;
  }
  pc.putImageData(image,0,0);
  pc.lineWidth=.45;
  for(let i=0;i<27000;i++) {
    const x=pr()*W,y=pr()*H;
    pc.strokeStyle=pr()>.5?'rgba(255,255,246,.12)':'rgba(83,72,49,.045)';
    pc.beginPath();pc.moveTo(x,y);pc.lineTo(x+2+pr()*9,y+(pr()-.5)*1.5);pc.stroke();
  }
  const gc=grain.getContext('2d'), g=gc.createImageData(W,H);
  for(let i=0;i<g.data.length;i+=4) {const n=pr();g.data[i]=60;g.data[i+1]=52;g.data[i+2]=39;g.data[i+3]=n<.13?Math.floor(pr()*21):0;}
  gc.putImageData(g,0,0);
}
function drawGrid(c) {
  if(!params.grid)return;
  const rand=F.randomSource(seed+277);
  c.save();c.strokeStyle='rgba(70,83,79,.105)';c.lineWidth=.55;
  for(let x=55;x<W-30;x+=98) {c.beginPath();c.moveTo(x+(rand()-.5)*2,43);c.lineTo(x+(rand()-.5)*2,H-57);c.stroke();}
  for(let y=68;y<H-35;y+=98) {c.beginPath();c.moveTo(38,y+(rand()-.5)*1.5);c.lineTo(W-38,y+(rand()-.5)*1.5);c.stroke();}
  c.strokeStyle='rgba(73,79,70,.12)';c.lineWidth=.5;
  for(const b of model.guides){
    c.beginPath();c.arc(b.x,b.y,b.r+10,0,F.TAU);c.stroke();
    c.setLineDash([2,7]);c.beginPath();c.arc(b.x,b.y,b.r*.77,0,F.TAU);c.stroke();c.setLineDash([]);
    c.strokeStyle='rgba(76,77,63,.09)';
    for(let i=0;i<3;i++){const a=rand()*F.TAU;c.beginPath();c.moveTo(b.x-Math.cos(a)*b.r*1.25,b.y-Math.sin(a)*b.r*1.25);c.lineTo(b.x+Math.cos(a)*b.r*1.2,b.y+Math.sin(a)*b.r*1.2);c.stroke();}
  }
  for(let i=0;i<4;i++) {const x=i%2?W-56:55,y=i<2?68:H-68;c.beginPath();c.moveTo(x-12,y);c.lineTo(x+12,y);c.moveTo(x,y-12);c.lineTo(x,y+12);c.stroke();}
  c.restore();
}
function refreshGround(){const c=ground.getContext('2d');c.drawImage(paper,0,0);drawGrid(c);}
function spawn(path, t, color) {
  const p={path,t:t??rng(),lane:(rng()*2-1),phase:rng()*F.TAU,speed:.6+rng()*1.7,alpha:.5+rng()*.8,weight:.32+rng()*.58,color:color??path.color,age:rng()*1000,x:0,y:0,first:true};
  return p;
}
function initializeSystem() {
  lastDraw=0;simulationDebt=0;pointer=null;lastInkTick=-100;
  resetFrameStats();hasGestureInk=false;
  const previous={fluid,filaments,droplets};fluid=null;filaments=null;droplets=null;
  const wasCamera=canvas.dataset.design==='camera';
  if(designMode==='camera'&&!wasCamera)cameraPreviousRunning=running;
  else if(designMode!=='camera'&&wasCamera)running=cameraPreviousRunning;
  if(designMode!=='camera')cameraSource?.stop(false);
  else if(previous.filaments){previous.filaments.destroy();previous.filaments=null;}
  cameraPaths=[];cameraCurrents=[];cameraMotion=[];cameraEnergy=0;cameraCursor=0;cameraAge=0;cameraPrimed=false;portraitInk.getContext('2d').clearRect(0,0,W,H);
  seed=Math.min(2147483647,Math.max(1,Math.floor(seed)||21));
  randomSeed(seed);noiseSeed(seed);rng=F.randomSource(seed+421);model=designMode==='camera'?InkCamera.model(seed):F.build(seed,W,H,designMode);model.transport=F.transportField(model);particles=[];vortices=[];tick=0;
  for(const c of [dry,wet,wash,gestureInk])c.getContext('2d').clearRect(0,0,W,H);
  paperSurface();refreshGround();
  const weights=model.paths.map(p=>p.length*Math.pow(p.width,.63)),sum=weights.reduce((a,b)=>a+b,0);
  model.paths.forEach((p,i)=>{const n=Math.max(8,Math.round(weights[i]/sum*10500));for(let k=0;k<n;k++)particles.push(spawn(p));});
  for(let i=0;i<48;i++)advance(true);
  for(const p of model.pools)if(p.r<90)bloom(p.x,p.y,p.r*1.2,p.color);
  try{
    if(query.get('renderer')!=='canvas'){
      fluid=previous.fluid??new WetInk(model);fluid.resizeInk(model.camera?1600:2000,model.camera?1000:1250);if(previous.fluid)fluid.reset(model);
      fluid.update(wet,params);fluid.warmVelocity(params);
    }
  }catch(error){fluid?.destroy();fluid=null;console.info('Using the portable canvas ink renderer:',error.message);}
  try{
    if(fluid&&designMode!=='camera'){filaments=previous.filaments??new InkFilaments(model,fluid);if(previous.filaments)filaments.build(model);filaments.render(tick,params,paletteIndex);}
  }catch(error){filaments?.destroy();filaments=null;console.info('Using canvas filaments:',error.message);}
  if(!fluid){previous.filaments?.destroy();previous.droplets?.destroy();previous.fluid?.destroy();}
  try{droplets=previous.droplets&&previous.droplets.fluid===fluid?previous.droplets:new InkDroplets(model,fluid);droplets.reset(model);}
  catch(error){console.info('Using canvas ink drops:',error.message);droplets=new InkDroplets(model,null);}
  document.documentElement.dataset.wetInk=fluid?'gpu':'canvas';document.documentElement.dataset.filaments=filaments?'gpu':'canvas';
  document.documentElement.dataset.inkDrops=droplets.gl?'gpu':'canvas';canvas.dataset.inkDrops='0';
  canvas.dataset.design=model.design.id;canvas.dataset.segments=String(filaments?.count??0);
  canvas.dataset.layout=model.composition?.layout.id??'original';
  $('seed-input').value=seed;$('edition').textContent=String(seed).padStart(3,'0');$('edition').title=model.design.name;
  const u=new URL(location.href);u.searchParams.set('seed',seed);if(designMode==='auto')u.searchParams.delete('design');else u.searchParams.set('design',designMode);if(designMode!=='camera')u.searchParams.delete('demo');history.replaceState(null,'',u);
  cameraInterface();composite();updatePause();
}

function fade(c,alpha) {
  const d=c.getContext('2d');d.save();d.globalCompositeOperation='destination-out';d.fillStyle=`rgba(0,0,0,${alpha})`;d.fillRect(0,0,W,H);d.restore();
}
function position(p) {
  const q=F.sample(p.path,p.t), width=p.path.width*(q.spread??1);
  const flow=F.noise(q.x*.016+tick*.0015,q.y*.016,p.phase*1000)-.5;
  const flutter=Math.sin(p.t*36+p.phase+tick*.009)*.18+Math.sin(p.t*95+p.phase*.3-tick*.006)*.08;
  let envelope=.25+1.1*Math.pow(.5+.5*Math.sin(p.t*23+p.path.phase),2);
  envelope*=.75+.3*Math.sin(p.t*53-p.path.phase);
  if(!p.path.closed)envelope*=Math.pow(Math.max(.001,Math.sin(Math.PI*p.t)),.3);
  const bolus=Math.sin(p.t*19-tick*.028+p.path.phase);
  envelope*=.8+.3*Math.pow(Math.max(0,bolus),4);
  let spread=width*(p.lane*envelope+flow*(.9+params.wildness)+flutter);
  spread+=Math.sin(p.t*170+p.phase)*width*.08;
  if(p.path.wild)spread+=width*params.wildness*Math.sin(p.t*65+p.phase+tick*.004);
  let x=q.x+q.nx*spread,y=q.y+q.ny*spread;
  // A broad, slowly changing lateral field opens and closes the wet banks.
  x+=(F.noise(q.x*.009,q.y*.009+tick*.0007,seed+1)-.5)*width*.75*params.water;
  y+=(F.noise(q.x*.009+13,q.y*.009+tick*.0007,seed+2)-.5)*width*.75*params.water;
  for(const v of vortices) {
    const dx=x-v.x,dy=y-v.y,d=Math.hypot(dx,dy),m=Math.exp(-d*d/(v.r*v.r))*v.life;
    x-=dy*.21*m;y+=dx*.21*m;
  }
  return {x,y};
}
function advance(prewarm=false,paint=true) {
  tick++;
  if(fluid)wet.getContext('2d').clearRect(0,0,W,H);
  else fade(wet,designMode==='camera'?.014:.006+(1-params.water)*.004);
  if(tick%3===0)fade(wash,.008);
  if(tick%8===0)fade(dry,.004);
  const wc=wet.getContext('2d'),dc=dry.getContext('2d'),ac=wash.getContext('2d');
  if(designMode==='camera'&&fluid){wc.save();wc.globalAlpha=.035;wc.drawImage(portraitInk,0,0);wc.restore();}
  const opacity=.10*(.4+params.pigment*1.25);
  const traces=new Array(COLOUR_STEPS*3),washes=tick%4===0?new Array(COLOUR_STEPS):null;
  for(let i=0;i<particles.length;i++) {
    const p=particles[i];let q;
    p.t+=(.65+params.flow*1.6)*p.speed/(p.path.length||1);
    if(p.t>=1){p.t-=1;p.first=true;}
    q=position(p);
    const fixedColour=p.path.pigment;
    const phase=fixedColour==null?(P.isTriad(paletteIndex)?p.path.color/3:P.phaseAt(q.x/W,q.y/H,tick)):P.phaseForInk(paletteIndex,fixedColour);
    const shade=Math.min(COLOUR_STEPS-1,Math.floor(phase*COLOUR_STEPS));
    if(!p.first&&Math.hypot(q.x-p.x,q.y-p.y)<24) {
      const trace=traces[shade*3+i%3]??=new Path2D();trace.moveTo(p.x,p.y);trace.lineTo(q.x,q.y);
      if(washes&&i%2===0){const w=washes[shade]??=new Path2D();w.moveTo(p.x,p.y);w.lineTo(q.x,q.y);}
    }
    p.x=q.x;p.y=q.y;p.first=false;
  }
  wc.lineCap='round';dc.lineCap='round';ac.lineCap='round';
  for(let shade=0;shade<COLOUR_STEPS;shade++) {
    const rgb=PAINT_RGB[paletteIndex][shade];
    for(let bucket=0;bucket<3;bucket++) {
      const trace=traces[shade*3+bucket];
      if(!trace)continue;
      wc.strokeStyle=`rgba(${rgb},${opacity*(.65+bucket*.35)})`;wc.lineWidth=.38+bucket*.28;wc.stroke(trace);
      if(tick%3===0){dc.strokeStyle=`rgba(${rgb},${opacity*.09})`;dc.lineWidth=.30;dc.stroke(trace);}
    }
    if(washes&&washes[shade]){ac.strokeStyle=`rgba(${rgb},${opacity*.08*params.water})`;ac.lineWidth=3+params.water*2;ac.stroke(washes[shade]);}
  }
  for(const v of vortices)v.life*=.974;
  vortices=vortices.filter(v=>v.life>.02);
  if(pointer&&tool==='ink'&&!prewarm&&tick-lastInkTick>=14)applyGesture(pointer.x,pointer.y,0,0);
  const portrait=designMode==='camera',paintParams=portrait?{...params,portrait:true}:params;
  const currents=portrait?[...cameraCurrents,...cameraMotion,...vortices].slice(-8):vortices;
  if(portrait){
    cameraAge++;cameraEnergy*=.97;for(const impulse of cameraMotion)impulse.life*=.965;
    if(cameraSource?.active&&model.paths.length&&tick%8===0)droplets?.feedContours(model.paths,tick);
    canvas.dataset.cameraAge=String(cameraAge);
  }
  if(fluid)fluid.update(wet,paintParams,currents,portrait?false:paint);
  if(filaments){if(paint)filaments.render(tick,params,paletteIndex);else filaments.advance(tick,params);}
  if(droplets){
    droplets.advance(tick,params,currents);
    if(portrait){
      if(!droplets.gl||tick%2===0)droplets.render(tick,params,paletteIndex,wet.getContext('2d'),true);
      if(paint&&fluid){fluid.pass('display',null,[fluid.ink[0]],paintParams);droplets.render(tick,params,paletteIndex,gestureInk.getContext('2d'));}
      hasGestureInk=false;
    }else{if(paint)droplets.render(tick,params,paletteIndex,gestureInk.getContext('2d'));hasGestureInk=!droplets.gl&&droplets.count>0;}
  }
}
function presentInk(){
  if(fluid)fluid.pass('display',null,[fluid.ink[0]],{...params,portrait:designMode==='camera'});
  if(filaments)filaments.render(tick,params,paletteIndex);
  if(designMode!=='camera'||droplets?.gl)droplets?.render(tick,params,paletteIndex,gestureInk.getContext('2d'));hasGestureInk=designMode!=='camera'&&!!droplets&&!droplets.gl&&droplets.count>0;
  composite();
}

function composite() {
  ctx.globalCompositeOperation='source-over';ctx.drawImage(ground,0,0);
  ctx.globalCompositeOperation='multiply';
  ctx.save();ctx.filter='blur(.8px)';ctx.globalAlpha=designMode==='camera'?.12:filaments?.18:.5;ctx.drawImage(wash,0,0);ctx.restore();
  ctx.globalAlpha=1;
  if(designMode==='camera'){ctx.globalAlpha=droplets?.gl ? .22 : .85;ctx.drawImage(portraitInk,0,0);ctx.globalAlpha=1;}
  ctx.drawImage(fluid?fluid.canvas:wet,0,0,W,H);
  ctx.globalAlpha=designMode==='camera'?.05:filaments?.08:.45;ctx.drawImage(dry,0,0);ctx.globalAlpha=1;
  if(hasGestureInk)ctx.drawImage(gestureInk,0,0);
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';ctx.drawImage(grain,0,0);
}
function draw() {
  if(!ready||document.hidden||spatialMode==='3d')return;
  const now=performance.now();
  if(!running){lastDraw=now;simulationDebt=0;return;}
  const elapsed=lastDraw?Math.min((now-lastDraw)/1000,.1):0;lastDraw=now;
  let steps=0;
  if(running){
    simulationDebt=Math.min(4,simulationDebt+elapsed*30*params.pace);
    steps=Math.floor(simulationDebt);simulationDebt-=steps;
    for(let i=0;i<steps;i++)advance(false,i===steps-1);
  }else simulationDebt=0;
  const simulated=performance.now();composite();
  recordFrame(now,steps,simulated-now,performance.now()-simulated);
}
function coordinates(e) {
  const r=canvas.getBoundingClientRect(),cover=getComputedStyle(canvas).objectFit==='cover';
  const scale=cover?Math.max(r.width/W,r.height/H):Math.min(r.width/W,r.height/H);
  return{x:(e.clientX-r.left-(r.width-W*scale)/2)/scale,y:(e.clientY-r.top-(r.height-H*scale)/2)/scale};
}
function pointerDown(e) {
  if(e.button!==0&&e.pointerType==='mouse')return;
  const p=coordinates(e);if(p.x<0||p.x>W||p.y<0||p.y>H)return;
  pointer={...p,dx:0,dy:0,lastX:p.x,lastY:p.y};canvas.setPointerCapture(e.pointerId);
  applyGesture(p.x,p.y,0,0);if(tool==='ink')announce(running?'Ink released':'Ink released. Let it flow to disperse.');e.preventDefault();
}
function pointerMove(e) {
  const p=coordinates(e);$('cursor').style.left=e.clientX+'px';$('cursor').style.top=e.clientY+'px';
  if(!pointer)return;
  const dx=p.x-pointer.x,dy=p.y-pointer.y;pointer={...pointer,...p,dx,dy};
  if(tool==='water')applyGesture(p.x,p.y,dx,dy);
  else if(Math.hypot(p.x-pointer.lastX,p.y-pointer.lastY)>24&&tick-lastInkTick>=3){applyGesture(p.x,p.y,dx,dy);pointer.lastX=p.x;pointer.lastY=p.y;}
}
function pointerUp(){pointer=null;}
function bloom(x,y,r,color=null) {
  const c=wash.getContext('2d'),rgb=(color==null?P.sample(paletteIndex,P.phaseAt(x/W,y/H,tick)):P.swatch(paletteIndex,color)).join(','),g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${rgb},.10)`);g.addColorStop(.4,`rgba(${rgb},.075)`);g.addColorStop(.84,`rgba(${rgb},.035)`);g.addColorStop(1,`rgba(${rgb},0)`);
  c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,F.TAU);c.fill();
}
function applyGesture(x,y,dx,dy) {
  if(x<1||x>W-1||y<1||y>H-1)return;
  if(tool==='water'){
    const clamp=value=>Math.max(-12,Math.min(12,value));
    vortices.push({x,y,r:55+params.water*85,life:Math.min(1.8,.65+Math.hypot(dx,dy)*.06),dx:clamp(dx),dy:clamp(dy)});
    if(vortices.length>8)vortices.shift();
    if(!running){for(let i=0;i<3;i++)advance(true);composite();}
  }else{
    droplets?.drop(x,y,selectedColor,tick);canvas.dataset.inkDrops=String(droplets?.serial??0);lastInkTick=tick;
    if(!running)presentInk();
  }
}
function announce(text) {$('status').textContent=text;clearTimeout(statusTimer);statusTimer=setTimeout(()=>$('status').textContent='',2400);}
function setTool(value) {
  if(!['ink','water'].includes(value))return;
  tool=value;document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});
  $('cursor').dataset.tool=tool;
  $('gesture-hint').textContent=tool==='ink'?'Touch the paper to drop ink into the currents':'Drag through the ink to stir the water';
}
function updatePause() {$('pause').textContent=running?'Pause':'Let it flow';$('pause').setAttribute('aria-pressed',String(!running));$('flow-state').textContent=running?'INK IN MOTION':'A MOMENT HELD';resetFrameStats();$('fps').textContent=running?'Measuring frame rate…':'Paused';if(typeof syncVolume==='function')syncVolume();}
function togglePause(){running=!running;lastDraw=0;simulationDebt=0;updatePause();}
function parameterText(key,value){return key==='pace'?value.toFixed(1)+'×':Math.round(value*100)+'%';}
function updateParam(key,value){params[key]=Number(value);$(key+'-value').textContent=parameterText(key,params[key]);if(key==='pigment'&&model?.camera){paintPortrait();presentInk();}}
function updateSeed(){seed=Number($('seed-input').value)||seed;initializeSystem();}
function previousSeed(){seed=Math.max(1,seed-1);initializeSystem();}
function nextSeed(){seed++;initializeSystem();}
function randomSeedAndUpdate(){
  if(spatialMode==='3d'){newVolumeSeed();return;}
  if(designMode==='camera'){clearPortraitInk();announce('Fresh paper for the portrait');return;}
  const previousDesign=model.design.id,previousLayout=model.composition?.layout.id??'original';let nextDesign,nextLayout;
  do{seed=crypto.getRandomValues(new Uint32Array(1))[0]%999999+1;nextDesign=designMode==='auto'?F.designs[seed%F.designs.length].id:designMode;nextLayout=nextDesign==='river'?'original':F.arrangementFor(seed).id;}
  while((designMode==='auto'&&nextDesign===previousDesign)||(nextLayout!=='original'&&nextLayout===previousLayout));
  initializeSystem();announce(model.composition?model.composition.layout.name+' · '+model.design.name:model.design.name);
}
function resetParameters(){params={...defaults};for(const key of ['water','flow','pace','wildness','pigment']){$(key).value=params[key];$(key+'-value').textContent=parameterText(key,params[key]);}$('grid').checked=params.grid;designMode='auto';$('design').value='auto';setPortraitMode('still');paletteIndex=0;$('palette').value='0';setPalette();initializeSystem();}
function downloadPNG() {
  if(spatialMode==='3d'){sendVolume('save');return;}
  composite();const data=canvas.toDataURL('image/png');
  showPrint(data,W,H,`vellum-${seed}-${tick}.png`);
}
function showPrint(data,width,height,filename){
  $('print-preview').src=data;$('print-download').href=data;$('print-download').download=filename;
  $('print-size').textContent=`${width} × ${height} · PNG`;
  $('print-dialog').showModal();
}
function toggleStudio(force) {
  const open=typeof force==='boolean'?force:!document.body.classList.contains('studio-open');
  document.body.classList.toggle('studio-open',open);$('studio-toggle').setAttribute('aria-expanded',String(open));$('studio').inert=!open;
  if(open)$('close-studio').focus();else $('studio-toggle').focus();
}
function updateSwatches() {
  const names=P.presets[paletteIndex].inkNames??['Cool mineral ink','Warm earth ink','Moss ink'];
  document.querySelectorAll('[data-color]').forEach((b,i)=>{b.style.setProperty('--swatch',`rgb(${P.swatch(paletteIndex,i).join(',')})`);b.setAttribute('aria-label',names[i]);b.title=names[i];});
}
function populatePalettes(){
  $('palette').replaceChildren();
  for(const [name,triad] of [['Three-pigment sets',true],['Colour studies',false]]){
    const group=document.createElement('optgroup');group.label=name;
    P.presets.forEach((preset,index)=>{if(P.isTriad(index)===triad){const option=document.createElement('option');option.value=index;option.textContent=preset.name;group.append(option);}});
    $('palette').append(group);
  }
  $('palette').value=String(paletteIndex);
}
function setPalette(){
  paletteIndex=Number($('palette').value);updateSwatches();
  const url=new URL(location.href);if(paletteIndex===0)url.searchParams.delete('palette');else url.searchParams.set('palette',P.presets[paletteIndex].id);history.replaceState(null,'',url);
  paintPortrait();presentInk();
  announce(P.presets[paletteIndex].name);
}
window.addEventListener('DOMContentLoaded',()=>{
  $('studio').inert=true;
  cameraSource=new InkCamera({onFrame:cameraFrame,onState:cameraState,mode:portraitMode,enabled:()=>ready&&running&&!document.hidden&&spatialMode==='2d'&&designMode==='camera'});
  document.querySelectorAll('[data-portrait]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.portrait===portraitMode));button.addEventListener('click',()=>setPortraitMode(button.dataset.portrait));});
  for(const key of ['water','flow','pace','wildness','pigment']){$(key).value=params[key];$(key+'-value').textContent=parameterText(key,params[key]);}
  const designSelect=$('design');for(const design of F.designs){const option=document.createElement('option');option.value=design.id;option.textContent=design.name;designSelect.append(option);}designSelect.value=designMode;
  const cameraOption=document.createElement('option');cameraOption.value='camera';cameraOption.textContent='Webcam portrait';designSelect.append(cameraOption);designSelect.value=designMode;
  designSelect.addEventListener('change',()=>{designMode=designSelect.value;initializeSystem();announce(model.design.name);});
  populatePalettes();updateSwatches();
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{selectedColor=Number(b.dataset.color);document.querySelectorAll('[data-color]').forEach(a=>{a.classList.toggle('active',a===b);a.setAttribute('aria-pressed',String(a===b));});}));
  $('pause').addEventListener('click',togglePause);$('save').addEventListener('click',downloadPNG);$('another').addEventListener('click',randomSeedAndUpdate);
  $('studio-toggle').addEventListener('click',()=>toggleStudio());$('close-studio').addEventListener('click',()=>toggleStudio(false));
  $('camera-toggle').addEventListener('click',()=>{if(cameraSource.state==='live')cameraSource.stop();else{cameraSource.stop(false);clearPortraitInk();cameraSource.start();}});
  $('capture-portrait').addEventListener('click',()=>{if(cameraSource.capture())clearPortraitInk();});
  $('close-print').addEventListener('click',()=>$('print-dialog').close());
  $('grid').addEventListener('change',e=>{params.grid=e.target.checked;refreshGround();composite();});
  $('palette').addEventListener('change',setPalette);
  window.addEventListener('blur',pointerUp);
  document.addEventListener('visibilitychange',()=>{lastDraw=0;simulationDebt=0;resetFrameStats();if(document.hidden&&['live','requesting'].includes(cameraSource.state))cameraSource.stop();});
  window.addEventListener('pagehide',()=>cameraSource.stop(false));
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{announce('Fullscreen is unavailable in this browser');}});
  document.addEventListener('keydown',e=>{
    if($('print-dialog').open)return;
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.code==='Space'){e.preventDefault();togglePause();}
    else if(e.key==='Escape'){document.body.classList.remove('hide-ui');toggleStudio(false);}
    else if(e.key.toLowerCase()==='h')document.body.classList.toggle('hide-ui');
    else if(e.key.toLowerCase()==='s')downloadPNG();
    else if(spatialMode==='2d'&&e.key==='1')setTool('ink');else if(spatialMode==='2d'&&e.key==='2')setTool('water');
  });
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');reduced.addEventListener('change',e=>{if(e.matches){running=false;updatePause();}});
  if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('hide-ui');
});
