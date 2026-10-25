const DEPTH_BINS=160;
const CELLS=8;
const SPAN=2.6;
export const FOCUS_BAND=.03;

export function createFocusCloud(model,maxSamples=6500){
 const count=model.baseCount??model.count;
 const stride=Math.max(1,Math.ceil(count/maxSamples));
 const samples=[];
 for(let i=0;i<count;i+=stride){
  const j=i*3;
  samples.push({position:model.positions.slice(j,j+3),normal:model.normals.slice(j,j+3),radius:model.radii[i]});
 }
 return samples;
}

// Match the three clockwise coordinate rotations in the grain vertex shader.
function rotated(point,trig){
 const [cr,sr,ca,sa,ct,st]=trig;
 const x=cr*point[0]+sr*point[1],y=-sr*point[0]+cr*point[1];
 const xx=ca*x+sa*point[2],z=-sa*x+ca*point[2];
 return [xx,ct*y+st*z,-st*y+ct*z];
}

export function trackFocus(tracker,cloud,pose,viewport,elapsed,advance=true){
 const aspect=viewport.width/viewport.height,fit=Math.min(1,aspect/.9);
 const trig=[Math.cos(.32+pose.roll),Math.sin(.32+pose.roll),Math.cos(pose.angle),Math.sin(pose.angle),Math.cos(pose.tilt),Math.sin(pose.tilt)];
 const histogram=new Uint16Array(DEPTH_BINS*CELLS*CELLS);
 const totals=new Uint16Array(DEPTH_BINS);
 const visible=[];
 let tracked=null;
 for(let index=0;index<cloud.length;index++){
  const sample=cloud[index],p=rotated(sample.position,trig),n=rotated(sample.normal,trig);
  const depth=pose.distanceToEye-p[2];
  const x=p[0]/(depth*(pose.lens??.255))*fit/aspect,y=p[1]/(depth*(pose.lens??.255))*fit;
  const radius=sample.radius*viewport.height/(depth*(pose.lens??.255))*fit;
  if(Math.abs(x)>.44||Math.abs(y)>.44||radius<.18)continue;
  const lit=Math.max(0,(-.8*n[0]+1.5*n[1]+1.3*n[2])/2.14);
  const edge=Math.pow(1-Math.abs(n[2]),1.6);
  const weight=(.2+lit*.6+edge*.4)*Math.min(3,radius*radius+ .2);
  const bin=Math.max(0,Math.min(DEPTH_BINS-1,Math.floor((p[2]+SPAN/2)/SPAN*DEPTH_BINS)));
  const cellX=Math.min(CELLS-1,Math.floor((x+.44)/.88*CELLS));
  const cellY=Math.min(CELLS-1,Math.floor((y+.44)/.88*CELLS));
  const cell=cellY*CELLS+cellX;
  histogram[cell*DEPTH_BINS+bin]++;totals[bin]++;
  const candidate={index,depth,bin,cell,weight};visible.push(candidate);
  if(index===tracker.index)tracked=candidate;
 }
 if(!visible.length)return {focus:pose.focus,index:-1,visible:0,sharpSamples:0};
 let accumulated=0,lowBin=0,highBin=DEPTH_BINS-1;
 for(let bin=0;bin<DEPTH_BINS;bin++){
  accumulated+=totals[bin];
  if(accumulated<visible.length*.18)lowBin=bin;
  if(accumulated<visible.length*.82)highBin=bin;
 }
 // Keep the sweep within the populated body, away from isolated front tips.
 const near=pose.distanceToEye-((highBin+.5)/DEPTH_BINS*SPAN-SPAN/2);
 const far=pose.distanceToEye-((lowBin+.5)/DEPTH_BINS*SPAN-SPAN/2);
 const desired=Math.max(near,Math.min(far,pose.focus));
 const density=c=>{
  const offset=c.cell*DEPTH_BINS;
  return histogram[offset+c.bin]+(c.bin>0?histogram[offset+c.bin-1]:0)+(c.bin<DEPTH_BINS-1?histogram[offset+c.bin+1]:0);
 };
 // Follow the previous grain as it rotates. Nearby replacements move the plane
 // toward its desired depth without sending it across an unoccupied gap.
 const reference=tracked?.depth??tracker.depth??pose.focus;
 const trackedStrong=tracked&&visible.reduce((count,c)=>count+(Math.abs(c.depth-tracked.depth)<=FOCUS_BAND?1:0),0)>=8;
 const travel=Math.max(0,Math.min(.1,elapsed))*.22+.0025;
 let best=null,bestScore=Infinity,fallback=null,fallbackScore=Infinity;
 for(const candidate of visible){
  const count=density(candidate);
  const score=Math.abs(candidate.depth-desired)+.012/(Math.sqrt(count)*candidate.weight+.1);
  const continuity=Math.abs(candidate.depth-reference);
  if(totals[candidate.bin]>=12&&count>=4&&(!tracked||continuity<=travel)&&(advance||candidate.index===tracker.index)&&score<bestScore){best=candidate;bestScore=score;}
  const fallbackCost=(tracked?continuity:Math.abs(candidate.depth-desired))+.012/(Math.sqrt(count)*candidate.weight+.1);
  if(totals[candidate.bin]>=12&&fallbackCost<fallbackScore){fallback=candidate;fallbackScore=fallbackCost;}
 }
 // A populated depth bin guarantees a visible group, rather than one lone dot.
 if(!fallback)fallback=visible.reduce((a,b)=>totals[b.bin]>totals[a.bin]?b:a);
 const target=(!advance&&trackedStrong)?tracked:best??(trackedStrong?tracked:null)??fallback;
 tracker.index=target.index;tracker.depth=target.depth;
 let sharpSamples=0;
 for(const candidate of visible)if(Math.abs(candidate.depth-target.depth)<=FOCUS_BAND)sharpSamples++;
 return {focus:target.depth,index:target.index,visible:visible.length,sharpSamples};
}
