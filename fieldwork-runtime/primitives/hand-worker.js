// The bundled model processes camera frames locally, away from the artwork renderer.
self.exports={};
importScripts('./vendor/vision_bundle.js');
let detector;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      const {FilesetResolver,HandLandmarker}=self.exports;
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
      detector=await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:new URL('./vendor/hand_landmarker.task',self.location.href).href,delegate:'CPU'},
        canvas:new OffscreenCanvas(640,480),runningMode:'VIDEO',numHands:2,
        minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6
      });
      self.postMessage({type:'ready'});
    }catch(error){self.postMessage({type:'error',name:error.name,phase:'init',message:error.message});}
  }else if(data.type==='frame'){
    try{
      const result=detector.detectForVideo(data.image,data.time);
      self.postMessage({type:'result',hands:result.landmarks||[],time:data.time});
    }catch(error){self.postMessage({type:'error',name:error.name,phase:'frame',message:error.message});}
    finally{data.image.close();}
  }
};
