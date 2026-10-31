let detector,cpuDetector,backend,files,modelPath,emptySince=null,lastCpuProbe=-Infinity;
async function prepare(delegate){
 let instance;
 try{
  instance=await HandLandmarkerType.createFromOptions(files,{baseOptions:{modelAssetPath:modelPath,delegate},runningMode:'IMAGE',numHands:1,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5});
  const blank=new OffscreenCanvas(256,256);blank.getContext('2d').fillRect(0,0,256,256);
  const bitmap=await createImageBitmap(blank);
  try{instance.detect(bitmap);}finally{bitmap.close();}
  return instance;
 }catch(error){instance?.close();throw error;}
}
let HandLandmarkerType;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const {FilesetResolver,HandLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
   HandLandmarkerType=HandLandmarker;
   const root=new URL('./vendor/mediapipe/',self.location.href);
   files=await FilesetResolver.forVisionTasks(new URL('wasm',root).href);modelPath=new URL('hand_landmarker.task',root).href;
   // Compile the palm detector before asking the viewer to begin calibration.
   try{detector=await prepare('GPU');backend='GPU';}
   catch{detector=await prepare('CPU');backend='CPU';}
   self.postMessage({type:'ready',backend});
  }else if(data.type==='frame'){
   if(!detector)throw Error('Hand tracking has not loaded.');
   // Scan the whole frame each time so a closed pinch cannot leave a stale hand crop.
   const started=performance.now();
   let result=detector.detect(data.bitmap);
   // A GPU may initialize successfully yet return empty detections. Compare a
   // real frame on CPU before replacing it, without restarting the camera or dial.
   if(!result.landmarks[0]&&backend==='GPU'){
    emptySince??=started;
    if(started-emptySince>2200&&started-lastCpuProbe>3500){
     lastCpuProbe=started;
     try{
      cpuDetector??=await prepare('CPU');
      const comparison=cpuDetector.detect(data.bitmap);
      if(comparison.landmarks[0]){detector.close();detector=cpuDetector;cpuDetector=null;backend='CPU';result=comparison;}
     }catch{cpuDetector?.close();cpuDetector=null;}
    }
   }
   if(result.landmarks[0])emptySince=null;
   self.postMessage({type:'result',landmarks:result.landmarks[0]??null,world:result.worldLandmarks[0]??null,timestamp:data.timestamp,inferenceMs:performance.now()-started,backend});
  }
 }catch(error){self.postMessage({type:'error',message:error.message??String(error)});}
 finally{data.bitmap?.close();}
};
