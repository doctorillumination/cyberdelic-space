import * as THREE from './vendor/three.module.js';
import { Fluid, COUNT, FIELD, GRID, MAX_PARTICLES, validateCount } from './fluid.js?v=2.20.0';
import { vertex } from './shaders.js?v=2.24.2';
import { buildDanceGroups } from './dance.js';
import { initialPools, coalescenceShaders, LIQUID_CEILING, SPLIT_COOLDOWN } from './coalescence.js?v=2.20.0';
import { GROW_MIN, GROW_MAX, BRUSH_RADIUS, padRows, grownSplitPlan } from './play.js?v=2.20.0';
import { objectUniforms, objectGLSL, objectShader } from './objects.js?v=2.24.2';
const common=`precision highp float;precision highp int;varying vec2 vUv;uniform sampler2D uState;uniform sampler2D uPools;uniform int uCount;
const int COUNT=${MAX_PARTICLES}; const float FIELD=${FIELD.toFixed(1)}; const int GRID=${GRID};
vec4 row(int id,int r){return texelFetch(uState,ivec2(id,r),0);}
vec4 pool(int id,int r){return texelFetch(uPools,ivec2(id,r),0);}
vec2 wrap(vec2 p){return p-FIELD*floor(p/FIELD+.5);}`;
const simulation=`
uniform float uDt;uniform float uTime;uniform float uFlow;uniform float uViscosity;uniform float uTension;uniform float uDance;uniform float uDanceTime;uniform sampler2D uBonds;
uniform int uSelected;uniform vec2 uTarget;uniform vec4 uPointer;uniform float uHover;
uniform bool uPoolEvent;uniform sampler2D uOldPools;uniform sampler2D uProposal;
uniform float uBrush;uniform int uGrowId;uniform float uGrowRadius;
uniform int uStretchRoot;uniform float uStretch;uniform vec2 uStretchAxis;
${objectGLSL}
void main(){
 int id=int(gl_FragCoord.x),outRow=int(gl_FragCoord.y);
 if(id>=uCount){gl_FragColor=vec4(0);return;}
 vec4 pos=row(id,0),shape=row(id,1),motion=row(id,2),aux=row(id,3);
 vec4 bond=texelFetch(uBonds,ivec2(id,0),0),parcel=texelFetch(uBonds,ivec2(id,1),0);
 vec4 group=pool(id,0);int root=int(group.x+.5);
 bool pooled=group.y>1.5,follower=pooled && id!=root;
 int selectedRoot=uSelected>=0?int(pool(uSelected,0).x+.5):-1;
 bool selected=id==selectedRoot;
 vec2 p=pos.xy,velocity=motion.xy;
 vec4 event=texelFetch(uProposal,ivec2(0),0),burst=texelFetch(uProposal,ivec2(1,0),0);
 bool splitting=uPoolEvent && event.w<-.5 && int(texelFetch(uOldPools,ivec2(id,0),0).x+.5)==int(event.x+.5);
 vec2 scatter=vec2(0);
 if(splitting){
   int parent=int(event.x+.5),rank=0;
   for(int j=0;j<COUNT;j++){
     if(j>=uCount)break;
     if(j<id && int(texelFetch(uOldPools,ivec2(j,0),0).x+.5)==parent)rank++;
   }
   float part=float(rank%int(burst.w+.5));
   float angle=6.28318530718*(part/burst.w+fract(float(parent)*.41421356237));
   scatter=vec2(cos(angle),sin(angle));
   p=wrap(row(parent,0).xy+scatter*row(parent,0).z*.28);
   velocity=row(parent,2).xy*.45+burst.xy*.24+scatter*(1.4+length(burst.xy)*.18);
 }
 float danceWeight=smoothstep(0.0,.4,uDance)*(1.0-pool(id,1).z),beat=fract(uDanceTime/bond.w+bond.z);
 float merge=danceWeight*smoothstep(.06,.30,beat)*(1.0-smoothstep(.52,.82,beat));
 vec2 force=.12*uFlow*(1.0-danceWeight*.92)*vec2(sin(p.y*1.2+uTime*.42+aux.y*.15)+.4*cos(p.x*1.6-uTime*.3),cos(p.x*1.1+uTime*.31+aux.y*.15)-.4*sin(p.y*1.4-uTime*.38));
 // Nearby parcels gather along fixed local bonds, hold, and separate along the same short paths.
 vec2 destination=aux.zw+parcel.xy*(merge*.68);
 force+=wrap(destination-p)*mix(.035,5.0+uTension*3.0,danceWeight);
 if(follower)force=wrap(row(root,0).xy-p)*32.0+(row(root,2).xy-velocity)*9.0;
 if(splitting)force=vec2(0);
 int leader=int(bond.y+.5);vec4 leaderPos=row(leader,0);
 float leaderRadius=texelFetch(uBonds,ivec2(leader,1),0).z;
 float density=1.0,maxGroupGap=0.0;
 for(int j=0;j<COUNT;j++){
   if(j>=uCount)break;
   if(follower)break;
   vec4 other=row(j,0),otherBond=texelFetch(uBonds,ivec2(j,0),0),otherParcel=texelFetch(uBonds,ivec2(j,1),0);
   bool sameGroup=abs(otherBond.x-bond.x)<.5;
   if(sameGroup)maxGroupGap=max(maxGroupGap,length(wrap(other.xy-leaderPos.xy))/(otherParcel.z+leaderRadius));
   if(j==id)continue;
   vec2 delta=wrap(other.xy-p);float d=length(delta),rest=pos.z+other.z,h=max(rest,parcel.z+otherParcel.z)*1.8;
   if(d>=h || d<.00001)continue;
   vec4 otherPool=pool(j,0);
   if((otherPool.y>1.5 && int(otherPool.x+.5)!=j) || int(otherPool.x+.5)==root)continue;
   vec2 n=delta/d;float q=1.0-d/h;
   density+=q*q;
   float contact=sameGroup?mix(.97,.34,merge):.97;
   float pressure=max(0.0,rest*contact-d)*25.0;
   float cohesion=uTension*.12*max(0.0,1.0-abs(d/rest-1.1)/.65);
   force+=n*(cohesion-pressure)+(row(j,2).xy-velocity)*(uViscosity*2.2*q);
 }
 if(selected){force+=wrap(uTarget-p)*105.0+(uPointer.zw-velocity)*12.0;}
 else if(uHover>.5 && uSelected<0){
   vec2 delta=wrap(p-uPointer.xy);float d=length(delta);
   float influence=pow(max(0.0,1.0-d/(pos.z+.35)),2.0);
   force+=uPointer.zw*influence*2.5;
 }
 float brushed=0.0;
 if(uBrush>.5 && !follower){
   vec2 delta=wrap(uPointer.xy-p);
   brushed=1.0-smoothstep(.18,${BRUSH_RADIUS.toFixed(2)},length(delta));
   force+=(delta*.9-velocity)*brushed*3.2;
 }
 float objectContact=0.0;
 if(!follower)for(int body=0;body<6;body++){
   if(body>=uObjectCount)break;
   float gap=objectFootprint(body,p)-pos.z*.85;
   if(gap>=.10)continue;
   vec2 n=objectFootprintNormal(body,p),drive=uObjectMotion[body].xy;
   float contact=1.0-smoothstep(-.05,.10,gap);
   force+=n*min(90.0,max(0.0,-gap)*160.0)+(drive-velocity)*contact*16.0;
   objectContact=max(objectContact,contact);
 }
 float damping=exp(-uDt*(.95+uViscosity*1.8+danceWeight*.8));
 velocity=(velocity+force*uDt)*damping;
 float speed=length(velocity);float limit=selected || follower?6.0:mix(3.0,1.2,danceWeight);
 if(speed>limit)velocity*=limit/speed;
 vec2 next=wrap(p+velocity*uDt);
 float capillary=motion.w,capillaryV=aux.x;
 float goal=.16*sin(uTime*1.5+aux.y)*uFlow*(1.0-danceWeight)+min(.22,length(velocity)*.22)+objectContact*.10+merge*(1.0-merge)*.16;
 capillaryV+=(goal-capillary)*(18.0+uTension*40.0)*uDt;
 capillaryV*=exp(-uDt*(3.0+uViscosity*6.0));capillary+=capillaryV*uDt;
 float angle=motion.z;
 if(length(velocity)>.008){float desired=atan(velocity.y,velocity.x);float difference=atan(sin(desired-angle),cos(desired-angle));angle+=difference*min(1.0,uDt*8.0);}
 float stretch=1.0+clamp(capillary,-.15,.32);
 if(root==uStretchRoot){stretch=max(stretch,1.0+uStretch*.48);angle=atan(uStretchAxis.y,uStretchAxis.x);}

 // Transfer cubic parcel volume to the leading bead only while the cluster is in contact.
 float transfer=merge*(1.0-smoothstep(.50,1.08,maxGroupGap))*.92;
 float volume=parcel.z*parcel.z*parcel.z*(1.0-transfer)+(id==leader?parcel.w*transfer:0.0);
 if(pooled || pool(id,1).z>.5){
   // Keep a little volume in the following parcels while the combined surface rounds out.
   float goalVolume=pooled?parcel.z*parcel.z*parcel.z*.03+(id==root?group.z*.97:0.0):parcel.z*parcel.z*parcel.z;
   volume=mix(pos.z*pos.z*pos.z,goalVolume,1.0-exp(-uDt*8.0));
 }
 if(id==uGrowId)volume=uGrowRadius*uGrowRadius*uGrowRadius;
 float radius=pow(max(volume,.000001),1.0/3.0);
 if(outRow==0)gl_FragColor=vec4(next,radius,stretch);
 else if(outRow==1)gl_FragColor=vec4(cos(angle),sin(angle),clamp(.78-capillary*.20,.64,.92),density);
 else if(outRow==2)gl_FragColor=vec4(velocity,angle,capillary);
 else gl_FragColor=vec4(capillaryV,aux.y,splitting || selected || brushed>.01 || objectContact>.01?next:follower?row(root,3).zw:aux.zw);
}`;
const grid=`
void main(){
 ivec2 pixel=ivec2(gl_FragCoord.xy);int cx=pixel.x/2,cy=pixel.y;
 vec2 center=(vec2(cx,cy)+.5)/float(GRID)*FIELD-FIELD*.5;
 float distances[8];float ids[8];
 for(int k=0;k<8;k++){distances[k]=1000.0;ids[k]=-1.0;}
 for(int i=0;i<COUNT;i++){
   if(i>=uCount)break;
   vec4 p=row(i,0);float d=length(wrap(center-p.xy))-p.z*1.4;
   if(d>.75 || d>=distances[7])continue;
   int insert=7;
   for(int k=6;k>=0;k--){if(d<distances[k]){distances[k+1]=distances[k];ids[k+1]=ids[k];insert=k;}else break;}
   distances[insert]=d;ids[insert]=float(i);
 }
 // Keep the smooth-union order consistent when nearest-particle ranks change between cells.
 for(int i=1;i<8;i++){
   float value=ids[i];if(value<0.0)continue;int insert=i;
   for(int j=6;j>=0;j--){
     if(j>=i)continue;
     if(ids[j]<0.0 || ids[j]>value){ids[j+1]=ids[j];insert=j;}else break;
   }
   ids[insert]=value;
 }
 int base=(pixel.x%2)*4;gl_FragColor=vec4(ids[base],ids[base+1],ids[base+2],ids[base+3]);
}`;
const pick=`
uniform vec2 uPick;uniform vec3 uPickOrigin;uniform vec3 uPickDirection;
void main(){float closest=1000.0;int selected=-1;vec2 position=vec2(0);float height=0.0;
 for(int i=0;i<COUNT;i++){
   if(i>=uCount)break;
   vec4 group=pool(i,0);if(group.y>1.5 && int(group.x+.5)!=i)continue;
   vec4 p=row(i,0),shape=row(i,1);vec2 center=uPick+wrap(p.xy-uPick);
   vec3 delta=uPickOrigin-vec3(center,p.z*.09),direction=uPickDirection;
   vec3 q=vec3(dot(delta.xy,shape.xy),dot(delta.xy,vec2(-shape.y,shape.x)),delta.z);
   vec3 d=vec3(dot(direction.xy,shape.xy),dot(direction.xy,vec2(-shape.y,shape.x)),direction.z);
   vec3 radii=p.z*vec3(p.w,1.0/p.w,shape.z);q/=radii;d/=radii;
   float a=dot(d,d),b=dot(q,d),c=dot(q,q)-1.0,discriminant=b*b-a*c;
   if(discriminant<0.0)continue;float t=(-b-sqrt(discriminant))/a;
   float z=uPickOrigin.z+uPickDirection.z*t;
   if(t>0.0 && t<closest && z>=0.0){closest=t;selected=i;position=p.xy;height=z;}
 }
 gl_FragColor=vec4(float(selected),position,height);
}`;
const bounds=`
void main(){float height=.72;
 for(int i=0;i<COUNT;i++){if(i>=uCount)break;height=max(height,row(i,0).z*(row(i,1).z+.09)+.065);}
 gl_FragColor=vec4(min(height,${LIQUID_CEILING.toFixed(2)}),0,0,1);
}`;
const copy=`precision highp float;varying vec2 vUv;uniform sampler2D uState;void main(){gl_FragColor=texture2D(uState,vUv);}`;
const growState=common+`
uniform int uGrowId;uniform float uGrowRadius;uniform vec2 uGrowPoint;uniform float uGrowPhase;uniform bool uGrowInitialize;
void main(){
 int id=int(gl_FragCoord.x),r=int(gl_FragCoord.y);vec4 value=row(id,r);
 if(id==uGrowId){
   if(r==0){value.z=uGrowRadius;if(uGrowInitialize)value=vec4(wrap(uGrowPoint),uGrowRadius,1);}
   else if(uGrowInitialize){
     if(r==1)value=vec4(1,0,.78,1);
     else if(r==2)value=vec4(0);
     else value=vec4(0,uGrowPhase,wrap(uGrowPoint));
   }
 }
 gl_FragColor=value;
}`;
const growPool=common+`
uniform int uGrowId;uniform float uGrowRadius;uniform float uTime;
void main(){int id=int(gl_FragCoord.x),r=int(gl_FragCoord.y);
 gl_FragColor=id==uGrowId?(r==0?vec4(float(id),1,uGrowRadius*uGrowRadius*uGrowRadius,uTime+.35):vec4(-1,0,1,0)):pool(id,r);
}`;
const splitState=common+`
uniform int uSplitParent;uniform int uSplitFirst;uniform int uSplitPieces;uniform float uSplitRadius;
uniform vec2 uBurstVelocity;uniform sampler2D uBonds;
void main(){
 int id=int(gl_FragCoord.x),r=int(gl_FragCoord.y);
 int part=id==uSplitParent?0:id>=uSplitFirst && id<uSplitFirst+uSplitPieces-1?id-uSplitFirst+1:-1;
 if(part<0){gl_FragColor=row(id,r);return;}
 vec4 parent=row(uSplitParent,0);
 float angle=6.28318530718*(float(part)/float(uSplitPieces)+fract(float(uSplitParent)*.41421356237));
 vec2 scatter=vec2(cos(angle),sin(angle)),point=wrap(parent.xy+scatter*parent.z*.28);
 if(r==0)gl_FragColor=vec4(point,uSplitRadius,1.12);
 else if(r==1)gl_FragColor=vec4(scatter,.756,1);
 else if(r==2)gl_FragColor=vec4(row(uSplitParent,2).xy*.45+uBurstVelocity*.24+scatter*(1.4+length(uBurstVelocity)*.18),angle,.12);
 else gl_FragColor=vec4(0,texelFetch(uBonds,ivec2(id,0),0).z*6.28318530718,point);
}`;
const splitPool=common+`
uniform int uSplitParent;uniform int uSplitFirst;uniform int uSplitPieces;uniform float uSplitVolume;uniform float uTime;
void main(){
 int id=int(gl_FragCoord.x),r=int(gl_FragCoord.y);
 bool fragment=id==uSplitParent || (id>=uSplitFirst && id<uSplitFirst+uSplitPieces-1);
 gl_FragColor=fragment?(r==0?vec4(float(id),1,uSplitVolume,uTime+${SPLIT_COOLDOWN.toFixed(1)}):vec4(-1,0,1,uTime+${SPLIT_COOLDOWN.toFixed(1)})):pool(id,r);
}`;
function target(w,h){return new THREE.WebGLRenderTarget(w,h,{type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false});}
export class GPUFluid {
 constructor(renderer,seed=7351,count=COUNT,objects=null,{objectMode='soft'}={}){
   this.ownsObjects=!objects;objects ??= objectUniforms();
   this.baseCount=validateCount(count);this.count=count;this.capacity=MAX_PARTICLES;this.growing=null;
   const header=common,poolShaders=coalescenceShaders(header);
   this.renderer=renderer;this.seed=seed;this.time=0;this.danceTime=0;this.index=0;this.poolIndex=0;this.selected=-1;this.pendingBurst=null;
   this.scene=new THREE.Scene();this.camera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.scene.add(this.quad);
   this.states=[target(this.capacity,4),target(this.capacity,4)];this.grid=target(GRID*2,GRID);this.pickTarget=target(1,1);this.bounds=target(1,1);
   this.pools=[target(this.capacity,2),target(this.capacity,2)];this.poolProposal=target(2,1);this.impactTarget=target(1,1);this.impactEpoch=0;this.impactBusy=false;this.lastImpact=-Infinity;
   this.uniforms={uState:{value:null},uPools:{value:null},uOldPools:{value:null},uBonds:{value:null},uDt:{value:1/120},uTime:{value:0},uDanceTime:{value:0},uFlow:{value:.18},uViscosity:{value:.65},uTension:{value:.58},uDance:{value:0},uSelected:{value:-1},uTarget:{value:new THREE.Vector2()},uPointer:{value:new THREE.Vector4()},uHover:{value:0},uNewSelection:{value:false},uProposal:{value:this.poolProposal.texture},uPoolEvent:{value:false},uBurstSelected:{value:-1},uBurstVelocity:{value:new THREE.Vector2()}};
   Object.assign(this.uniforms,{uCount:{value:this.count},uBrush:{value:0},uGrowId:{value:-1},uGrowRadius:{value:GROW_MIN},uGrowPoint:{value:new THREE.Vector2()},uGrowPhase:{value:0},uGrowInitialize:{value:false}});
   Object.assign(this.uniforms,objects,{uStretchRoot:{value:-1},uStretch:{value:0},uStretchAxis:{value:new THREE.Vector2(1,0)},uObjectHeld:{value:-1}});
   Object.assign(this.uniforms,{uSplitParent:{value:-1},uSplitFirst:{value:0},uSplitPieces:{value:0},uSplitRadius:{value:0},uSplitVolume:{value:0}});
   this.stepMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:objectShader(header+simulation,objectMode),uniforms:this.uniforms});
   this.proposalMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:poolShaders.proposal,uniforms:this.uniforms});
   this.poolMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:poolShaders.commit,uniforms:this.uniforms});
   this.gridMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:header+grid,uniforms:{uState:{value:null},uCount:this.uniforms.uCount}});
   this.boundsMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:header+bounds,uniforms:{uState:{value:null},uCount:this.uniforms.uCount}});
   this.pickMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:header+pick,uniforms:{uState:{value:null},uPools:{value:null},uCount:this.uniforms.uCount,uPick:{value:new THREE.Vector2()},uPickOrigin:{value:new THREE.Vector3()},uPickDirection:{value:new THREE.Vector3()}}});
   this.growStateMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:growState,uniforms:this.uniforms});
   this.growPoolMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:growPool,uniforms:this.uniforms});
   this.splitStateMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:splitState,uniforms:this.uniforms});
   this.splitPoolMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:splitPool,uniforms:this.uniforms});
   this.impactMaterial=new THREE.ShaderMaterial({vertexShader:vertex,uniforms:this.uniforms,fragmentShader:objectShader(common+objectGLSL+`
     uniform float uTime;
     void main(){int chosen=-1;float closest=1000.0;vec2 drive=vec2(0);
       for(int body=0;body<6;body++){if(body>=uObjectCount)break;
         vec2 motion=uObjectMotion[body].xy;if(uObjectMotion[body].w>.5 || length(motion)<1.8)continue;
         for(int id=0;id<COUNT;id++){if(id>=uCount)break;vec4 group=pool(id,0),p=row(id,0);
           if(int(group.x+.5)!=id || p.z<.12 || uTime<max(group.w,pool(id,1).w))continue;
           float gap=objectFootprint(body,p.xy)-p.z;
           if(gap<.12 && gap<closest){closest=gap;chosen=id;drive=motion;}
         }
       }
       gl_FragColor=vec4(float(chosen),drive,1);
     }`,objectMode)});
   this.copyMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:copy,uniforms:{uState:{value:null}}});
   this.reset(seed);
 }
 get texture(){return this.states[this.index].texture;}
 get poolTexture(){return this.pools[this.poolIndex].texture;}
 draw(material,destination){this.quad.material=material;this.renderer.setRenderTarget(destination);this.renderer.render(this.scene,this.camera);}
 reset(seed=this.seed){
   this.count=this.baseCount;this.growing=null;this.uniforms.uCount.value=this.count;this.uniforms.uGrowId.value=-1;
   const count=this.count;
   this.seed=seed;this.time=0;this.danceTime=0;this.selected=-1;this.pendingBurst=null;this.impactEpoch++;this.lastImpact=-Infinity;this.uniforms.uStretchRoot.value=-1;const source=new Fluid(seed,count),data=new Float32Array(count*16);
   this.setTopology(buildDanceGroups(source.particles,seed));
   data.set(source.data);
   source.particles.forEach((p,i)=>{data.set([p.vx,p.vy,p.angle,p.capillary],count*8+i*4);data.set([p.capillaryV,p.phase,p.x,p.y],count*12+i*4);});
   const initial=new THREE.DataTexture(padRows(data,count,4,this.capacity),this.capacity,4,THREE.RGBAFormat,THREE.FloatType);initial.needsUpdate=true;
   this.copyMaterial.uniforms.uState.value=initial;this.states.forEach(t=>this.draw(this.copyMaterial,t));initial.dispose();this.index=0;this.rebuildGrid();
   this.uploadPools(initialPools(source.particles));
 }
 uploadPools(data){
   const source=new THREE.DataTexture(padRows(data,this.count,2,this.capacity),this.capacity,2,THREE.RGBAFormat,THREE.FloatType);source.needsUpdate=true;
   this.copyMaterial.uniforms.uState.value=source;this.pools.forEach(t=>this.draw(this.copyMaterial,t));source.dispose();this.poolIndex=0;
 }
 setTopology(topology){
   this.topology=topology;this.bonds?.dispose();
   this.bonds=new THREE.DataTexture(padRows(topology.data,this.count,2,this.capacity),this.capacity,2,THREE.RGBAFormat,THREE.FloatType);
   this.bonds.needsUpdate=true;this.uniforms.uBonds.value=this.bonds;
 }
 beginDrop(x,y){
   if(this.growing || this.count>=this.capacity)return -1;
   const id=this.count++,previous=this.topology.data,data=new Float32Array(this.count*8),group=this.topology.groups.length;
   const point=[x,y].map(v=>v-FIELD*Math.round(v/FIELD)),phase=(id*.61803398875)%1,volume=GROW_MIN**3;
   data.set(previous.subarray(0,id*4));data.set(previous.subarray(id*4),this.count*4);
   data.set([group,id,phase,8.6],id*4);data.set([0,0,GROW_MIN,volume],this.count*4+id*4);
   this.setTopology({data,groups:[...this.topology.groups,{leader:id,members:[id],center:point,volume,phase,period:8.6}]});
   this.growing={id,group,radius:GROW_MIN};
   const u=this.uniforms;u.uCount.value=this.count;u.uGrowId.value=id;u.uGrowRadius.value=GROW_MIN;u.uGrowPoint.value.fromArray(point);u.uGrowPhase.value=phase*Math.PI*2;u.uTime.value=this.time;
   this.patchDrop(true);
   return id;
 }
 growDrop(radius){
   if(!this.growing)return;
   this.growing.radius=Math.min(GROW_MAX,Math.max(GROW_MIN,Number.isFinite(radius)?radius:GROW_MIN));
   this.uniforms.uGrowRadius.value=this.growing.radius;
   this.topology.groups[this.growing.group].volume=this.growing.radius**3;
 }
 patchDrop(initialize=false){
   const u=this.uniforms;u.uGrowInitialize.value=initialize;u.uState.value=this.texture;u.uTime.value=this.time;
   let next=1-this.index;this.draw(this.growStateMaterial,this.states[next]);this.index=next;
   u.uPools.value=this.poolTexture;next=1-this.poolIndex;this.draw(this.growPoolMaterial,this.pools[next]);this.poolIndex=next;
 }
 finishDrop(){
   if(!this.growing)return;
   this.patchDrop();
   const {id,radius}=this.growing;this.topology.data.set([0,0,radius,radius**3],this.count*4+id*4);
   this.setTopology(this.topology);
   this.growing=null;this.uniforms.uGrowId.value=-1;this.rebuildGrid();
 }
 splitGrownDrop(id,velocity=[0,0]){
   if(!Number.isInteger(id) || id<0 || id>=this.count || this.growing)return false;
   const metadata=new Float32Array(8);
   this.renderer.readRenderTargetPixels(this.pools[this.poolIndex],id,0,1,2,metadata);
   if(Math.round(metadata[0])!==id || metadata[1]>1.5)return false;
   // Explicit breakup has its own cooldown, separate from the post-growth contact delay.
   if(this.time<metadata[7])return true;
   const plan=grownSplitPlan(metadata[2],this.capacity-this.count);
   if(!plan)return true;
   const first=this.count,previous=this.topology.data,parentGroup=Math.round(previous[id*4]);
   this.count+=plan.pieces-1;
   const data=new Float32Array(this.count*8),groups=this.topology.groups.map(group=>({...group,members:[...group.members]}));
   data.set(previous.subarray(0,first*4));data.set(previous.subarray(first*4),this.count*4);
   let fragmentGroup=parentGroup;
   if(groups[parentGroup].members.length>1){
     const remaining=groups[parentGroup].members.filter(member=>member!==id),volume=remaining.reduce((sum,member)=>sum+previous[first*4+member*4+2]**3,0);
     groups[parentGroup].members=remaining;groups[parentGroup].leader=remaining[0];groups[parentGroup].volume=volume;
     for(const member of remaining){data[member*4+1]=remaining[0];data[this.count*4+member*4+3]=volume;}
     fragmentGroup=groups.length;const phase=previous[id*4+2];
     data.set([fragmentGroup,id,phase,8.6],id*4);
     groups.push({leader:id,members:[id],center:[...groups[parentGroup].center],volume:plan.volume,phase,period:8.6});
   }else groups[parentGroup].volume=plan.volume;
   data.set([0,0,plan.radius,plan.volume],this.count*4+id*4);
   for(let child=first;child<this.count;child++){
     const group=groups.length,phase=(child*.61803398875)%1;
     data.set([group,child,phase,8.6],child*4);data.set([0,0,plan.radius,plan.volume],this.count*4+child*4);
     groups.push({leader:child,members:[child],center:[...groups[fragmentGroup].center],volume:plan.volume,phase,period:8.6});
   }
   this.setTopology({data,groups});
   const u=this.uniforms;u.uCount.value=this.count;u.uSplitParent.value=id;u.uSplitFirst.value=first;u.uSplitPieces.value=plan.pieces;
   u.uSplitRadius.value=plan.radius;u.uSplitVolume.value=plan.volume;u.uBurstVelocity.value.fromArray(velocity);u.uTime.value=this.time;
   u.uState.value=this.texture;let next=1-this.index;this.draw(this.splitStateMaterial,this.states[next]);this.index=next;
   u.uPools.value=this.poolTexture;next=1-this.poolIndex;this.draw(this.splitPoolMaterial,this.pools[next]);this.poolIndex=next;
   this.rebuildGrid();
   return true;
 }
 burst(id,velocity=[0,0]){if(!this.pendingBurst && Number.isInteger(id) && id>=0 && id<this.count)this.pendingBurst={id,velocity:[...velocity],start:null};}
 advanceBurst(){
   const u=this.uniforms;u.uStretchRoot.value=-1;u.uStretch.value=0;
   const request=this.pendingBurst;if(!request)return null;
   if(request.start===null){
     const metadata=new Float32Array(8);this.renderer.readRenderTargetPixels(this.pools[this.poolIndex],request.id,0,1,2,metadata);
     const root=Math.round(metadata[0]);
     if((metadata[1]>1.5 && this.time<metadata[3]) || this.time<metadata[7]){this.pendingBurst=null;return null;}
     if(metadata[1]<1.5 && (!grownSplitPlan(metadata[2],this.capacity-this.count))){this.pendingBurst=null;return null;}
     request.id=root;request.start=this.time;request.axis=Math.hypot(...request.velocity)>.1?request.velocity:[Math.cos(root*2.4),Math.sin(root*2.4)];
   }
   const progress=Math.min(1,(this.time-request.start)/.28);
   if(progress>=1){this.pendingBurst=null;return request;}
   u.uStretchRoot.value=request.id;u.uStretch.value=progress*progress*(3-2*progress);u.uStretchAxis.value.fromArray(request.axis);
   return null;
 }
 checkImpact(){
   if(this.impactBusy || this.pendingBurst || this.growing || this.time-this.lastImpact<.14)return;
   const motion=this.uniforms.uObjectMotion.value;
   let fast=false;for(let body=0;body<this.uniforms.uObjectCount.value;body++)if(motion[body*4+3]<.5 && Math.hypot(motion[body*4],motion[body*4+1])>1.8)fast=true;
   if(!fast)return;
   this.lastImpact=this.time;this.uniforms.uState.value=this.texture;this.uniforms.uPools.value=this.poolTexture;
   this.draw(this.impactMaterial,this.impactTarget);const epoch=this.impactEpoch;this.impactBusy=true;
   const job=this.renderer.readRenderTargetPixelsAsync(this.impactTarget,0,0,1,1,new Float32Array(4));
   const gl=this.renderer.getContext();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
   job.then(data=>{
     if(epoch===this.impactEpoch && data[0]>=0)this.burst(Math.round(data[0]),[data[1],data[2]]);
   }).catch(()=>{}).finally(()=>{this.impactBusy=false;});
 }
 step(dt,settings,pointer){
   this.time+=dt;if(settings.dance>.001)this.danceTime+=dt*(.65+settings.dance*.7);
   let release=this.advanceBurst();
   if(release && this.splitGrownDrop(release.id,release.velocity))release=null;
   const u=this.uniforms;u.uState.value=this.texture;u.uDt.value=dt;u.uTime.value=this.time;u.uDanceTime.value=this.danceTime;u.uFlow.value=settings.flow;u.uViscosity.value=settings.viscosity;u.uTension.value=settings.tension;u.uDance.value=settings.dance ?? 0;
   u.uSelected.value=pointer.selected;u.uTarget.value.set(pointer.targetX,pointer.targetY);u.uPointer.value.set(pointer.x,pointer.y,pointer.vx,pointer.vy);u.uHover.value=pointer.hover && !(pointer.object>=0)?1:0;
   u.uPools.value=this.poolTexture;u.uNewSelection.value=pointer.selected!==this.selected;this.selected=pointer.selected;
   u.uOldPools.value=this.poolTexture;
   u.uBrush.value=pointer.active && pointer.gather?1:0;
   u.uObjectHeld.value=pointer.active && pointer.object>=0?pointer.object:-1;
   if(this.growing){
     const nextPool=1-this.poolIndex;this.draw(this.growPoolMaterial,this.pools[nextPool]);this.poolIndex=nextPool;u.uPools.value=this.poolTexture;u.uOldPools.value=this.poolTexture;
   }
   u.uBurstSelected.value=release?.id ?? -1;
   u.uBurstVelocity.value.fromArray(release?.velocity ?? [0,0]);
   u.uPoolEvent.value=!this.growing && (!!release || (!this.pendingBurst && (pointer.selected>=0 || u.uBrush.value>.5 || u.uObjectHeld.value>=0) && u.uDance.value<=.001));
   if(u.uPoolEvent.value){
     this.draw(this.proposalMaterial,this.poolProposal);
     const nextPool=1-this.poolIndex;this.draw(this.poolMaterial,this.pools[nextPool]);this.poolIndex=nextPool;u.uPools.value=this.poolTexture;
   }
   const next=1-this.index;this.draw(this.stepMaterial,this.states[next]);this.index=next;
   if(pointer.active && pointer.object>=0)this.checkImpact();
 }
 rebuildGrid(){
   this.gridMaterial.uniforms.uState.value=this.texture;this.draw(this.gridMaterial,this.grid);
   this.boundsMaterial.uniforms.uState.value=this.texture;this.draw(this.boundsMaterial,this.bounds);
 }
 pickRay(ray,floorPoint){
   const u=this.pickMaterial.uniforms;u.uState.value=this.texture;u.uPools.value=this.poolTexture;u.uPick.value.set(floorPoint[0],floorPoint[1]);
   u.uPickOrigin.value.fromArray(ray.origin);u.uPickDirection.value.fromArray(ray.direction);this.draw(this.pickMaterial,this.pickTarget);
   const data=new Float32Array(4);this.renderer.readRenderTargetPixels(this.pickTarget,0,0,1,1,data);return {id:Math.round(data[0]),x:data[1],y:data[2],height:data[3]};
 }
 inspect(){const data=new Float32Array(this.count*16);this.renderer.readRenderTargetPixels(this.states[this.index],0,0,this.count,4,data);return data;}
 inspectPools(){const data=new Float32Array(this.count*8);this.renderer.readRenderTargetPixels(this.pools[this.poolIndex],0,0,this.count,2,data);return data;}
 cancelImpact(){this.impactEpoch++;}
 checkpoint(){return { count:this.count,topology:{data:this.topology.data.slice(),groups:JSON.parse(JSON.stringify(this.topology.groups))},data:this.inspect(),pools:this.inspectPools(),time:this.time,danceTime:this.danceTime, pendingBurst:this.pendingBurst?JSON.parse(JSON.stringify(this.pendingBurst)):null };}
 restore(checkpoint){
   const count=checkpoint.count ?? this.count;
   if(!Number.isInteger(count) || count<this.baseCount || count>this.capacity || checkpoint.data.length!==count*16 || (checkpoint.pools && checkpoint.pools.length!==count*8) || (count!==this.count && !checkpoint.topology) || (checkpoint.topology && checkpoint.topology.data.length!==count*8))throw new RangeError('The saved field has a different droplet amount.');
   this.count=count;this.uniforms.uCount.value=count;
   if(checkpoint.topology)this.setTopology({data:checkpoint.topology.data.slice(),groups:JSON.parse(JSON.stringify(checkpoint.topology.groups))});
   const source=new THREE.DataTexture(padRows(checkpoint.data,this.count,4,this.capacity),this.capacity,4,THREE.RGBAFormat,THREE.FloatType);source.needsUpdate=true;
   this.copyMaterial.uniforms.uState.value=source;this.states.forEach(state=>this.draw(this.copyMaterial,state));source.dispose();
   if(checkpoint.pools)this.uploadPools(checkpoint.pools);
   this.index=0;this.time=checkpoint.time;this.danceTime=checkpoint.danceTime;this.selected=-1;this.pendingBurst=checkpoint.pendingBurst?JSON.parse(JSON.stringify(checkpoint.pendingBurst)):null;this.impactEpoch++;this.rebuildGrid();
 }
 dispose(){
   this.impactEpoch++;this.renderer.setRenderTarget(null);
   for(const resource of [...this.states,...this.pools,this.grid,this.pickTarget,this.bounds,this.poolProposal,this.impactTarget,this.bonds,
     this.stepMaterial,this.impactMaterial,this.proposalMaterial,this.poolMaterial,this.gridMaterial,this.boundsMaterial,this.pickMaterial,this.copyMaterial,this.growStateMaterial,this.growPoolMaterial,this.splitStateMaterial,this.splitPoolMaterial,this.quad.geometry])resource.dispose();
   if(this.ownsObjects){this.uniforms.uObjectWarp.value.dispose();this.uniforms.uObjectMesh.value.dispose();}
   this.scene.clear();
 }
}
