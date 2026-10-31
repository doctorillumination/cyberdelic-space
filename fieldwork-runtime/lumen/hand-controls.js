export const MAX_HAND_APERTURE=4.5;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[sorted.length>>1];};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
const middle=values=>values[0].map((_,i)=>median(values.map(row=>row[i])));

export function measureHand(landmarks,world,aspect=4/3){
 if(!landmarks||landmarks.length!==21)return null;
 if(!landmarks.every(p=>[p.x,p.y].every(Number.isFinite)))return null;
 const imageDistance=(a,b)=>Math.hypot((landmarks[a].x-landmarks[b].x)*aspect,landmarks[a].y-landmarks[b].y);
 const bones=[[0,9],[0,13],[0,17],[9,17]];
 const imagePalm=median(bones.map(([a,b])=>imageDistance(a,b)));
 if(imagePalm<.025||imagePalm>1.2)return {valid:false,palm:imagePalm};
 // Visible fingertips remain usable when inferred 3D palm geometry is uncertain.
 const separation=imageDistance(4,8)/Math.max(imagePalm,.025);
 const fallback={valid:true,focusValid:false,palm:imagePalm,depthSamples:bones.map(([a,b])=>imageDistance(a,b)),facing:0,separation};
 if(!world||world.length!==21||!world.every(p=>[p.x,p.y,p.z].every(Number.isFinite)))return fallback;
 const u={x:world[5].x-world[0].x,y:world[5].y-world[0].y,z:world[5].z-world[0].z};
 const v={x:world[17].x-world[0].x,y:world[17].y-world[0].y,z:world[17].z-world[0].z};
 const normal=[u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x];
 const facing=Math.abs(normal[2])/Math.max(.000001,Math.hypot(...normal));
 const depthSamples=[];
 // Thumb and index joints move during a pinch and must not masquerade as a push.
 for(const [a,b] of bones){
  const projected=Math.hypot(world[a].x-world[b].x,world[a].y-world[b].y);
  if(projected<.008)return {...fallback,facing};
  depthSamples.push(imageDistance(a,b)*distance(world[a],world[b])/projected);
 }
 const palm=median(depthSamples);
 return {valid:true,focusValid:facing>=.5&&palm>=.04&&palm<=.85,palm,depthSamples,facing,separation};
}

function damp(value,velocity,target,dt,tau,rate){
 const omega=2/tau,delta=value-target,term=(velocity+omega*delta)*dt,decay=Math.exp(-omega*dt);
 const next=target+(delta+term)*decay;
 const limited=value+clamp(next-value,-rate*dt,rate*dt);
 return [limited,limited===next?(velocity-omega*term)*decay:(limited-value)/Math.max(dt,.00001)];
}

