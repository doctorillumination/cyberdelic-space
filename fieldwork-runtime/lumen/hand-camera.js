// Camera ownership and inference are separate from gesture-to-lens mapping.
export class HandCamera{
 constructor({onResult,onEnded=()=>{}}){this.onResult=onResult;this.onEnded=onEnded;this.generation=0;this.stream=null;this.worker=null;this.enabled=false;}
 async start(video){
  const generation=++this.generation;this.enabled=true;
  const worker=new Worker(new URL('./hand-worker.js',import.meta.url));this.worker=worker;
  let armTimeout;
  const ready=new Promise((resolve,reject)=>{
   let timer;armTimeout=()=>{timer=setTimeout(()=>reject(Error('The local hand tracker took too long to load.')),25000);};
   this.cancelLoading=()=>{clearTimeout(timer);reject(new DOMException('Camera loading cancelled.','AbortError'));};
   worker.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);this.cancelLoading=null;resolve();}
    else if(data.type==='result'){this.busy=false;this.onResult(data);}
    else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message));this.busy=false;if(this.ready)this.onEnded(Error(data.message));}
   };
   worker.onerror=event=>{clearTimeout(timer);const error=Error(event.message||'This browser could not start the local hand tracker.');reject(error);if(this.ready)this.onEnded(error);};
  });
  // Attach a handler immediately, including while the permission prompt is open.
  ready.catch(()=>{});
  try{
   if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera access needs localhost or an HTTPS page.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:24}}});
   if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());throw new DOMException('Camera loading cancelled.','AbortError');}
   this.stream=stream;this.video=video;video.srcObject=stream;
   for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(this.enabled)this.onEnded(Error('The camera was disconnected.'));},{once:true});
   armTimeout();worker.postMessage({type:'init'});await Promise.all([ready,video.play()]);
   if(generation!==this.generation)throw new DOMException('Camera loading cancelled.','AbortError');
   this.ready=true;this.busy=false;this.lastFrame=-1;this.lastVideoTime=-1;
   const capture=async now=>{
    this.frame=requestAnimationFrame(capture);
    if(!this.enabled||document.hidden||this.busy||now-this.lastFrame<65||video.readyState<2)return;
    this.busy=true;this.lastFrame=now;this.lastVideoTime=video.currentTime;
    try{
     const bitmap=await createImageBitmap(video,{resizeWidth:640,resizeHeight:Math.round(640*video.videoHeight/video.videoWidth)});
     if(generation!==this.generation){bitmap.close();return;}
     worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
    }catch(error){this.busy=false;if(generation===this.generation)this.onEnded(error);}
   };
   this.frame=requestAnimationFrame(capture);
  }catch(error){if(generation===this.generation)this.stop();throw error;}
 }
 stop(){
  this.enabled=false;this.ready=false;++this.generation;cancelAnimationFrame(this.frame);this.cancelLoading?.();this.cancelLoading=null;
  this.worker?.terminate();this.worker=null;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
  if(this.video){this.video.pause();this.video.srcObject=null;}this.busy=false;
 }
}
