import * as THREE from './vendor/three.module.js';
import { SOFT_GRID, WARP_GRID, softTemplate, createSoftState, stepSoft, meshVolume, writeWarp, sampleWarp } from './soft-body.js?v=2.20.0';
import { MESH_WIDTH, createSkin, updateSkin, writeSkin, skinRay, softMeshGLSL } from './soft-surface.js?v=2.20.0';
import { selectObjectFeatures, pruneShader } from './shader-tools.js?v=2.24.2';
export const MAX_OBJECTS = 6;
export const SHAPES = ['sphere','cube','capsule','soft'];
export const JELLY_FINISHES = ['opal','sorbet','satin'];
const dimensions = [[.55,.55,.55],[.56,.56,.48],[.92,.34,.34],[.84,.69,.33]];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const warpSize=WARP_GRID**3*4;
export function objectUniforms() {
  const texture=new THREE.Data3DTexture(new Uint16Array(warpSize*MAX_OBJECTS),WARP_GRID,WARP_GRID,WARP_GRID*MAX_OBJECTS);
  texture.type=THREE.HalfFloatType;texture.format=THREE.RGBAFormat;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  const mesh=new THREE.DataTexture(new Float32Array(MESH_WIDTH*MAX_OBJECTS*4),MESH_WIDTH,MAX_OBJECTS,THREE.RGBAFormat,THREE.FloatType);mesh.needsUpdate=true;
  return {uObjectMesh:{value:mesh},uObjectCount:{value:0},uObjectClarity:{value:new Float32Array(MAX_OBJECTS)},uObjectFinish:{value:new Float32Array(MAX_OBJECTS)},uObjectPose:{value:new Float32Array(MAX_OBJECTS*4)},uObjectSize:{value:new Float32Array(MAX_OBJECTS*4)},uObjectMotion:{value:new Float32Array(MAX_OBJECTS*4)},uObjectBounds:{value:new Float32Array(MAX_OBJECTS*4)},uObjectWarp:{value:texture}};
}
function local(body,x,y,z=body.size[2]){
  const c=Math.cos(body.angle),s=Math.sin(body.angle),dx=x-body.x,dy=y-body.y;
  return [c*dx+s*dy,-s*dx+c*dy,z-body.size[2]];
}
export function primitiveDistance(kind,size,q){
  q=[...q];
  if(kind===1){const a=q.map((v,i)=>Math.abs(v)-size[i]+.13);return Math.hypot(...a.map(v=>Math.max(v,0)))+Math.min(Math.max(...a),0)-.13;}
  if(kind===2)q[0]-=clamp(q[0],-size[0]+size[1],size[0]-size[1]);
  const radii=kind===2?[size[1],size[1],size[2]]:size;
  const k0=Math.hypot(...q.map((v,i)=>v/radii[i])),k1=Math.hypot(...q.map((v,i)=>v/radii[i]**2));
  return k1>.000001?k0*(k0-1)/k1:-Math.min(...radii);
}
const fields=new WeakMap(),skins=new WeakMap();
export function restDistance(body,q){
  if(!body.soft)return primitiveDistance(body.kind,body.size,q);
  const shaped=[q[0],q[1],(q[2]+body.size[2]*.35)/1.35];
  return Math.max(primitiveDistance(body.kind,body.size,shaped),-q[2]-body.size[2]);
}
function skin(body){
  let value=skins.get(body);if(!value){const t=template(body);value=createSkin(t,q=>restDistance(body,q),body.size);t.surfaceSamples=value.contactSamples;skins.set(body,value);}return value;
}
function template(body){
  const t=softTemplate(body.kind,body.size,q=>restDistance(body,q));t.restHeight=body.size[2];return t;
}
function warp(body){
  let field=fields.get(body);if(!field){field=new Float32Array(warpSize);fields.set(body,field);}return field;
}
export function objectDistance(body,x,y,z){
  const p=local(body,x,y,z);let q=[...p];
  if(body.soft && body.deformation && body.compression>.0001){
    const span=template(body).span,field=warp(body);
    // Relaxed inverse deformation. The same bounded iteration is used on the GPU.
    for(let i=0;i<4;i++){const d=sampleWarp(field,span,q);q=q.map((v,k)=>v*.25+(p[k]-d[k])*.75);}
  }
  return restDistance(body,q)*(body.soft?.55:1);
}
export function footprint(body,x,y){
  if(body.soft && body.compression>.0001)return Math.min(...[.45,1,1.55].map(h=>objectDistance(body,x,y,body.size[2]*h)))/.55;
  const q=local(body,x,y);
  if(body.kind===1){const ax=Math.abs(q[0])-body.size[0]+.13,ay=Math.abs(q[1])-body.size[1]+.13;return Math.hypot(Math.max(ax,0),Math.max(ay,0))+Math.min(Math.max(ax,ay),0)-.13;}
  if(body.kind===2){q[0]-=clamp(q[0],-body.size[0]+body.size[1],body.size[0]-body.size[1]);return Math.hypot(q[0],q[1])-body.size[1];}
  return (Math.hypot(q[0]/body.size[0],q[1]/body.size[1])-1)*Math.min(body.size[0],body.size[1]);
}
export function footprintNormal(body,x,y){
  const e=.002,dx=footprint(body,x+e,y)-footprint(body,x-e,y),dy=footprint(body,x,y+e)-footprint(body,x,y-e),length=Math.hypot(dx,dy);
  return length>.000001?[dx/length,dy/length]:[1,0];
}
function support(body,nx,ny,atRest=false){
  if((body.kind===0 || body.kind===3) && (atRest || body.compression<.0001)){const c=Math.cos(body.angle),s=Math.sin(body.angle),x=c*nx+s*ny,y=-s*nx+c*ny;return 1/Math.hypot(x/body.size[0],y/body.size[1]);}
  let lo=0,hi=body.soft?body.compression+Math.hypot(...body.size):1.8;
  for(let k=0;k<10;k++){const m=(lo+hi)/2;if(footprint(atRest?{...body,compression:0}:body,body.x+nx*m,body.y+ny*m)<0)lo=m;else hi=m;}return(lo+hi)/2;
}
// Horizontal cross-sections keep a floor-bound tool from scooping jelly into the air.
function hardSection(body,x,y,z){
  const q=local(body,x,y,z),size=body.size;
  if(body.kind===1){
    const dz=Math.max(Math.abs(q[2])-size[2]+.13,0);if(dz>=.13)return 1;
    const radius=Math.sqrt(.13*.13-dz*dz),ax=Math.abs(q[0])-size[0]+.13,ay=Math.abs(q[1])-size[1]+.13;
    return Math.hypot(Math.max(ax,0),Math.max(ay,0))+Math.min(Math.max(ax,ay),0)-radius;
  }
  const factor=Math.sqrt(Math.max(0,1-(q[2]/size[2])**2));if(factor<.0001)return 1;
  if(body.kind===2){q[0]-=clamp(q[0],-size[0]+size[1],size[0]-size[1]);return Math.hypot(q[0],q[1])-size[1]*factor;}
  return (Math.hypot(q[0]/size[0],q[1]/size[1])-factor)*Math.min(...size.slice(0,2));
}
function hardContact(body,hard,q){
  const c=Math.cos(body.angle),s=Math.sin(body.angle),p=[body.x+c*q[0]-s*q[1],body.y+s*q[0]+c*q[1],q[2]+body.size[2]];
  const distance=(x,y)=>hard.soft?objectDistance(hard,x,y,p[2]):hardSection(hard,x,y,p[2]);
  const d=distance(p[0],p[1]);if(d>=.012)return null;
  const e=.001,nx=distance(p[0]+e,p[1])-distance(p[0]-e,p[1]),ny=distance(p[0],p[1]+e)-distance(p[0],p[1]-e),length=Math.hypot(nx,ny);
  if(length<1e-8)return null;const dx=nx/length*(.012-d),dy=ny/length*(.012-d);
  return [c*dx+s*dy,-s*dx+c*dy,0];
}
export class PlayObjects{
  constructor(){this.dirty=new Set();this.bodies=[];this.serial=0;this.uniforms=objectUniforms();}
  add(shape,options={}){
    const kind=SHAPES.indexOf(shape);if(kind<0 || this.bodies.length>=MAX_OBJECTS)return null;
    const ordinal=this.serial++,angle=ordinal*2.39996323,spread=ordinal===0?0:1.9;
    const body={id:ordinal,kind,soft:options.soft ?? kind===3,softness:clamp(options.softness ?? .92,0,1),x:Math.cos(angle)*spread,y:Math.sin(angle)*spread,vx:0,vy:0,angle:kind===2?.3:0,size:[...dimensions[kind]],compression:0,dentDepth:0,volumeRatio:1};
    body.finish=Math.max(0,JELLY_FINISHES.indexOf(options.finish ?? 'opal'));
    body.clarity=clamp(Number.isFinite(options.clarity)?options.clarity:.68,0,1);
    if(body.soft){body.size[2]*=.7;body.deformation=createSoftState(template(body));}
    this.bodies.push(body);this.dirty.add(body.id);this.sync();return body;
  }
  clear(){this.bodies=[];this.serial=0;this.sync();}
  step(dt,drag=null,press=null){
    for(const body of this.bodies){
      if(body.id===drag?.id){const spring=body.soft?55:150,damping=body.soft?24:20;body.vx+=((drag.x-body.x)*spring-body.vx*damping)*dt;body.vy+=((drag.y-body.y)*spring-body.vy*damping)*dt;}
      else{const decay=Math.exp(-dt*(body.soft?16:5));body.vx*=decay;body.vy*=decay;}
      const speed=Math.hypot(body.vx,body.vy);if(speed<.00001)body.vx=body.vy=0;const limit=body.soft?2.2:7;if(speed>limit){body.vx*=limit/speed;body.vy*=limit/speed;}
      body.x+=body.vx*dt;body.y+=body.vy*dt;
      const margin=Math.max(...body.size.slice(0,2)),x=clamp(body.x,-5.8+margin,5.8-margin),y=clamp(body.y,-5.8+margin,5.8-margin);
      if(x!==body.x)body.vx*=-.25;if(y!==body.y)body.vy*=-.25;body.x=x;body.y=y;
    }
    for(let iteration=0;iteration<3;iteration++)for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){
      const a=this.bodies[i],b=this.bodies[j];if(a.soft || b.soft)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),nx=d>.0001?dx/d:1,ny=d>.0001?dy/d:0;
      const overlap=support(a,nx,ny)+support(b,-nx,-ny)-d;if(overlap<=0)continue;
      const aWeight=a.id===drag?.id?0:1,bWeight=b.id===drag?.id?0:1,total=aWeight+bWeight || 2;
      a.x-=nx*overlap*aWeight/total;b.x+=nx*overlap*bWeight/total;a.y-=ny*overlap*aWeight/total;b.y+=ny*overlap*bWeight/total;
      const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(closing<0){const impulse=-closing*1.15/total;a.vx-=nx*impulse*aWeight;a.vy-=ny*impulse*aWeight;b.vx+=nx*impulse*bWeight;b.vy+=ny*impulse*bWeight;}
    }
    // A finite indentation budget supplies a reaction even to a held rigid tool.
    // It prevents a kinematic pointer from forcing the tool through an anchored pad.
    for(const gel of this.bodies)if(gel.soft)for(const hard of this.bodies)if(!hard.soft){
      const dx=hard.x-gel.x,dy=hard.y-gel.y,d=Math.hypot(dx,dy),nx=d>.0001?dx/d:1,ny=d>.0001?dy/d:0;
      const reach=support(gel,nx,ny,true),minimum=reach+support(hard,-nx,-ny,true)-Math.min(reach*(.18+.48*gel.softness),.48);
      if(d<minimum){hard.x=gel.x+nx*minimum;hard.y=gel.y+ny*minimum;const closing=hard.vx*nx+hard.vy*ny;if(closing<0){hard.vx-=closing*nx;hard.vy-=closing*ny;}}
    }
    for(const body of this.bodies){
      if(!body.soft)continue;const t=template(body),contacts=[];skin(body);
      for(const other of this.bodies){
        if(other===body)continue;const dx=other.x-body.x,dy=other.y-body.y,d=Math.hypot(dx,dy),nx=d>.0001?dx/d:1,ny=d>.0001?dy/d:0;
        if(d>support(body,nx,ny,true)+support(other,-nx,-ny,true)+body.compression+other.compression+.04)continue;
        contacts.push(q=>{const correction=hardContact(body,other,q);return correction && other.soft?correction.map(v=>v*.5):correction;});
      }
      let probe=null;
      if(press?.id===body.id){
        const depth=Math.min(body.size[2]*(.85+.65*body.softness),.60)*(1-Math.exp(-press.elapsed*7));
        const origin=local(body,press.originX ?? press.x,press.originY ?? press.y,press.height),point=local(body,press.x,press.y,press.height),dx=point[0]-origin[0],dy=point[1]-origin[1],length=Math.hypot(dx,dy),limit=.65*Math.max(...body.size.slice(0,2));
        if(length>limit){point[0]=origin[0]+dx*limit/length;point[1]=origin[1]+dy*limit/length;}
        probe={point,origin,depth};
      }
      if(!contacts.length && !probe && body.compression<.00002 && body.deformation.velocities.every(v=>Math.abs(v)<.0004)){
        if(body.compression>0){body.deformation=createSoftState(t);this.dirty.add(body.id);}
        body.sleeping=true;continue;
      }
      body.sleeping=false;stepSoft(body.deformation,t,dt,body.softness,contacts,probe);this.dirty.add(body.id);
    }
    this.sync();
    let reaction=false;
    // The tool yields to unresolved skin contact instead of tunnelling through it.
    for(const gel of this.bodies)if(gel.soft)for(const hard of this.bodies)if(!hard.soft){
      const dx=hard.x-gel.x,dy=hard.y-gel.y,d=Math.hypot(dx,dy);if(d>Math.hypot(...gel.size)+Math.hypot(...hard.size)+gel.compression)continue;
      const nx=d>.0001?dx/d:1,ny=d>.0001?dy/d:0,surface=skin(gel),c=Math.cos(gel.angle),s=Math.sin(gel.angle),p=surface.positions;
      for(let iteration=0;iteration<3;iteration++){
        let correction=0;
        const sample=(x,y,z)=>{
          const wx=gel.x+c*x-s*y,wy=gel.y+s*x+c*y,wz=gel.size[2]+z,gap=hardSection(hard,wx,wy,wz);if(gap>=.004)return;
          const derivative=-(hardSection(hard,wx+nx*.001,wy+ny*.001,wz)-hardSection(hard,wx-nx*.001,wy-ny*.001,wz))/.002;
          correction=Math.max(correction,(.004-gap)/Math.max(derivative,.25));
        };
        for(const t of surface.triangles){
          const a=t[0]*3,b=t[1]*3,e=t[2]*3;
          const x=(p[a]+p[b]+p[e])/3,y=(p[a+1]+p[b+1]+p[e+1])/3,z=(p[a+2]+p[b+2]+p[e+2])/3;
          const wx=gel.x+c*x-s*y,wy=gel.y+s*x+c*y;
          if(Math.hypot(wx-hard.x,wy-hard.y)>Math.hypot(...hard.size.slice(0,2))+.12)continue;
          sample(x,y,z);
          for(let j=0;j<3;j++){const u=t[j]*3,v=t[(j+1)%3]*3;sample(p[u],p[u+1],p[u+2]);sample((p[u]+p[v])/2,(p[u+1]+p[v+1])/2,(p[u+2]+p[v+2])/2);}
        }
        if(correction<.0001)break;const travel=Math.min(correction,.12);hard.x+=nx*travel;hard.y+=ny*travel;reaction=true;
        const closing=hard.vx*nx+hard.vy*ny;if(closing<0){hard.vx-=closing*nx;hard.vy-=closing*ny;}
      }
    }
    if(reaction)this.sync();
  }
  updateDeformation(body){
    const t=template(body),field=warp(body);body.compression=writeWarp(body.deformation,t,field);
    body.volumeRatio=meshVolume(body.deformation,t)/t.volume;
    const middle=(SOFT_GRID-1)/2,top=((SOFT_GRID-1)*SOFT_GRID+middle)*SOFT_GRID+middle;body.dentDepth=Math.max(0,t.rest[top*3+2]-body.deformation.positions[top*3+2]);
    // Match the half-float field sampled by the renderer exactly.
    for(let i=0;i<field.length;i++)field[i]=THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(field[i]));
  }
  sync(){
    const u=this.uniforms;u.uObjectCount.value=this.bodies.length;let changed=false;
    this.bodies.forEach((b,i)=>{
      const update=b.soft && (this.dirty.has(b.id) || !skins.has(b));
      let packed=Array.from(u.uObjectBounds.value.subarray(i*4+1,i*4+4));if(update){this.updateDeformation(b);const surface=skin(b);updateSkin(surface,template(b),b.deformation.positions);packed=writeSkin(surface,u.uObjectMesh.value.image.data,i);changed=true;}
      const radius=update?Math.max(...Array.from({length:skin(b).positions.length/3},(_,j)=>Math.hypot(...skin(b).positions.slice(j*3,j*3+3))))+.025:b.soft?u.uObjectBounds.value[i*4]:Math.hypot(...b.size)+.15;
      u.uObjectPose.value.set([b.x,b.y,b.kind,b.size[2]],i*4);u.uObjectSize.value.set([...b.size,b.angle],i*4);u.uObjectMotion.value.set([b.vx,b.vy,b.compression,b.soft?1:0],i*4);
      u.uObjectFinish.value[i]=b.finish ?? 0;
      u.uObjectClarity.value[i]=b.clarity ?? .68;
      u.uObjectBounds.value.set([radius,...packed],i*4);
      if(update){const field=warp(b),data=u.uObjectWarp.value.image.data;for(let k=0;k<field.length;k++)data[i*warpSize+k]=THREE.DataUtils.toHalfFloat(field[k]);}
    });
    if(changed){u.uObjectWarp.value.needsUpdate=true;u.uObjectMesh.value.needsUpdate=true;}this.dirty.clear();
  }
  pickRay(ray){
    let nearest=null;
    for(const body of this.bodies){
      if(body.soft){
        const origin=local(body,...ray.origin),c=Math.cos(body.angle),s=Math.sin(body.angle),d=ray.direction,direction=[c*d[0]+s*d[1],-s*d[0]+c*d[1],d[2]],distance=skinRay(skin(body),origin,direction,nearest?.distance ?? Infinity);
        if(distance!==null){const p=ray.origin.map((v,i)=>v+ray.direction[i]*distance);nearest={id:body.id,x:body.x,y:body.y,height:p[2],point:p,distance,soft:true};}
        continue;
      }
      const delta=ray.origin.map((v,i)=>v-[body.x,body.y,body.size[2]][i]),radius=this.uniforms.uObjectBounds.value[body.id*4];
      const dot=delta.reduce((sum,v,i)=>sum+v*ray.direction[i],0),disc=dot*dot-delta.reduce((sum,v)=>sum+v*v,0)+radius*radius;
      if(disc<0)continue;let t=Math.max(0,-dot-Math.sqrt(disc)),end=-dot+Math.sqrt(disc);
      for(let k=0;k<96 && t<end;k++){
        const p=ray.origin.map((v,i)=>v+ray.direction[i]*t),d=objectDistance(body,...p);
        if(Math.abs(d)<.0012){if(!nearest || t<nearest.distance)nearest={id:body.id,x:body.x,y:body.y,height:p[2],point:p,distance:t,soft:body.soft};break;}
        t+=Math.max(.0007,Math.abs(d)*.8);
      }
    }
    return nearest;
  }
  checkpoint(){return JSON.parse(JSON.stringify({bodies:this.bodies,serial:this.serial}));}
  restore(saved){this.bodies=JSON.parse(JSON.stringify(saved.bodies));this.serial=saved.serial;this.dirty=new Set(this.bodies.map(b=>b.id));this.sync();}
  dispose(){this.uniforms.uObjectWarp.value.dispose();this.uniforms.uObjectMesh.value.dispose();}
}
export const objectGLSL = `
#ifndef GLOP_OBJECTS
#define GLOP_OBJECTS 1
#endif
#ifndef GLOP_SOFT
#define GLOP_SOFT 1
#endif
#if GLOP_OBJECTS
uniform int uObjectCount;
uniform float uObjectFinish[${MAX_OBJECTS}];
uniform float uObjectClarity[${MAX_OBJECTS}];
uniform vec4 uObjectPose[${MAX_OBJECTS}];uniform vec4 uObjectSize[${MAX_OBJECTS}];
uniform vec4 uObjectMotion[${MAX_OBJECTS}];uniform vec4 uObjectBounds[${MAX_OBJECTS}];
vec2 objectLocal(int id,vec2 p){vec4 pose=uObjectPose[id],size=uObjectSize[id];float c=cos(size.w),s=sin(size.w);vec2 q=p-pose.xy;return vec2(c*q.x+s*q.y,-s*q.x+c*q.y);}
#if GLOP_SOFT
uniform highp sampler3D uObjectWarp;
vec3 objectDisplacement(int id,vec3 q){
 vec3 uv=clamp(q/(uObjectSize[id].xyz*1.8)*.5+.5,0.0,1.0);
 uv=(uv*float(${WARP_GRID-1})+.5)/float(${WARP_GRID});
 uv.z=(uv.z+float(id))/float(${MAX_OBJECTS});
 return texture(uObjectWarp,uv).xyz;
}
${softMeshGLSL}
#else
vec3 objectDisplacement(int id,vec3 q){return vec3(0);}
int objectHitNormalId=-1;vec3 objectHitNormal=vec3(0,0,1);
float intersectSoftMesh(int id,vec3 ro,vec3 rd,float maximum,out vec3 normal){normal=vec3(0,0,1);return maximum;}
#endif
float objectPrimitive(int kind,vec3 radii,vec3 q){
 if(kind==1){vec3 a=abs(q)-radii+.13;return length(max(a,0.0))+min(max(a.x,max(a.y,a.z)),0.0)-.13;}
 if(kind==2){q.x-=clamp(q.x,-radii.x+radii.y,radii.x-radii.y);radii.x=radii.y;}
 float k0=length(q/radii),k1=length(q/(radii*radii));return k1>.000001?k0*(k0-1.0)/k1:-min(radii.x,min(radii.y,radii.z));
}
float objectSdf(int id,vec3 p){
 vec4 pose=uObjectPose[id],size=uObjectSize[id];vec3 original=vec3(objectLocal(id,p.xy),p.z-pose.w),q=original;
 if(uObjectMotion[id].w>.5 && uObjectMotion[id].z>.0001){
  for(int k=0;k<4;k++)q=mix(q,original-objectDisplacement(id,q),.75);
 }
 if(uObjectMotion[id].w>.5){vec3 shaped=vec3(q.xy,(q.z+size.z*.35)/1.35);return max(objectPrimitive(int(pose.z+.5),size.xyz,shaped),-q.z-size.z)*.55;}
 return objectPrimitive(int(pose.z+.5),size.xyz,q);
}
float objectFootprint(int id,vec2 p){
 vec4 size=uObjectSize[id];int kind=int(uObjectPose[id].z+.5);vec2 q=objectLocal(id,p);
 if(uObjectMotion[id].w>.5 && uObjectMotion[id].z>.0001)return min(objectSdf(id,vec3(p,size.z*.45)),min(objectSdf(id,vec3(p,size.z)),objectSdf(id,vec3(p,size.z*1.55))))/.55;
 if(kind==1){vec2 a=abs(q)-size.xy+.13;return length(max(a,0.0))+min(max(a.x,a.y),0.0)-.13;}
 if(kind==2){q.x-=clamp(q.x,-size.x+size.y,size.x-size.y);return length(q)-size.y;}
 return (length(q/size.xy)-1.0)*min(size.x,size.y);
}
vec2 objectFootprintNormal(int id,vec2 p){vec2 n=vec2(objectFootprint(id,p+vec2(.002,0))-objectFootprint(id,p-vec2(.002,0)),objectFootprint(id,p+vec2(0,.002))-objectFootprint(id,p-vec2(0,.002)));return length(n)>.000001?normalize(n):vec2(1,0);}
vec3 objectNormal(int id,vec3 p){if(uObjectMotion[id].w>.5 && objectHitNormalId==id)return objectHitNormal;float e=.002;vec3 n=vec3(objectSdf(id,p+vec3(e,0,0))-objectSdf(id,p-vec3(e,0,0)),objectSdf(id,p+vec3(0,e,0))-objectSdf(id,p-vec3(0,e,0)),objectSdf(id,p+vec3(0,0,e))-objectSdf(id,p-vec3(0,0,e)));return length(n)>1e-7?normalize(n):vec3(0,0,1);}
float intersectObjects(vec3 ro,vec3 rd,float maximum,out int found){
 float closest=maximum;found=-1;
 for(int id=0;id<${MAX_OBJECTS};id++){
  if(id>=uObjectCount)break;
  vec3 center=vec3(uObjectPose[id].xy,uObjectPose[id].w),delta=ro-center;
  float radius=uObjectBounds[id].x,b=dot(delta,rd),disc=b*b-dot(delta,delta)+radius*radius;
  if(disc<0.0)continue;
  if(uObjectMotion[id].w>.5){vec3 normal;float distance=intersectSoftMesh(id,ro,rd,closest,normal);if(distance<closest){closest=distance;found=id;objectHitNormalId=id;objectHitNormal=normal;}continue;}
float t=max(0.0,-b-sqrt(disc)),end=min(closest,-b+sqrt(disc));
  for(int k=0;k<80;k++){if(t>end)break;float d=objectSdf(id,ro+rd*t);if(abs(d)<.0012){closest=t;found=id;objectHitNormalId=-1;break;}t+=max(.0007,abs(d)*.8);}
 }
 return closest;
}
float objectVisibility(vec3 p,vec3 rd,int ignore){
 float visibility=1.0;
 for(int id=0;id<${MAX_OBJECTS};id++){
  if(id>=uObjectCount)break;if(id==ignore)continue;vec3 center=vec3(uObjectPose[id].xy,uObjectPose[id].w);float t=max(.025,dot(center-p,rd));
  vec3 nearest=p+rd*t;float penumbra=.20*t+.025;
  if(length(nearest-center)>uObjectBounds[id].x+penumbra)continue;
  float gap=objectSdf(id,nearest),through=uObjectMotion[id].w>.5?uObjectClarity[id]*exp(-.8*uObjectSize[id].z*2.0/max(abs(rd.z),.35))*.85:0.0;
  visibility=min(visibility,mix(through,1.0,smoothstep(-.03,penumbra,gap)));
 }
 return visibility;
}
#else
const int uObjectCount=0;
uniform vec4 uObjectMotion[6];
uniform float uObjectClarity[6];
float objectFootprint(int id,vec2 p){return 1000.0;}
vec2 objectFootprintNormal(int id,vec2 p){return vec2(1,0);}
float intersectObjects(vec3 ro,vec3 rd,float maximum,out int found){found=-1;return maximum;}
float objectVisibility(vec3 p,vec3 rd,int ignore){return 1.0;}
#endif
`;

// Select features before driver compilation, rather than hiding them with a uniform.
export function objectShader(source,mode='soft'){
  if(!['none','hard','soft'].includes(mode))throw new Error('Unknown object shader mode');
  return pruneShader(selectObjectFeatures(source,mode));
}