export class HandControls{
 constructor(){this.enabled=false;this.status='off';this.focusOffset=-.4;this.aperture=.64;this.detail=0;this.vFocus=0;this.vAperture=0;this.lastValid=-Infinity;}
 start({focusOffset=-.4,aperture=.64}={}){
  this.enabled=true;this.focusOffset=clamp(focusOffset,-1.1,1.1);this.aperture=clamp(aperture,0,MAX_HAND_APERTURE);
  this.detail=Math.pow(this.aperture/MAX_HAND_APERTURE,1/1.6);this.targetFocus=this.focusOffset;this.targetAperture=this.aperture;this.calibrate();
 }
 begin(phase){
  this.phase=phase;this.status='calibrating-'+phase;this.calibration=[];this.anchor=this.focusOffset;
  this.targetFocus=this.focusOffset;this.targetAperture=this.aperture;this.vFocus=this.vAperture=0;this.lastInput=null;this.lastValid=-Infinity;this.lastResult=null;this.resultInterval=.1;this.missingSince=null;
 }
 calibrate(){this.pinchOpen=null;this.pinchClosed=null;this.neutral=null;this.poseCorrection=[1,1,1,1];this.begin('open');}
 recentre(){if(this.pinchOpen===null||this.pinchClosed===null){this.calibrate();return;}this.begin('centre');}
 stop(){this.enabled=false;this.status='off';this.vFocus=this.vAperture=0;}
 hold(status){this.status=status;this.targetFocus=this.focusOffset;this.targetAperture=this.aperture;this.vFocus=this.vAperture=0;}
 closure(separation){
  const amount=clamp((this.pinchOpen-separation)/Math.max(.15,this.pinchOpen-this.pinchClosed),0,1);
  return amount<.025?0:amount>.975?1:amount;
 }
 calibrateSample(m,time){
  this.status='calibrating-'+this.phase;
  if(this.phase!=='pinch'&&!m.focusValid)return false;
  if(this.phase==='open'&&m.separation<.5)return false;
  // Learn contact only at contact, rather than capturing a pause halfway closed.
  if(this.phase==='pinch'&&m.separation>Math.min(.18,this.pinchOpen-.28))return false;
  const samples=this.calibration;
  // A rolling window tolerates occasional missed frames and natural hand tremor.
  while(samples.length&&time-samples[0].time>Math.max(1.4,this.resultInterval*10))samples.shift();
  if(samples.length&&(Math.abs(Math.log(m.palm/median(samples.map(s=>s.palm))))>.14||Math.abs(m.separation-median(samples.map(s=>s.separation)))>.22))samples.length=0;
  samples.push({...m,depthSamples:this.phase==='pinch'&&!m.focusValid?this.openDepth:m.depthSamples,time});while(samples.length>24)samples.shift();
  if(samples.length<Math.max(4,Math.min(8,Math.ceil(.65/this.resultInterval)))||time-samples[0].time<.65)return false;
  const separation=median(samples.map(s=>s.separation)),depth=middle(samples.map(s=>s.depthSamples));
  if(this.phase==='open'){
   this.pinchOpen=separation;this.openDepth=depth;this.phase='pinch';this.status='calibrating-pinch';this.calibration=[];return false;
  }
  if(this.phase==='pinch'){
   this.pinchClosed=separation;this.poseCorrection=depth.map((v,i)=>clamp(v/this.openDepth[i],.8,1.25));this.neutral=this.openDepth;
  }else{
   const amount=this.closure(separation);
   this.neutral=depth.map((value,i)=>value/Math.pow(this.poseCorrection[i],amount));
  }
  this.phase=null;this.calibration=[];this.filteredSeparation=separation;this.filteredTravel=0;this.lastInput=time;
  this.status='tracking';this.vFocus=this.vAperture=0;return true;
 }
 ingest(m,time){
  if(!this.enabled)return;
  if(this.lastResult!==null)this.resultInterval=clamp(this.resultInterval*.7+(time-this.lastResult)*.3,.05,2);
  this.lastResult=time;
  if(!m?.valid){
   if(this.phase){this.status='calibrating-'+this.phase;return;}
   this.missingSince??=time;
   // Only actual empty detections indicate absence. Slow inference is not loss.
   if(time-this.missingSince>.3)this.hold(m?'turn-palm':'holding');
   return;
  }
  this.lastValid=time;this.missingSince=null;
  if(this.phase&&!this.calibrateSample(m,time))return;
  const dt=clamp(time-(this.lastInput??time-.06),.001,1);this.lastInput=time;
  this.filteredSeparation+=(m.separation-this.filteredSeparation)*(1-Math.exp(-dt/.09));
  const amount=this.closure(this.filteredSeparation);this.detail=amount;
  this.targetAperture=MAX_HAND_APERTURE*Math.pow(amount,1.6);
  this.status=m.focusValid?'tracking':'focus-held';
  if(m.focusValid){
   const ratios=m.depthSamples.map((value,i)=>Math.log(value/(this.neutral[i]*Math.pow(this.poseCorrection[i],amount))));
   const travel=median(ratios);
   this.filteredTravel+=(travel-this.filteredTravel)*(1-Math.exp(-dt/.20));
   const clean=Math.sign(this.filteredTravel)*Math.max(0,Math.abs(this.filteredTravel)-.012);
   const focus=clamp(this.anchor+clean/Math.log(1.35),-1.05,1.05);
   if(Math.abs(focus-this.targetFocus)>.012)this.targetFocus=focus;
  }else{this.targetFocus=this.focusOffset;this.vFocus=0;}
 }
 step(elapsed,time){
  if(!this.enabled)return false;
  const timeout=Math.max(1.5,this.resultInterval*4);
  if(time-this.lastResult>timeout&&['tracking','focus-held'].includes(this.status))this.hold('holding');
  const dt=clamp(elapsed,0,.05),oldFocus=this.focusOffset,oldAperture=this.aperture;
  if(['tracking','focus-held'].includes(this.status)){
   if(this.status==='tracking')[this.focusOffset,this.vFocus]=damp(this.focusOffset,this.vFocus,this.targetFocus,dt,.24,1.2);
   [this.aperture,this.vAperture]=damp(this.aperture,this.vAperture,this.targetAperture,dt,.19,8);
  }
  const f=clamp(this.focusOffset,-1.1,1.1),a=clamp(this.aperture,0,MAX_HAND_APERTURE);
  if(f!==this.focusOffset)this.vFocus=0;if(a!==this.aperture)this.vAperture=0;
  this.focusOffset=f;this.aperture=a;
  return Math.abs(f-oldFocus)>1e-7||Math.abs(a-oldAperture)>1e-7;
 }
}
