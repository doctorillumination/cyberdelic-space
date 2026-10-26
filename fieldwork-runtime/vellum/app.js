'use strict';
const $ = id => document.getElementById(id);
const F = InkFlow, W = 1600, H = 1000;
const defaults = {water: .60, flow: .55, pace: 1.8, wildness: .5, pigment: .65, grid: true};
const query = new URLSearchParams(location.search);
let params = {...defaults}, seed = Math.max(1, Number(query.get('seed')) || 21);
let model, rng, particles = [], vortices = [], drops = [], tick = 0, running = query.get('paused')!=='1'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
let tool = 'ink', selectedColor = 0, pointer = null, penCounter = 0, ready = false;
let paper, ground, dry, wet, wash, gestureInk, grain, ctx, canvas, fluid = null, filaments = null, lastDraw = 0, simulationDebt = 0, statusTimer, hasGestureInk=false;
const P = InkPigments, COLOUR_STEPS = 28;
const PAINT_RGB=P.palettes.map((_,palette)=>Array.from({length:COLOUR_STEPS},(_,shade)=>P.sample(palette,shade/COLOUR_STEPS).join(',')));
let paletteIndex = 0;
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
  canvas=renderer.elt; canvas.id='artwork'; canvas.setAttribute('aria-label','Generative ink on warm paper. Choose Ink, Water, or Eddy, then click or drag on the paper.');
  ctx=canvas.getContext('2d');
  paper=surface();ground=surface();dry=surface();wet=surface();wash=surface();gestureInk=surface();grain=surface();
  canvas.addEventListener('pointerdown',pointerDown);
  canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);
  canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  initializeSystem(); ready=true;
  $('loading').hidden=true;
  frameRate(60);
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
  const b=model.circle;
  c.beginPath();c.arc(b.x,b.y,b.r+10,0,F.TAU);c.stroke();
  c.setLineDash([2,7]);c.beginPath();c.arc(b.x,b.y,b.r*.77,0,F.TAU);c.stroke();c.setLineDash([]);
  c.strokeStyle='rgba(76,77,63,.09)';
  for(let i=0;i<8;i++) {const a=rand()*F.TAU;c.beginPath();c.moveTo(b.x-Math.cos(a)*b.r*1.35,b.y-Math.sin(a)*b.r*1.35);c.lineTo(b.x+Math.cos(a)*b.r*1.3,b.y+Math.sin(a)*b.r*1.3);c.stroke();}
  for(let i=0;i<4;i++) {const x=i%2?W-56:55,y=i<2?68:H-68;c.beginPath();c.moveTo(x-12,y);c.lineTo(x+12,y);c.moveTo(x,y-12);c.lineTo(x,y+12);c.stroke();}
  c.restore();
}
function refreshGround(){const c=ground.getContext('2d');c.drawImage(paper,0,0);drawGrid(c);}
function spawn(path, t, color) {
  const p={path,t:t??rng(),lane:(rng()*2-1),phase:rng()*F.TAU,speed:.6+rng()*1.7,alpha:.5+rng()*.8,weight:.32+rng()*.58,color:color??path.color,age:rng()*1000,x:0,y:0,first:true};
  return p;
}
function initializeSystem() {
  lastDraw=0;simulationDebt=0;
  resetFrameStats();hasGestureInk=false;
  seed=Math.min(2147483647,Math.max(1,Math.floor(seed)||21));
  randomSeed(seed);noiseSeed(seed);rng=F.randomSource(seed+421);model=F.build(seed,W,H);particles=[];vortices=[];drops=[];tick=0;
  if(filaments){filaments.destroy();filaments=null;}
  if(fluid){fluid.destroy();fluid=null;}
  for(const c of [dry,wet,wash,gestureInk]) c.getContext('2d').clearRect(0,0,W,H);
  paperSurface();
  refreshGround();
  const weights=model.paths.map(p=>p.length*Math.pow(p.width,.63)),sum=weights.reduce((a,b)=>a+b,0);
  model.paths.forEach((p,i)=>{const n=Math.max(8,Math.round(weights[i]/sum*10500));for(let k=0;k<n;k++)particles.push(spawn(p));});
  // A restrained first wash makes the opening frame legible while ink keeps moving.
  for(let i=0;i<48;i++)advance(true);
  for(const p of model.pools)bloom(p.x,p.y,p.r*1.2);
  try{if(query.get('renderer')!=='canvas'){fluid=new WetInk(model);fluid.update(wet,params);fluid.warmVelocity(params);}document.documentElement.dataset.wetInk=fluid?'gpu':'canvas';}
  catch(error){document.documentElement.dataset.wetInk='canvas';console.info('Using the portable canvas ink renderer:',error.message);}
  try{if(fluid){filaments=new InkFilaments(model,fluid);filaments.render(tick,params,paletteIndex);}}
  catch(error){console.info('Using canvas filaments:',error.message);}
  document.documentElement.dataset.filaments=filaments?'gpu':'canvas';
  $('seed-input').value=seed; $('edition').textContent=String(seed).padStart(3,'0');
  const u=new URL(location.href);u.searchParams.set('seed',seed);history.replaceState(null,'',u);
  composite(); updatePause();
}
function fade(c,alpha) {
  const d=c.getContext('2d');d.save();d.globalCompositeOperation='destination-out';d.fillStyle=`rgba(0,0,0,${alpha})`;d.fillRect(0,0,W,H);d.restore();
}
function position(p) {
  const q=F.sample(p.path,p.t), width=p.path.width;
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
  else fade(wet,.006+(1-params.water)*.004);
  if(tick%3===0)fade(wash,.008);
  if(tick%8===0)fade(dry,.004);
  if(hasGestureInk)fade(gestureInk,.025);
  const wc=wet.getContext('2d'),dc=dry.getContext('2d'),ac=wash.getContext('2d'),gc=gestureInk.getContext('2d');
  const opacity=.10*(.4+params.pigment*1.25);
  const traces=new Array(COLOUR_STEPS*3),washes=tick%4===0?new Array(COLOUR_STEPS):null;
  let gestures=null;
  for(let i=0;i<particles.length;i++) {
    const p=particles[i];let q;
    if(p.free) {
      p.age++;const n=F.noise(p.x*.007,p.y*.007+tick*.0009,seed)*F.TAU*2;
      let vx=Math.cos(n)*.55,vy=Math.sin(n)*.55;
      for(const v of vortices) {const dx=p.x-v.x,dy=p.y-v.y,d=Math.hypot(dx,dy)||1,m=Math.exp(-d*d/(v.r*v.r))*v.life;vx-=dy*.025*m;vy+=dx*.025*m;}
      q={x:p.x+vx*(.5+params.flow)+p.vx,y:p.y+vy*(.5+params.flow)+p.vy};p.vx*=.985;p.vy*=.985;
      if(p.age>220+rng()*200){p.dead=true;continue;}
    } else {
      p.t+=(.65+params.flow*1.6)*p.speed/(p.path.length||1);
      if(p.t>=1){p.t-=1;p.first=true;}
      q=position(p);
    }
    const fixedColour=p.free?p.color:p.path.pigment;
    const phase=fixedColour==null?(paletteIndex===0?p.path.color/3:P.phaseAt(q.x/W,q.y/H,tick)):P.phaseForInk(paletteIndex,fixedColour);
    const shade=Math.min(COLOUR_STEPS-1,Math.floor(phase*COLOUR_STEPS));
    if(!p.first&&Math.hypot(q.x-p.x,q.y-p.y)<24) {
      const trace=traces[shade*3+i%3]??=new Path2D();trace.moveTo(p.x,p.y);trace.lineTo(q.x,q.y);
      if(p.free){gestures??=new Array(COLOUR_STEPS);const g=gestures[shade]??=new Path2D();g.moveTo(p.x,p.y);g.lineTo(q.x,q.y);hasGestureInk=true;}
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
    if(gestures&&gestures[shade]){gc.strokeStyle=`rgba(${rgb},.16)`;gc.lineWidth=.35;gc.stroke(gestures[shade]);}
  }
  if(tick%30===0)particles=particles.filter(p=>!p.dead);
  if(particles.length>18000){let excess=particles.length-18000;particles=particles.filter(p=>!p.free||excess--<=0);}
  for(const v of vortices)v.life*=.988;
  vortices=vortices.filter(v=>v.life>.02);
  if(pointer&&tool!=='eddy'&&!prewarm&&tick%2===0)applyGesture(pointer.x,pointer.y,pointer.dx*.4,pointer.dy*.4);
  for(const drop of drops) {
    hasGestureInk=true;
    const rgb=P.swatch(paletteIndex,drop.color).join(','),r=4+params.water*10;
    const gradient=wc.createRadialGradient(drop.x,drop.y,0,drop.x,drop.y,r);
    gradient.addColorStop(0,`rgba(${rgb},.26)`);gradient.addColorStop(.62,`rgba(${rgb},.11)`);gradient.addColorStop(1,`rgba(${rgb},0)`);
    wc.fillStyle=gradient;wc.beginPath();wc.arc(drop.x,drop.y,r,0,F.TAU);wc.fill();
    gc.fillStyle=gradient;gc.beginPath();gc.arc(drop.x,drop.y,r,0,F.TAU);gc.fill();
  }
  drops=[];
  if(fluid)fluid.update(wet,params,vortices,paint);
  if(filaments){if(paint)filaments.render(tick,params,paletteIndex);else filaments.advance(tick,params);}
}
function composite() {
  ctx.globalCompositeOperation='source-over';ctx.drawImage(ground,0,0);
  ctx.globalCompositeOperation='multiply';
  ctx.save();ctx.filter='blur(.8px)';ctx.globalAlpha=filaments ? .18 : .5;ctx.drawImage(wash,0,0);ctx.restore();
  ctx.globalAlpha=1;
  ctx.drawImage(fluid?fluid.canvas:wet,0,0,W,H);
  ctx.globalAlpha=filaments ? .08 : .45;ctx.drawImage(dry,0,0);ctx.globalAlpha=1;
  if(hasGestureInk)ctx.drawImage(gestureInk,0,0);
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';ctx.drawImage(grain,0,0);
}
function draw() {
  if(!ready||document.hidden)return;
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
  pointer={...p,dx:0,dy:0};canvas.setPointerCapture(e.pointerId);
  applyGesture(p.x,p.y,0,0);e.preventDefault();
}
function pointerMove(e) {
  const p=coordinates(e);$('cursor').style.left=e.clientX+'px';$('cursor').style.top=e.clientY+'px';
  if(pointer){const dx=p.x-pointer.x,dy=p.y-pointer.y;pointer={...p,dx,dy};if(tool!=='eddy')applyGesture(p.x,p.y,dx,dy);}
}
function pointerUp(){pointer=null;}
function bloom(x,y,r,color=null) {
  const c=wash.getContext('2d'),rgb=(color==null?P.sample(paletteIndex,P.phaseAt(x/W,y/H,tick)):P.swatch(paletteIndex,color)).join(','),g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${rgb},.10)`);g.addColorStop(.4,`rgba(${rgb},.075)`);g.addColorStop(.84,`rgba(${rgb},.035)`);g.addColorStop(1,`rgba(${rgb},0)`);
  c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,F.TAU);c.fill();
}
function applyGesture(x,y,dx,dy) {
  if(tool==='eddy') {
    const points=[],r=37+params.water*42;
    for(let k=0;k<=300;k++){const a=k/300*F.TAU,rr=r*(1+.012*Math.sin(a*7));points.push({x:x+Math.cos(a)*rr,y:y+Math.sin(a)*rr});}
    const p={points,width:4+params.water*6,color:selectedColor,length:F.TAU*r,closed:true,phase:rng()*F.TAU,ring:true,pigment:selectedColor};
    model.paths.push(p);model.pools.push({x,y,r,color:selectedColor});
    if(fluid)fluid.makeField(model);
    if(filaments)filaments.build(model);
    for(let i=0;i<500;i++)particles.push(spawn(p));
    vortices.push({x,y,r:r*2.5,life:2});bloom(x,y,r*.8,selectedColor);announce('Eddy placed');
  } else if(tool==='water') {
    vortices.push({x,y,r:95+params.water*90,life:Math.min(2,.5+Math.hypot(dx,dy)*.04)});
    if(vortices.length>18)vortices.shift();
  } else {
    if(drops.length<60)drops.push({x,y,color:selectedColor});
    const amount=pointer?45:110;
    for(let k=0;k<amount;k++) {
      const a=rng()*F.TAU,r=Math.sqrt(rng())*(6+params.water*15),px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
      particles.push({free:true,x:px,y:py,vx:Math.cos(a)*(.2+rng()*.8)+dx*.05,vy:Math.sin(a)*(.2+rng()*.8)+dy*.05,color:selectedColor,age:0,first:false});
    }
    if(penCounter++%4===0)bloom(x,y,15+params.water*14,selectedColor);
  }
  if(!running){for(let i=0;i<3;i++)advance(true);composite();}
}
function announce(text) {$('status').textContent=text;clearTimeout(statusTimer);statusTimer=setTimeout(()=>$('status').textContent='',2400);}
function setTool(value) {
  tool=value;document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});
  $('cursor').dataset.tool=tool;
  $('gesture-hint').textContent=tool==='ink'?'Touch the paper to release pigment':tool==='water'?'Drag through the ink to stir the water':'Touch the paper to place a circular eddy';
}
function updatePause() {$('pause').textContent=running?'Pause':'Let it flow';$('pause').setAttribute('aria-pressed',String(!running));$('flow-state').textContent=running?'INK IN MOTION':'A MOMENT HELD';resetFrameStats();$('fps').textContent=running?'Measuring frame rate…':'Paused';}
function togglePause(){running=!running;lastDraw=0;simulationDebt=0;updatePause();}
function parameterText(key,value){return key==='pace'?value.toFixed(1)+'×':Math.round(value*100)+'%';}
function updateParam(key,value){params[key]=Number(value);$(key+'-value').textContent=parameterText(key,params[key]);}
function updateSeed(){seed=Number($('seed-input').value)||seed;initializeSystem();}
function previousSeed(){seed=Math.max(1,seed-1);initializeSystem();}
function nextSeed(){seed++;initializeSystem();}
function randomSeedAndUpdate(){seed=crypto.getRandomValues(new Uint32Array(1))[0]%999999+1;initializeSystem();}
function resetParameters(){params={...defaults};for(const key of ['water','flow','pace','wildness','pigment']){$(key).value=params[key];$(key+'-value').textContent=parameterText(key,params[key]);}$('grid').checked=params.grid;paletteIndex=0;$('palette').value='0';setPalette();initializeSystem();}
function downloadPNG() {
  composite();const data=canvas.toDataURL('image/png');
  $('print-preview').src=data;$('print-download').href=data;$('print-download').download=`vellum-${seed}-${tick}.png`;
  $('print-dialog').showModal();
}
function toggleStudio(force) {
  const open=typeof force==='boolean'?force:!document.body.classList.contains('studio-open');
  document.body.classList.toggle('studio-open',open);$('studio-toggle').setAttribute('aria-expanded',String(open));$('studio').inert=!open;
  if(open)$('close-studio').focus();else $('studio-toggle').focus();
}
function updateSwatches() {
  const names=paletteIndex===0?['Blue ink','Orange ink','Green ink']:['Cool mineral ink','Warm earth ink','Moss ink'];
  document.querySelectorAll('[data-color]').forEach((b,i)=>{b.style.setProperty('--swatch',`rgb(${P.swatch(paletteIndex,i).join(',')})`);b.setAttribute('aria-label',names[i]);});
}
function setPalette(){
  paletteIndex=Number($('palette').value);updateSwatches();
  if(fluid&&filaments){fluid.pass('display',null,[fluid.ink[0]],params);filaments.render(tick,params,paletteIndex);composite();}
  announce('Palette changed');
}
window.addEventListener('DOMContentLoaded',()=>{
  $('studio').inert=true;
  for(const key of ['water','flow','pace','wildness','pigment']){$(key).value=params[key];$(key+'-value').textContent=parameterText(key,params[key]);}
  updateSwatches();
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{selectedColor=Number(b.dataset.color);document.querySelectorAll('[data-color]').forEach(a=>{a.classList.toggle('active',a===b);a.setAttribute('aria-pressed',String(a===b));});}));
  $('pause').addEventListener('click',togglePause);$('save').addEventListener('click',downloadPNG);$('another').addEventListener('click',randomSeedAndUpdate);
  $('studio-toggle').addEventListener('click',()=>toggleStudio());$('close-studio').addEventListener('click',()=>toggleStudio(false));
  $('close-print').addEventListener('click',()=>$('print-dialog').close());
  $('grid').addEventListener('change',e=>{params.grid=e.target.checked;refreshGround();composite();});
  $('palette').addEventListener('change',setPalette);
  window.addEventListener('blur',pointerUp);
  document.addEventListener('visibilitychange',()=>{lastDraw=0;simulationDebt=0;resetFrameStats();});
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{announce('Fullscreen is unavailable in this browser');}});
  document.addEventListener('keydown',e=>{
    if($('print-dialog').open)return;
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.code==='Space'){e.preventDefault();togglePause();}
    else if(e.key==='Escape'){document.body.classList.remove('hide-ui');toggleStudio(false);}
    else if(e.key.toLowerCase()==='h')document.body.classList.toggle('hide-ui');
    else if(e.key.toLowerCase()==='s')downloadPNG();
    else if(e.key==='1')setTool('ink');else if(e.key==='2')setTool('water');else if(e.key==='3')setTool('eddy');
  });
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');reduced.addEventListener('change',e=>{if(e.matches){running=false;updatePause();}});
  if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('hide-ui');
});
