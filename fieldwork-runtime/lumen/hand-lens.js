import {HandControls,measureHand} from './hand-controls.js';
import {HandCamera} from './hand-camera.js';
import {HandGuide} from './hand-guide.js';
const $=id=>document.getElementById(id);
const messages={
 'calibrating-open':'Spread your thumb and index finger comfortably. Keep your palm facing the camera and hold still for a moment.',
 'calibrating-pinch':'Now touch thumb and index finger together and hold. Keep your hand at the same distance.',
 'calibrating-centre':'Hold your hand at a comfortable distance for a moment. Your finger range stays calibrated.',
 'focus-held':'Pinch control is active. Turn your palm towards the camera to resume push and pull focus.',
 tracking:'Open to see the whole. Pinch for detail. Push and pull to explore depth.',
 holding:'Lens held. Bring the same hand back into view to continue.',
 'turn-palm':'Lens held. Turn your palm towards the camera.',
 reacquiring:'Finding your hand again. The lens is held steady.'
};
export class HandLens{
 constructor({readLens,onChange,closeStudio}){
  this.errorMessage=null;this.readLens=readLens;this.onChange=onChange;this.controls=new HandControls();this.guide=new HandGuide();this.guideStage=null;this.pending=false;this.request=0;this.status='off';
  this.camera=new HandCamera({onResult:data=>{
   const video=$('hand-video');
   const measurement=measureHand(data.landmarks,data.world,video.videoWidth/Math.max(1,video.videoHeight));
   document.body.dataset.handDetection=data.landmarks?'visible':'not-found';
   document.body.dataset.handInferenceMs=String(Math.round(data.inferenceMs??0));
   document.body.dataset.handBackend=data.backend??'CPU';
   this.controls.ingest(measurement,performance.now()/1000);
   this.sync();
  },onEnded:error=>this.fail(error)});
  $('hands').onclick=()=>{closeStudio();this.panel($('hand-panel').hidden);};
  $('hand-close').onclick=()=>this.panel(false);$('hand-enable').onclick=()=>this.start();
  $('hand-stop').onclick=$('hand-quick-stop').onclick=()=>this.stop();
  $('hand-recentre').onclick=()=>{this.guide.start();this.controls.recentre();this.panel(false);this.sync();};
  $('hand-recalibrate').onclick=()=>{this.guide.start();this.controls.calibrate();this.panel(false);this.sync();};
  $('hand-guide-skip').onclick=()=>{this.guide.dismiss();this.syncGuide();};
  $('hand-guide-stop').onclick=()=>this.stop();
  $('hand-preview-toggle').onclick=()=>{const show=$('hand-preview-wrap').hidden;$('hand-preview-wrap').hidden=!show;$('hand-preview-toggle').setAttribute('aria-pressed',show);$('hand-preview-toggle').textContent=show?'Hide camera preview':'Show camera preview';};
  addEventListener('pagehide',()=>this.stop());this.sync();
 }
 get active(){return this.controls.enabled;}
 get busy(){return this.pending||this.active;}
 panel(open){$('hand-panel').hidden=!open;$('hands').setAttribute('aria-expanded',String(open));}
 async start(){
  if(this.busy)return;
  this.errorMessage=null;const request=++this.request;this.pending=true;this.status='loading';this.guide.start();this.panel(false);this.sync();
  try{
   await this.camera.start($('hand-video'));
   if(request!==this.request)return;
   this.controls.start(this.readLens());
   this.pending=false;this.sync();
  }catch(error){if(request===this.request&&error.name!=='AbortError')this.fail(error);}
 }
 fail(error){
  this.stop();this.status='error';
  const denied=error.name==='NotAllowedError'||error.name==='PermissionDeniedError';
  const missing=error.name==='NotFoundError'||error.name==='DevicesNotFoundError';
  this.errorMessage=denied?'Camera access was not allowed. You can enable it in your browser and try again.':missing?'No webcam was found. Connect one and try again.':error.name==='NotReadableError'?'The camera is busy. Close the other camera app and try again.':error.message;
  this.panel(true);this.sync();
 }
 stop(){
  this.errorMessage=null;++this.request;this.camera.stop();this.controls.stop();this.guide.reset();this.pending=false;this.status='off';
  $('hand-preview-wrap').hidden=true;$('hand-preview-toggle').setAttribute('aria-pressed','false');$('hand-preview-toggle').textContent='Show camera preview';this.sync();
 }
 tick(dt){const changed=this.controls.step(dt,performance.now()/1000);this.sync(false);this.syncGuide(dt);return changed;}
 syncGuide(dt=0){
  const view=this.guide.update(this.status,this.controls,dt),overlay=$('hand-guide');
  overlay.hidden=!view;document.body.classList.toggle('hand-guiding',!!view);
  if(!view){this.guideStage=null;return;}
  overlay.dataset.leaving=String(view.leaving);
  if(this.guideStage!==view.stage){
   this.guideStage=view.stage;overlay.dataset.step=view.stage;
   $('hand-guide-title').textContent=view.title;$('hand-guide-copy').textContent=view.text;
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches)overlay.querySelector('.hand-guide-words').animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,easing:'cubic-bezier(.2,.7,.2,1)'});
   $('hand-guide-count').textContent=view.step?'Hand lens · '+String(view.step).padStart(2,'0')+' / 04':'Hand lens';
   for(const [i,dot] of [...$('hand-guide-steps').children].entries())dot.dataset.complete=String(i<view.step);
   $('hand-guide-skip').hidden=!view.canDismiss;
  }
  if($('hand-guide-hint').textContent!==view.hint)$('hand-guide-hint').textContent=view.hint;
 }
 sync(notify=true){
  const status=this.errorMessage?'error':this.pending?'loading':this.active?this.controls.status:'off';
  const changed=status!==this.status;this.status=status;
  this.syncGuide();
  if(!notify&&!changed){
   if(this.active&&!$('hand-panel').hidden){$('hand-detail').value=this.controls.detail;$('hand-depth').value=(this.controls.focusOffset+1.05)/2.1;$('hand-detail-value').textContent=Math.round(this.controls.detail*100)+'%';}
   return;
  }
  const busy=this.busy;
  $('hand-enable').hidden=busy;$('hand-active-controls').hidden=!busy;$('hand-recentre').disabled=this.pending||this.controls.pinchClosed==null;$('hand-recalibrate').disabled=this.pending;
  $('hand-preview-toggle').hidden=!this.active;$('hand-readouts').hidden=!this.active;$('hand-indicator').hidden=!busy;
  $('hands').setAttribute('aria-pressed',String(busy));
  if(notify||changed){
  if(status==='error')$('hand-message').textContent=this.errorMessage;
  else if(status==='loading')$('hand-message').textContent='Allow camera access when prompted. Loading the local hand tracker…';
  else if(this.active)$('hand-message').textContent=messages[status]??messages['calibrating-open'];
  else $('hand-message').textContent='Enable the camera, then spread your thumb and index finger. Touch them together when prompted, keeping your hand at the same distance.';
  }
  const label=status==='tracking'?'Hand lens · Tracking':status==='focus-held'?'Hand lens · Focus held':status==='loading'?'Hand lens · Starting camera':status==='calibrating-open'?'Hand lens · Open fingers':status==='calibrating-pinch'?'Hand lens · Touch fingertips':status==='calibrating-centre'?'Hand lens · Re-centring':'Hand lens · Held';
  if($('hand-indicator-text').textContent!==label)$('hand-indicator-text').textContent=label;
  $('hand-detail').value=this.controls.detail;$('hand-depth').value=(this.controls.focusOffset+1.05)/2.1;$('hand-detail-value').textContent=Math.round(this.controls.detail*100)+'%';
  document.body.dataset.handLens=status;
  if(notify||changed)this.onChange();
 }
}
