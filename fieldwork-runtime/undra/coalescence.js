import { FIELD, MAX_PARTICLES } from './fluid.js?v=2.20.0';
import { GROW_MAX, BRUSH_RADIUS } from './play.js?v=2.20.0';

import { objectGLSL } from './objects.js?v=2.24.2';
export const MAX_POOL_DROPS = MAX_PARTICLES;
export const CONTACT_HOLD = .18;
export const SPLIT_COOLDOWN = .9;
export const LIQUID_CEILING = Math.cbrt(MAX_PARTICLES*GROW_MAX**3)*1.01+.15;
const wrap = value => value - FIELD * Math.round(value / FIELD);

export function initialPools(particles) {
  const count = particles.length, data = new Float32Array(count * 8);
  particles.forEach((particle,id) => {
    data.set([id,1,particle.r ** 3,0],id*4);
    data.set([-1,0,0,0],count*4+id*4);
  });
  return data;
}

export function poolDiagnostics(state,pools) {
  const count = state.length/16, groups = new Map();
  let volume = 0, initialVolume = 0, largestRadius = 0, widestPool = 0;
  for (let id=0;id<count;id++) {
    const root = Math.round(pools[id*4]), radius = state[id*4+2];
    if (!groups.has(root)) groups.set(root,[]);
    groups.get(root).push(id);
    volume += radius ** 3;
    largestRadius = Math.max(largestRadius,radius);
    if (id === root) initialVolume += pools[id*4+2];
  }
  const formed = [...groups].filter(([,members]) => members.length>1);
  for (const [root,members] of formed) for (const id of members) {
    widestPool = Math.max(widestPool,Math.hypot(wrap(state[id*4]-state[root*4]),wrap(state[id*4+1]-state[root*4+1])));
  }
  return { pools:formed.length, largestPool:Math.max(1,...formed.map(([,members]) => members.length)), largestRadius,
    widestPool, volumeError:Math.abs(volume/initialVolume-1), finite:[...state,...pools].every(Number.isFinite) };
}

