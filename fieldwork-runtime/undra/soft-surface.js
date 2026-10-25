// A refined skin follows the material mesh. A refitted BVH keeps ray tracing bounded.
export const MESH_WIDTH=8192;
export const SKIN_TRIANGLES=3072;
const LEAF_SIZE=12;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const point=(data,id)=>data.slice(id*3,id*3+3);
export function createSkin(template,restDistance,size){
  const faces=new Map();
  for(const t of template.skinTets || template.tets)for(const order of [[1,2,3,0],[0,3,2,1],[0,1,3,2],[0,2,1,3]]){
    const face=order.slice(0,3).map(i=>t[i]),opposite=t[order[3]],key=[...face].sort((a,b)=>a-b).join(':');
    if(faces.has(key)){faces.delete(key);continue;}
    const a=point(template.rest,face[0]),normal=cross(sub(point(template.rest,face[1]),a),sub(point(template.rest,face[2]),a));
    if(dot(normal,sub(point(template.rest,opposite),a))>0)[face[1],face[2]]=[face[2],face[1]];faces.set(key,face);
  }
  const ids=[...new Set([...faces.values()].flat())],remap=new Map(ids.map((id,i)=>[id,i]));
  const rest=ids.flatMap(id=>point(template.rest,id));let embedding=ids.map(id=>({ids:[id],w:[1]})),triangles=[...faces.values()].map(face=>face.map(id=>remap.get(id))),contactSamples;
  for(let level=0;level<2;level++){
    const neighbours=new Map(),opposites=new Map(),previous=embedding,next=embedding.slice();
    for(const face of triangles)for(let j=0;j<3;j++){
      const a=face[j],b=face[(j+1)%3],other=face[(j+2)%3],key=[a,b].sort((i,j)=>i-j).join(':');
      if(!neighbours.has(a))neighbours.set(a,new Set());if(!neighbours.has(b))neighbours.set(b,new Set());neighbours.get(a).add(b);neighbours.get(b).add(a);
      if(!opposites.has(key))opposites.set(key,[]);opposites.get(key).push(other);
    }
    function compose(vertices,weights){
      const combined=new Map();vertices.forEach((vertex,j)=>previous[vertex].ids.forEach((id,k)=>combined.set(id,(combined.get(id)||0)+weights[j]*previous[vertex].w[k])));
      return {ids:[...combined.keys()],w:[...combined.values()]};
    }
    // Two Loop passes smooth displacement without shrinking the undeformed primitive.
    for(const [id,ring] of neighbours){const vertices=[id,...ring],beta=ring.size===3?3/16:3/(8*ring.size);next[id]=compose(vertices,[1-ring.size*beta,...Array(ring.size).fill(beta)]);}
    const mids=new Map();
    function midpoint(a,b){
      const key=[a,b].sort((i,j)=>i-j).join(':');if(mids.has(key))return mids.get(key);
      const q=[0,1,2].map(i=>(rest[a*3+i]+rest[b*3+i])/2),length=Math.hypot(...q),dir=q.map(v=>v/length);let lo=0,hi=Math.hypot(...size)*1.1;
      for(let i=0;i<28;i++){const m=(lo+hi)/2;if(restDistance(dir.map(v=>v*m))<0)lo=m;else hi=m;}
      const id=rest.length/3;rest.push(...dir.map(v=>v*(lo+hi)/2));const opposite=opposites.get(key);
      next.push(opposite?.length===2?compose([a,b,...opposite],[.375,.375,.125,.125]):compose([a,b],[.5,.5]));mids.set(key,id);return id;
    }
    const refined=[];for(const [a,b,c] of triangles){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);refined.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}
    triangles=refined;embedding=next;
    // Contact uses the first refined layer; the final skin supplies residual tool reaction.
    if(level===0)contactSamples=embedding.map((sample,id)=>({...sample,rest:rest.slice(id*3,id*3+3)}));
  }
  const nodes=[],ordered=[];
  function build(ids){
    const index=nodes.length,node={left:0,right:0,start:0,count:0,min:[0,0,0],max:[0,0,0]};nodes.push(node);
    if(ids.length<=LEAF_SIZE){node.start=ordered.length;node.count=ids.length;ordered.push(...ids);node.escape=nodes.length;return index;}
    const centroids=ids.map(id=>triangles[id].map(i=>point(rest,i)).reduce((sum,q)=>sum.map((v,k)=>v+q[k]/3),[0,0,0]));
    const ranges=[0,1,2].map(k=>Math.max(...centroids.map(q=>q[k]))-Math.min(...centroids.map(q=>q[k]))),axis=ranges.indexOf(Math.max(...ranges));
    ids.sort((a,b)=>triangles[a].reduce((sum,i)=>sum+rest[i*3+axis],0)-triangles[b].reduce((sum,i)=>sum+rest[i*3+axis],0));const middle=Math.floor(ids.length/2);
    node.left=build(ids.slice(0,middle));node.right=build(ids.slice(middle));node.escape=nodes.length;return index;
  }
  build(triangles.map((_,i)=>i));
  const skin={rest,embedding,contactSamples,triangles:ordered.map(i=>triangles[i]),nodes,positions:new Float32Array(rest),normals:new Float32Array(rest.length)};
  updateSkin(skin,template,template.rest);return skin;
}
export function updateSkin(skin,template,material){
  const p=skin.positions,n=skin.normals;n.fill(0);
  skin.embedding.forEach((sample,id)=>{for(let k=0;k<3;k++){let value=skin.rest[id*3+k];for(let j=0;j<sample.ids.length;j++){const i=sample.ids[j]*3+k;value+=sample.w[j]*(material[i]-template.rest[i]);}p[id*3+k]=k===2 && skin.rest[id*3+2]<=-template.restHeight+.0001?-template.restHeight:Math.max(k===2?-template.restHeight:-Infinity,value);}});
  for(const t of skin.triangles){const a=t[0]*3,b=t[1]*3,c=t[2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const id of t)for(let k=0;k<3;k++)n[id*3+k]+=normal[k];}
  for(let i=0;i<n.length;i+=3){const length=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=length;n[i+1]/=length;n[i+2]/=length;}
  for(let i=skin.nodes.length-1;i>=0;i--){
    const node=skin.nodes[i];node.min.fill(Infinity);node.max.fill(-Infinity);
    if(node.count){for(let j=node.start;j<node.start+node.count;j++)for(const id of skin.triangles[j])for(let k=0;k<3;k++){node.min[k]=Math.min(node.min[k],p[id*3+k]);node.max[k]=Math.max(node.max[k],p[id*3+k]);}}
    else{for(let k=0;k<3;k++){node.min[k]=Math.min(skin.nodes[node.left].min[k],skin.nodes[node.right].min[k]);node.max[k]=Math.max(skin.nodes[node.left].max[k],skin.nodes[node.right].max[k]);}}
  }
}
export function writeSkin(skin,data,body){
  const count=skin.positions.length/3,nodeOffset=count*2,triangleOffset=nodeOffset+skin.nodes.length*2,base=body*MESH_WIDTH*4;
  if(triangleOffset+skin.triangles.length>MESH_WIDTH)throw new Error("Jelly surface exceeds its texture row");
  for(let id=0;id<count;id++){data.set(skin.positions.subarray(id*3,id*3+3),base+id*4);data.set(skin.normals.subarray(id*3,id*3+3),base+(count+id)*4);}
  skin.nodes.forEach((node,id)=>{const offset=base+(nodeOffset+id*2)*4;data.set([...node.min,node.count?-node.start-1:node.left],offset);data.set([...node.max,node.escape*16+node.count],offset+4);});
  skin.triangles.forEach((t,id)=>data.set([...t,0],base+(triangleOffset+id)*4));return [count,nodeOffset,triangleOffset];
}
export function triangleHit(origin,direction,a,b,c,maximum){
  const e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-8)return null;
  const v=sub(origin,a),u=dot(v,p)/det;if(u<-.0000001 || u>1.0000001)return null;const q=cross(v,e1),w=dot(direction,q)/det;if(w<-.0000001 || u+w>1.0000001)return null;
  const distance=dot(e2,q)/det;return distance>.00001 && distance<maximum?distance:null;
}
export function skinRay(skin,origin,direction,maximum=Infinity){
  let closest=maximum;
  for(const t of skin.triangles){const hit=triangleHit(origin,direction,...t.map(id=>point(skin.positions,id)),closest);if(hit!==null)closest=hit;}
  return closest<maximum?closest:null;
}
export const softMeshGLSL = `
uniform highp sampler2D uObjectMesh;
vec4 meshRead(int id,int column){return texelFetch(uObjectMesh,ivec2(column,id),0);}
int objectHitNormalId=-1;vec3 objectHitNormal=vec3(0,0,1);
bool meshBox(vec3 ro,vec3 inverse,vec3 lo,vec3 hi,float maximum){vec3 a=(lo-ro)*inverse,b=(hi-ro)*inverse,mn=min(a,b),mx=max(a,b);return max(max(mn.x,mn.y),max(mn.z,0.0))<=min(min(mx.x,mx.y),min(mx.z,maximum));}
float intersectSoftMesh(int id,vec3 ro,vec3 rd,float maximum,out vec3 hitNormal){
 vec3 origin=vec3(objectLocal(id,ro.xy),ro.z-uObjectPose[id].w);
 float c=cos(uObjectSize[id].w),s=sin(uObjectSize[id].w);vec3 direction=vec3(c*rd.x+s*rd.y,-s*rd.x+c*rd.y,rd.z),inverse=1.0/(sign(direction+vec3(1e-12))*max(abs(direction),vec3(1e-8)));
 int normalOffset=int(uObjectBounds[id].y),nodeOffset=int(uObjectBounds[id].z),triangleOffset=int(uObjectBounds[id].w),nodeCount=(triangleOffset-nodeOffset)/2,node=0;float closest=maximum;hitNormal=vec3(0,0,1);
 // Escape links walk the BVH without a per-ray stack or its register pressure.
 for(int visit=0;visit<512;visit++){
  if(node>=nodeCount)break;vec4 lo=meshRead(id,nodeOffset+node*2),hi=meshRead(id,nodeOffset+node*2+1);int packed=int(hi.w),escape=packed/16;
  if(!meshBox(origin,inverse,lo.xyz-vec3(.00001),hi.xyz+vec3(.00001),closest)){node=escape;continue;}
  if(lo.w>=0.0){node=int(lo.w);continue;}
  int first=-int(lo.w)-1,count=packed%16;node=escape;
  for(int t=0;t<12;t++){
   if(t>=count)break;ivec3 ids=ivec3(meshRead(id,triangleOffset+first+t).xyz);vec3 a=meshRead(id,ids.x).xyz,b=meshRead(id,ids.y).xyz,d=meshRead(id,ids.z).xyz,e1=b-a,e2=d-a,p=cross(direction,e2);float determinant=dot(e1,p);if(abs(determinant)<1e-8)continue;
   vec3 delta=origin-a;float u=dot(delta,p)/determinant;if(u<-.00002 || u>1.00002)continue;vec3 q=cross(delta,e1);float v=dot(direction,q)/determinant;if(v<-.00002 || u+v>1.00002)continue;float distance=dot(e2,q)/determinant;
   if(distance>.00001 && distance<closest){closest=distance;vec3 geometric=normalize(cross(e1,e2)),n=normalize(meshRead(id,normalOffset+ids.x).xyz*(1.0-u-v)+meshRead(id,normalOffset+ids.y).xyz*u+meshRead(id,normalOffset+ids.z).xyz*v);
    if(dot(n,geometric)<.3)n=normalize(geometric+n*.5);if(dot(n,direction)*dot(geometric,direction)<0.0)n=geometric;
    hitNormal=vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);}
  }
 }
 return closest;
}
`;
