(function(root){
  'use strict';
  const Gesture=(typeof module!=='undefined'?require('./hand-zoom.js'):root.PrimitivesHandZoom).Gesture;
  const segments=[[0,5],[5,9],[9,13],[13,17],[17,0],[0,1],[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
  function attach(input,elements,platform={}){
    const {video,button,panel,message,overlay,close,preview,retry}=elements,ctx=overlay.getContext('2d');
    const doc=platform.document||document,win=platform.window||window;
    const getMedia=platform.getUserMedia||(constraints=>navigator.mediaDevices.getUserMedia(constraints));
    const bitmap=platform.createImageBitmap||(source=>createImageBitmap(source));
    const createWorker=platform.createWorker||(()=>new Worker('hand-worker.js'));
    const gesture=new Gesture();
    let running=false,starting=false,recovering=false,generation=0,workerSerial=0,stream=null,worker=null,workerReady=false,raf=null,watchdog=null,inFlight=false,inFlightSince=0,lastCapture=0,lastVideo=-1,lastResult=0,lastFrame=0,lastTick=0,suspendUntil=0,manualPending=false,pendingReject=null,recoveryCount=0,captureFailures=0,nextCapture=0;
    function say(text,state){if(message.textContent!==text)message.textContent=text;panel.dataset.state=state;}
    function choose(on){button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Turn off camera':'Turn on hand zoom');button.title=on?'Turn off camera':'Turn on hand zoom';panel.hidden=!on;}
    function draw(hands){
      ctx.clearRect(0,0,overlay.width,overlay.height);ctx.strokeStyle='#faf9f3dd';ctx.fillStyle='#f5d864';ctx.lineWidth=1.8;
      for(const hand of hands){
        if(!Array.isArray(hand)||hand.length!==21||hand.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
        for(const [a,b]of segments){ctx.beginPath();ctx.moveTo(hand[a].x*overlay.width,hand[a].y*overlay.height);ctx.lineTo(hand[b].x*overlay.width,hand[b].y*overlay.height);ctx.stroke();}
        const p=[0,5,9,17].map(i=>hand[i]);ctx.beginPath();ctx.arc(p.reduce((s,p)=>s+p.x,0)*overlay.width/4,p.reduce((s,p)=>s+p.y,0)*overlay.height/4,5,0,Math.PI*2);ctx.fill();
      }
    }
    function stop(text=''){
      generation++;workerSerial++;const wasActive=running;running=false;starting=false;recovering=false;workerReady=false;choose(false);gesture.reset(input.getZoom());
      cancelAnimationFrame(raf);clearInterval(watchdog);raf=null;watchdog=null;
      pendingReject?.(new Error('cancelled'));pendingReject=null;
      stream?.getTracks().forEach(track=>track.stop());stream=null;
      video.pause();video.srcObject=null;video.load();worker?.terminate();worker=null;inFlight=false;
      ctx.clearRect(0,0,overlay.width,overlay.height);if(wasActive)input.release();
      if(retry)retry.hidden=true;say('', 'off');input.state?.(false);if(text)input.notify?.(text);
    }
    function diagnose(error,phase){console.warn(`[Primitives hand zoom: ${phase}]`,error);}
    function failure(error,phase){
      diagnose(error,phase);stop();
      const descriptions={NotAllowedError:'Camera access was declined. Allow the camera for this page, then try again.',NotFoundError:'No camera was found. Connect a camera, then try again.',NotReadableError:'The camera could not open. Close another camera session if it is using the camera, then try again.',AbortError:'Camera startup was interrupted. Try again.'};
      const summary=descriptions[error.name]||(phase==='tracker'?'The hand tracker could not start.':'Hand zoom could not start.');
      const detail=`${error.name||'Error'}: ${error.message||phase}`;
      panel.hidden=false;panel.dataset.error=detail;panel.dataset.phase=phase;
      say(`${summary} (${detail})`,'error');if(retry)retry.hidden=false;input.notify?.(summary);
    }
    function pause(ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pendingReject=null;resolve();},ms);pendingReject=error=>{clearTimeout(timer);reject(error);};});}
    function usableVideo(){return video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0;}
    function waitForVideo(){
      if(usableVideo())return Promise.resolve();
      return new Promise((resolve,reject)=>{
        const began=performance.now();let timer;
        function poll(){if(usableVideo()){pendingReject=null;resolve();}else if(performance.now()-began>10000){pendingReject=null;reject(new Error('The camera did not deliver a video frame.'));}else timer=setTimeout(poll,40);}
        pendingReject=error=>{clearTimeout(timer);reject(error);};poll();
      });
    }
    async function prepareWorker(run){
      workerReady=false;worker?.terminate();worker=createWorker();const serial=++workerSerial;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('The hand tracker took too long to start.')),30000);
        pendingReject=error=>{clearTimeout(timer);reject(error);};
        const error=raw=>{
          if(generation!==run||serial!==workerSerial)return;
          const problem=Object.assign(new Error(raw.message||'The hand tracker stopped.'),{name:raw.name||'TrackerError'});
          if(!workerReady){clearTimeout(timer);reject(problem);}else recover(problem,run);
        };
        worker.onmessage=({data})=>{
          if(generation!==run||serial!==workerSerial)return;
          if(data.type==='ready'){clearTimeout(timer);pendingReject=null;workerReady=true;resolve();}
          else if(data.type==='error')error(data);
          else if(data.type==='result')result(data,run);
        };
        worker.onerror=error;
        try{worker.postMessage({type:'init'});}catch(problem){clearTimeout(timer);reject(problem);}
      });
    }
    async function recover(error,run){
      if(generation!==run||!running||recovering)return;
      if(recoveryCount>=1){failure(error,'tracker');return;}
      recoveryCount++;recovering=true;workerReady=false;inFlight=false;gesture.lose();draw([]);
      diagnose(error,'reconnecting tracker');say('Reconnecting hand tracking. The view is held.','reconnecting');
      try{
        await prepareWorker(run);if(generation!==run)return;
        recovering=false;inFlight=false;lastResult=performance.now();lastCapture=0;lastVideo=-1;
      }catch(problem){if(generation===run)failure(problem,'tracker');}
    }
    function result(data,run){
      if(generation!==run||!running)return;
      inFlight=false;lastResult=performance.now();
      if(lastResult-data.time>250||lastResult<suspendUntil){gesture.lose();draw([]);return;}
      const hands=Array.isArray(data.hands)?data.hands:[];
      try{gesture.update(hands,data.time,video.videoWidth/video.videoHeight||4/3,input.getZoom());draw(hands);}
      catch(error){failure(error,'hand result');}
    }
    async function capture(now,run){
      if(!running||generation!==run)return;
      const dt=Math.max(0,Math.min(.05,lastTick?(now-lastTick)/1000:1/60));lastTick=now;
      if(now>=suspendUntil){
        if(manualPending){gesture.reset(input.getZoom());manualPending=false;}
        const view=gesture.sample(now,dt);
        try{input.zoom(view.zoom,view.still,dt);}catch(error){failure(error,'zoom');return;}
        if(!recovering)say(view.tracking?'Hands apart: wide. Hands together: close.':'View held. Show both hands to zoom.',view.tracking?'tracking':'searching');
      }
      if(workerReady&&!recovering&&!inFlight&&now>=nextCapture&&now-lastCapture>=40&&usableVideo()&&video.currentTime!==lastVideo){
        inFlight=true;inFlightSince=now;lastCapture=now;lastVideo=video.currentTime;
        try{
          const sampledAt=performance.now(),serial=workerSerial,image=await bitmap(video);
          if(!running||generation!==run){image.close();return;}
          if(serial!==workerSerial||!workerReady){image.close();inFlight=false;}
          else{try{worker.postMessage({type:'frame',image,time:sampledAt},[image]);}catch(error){image.close();throw error;}
            lastFrame=performance.now();captureFailures=0;}
        }catch(error){
          if(generation!==run)return;
          inFlight=false;lastVideo=-1;nextCapture=performance.now()+120;captureFailures++;
          if(captureFailures>=3){failure(error,'video frame');return;}
          diagnose(error,'retrying video frame');
        }
      }
      if(running&&generation===run)raf=requestAnimationFrame(time=>capture(time,run));
    }
    async function start(){
      if(running||starting)return;
      if(!(platform.getUserMedia||root.navigator?.mediaDevices?.getUserMedia)||!root.Worker||!root.OffscreenCanvas){failure(new Error('Open this local page in a recent Chrome browser to use hand zoom.'),'browser');return;}
      const run=++generation;let phase='camera';starting=true;recovering=false;recoveryCount=0;captureFailures=0;nextCapture=0;panel.dataset.error='';panel.dataset.phase='';if(retry)retry.hidden=true;
      choose(true);say('Allow the camera to use hand zoom.','starting');input.state?.(true);
      try{
        let acquired;
        for(let attempt=0;attempt<2;attempt++){
          try{acquired=await getMedia(attempt?{video:true,audio:false}:{video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:25,max:30},facingMode:'user'},audio:false});break;}
          catch(error){
            if(generation!==run)return;
            if(attempt===1||!['NotReadableError','AbortError','OverconstrainedError'].includes(error.name))throw error;
            diagnose(error,'retrying camera startup');say('Retrying camera startup…','starting');await pause(400);if(generation!==run)return;
          }
        }
        if(generation!==run){acquired.getTracks().forEach(track=>track.stop());return;}
        stream=acquired;stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(generation===run)stop('The camera disconnected. Mouse and trackpad still work.');},{once:true});
        phase='video';video.srcObject=stream;
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Camera playback timed out.')),10000);
          pendingReject=error=>{clearTimeout(timer);reject(error);};
          Promise.resolve(video.play()).then(()=>{clearTimeout(timer);resolve();},error=>{clearTimeout(timer);reject(error);});
        });
        pendingReject=null;if(generation!==run)return;await waitForVideo();if(generation!==run)return;
        phase='tracker';say('Preparing hand zoom…','starting');
        try{await prepareWorker(run);}catch(error){
          if(generation!==run)return;diagnose(error,'retrying tracker startup');say('Retrying hand tracker startup…','starting');await prepareWorker(run);
        }
        if(generation!==run)return;
        starting=false;running=true;inFlight=false;lastCapture=0;lastVideo=-1;lastTick=0;lastResult=performance.now();lastFrame=lastResult;suspendUntil=0;
        phase='zoom';manualPending=false;gesture.reset(input.getZoom());input.begin();say('Show both hands. Apart is wide, together is close.','searching');
        watchdog=setInterval(()=>{
          if(!running||doc.hidden||recovering||!workerReady)return;
          const now=performance.now();
          if(inFlight&&now-inFlightSince>10000)recover(new Error('The hand tracker stopped responding.'),run);
          else if(!inFlight&&now-lastFrame>15000)failure(new Error('The camera stopped delivering video frames.'),'video');
        },500);
        raf=requestAnimationFrame(time=>capture(time,run));
      }catch(error){
        if(generation!==run)return;
        failure(error,phase);
      }
    }
    function toggle(){if(running||starting)stop();else start();}
    function hidden(){if(doc.hidden&&(running||starting))stop('Camera off while you are away. Turn hand zoom on when ready.');}
    function exit(){stop();}
    function escape(event){if(event.key==='Escape'&&(running||starting||!panel.hidden))stop();}
    function fold(){const hidden=panel.dataset.preview==='hidden';panel.dataset.preview=hidden?'visible':'hidden';preview.setAttribute('aria-label',hidden?'Hide camera preview':'Show camera preview');preview.setAttribute('aria-expanded',String(hidden));}
    button.addEventListener('click',toggle);close.addEventListener('click',exit);preview.addEventListener('click',fold);retry?.addEventListener('click',start);
    doc.addEventListener('visibilitychange',hidden);win.addEventListener('pagehide',exit);win.addEventListener('keydown',escape);
    return {start,stop,get active(){return running;},get starting(){return starting;},manual(){
      if(running){suspendUntil=performance.now()+900;manualPending=true;gesture.reset(input.getZoom());input.cancel();}
    },dispose(){stop();button.removeEventListener('click',toggle);close.removeEventListener('click',exit);preview.removeEventListener('click',fold);retry?.removeEventListener('click',start);doc.removeEventListener('visibilitychange',hidden);win.removeEventListener('pagehide',exit);win.removeEventListener('keydown',escape);}};
  }
  root.PrimitivesHandInput=Object.freeze({attach});if(typeof module!=='undefined')module.exports={attach};
})(globalThis);