export function coalescenceShaders(common) {
  const proposal = common+objectGLSL+`
uniform int uObjectHeld;uniform int uSelected;uniform int uBurstSelected;uniform vec2 uBurstVelocity;uniform vec4 uPointer;
uniform float uDt;uniform float uTime;uniform float uDance;uniform float uBrush;uniform bool uNewSelection;
void main(){
 bool requested=uBurstSelected>=0;
 int held=requested?uBurstSelected:uSelected;
 if(held<0 && uObjectHeld>=0 && !requested){
   float closest=.16;
   for(int j=0;j<COUNT;j++){if(j>=uCount)break;if(int(pool(j,0).x+.5)!=j)continue;
     vec4 p=row(j,0);float gap=objectFootprint(uObjectHeld,p.xy)-p.z;
     if(gap<closest){held=j;closest=gap;}
   }
 }
 if(held<0 && uBrush>.5){
   float closest=${BRUSH_RADIUS.toFixed(2)};
   for(int j=0;j<COUNT;j++){
     if(j>=uCount)break;
     if(int(pool(j,0).x+.5)!=j)continue;
     float d=length(wrap(row(j,0).xy-uPointer.xy));
     if(d<closest){closest=d;held=j;}
   }
 }
 if(held<0 || (!requested && uDance>.001)){gl_FragColor=vec4(-1,-1,0,0);return;}
 vec4 selectedPool=pool(held,0);int root=int(selectedPool.x+.5);
 vec4 position=row(root,0),contact=pool(root,1);
 vec2 drive=requested?uBurstVelocity:uObjectHeld>=0?uObjectMotion[uObjectHeld].xy:uPointer.zw*(uBrush>.5?.2:1.0);
 float speed=length(drive);
 bool ready=uTime>=selectedPool.w;
 bool splitting=selectedPool.y>1.5 && ready && requested;
 float pieces=clamp(floor(sqrt(selectedPool.y)),2.0,6.0);
 if(splitting){
   gl_FragColor=int(gl_FragCoord.x)==0?vec4(float(root),-1,0,-1):vec4(drive,0,pieces);return;
 }
 if(requested){gl_FragColor=vec4(-1,-1,0,0);return;}
 int candidate=-1;float nearest=1000.0;
 for(int j=0;j<COUNT;j++){
   if(j>=uCount)break;
   vec4 otherPool=pool(j,0);
   if(!ready || requested || speed>2.8 || j==root || int(otherPool.x+.5)!=j || uTime<otherPool.w ||
      selectedPool.y+otherPool.y>float(uCount))continue;
   vec4 other=row(j,0);float d=length(wrap(other.xy-position.xy)),rest=position.z+other.z;
   float gap=d/rest;
   if(d<=rest+.045 && gap<nearest){nearest=gap;candidate=j;}
 }
 float age=candidate>=0?uDt:0.0;
 if(!uNewSelection && candidate>=0 && abs(contact.x-float(candidate))<.5)age+=contact.y;
 gl_FragColor=int(gl_FragCoord.x)==0?vec4(float(root),float(candidate),age,candidate>=0?step(${CONTACT_HOLD.toFixed(2)},age):0.0):vec4(drive,0,pieces);
}`;
  const commit = common+`
uniform sampler2D uProposal;uniform sampler2D uBonds;uniform float uTime;
void main(){
 int id=int(gl_FragCoord.x),outRow=int(gl_FragCoord.y);
 if(id>=uCount){gl_FragColor=vec4(0);return;}
 vec4 metadata=pool(id,0),contact=pool(id,1),proposal=texelFetch(uProposal,ivec2(0),0);
 int root=int(metadata.x+.5),selected=int(round(proposal.x)),candidate=int(round(proposal.y));
 bool joining=proposal.w>.5;
 vec4 extra=texelFetch(uProposal,ivec2(1,0),0);
 bool splitting=proposal.w<-.5 && root==selected;
 if(splitting){
   int pieces=int(extra.w+.5),rank=0,rootRank=0,ordinal=0,leader=COUNT;
   for(int j=0;j<COUNT;j++){
     if(j>=uCount)break;
     if(int(pool(j,0).x+.5)!=root)continue;
     if(j<id)rank++;if(j<root)rootRank++;
   }
   int part=rank%pieces,rootPart=rootRank%pieces;
   float volume=0.0,count=0.0;
   for(int j=0;j<COUNT;j++){
     if(j>=uCount)break;
     if(int(pool(j,0).x+.5)!=root)continue;
     int otherPart=ordinal%pieces;ordinal++;
     if(otherPart!=part)continue;
     float r=texelFetch(uBonds,ivec2(j,1),0).z;
     volume+=r*r*r;count+=1.0;leader=min(leader,j);
   }
   if(part==rootPart)leader=root;
   if(outRow==0)gl_FragColor=vec4(float(leader),count,volume,uTime+${SPLIT_COOLDOWN.toFixed(1)});
   else gl_FragColor=vec4(-1,0,1,uTime+${SPLIT_COOLDOWN.toFixed(1)});
   return;
 }
 if(outRow==0){
   if(joining && (root==selected || root==candidate)){
     vec4 a=pool(selected,0),b=pool(candidate,0);
     metadata=vec4(float(selected),a.y+b.y,a.z+b.z,0);
   }
   gl_FragColor=metadata;
 }else{
   if(id==selected){contact.xy=joining?vec2(-1,0):proposal.yz;}
   if(joining){
     float danceGroup=texelFetch(uBonds,ivec2(id,0),0).x;
     float a=texelFetch(uBonds,ivec2(selected,0),0).x,b=texelFetch(uBonds,ivec2(candidate,0),0).x;
     if(abs(danceGroup-a)<.5 || abs(danceGroup-b)<.5)contact.z=1.0;
   }
   gl_FragColor=contact;
 }
}`;
  return { proposal,commit };
}
