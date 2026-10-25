// Compliant distance and tetrahedral volume constraints, following XPBD (Macklin et al., 2016).
// A small material mesh drives the refined skin and the approximate contact field.
export const SOFT_GRID = 5;
export const WARP_GRID = 10;
const templates = new Map();
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function point(p,id){return p.slice(id*3,id*3+3);}
function sub(a,b){return a.map((v,i)=>v-b[i]);}
function dot(a,b){return a.reduce((s,v,i)=>s+v*b[i],0);}
export function tetVolume(p,t){
  const a=t[0]*3,b=t[1]*3,c=t[2]*3,d=t[3]*3;
  const bx=p[b]-p[a],by=p[b+1]-p[a+1],bz=p[b+2]-p[a+2],cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
  return (bx*(cy*dz-cz*dy)+by*(cz*dx-cx*dz)+bz*(cx*dy-cy*dx))/6;
}
export function meshVolume(state,template){return template.tets.reduce((sum,t)=>sum+tetVolume(state.positions,t),0);}
function writeGradients(p,t,g){
  const a=t[0]*3,b=t[1]*3,c=t[2]*3,d=t[3]*3;
  const bx=p[b]-p[a],by=p[b+1]-p[a+1],bz=p[b+2]-p[a+2],cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
  g[3]=(cy*dz-cz*dy)/6;g[4]=(cz*dx-cx*dz)/6;g[5]=(cx*dy-cy*dx)/6;
  g[6]=(dy*bz-dz*by)/6;g[7]=(dz*bx-dx*bz)/6;g[8]=(dx*by-dy*bx)/6;
  g[9]=(by*cz-bz*cy)/6;g[10]=(bz*cx-bx*cz)/6;g[11]=(bx*cy-by*cx)/6;
  for(let k=0;k<3;k++)g[k]=-g[3+k]-g[6+k]-g[9+k];
}
function weights(p,t,q){
  const a=point(p,t[0]),b=sub(point(p,t[1]),a),c=sub(point(p,t[2]),a),d=sub(point(p,t[3]),a),v=sub(q,a),den=dot(b,cross(c,d));
  const w=[0,dot(v,cross(c,d))/den,dot(b,cross(v,d))/den,dot(b,cross(c,v))/den];w[0]=1-w[1]-w[2]-w[3];return w;
}
export function softTemplate(kind,size,restDistance){
  const key=kind+':'+size.join(',');if(templates.has(key))return templates.get(key);
  const rest=[],tets=[],edges=[],edgeSet=new Set(),n=SOFT_GRID;
  const node=(x,y,z)=>(z*n+y)*n+x;
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=[x,y,z].map(v=>v/(n-1)*2-1),[a,b,c]=u;
    const s=[a*Math.sqrt(1-b*b/2-c*c/2+b*b*c*c/3),b*Math.sqrt(1-c*c/2-a*a/2+c*c*a*a/3),c*Math.sqrt(1-a*a/2-b*b/2+a*a*b*b/3)];
    const r=Math.hypot(...s);if(r<1e-9){rest.push(0,0,0);continue;}
    const dir=s.map(v=>v/r);let lo=0,hi=Math.hypot(...size)*1.1;
    for(let i=0;i<30;i++){const m=(lo+hi)/2;if(restDistance(dir.map(v=>v*m))<0)lo=m;else hi=m;}
    rest.push(...dir.map(v=>v*(lo+hi)*.5*r));
  }
  for(let i=2;i<rest.length;i+=3)if(rest[i]<=-size[2]+.0001)rest[i]=-size[2];
  // Six consistently oriented tetrahedra around each cell's main diagonal.
  const pieces=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
  for(let z=0;z<n-1;z++)for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){
    const ids=[node(x,y,z),node(x+1,y,z),node(x,y+1,z),node(x+1,y+1,z),node(x,y,z+1),node(x+1,y,z+1),node(x,y+1,z+1),node(x+1,y+1,z+1)];
    for(const piece of pieces){const t=piece.map(i=>ids[i]);if(tetVolume(rest,t)<0)[t[1],t[2]]=[t[2],t[1]];tets.push(t);}
  }
  const skinTets=tets.slice();
  // The clipped flat base includes zero-volume surface cells, excluded from dynamics.
  for(let i=tets.length-1;i>=0;i--)if(tetVolume(rest,tets[i])<1e-10)tets.splice(i,1);
  for(const t of tets)for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
    const i=Math.min(t[a],t[b]),j=Math.max(t[a],t[b]),key=i+':'+j;if(edgeSet.has(key))continue;edgeSet.add(key);edges.push([i,j,Math.hypot(...sub(point(rest,i),point(rest,j)))]);
  }
  const volumes=tets.map(t=>tetVolume(rest,t)),volume=volumes.reduce((a,b)=>a+b,0),span=size.map(v=>v*1.8),map=[];
  // Precompute rest-space embedding once. Outside samples extend the closest material element.
  for(let z=0;z<WARP_GRID;z++)for(let y=0;y<WARP_GRID;y++)for(let x=0;x<WARP_GRID;x++){
    const q=[x,y,z].map((v,i)=>(v/(WARP_GRID-1)*2-1)*span[i]);let best=null,error=Infinity;
    for(const t of tets){const w=weights(rest,t,q),negative=w.reduce((s,v)=>s+Math.max(0,-v),0);if(negative<error){best={ids:t,w};error=negative;}if(error<1e-6)break;}
    if(error>1e-6){best.w=best.w.map(v=>clamp(v,0,1));const total=best.w.reduce((a,b)=>a+b,0);best.w=best.w.map(v=>v/total);}
    map.push(best);
  }
  const template={rest,restHeight:size[2],tets,skinTets,edges,volumes,volume,span,map};templates.set(key,template);return template;
}
export function createSoftState(template){return {positions:[...template.rest],velocities:template.rest.map(()=>0)};}
export function stepSoft(state,template,dt,softness,contacts,press=null){
  const p=state.positions,v=state.velocities,rest=template.rest,count=p.length/3,w=count,previous=p.slice();
  const decay=Math.exp(-dt*15),recovery=4+76*(1-softness)**2,edgeAlpha=(.00008*Math.pow(900,softness))/(dt*dt);
  const edgeLambda=new Float64Array(template.edges.length),volumeLambda=new Float64Array(template.tets.length);
  const mass=new Float64Array(p.length),grounded=new Uint8Array(count);
  for(let id=0;id<count;id++){
    grounded[id]=rest[id*3+2]<=-template.restHeight+.0001?1:0;
    for(let k=0;k<3;k++){
      const i=id*3+k;mass[i]=grounded[id]?(k===2?0:w*.3):w;
      const attachment=grounded[id]?180:recovery;
      v[i]=(v[i]+(rest[i]-p[i])*attachment*dt)*decay;p[i]+=clamp(v[i],-5,5)*dt;
      if(grounded[id] && k===2)p[i]=-template.restHeight;
    }
  }
  function applySurfaceContact(sample){
    const q=[...sample.rest];for(let j=0;j<sample.ids.length;j++)for(let k=0;k<3;k++){const i=sample.ids[j]*3+k;q[k]+=sample.w[j]*(p[i]-rest[i]);}
    q[2]=sample.rest[2]<=-template.restHeight+.0001?-template.restHeight:Math.max(q[2],-template.restHeight);
    for(const collider of contacts){
      const correction=collider(q);if(!correction)continue;
      for(let k=0;k<3;k++){
        let denominator=0;for(let j=0;j<sample.ids.length;j++)denominator+=mass[sample.ids[j]*3+k]*sample.w[j]**2;
        if(denominator<1e-9)continue;
        for(let j=0;j<sample.ids.length;j++)p[sample.ids[j]*3+k]+=correction[k]*mass[sample.ids[j]*3+k]*sample.w[j]/denominator;
        q[k]+=correction[k];
      }
    }
  }
  const contact=()=>{
    for(let id=0;id<count;id++){
      const base=id*3,q=p.slice(base,base+3);
      for(const collider of contacts){const hit=collider(q);if(hit)for(let axis=0;axis<3;axis++){p[base+axis]+=hit[axis];q[axis]=p[base+axis];}}
      if(press){
        // A distributed grab is the fingertip's grip on a small patch of material.
        // Constraining material coordinates prevents the skin from sliding out from under it.
        const dx=rest[base]-press.origin[0],dy=rest[base+1]-press.origin[1];
        const influence=Math.exp(-(dx*dx+dy*dy)/.18)*clamp((rest[base+2]/template.restHeight+.15)/1.15,0,1);
        if(influence>.015){
          const grip=.65*influence;
          p[base]+=(rest[base]+(press.point[0]-press.origin[0])*influence-p[base])*grip;
          p[base+1]+=(rest[base+1]+(press.point[1]-press.origin[1])*influence-p[base+1])*grip;
          p[base+2]+=(rest[base+2]-press.depth*influence-p[base+2])*grip;
        }
      }
      p[base+2]=grounded[id]?-template.restHeight:Math.max(p[base+2],-template.restHeight);
    }
    if(contacts.length)for(const sample of template.surfaceSamples || [])applySurfaceContact(sample);
  };
  const tg=new Float64Array(12),g=new Float64Array(p.length);
  for(let iteration=0;iteration<6;iteration++){
    for(let e=0;e<template.edges.length;e++){
      const index=iteration%2?template.edges.length-1-e:e,[a,b,length]=template.edges[index];
      const dx=p[a*3]-p[b*3],dy=p[a*3+1]-p[b*3+1],dz=p[a*3+2]-p[b*3+2],distance=Math.hypot(dx,dy,dz);if(distance<1e-8)continue;
      const normal=[dx/distance,dy/distance,dz/distance];let denominator=edgeAlpha;
      for(let k=0;k<3;k++)denominator+=(mass[a*3+k]+mass[b*3+k])*normal[k]**2;
      const dl=(-(distance-length)-edgeAlpha*edgeLambda[index])/denominator;edgeLambda[index]+=dl;
      for(let k=0;k<3;k++){p[a*3+k]+=mass[a*3+k]*dl*normal[k];p[b*3+k]-=mass[b*3+k]*dl*normal[k];}
    }
    for(let e=0;e<template.tets.length;e++){
      const index=iteration%2?template.tets.length-1-e:e,t=template.tets[index];writeGradients(p,t,tg);
      const alpha=1e-8*template.volumes[index]/(dt*dt);let den=0;for(let j=0;j<4;j++)for(let k=0;k<3;k++)den+=mass[t[j]*3+k]*tg[j*3+k]**2;
      if(den<1e-12)continue;const dl=(-(tetVolume(p,t)-template.volumes[index])-alpha*volumeLambda[index])/(den+alpha);volumeLambda[index]+=dl;
      for(let j=0;j<4;j++)for(let k=0;k<3;k++)p[t[j]*3+k]+=mass[t[j]*3+k]*dl*tg[j*3+k];
    }
    // A global volume constraint reduces accumulated local solver error under a broad press.
    g.fill(0);let volume=0;
    for(const t of template.tets){volume+=tetVolume(p,t);writeGradients(p,t,tg);for(let j=0;j<4;j++)for(let k=0;k<3;k++)g[t[j]*3+k]+=tg[j*3+k];}
    let den=0;for(let i=0;i<g.length;i++)den+=mass[i]*g[i]*g[i];
    if(den>1e-12){const dl=-(volume-template.volume)/den;for(let i=0;i<p.length;i++)p[i]+=mass[i]*dl*g[i];}
    contact();
  }
  // A unilateral volume barrier resolves very compressed elements before the safety line search.
  for(let iteration=0;iteration<10;iteration++){
    let resolved=true;
    for(let j=0;j<template.tets.length;j++){
      const t=template.tets[j],minimum=template.volumes[j]*.12,volume=tetVolume(p,t);if(volume>=minimum)continue;resolved=false;
      writeGradients(p,t,tg);let den=0;for(let a=0;a<4;a++)for(let k=0;k<3;k++)den+=mass[t[a]*3+k]*tg[a*3+k]**2;
      if(den>1e-14){const scale=(minimum-volume)/den;for(let a=0;a<4;a++)for(let k=0;k<3;k++)p[t[a]*3+k]+=scale*mass[t[a]*3+k]*tg[a*3+k];}
    }
    for(let i=2;i<p.length;i+=3)p[i]=grounded[(i-2)/3]?-template.restHeight:Math.max(p[i],-template.restHeight);
    if(resolved)break;
  }
  // A line search keeps material elements from turning inside out under an extreme gesture.
  let safe=true;for(let i=0;i<template.tets.length;i++)if(tetVolume(p,template.tets[i])<template.volumes[i]*.08){safe=false;break;}
  if(!safe){
    const proposed=p.slice();let lo=0,hi=1;
    for(let iteration=0;iteration<10;iteration++){
      const blend=(lo+hi)/2;for(let i=0;i<p.length;i++)p[i]=previous[i]+(proposed[i]-previous[i])*blend;
      let valid=true;for(let i=0;i<template.tets.length;i++)if(tetVolume(p,template.tets[i])<template.volumes[i]*.08){valid=false;break;}
      if(valid)lo=blend;else hi=blend;
    }
    for(let i=0;i<p.length;i++)p[i]=previous[i]+(proposed[i]-previous[i])*lo;
  }
  for(let i=0;i<p.length;i++)v[i]=clamp((p[i]-previous[i])/dt,-5,5);
}
export function writeWarp(state,template,output){
  let maximum=0;
  for(let i=0;i<template.map.length;i++){
    const sample=template.map[i];
    for(let axis=0;axis<3;axis++){
      let value=0;for(let j=0;j<4;j++){const offset=sample.ids[j]*3+axis;value+=sample.w[j]*(state.positions[offset]-template.rest[offset]);}
      output[i*4+axis]=value;maximum=Math.max(maximum,Math.abs(value));
    }
    output[i*4+3]=0;
  }
  return maximum;
}
export function sampleWarp(data,span,q){
  const grid=q.map((v,i)=>clamp((v/span[i]*.5+.5)*(WARP_GRID-1),0,WARP_GRID-1)),lo=grid.map(Math.floor),hi=lo.map(v=>Math.min(WARP_GRID-1,v+1)),f=grid.map((v,i)=>v-lo[i]),sum=[0,0,0];
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const weight=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]),offset=(((z?hi[2]:lo[2])*WARP_GRID+(y?hi[1]:lo[1]))*WARP_GRID+(x?hi[0]:lo[0]))*4;
    for(let k=0;k<3;k++)sum[k]+=weight*data[offset+k];
  }
  return sum;
}
