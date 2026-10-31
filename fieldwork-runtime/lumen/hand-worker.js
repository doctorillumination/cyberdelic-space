let detector,backend;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const {FilesetResolver,HandLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
   const root=new URL('./vendor/mediapipe/',self.location.href);
   const files=await FilesetResolver.forVisionTasks(new URL('wasm',root).href);
   const options={baseOptions:{modelAssetPath:new URL('hand_landmarker.task',root).href,delegate:'GPU'},runningMode:'IMAGE',numHands:1,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5};
   const prepare=async()=>{
    detector=await HandLandmarker.createFromOptions(files,options);
    // Compile the palm detector before asking the viewer to begin calibration.
    const blank=new OffscreenCanvas(256,256);blank.getContext('2d').fillRect(0,0,256,256);
    const bitmap=await createImageBitmap(blank);
    try{detector.detect(bitmap);}finally{bitmap.close();}
   };
   try{await prepare();backend='GPU';}
   catch{detector?.close();options.baseOptions.delegate='CPU';await prepare();backend='CPU';}
   self.postMessage({type:'ready',backend});
  }else if(data.type==='frame'){
   if(!detector)throw Error('Hand tracking has not loaded.');
   // Scan the whole frame each time so a closed pinch cannot leave a stale hand crop.
   const started=performance.now();
   const result=detector.detect(data.bitmap);
   self.postMessage({type:'result',landmarks:result.landmarks[0]??null,world:result.worldLandmarks[0]??null,timestamp:data.timestamp,inferenceMs:performance.now()-started,backend});
  }
 }catch(error){self.postMessage({type:'error',message:error.message??String(error)});}
 finally{data.bitmap?.close();}
};
