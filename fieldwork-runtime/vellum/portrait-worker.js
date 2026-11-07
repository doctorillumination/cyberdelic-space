/* The worker receives transient pixels, returns geometry, and never sends video off device. */
'use strict';
let portraitModels,faceDetector,personDetector,analysisCanvas,analysisContext,faceShapes;
function selectPersonMask(mask,width,height,anchor){
  const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),cx=(anchor?.x??.5)*width,cy=(anchor?.y??.4)*height;
  let chosen=[],best=-Infinity;
  for(let start=0;start<mask.length;start++){
    if(seen[start]||mask[start]<.5)continue;
    let head=0,tail=1,nearest=Infinity;queue[0]=start;seen[start]=1;const component=[];
    while(head<tail){
      const index=queue[head++],x=index%width,y=Math.floor(index/width);component.push(index);nearest=Math.min(nearest,(x-cx)**2+(y-cy)**2);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const px=x+dx,py=y+dy;if(px<0||py<0||px>=width||py>=height)continue;const next=py*width+px;
        if(!seen[next]&&mask[next]>=.5){seen[next]=1;queue[tail++]=next;}
      }
    }
    const score=(anchor&&nearest<16?1e9:0)+component.length/(1+nearest/(width*height*.02));
    if(component.length>=25&&score>best){best=score;chosen=component;}
  }
  const foreground=new Float32Array(mask.length);for(const index of chosen)foreground[index]=mask[index];return foreground;
}
function connectionPaths(connections){
  const edges=connections.map(({start,end})=>[start,end]),paths=[];
  while(edges.length){
    const degrees=new Map();for(const [a,b] of edges){degrees.set(a,(degrees.get(a)??0)+1);degrees.set(b,(degrees.get(b)??0)+1);}
    let current=[...degrees].find(([,degree])=>degree===1)?.[0]??edges[0][0];const path=[current];
    while(true){const index=edges.findIndex(([a,b])=>a===current||b===current);if(index<0)break;const [a,b]=edges.splice(index,1)[0];current=a===current?b:a;path.push(current);if(current===path[0])break;}
    if(path.length>2)paths.push(path);
  }
  return paths;
}
async function loadPortraitModels(){
  self.postMessage({type:'progress',message:'Loading local vision runtime…'});
  const {FilesetResolver,FaceLandmarker,ImageSegmenter}=await import('./vendor/mediapipe-1.2.0/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe-1.2.0/wasm',self.location.href).href);
  self.postMessage({type:'progress',message:'Preparing the face detector…'});
  faceDetector=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./vendor/mediapipe-1.2.0/face_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.65,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
  self.postMessage({type:'progress',message:'Preparing the person mask…'});
  personDetector=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./vendor/mediapipe-1.2.0/selfie_segmenter.tflite',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});
  faceShapes=[['oval',0,FaceLandmarker.FACE_LANDMARKS_FACE_OVAL],['eyes-left',0,FaceLandmarker.FACE_LANDMARKS_LEFT_EYE],['eyes-right',0,FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE],['brow-left',2,FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW],['brow-right',2,FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW],['lips',1,FaceLandmarker.FACE_LANDMARKS_LIPS]].flatMap(([name,color,connections])=>connectionPaths(connections).map((indices,index)=>({id:name+'-'+index,color,indices})));
  faceShapes.push({id:'nose-bridge',color:2,indices:[168,6,197,195,5,4,1,19,94,2]},{id:'nose-base',color:2,indices:[98,97,2,326,327]});
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){portraitModels??=loadPortraitModels();await portraitModels;self.postMessage({type:'ready'});return;}
    if(data.type==='clear'){if(analysisCanvas){analysisCanvas.width=1;analysisCanvas.height=1;}return;}
    if(data.type!=='frame')return;
    await portraitModels;
    analysisCanvas??=new OffscreenCanvas(data.width,data.height);
    if(analysisCanvas.width!==data.width||analysisCanvas.height!==data.height){analysisCanvas.width=data.width;analysisCanvas.height=data.height;}
    analysisContext??=analysisCanvas.getContext('2d',{willReadFrequently:true});
    analysisContext.putImageData(new ImageData(data.pixels,data.width,data.height),0,0);
    const face=faceDetector.detectForVideo(analysisCanvas,data.time).faceLandmarks[0]??[];
    const faceCurves=face.length?faceShapes.map(shape=>({id:shape.id,color:shape.color,points:shape.indices.map(index=>({x:face[index].x,y:face[index].y}))})):[];
    let mask,maskWidth,maskHeight;
    personDetector.segmentForVideo(analysisCanvas,data.time,result=>{const region=result.confidenceMasks.at(-1);mask=region.getAsFloat32Array().slice();maskWidth=region.width;maskHeight=region.height;});
    mask=selectPersonMask(mask,maskWidth,maskHeight,face[1]);
    analysisContext.clearRect(0,0,data.width,data.height);
    self.postMessage({type:'frame',id:data.id,faceCurves,faceFound:face.length>0,mask,maskWidth,maskHeight},[mask.buffer]);
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
if(typeof module!=='undefined')module.exports={selectPersonMask};
