export const HAND_FOCUS_BAND=.012;
const turn=(p,a,i,j)=>{const c=Math.cos(a),s=Math.sin(a),x=p[i],y=p[j];p[i]=c*x+s*y;p[j]=-s*x+c*y;};

export function fieldLocal(point,pose){
 const p=[...point];turn(p,pose.angle,0,2);turn(p,pose.tilt,1,2);turn(p,-.38,0,1);return p;
}
export function fieldWorld(point,pose){
 const p=[...point];turn(p,.38,0,1);turn(p,-pose.tilt,1,2);turn(p,-pose.angle,0,2);return p;
}

// The field renderer already stores primary-ray depth. Reuse that surface in
// object coordinates so a rotating, visible part can stay inside the pupil plane.
export function fieldFocusSamples(pixels,size,pose,viewport){
 const aspect=viewport.width/viewport.height,fit=Math.min(1,aspect/.9),samples=[];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,depth=pixels[i+3];
  if(depth<=0||!Number.isFinite(depth)||Math.max(pixels[i],pixels[i+1],pixels[i+2])<.008)continue;
  const p=[((x+.5)/size-.5)*aspect*depth*pose.lens/fit,((y+.5)/size-.5)*depth*pose.lens/fit,pose.distanceToEye-depth];
  samples.push({position:fieldLocal(p,pose),radius:.01});
 }
 return samples;
}

export function keepHandFocus(cloud,pose,viewport,engine='grains'){
 const aspect=viewport.width/viewport.height,fit=Math.min(1,aspect/.9),depths=[];
 for(const sample of cloud){
  let p;
  if(engine==='field')p=fieldWorld(sample.position,pose);
  else{p=[...sample.position];turn(p,.32+(pose.roll??0),0,1);turn(p,pose.angle,0,2);turn(p,pose.tilt,1,2);}
  const depth=pose.distanceToEye-p[2];
  if(depth<=0)continue;
  const x=p[0]/(depth*pose.lens)*fit/aspect,y=p[1]/(depth*pose.lens)*fit;
  if(Math.abs(x)>.46||Math.abs(y)>.46)continue;
  if(engine==='grains'&&sample.radius*viewport.height/(depth*pose.lens)*fit<.18)continue;
  depths.push(depth);
 }
 if(!depths.length)return {focus:pose.focus,focusBand:engine==='field'?0:HAND_FOCUS_BAND,sharpSamples:0,visible:0};
 depths.sort((a,b)=>a-b);
 // Stay near the requested hand depth. A small density preference avoids an
 // isolated dot, without sweeping focus independently of the person's hand.
 let best=depths[0],cost=Infinity,fallback=depths[0],fallbackCost=Infinity,left=0,right=0;
 const band=engine==='field'?.008:HAND_FOCUS_BAND;
 for(let i=0;i<depths.length;i++){
  const depth=depths[i];
  while(depths[left]<depth-band)left++;
  while(right<depths.length&&depths[right]<=depth+band)right++;
  const score=Math.abs(depth-pose.focus)+.002/Math.sqrt(right-left);
  if(score<fallbackCost){fallback=depth;fallbackCost=score;}
  if(right-left>=4&&score<cost){best=depth;cost=score;}
 }
 if(!Number.isFinite(cost))best=fallback;
 return {focus:best,focusBand:engine==='field'?0:HAND_FOCUS_BAND,sharpSamples:depths.filter(d=>Math.abs(d-best)<=band).length,visible:depths.length};
}

export const fieldDepthFragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 frag;
uniform sampler2D image;
void main(){ivec2 size=textureSize(image,0);frag=texelFetch(image,clamp(ivec2(uv*vec2(size)),ivec2(0),size-1),0);}
`;
