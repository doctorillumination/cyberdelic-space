import * as THREE from './vendor/three.module.js';
import {LeanMotion} from './motion.js';
import {WorkshopSound} from './sound.js';
import {BakedViewer, bakedAssetURL} from './baked-viewer.js';

const stage=document.querySelector('#stage'),canvas=document.querySelector('#view'),loading=document.querySelector('#loading');
const announce=document.querySelector('#announcement'),button=document.querySelector('#sound'),label=document.querySelector('#sound-label');
const about=document.querySelector('#about'),aboutButton=document.querySelector('#about-button');
const sound=new WorkshopSound(),motion=new LeanMotion({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
const forward=new THREE.Vector3(),up=new THREE.Vector3();
let viewer,ready=false,pointer=null,lastTime=performance.now(),lastDraw=[Infinity,Infinity],resize=true,lastDiagnostics=0;
let roomSeconds=0,lastRoomDraw=0;
const frameTimes=[];

aboutButton.addEventListener('click',()=>about.showModal());
button.addEventListener('click',async()=>{
 try{const enabled=await sound.toggle();button.setAttribute('aria-pressed',String(enabled));
 button.setAttribute('aria-label',enabled?'Mute spatial sound':'Enable quiet spatial sound');label.textContent=enabled?'Sound on':'Sound off';
 announce.textContent=enabled?'Quiet spatial sound enabled.':'Sound muted.';}
 catch(error){announce.textContent=error.message;label.textContent='Sound unavailable';}
});
document.addEventListener('visibilitychange',()=>{
 lastTime=performance.now();
 sound.visibility(!document.hidden);
});
window.addEventListener('pagehide',()=>sound.visibility(false));
window.addEventListener('blur',()=>{if(pointer!==null){pointer=null;motion.end(performance.now());stage.classList.remove('dragging');}});

async function start(){
 const response=await fetch('./assets/baked/manifest.json', {cache:'no-cache'});if(!response.ok)throw new Error('The baked views could not load.');
 const manifest=await response.json();
 document.querySelector('.poster').src = bakedAssetURL(manifest, manifest.views[manifest.center].color);
 viewer=new BakedViewer(canvas,manifest);
 const box=stage.getBoundingClientRect();viewer.setSize(box.width,box.height);await viewer.start();
 ready=true;stage.classList.add('ready');loading.textContent='';
 new ResizeObserver(()=>{resize=true;}).observe(stage);
 if(motion.reduced)document.querySelector('#instruction').textContent='Drag to lean · Esc to return';
 lastTime=performance.now();
 requestAnimationFrame(tick);
}
function tick(now){
 const elapsed=Math.max(0,(now-lastTime)/1000),dt=Math.min(elapsed,.05);lastTime=now;
 if(ready&&!document.hidden){
  const [x,y]=motion.update(dt,now);const changed=resize||Math.abs(x-lastDraw[0])>1e-7||Math.abs(y-lastDraw[1])>1e-7;
  if(!motion.reduced){
   roomSeconds+=elapsed;
   if(roomSeconds-lastRoomDraw>=1/30||changed){
    viewer.setRoomTime(roomSeconds);lastRoomDraw=roomSeconds;
   }
  }
  if(changed){
   if(resize){const box=stage.getBoundingClientRect();viewer.setSize(box.width,box.height);resize=false;}
   viewer.setView(x,y);lastDraw=[x,y];
   if(dt<.05){frameTimes.push(dt*1000);if(frameTimes.length>90)frameTimes.shift();}
  }
  viewer.draw();
  viewer.camera.getWorldDirection(forward);up.set(0,1,0).applyQuaternion(viewer.camera.quaternion);
  sound.update(viewer.camera.position.toArray(),forward.toArray(),up.toArray());
  if(now-lastDiagnostics>500){
   const times=[...frameTimes].sort((a,b)=>a-b);
   stage.dataset.render=JSON.stringify({...viewer.diagnostics(),roomSeconds,medianFrameMs:times[Math.floor(times.length/2)]??null});
   stage.dataset.audio=JSON.stringify(sound.diagnostics());lastDiagnostics=now;
  }
 }
 requestAnimationFrame(tick);
}
stage.addEventListener('pointerdown',event=>{
 if(!ready||event.button!==0||pointer!==null)return;
 pointer=event.pointerId;stage.setPointerCapture(pointer);stage.classList.add('dragging');stage.focus({preventScroll:true});
 const box=stage.getBoundingClientRect();motion.begin(event.clientX,event.clientY,box.width,box.height);
});
stage.addEventListener('pointermove',event=>{if(event.pointerId===pointer)motion.drag(event.clientX,event.clientY);});
function release(event){if(event.pointerId!==pointer)return;pointer=null;motion.end(performance.now());stage.classList.remove('dragging');}
for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,release);
stage.addEventListener('keydown',event=>{
 if(!ready)return;const moves={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,.18],ArrowDown:[0,-.18]};
 if(moves[event.key]){event.preventDefault();motion.nudge(...moves[event.key],performance.now());}
 if(event.key==='Escape'||event.key==='Home'){event.preventDefault();motion.reset();announce.textContent='Returning to the original framing.';}
});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();ready=false;stage.classList.remove('ready');loading.textContent='Still image shown · Reload to explore the room';});
start().catch(error=>{console.error(error);loading.textContent='Still image shown · Interactive view unavailable';announce.textContent='The baked view could not load. The still image is shown.';});
