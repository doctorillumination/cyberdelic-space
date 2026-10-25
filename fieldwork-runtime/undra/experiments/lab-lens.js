import * as THREE from '../vendor/three.module.js';
import { molecularLayout } from './lab-model.js?v=2.23.6';

export class MolecularLens{
 constructor(canvas){
  this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));this.renderer.setSize(360,360,false);this.renderer.setClearColor(0,0);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.9;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(39,1,.1,30);this.camera.position.set(3.1,2.0,6.1);this.camera.lookAt(0,-.22,0);
  const room=new THREE.Scene(),box=new THREE.Mesh(new THREE.BoxGeometry(20,20,20),new THREE.MeshBasicMaterial({color:'#686f64',side:THREE.BackSide}));room.add(box);
  const panel=(x,y,z,w,h,color)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color}));mesh.position.set(x,y,z);mesh.lookAt(0,0,0);room.add(mesh);};
  panel(-5,4,4,7,6,'#ffffff');panel(5,2,-3,3,7,'#eedbb8');panel(0,7,0,6,6,'#eaf2ee');
  const pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,0,1,30);this.scene.environment=this.environment.texture;pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  this.scene.add(new THREE.HemisphereLight('#f8ffef','#8da2a0',2.3));
  const light=new THREE.DirectionalLight('#ffffff',3.8);light.position.set(-4,7,5);this.scene.add(light);
  const fill=new THREE.DirectionalLight('#e6b981',1.8);fill.position.set(5,2,-2);this.scene.add(fill);
  this.sphere=new THREE.SphereGeometry(1,28,20);this.cylinder=new THREE.CylinderGeometry(1,1,1,10);
  this.materials={oxygen:new THREE.MeshPhysicalMaterial({color:'#b65f58',roughness:.19,metalness:.08,clearcoat:1,clearcoatRoughness:.10}),hydrogen:new THREE.MeshPhysicalMaterial({color:'#f7eee1',roughness:.14,clearcoat:1}),head:new THREE.MeshPhysicalMaterial({color:'#238f98',roughness:.14,metalness:.12,clearcoat:1}),tail:new THREE.MeshPhysicalMaterial({color:'#d2ad62',roughness:.2,metalness:.24,clearcoat:.8}),covalent:new THREE.MeshPhysicalMaterial({color:'#cfdfd9',roughness:.24,transparent:true,opacity:.8}),bond:new THREE.MeshPhysicalMaterial({color:'#75b6d0',roughness:.3,transparent:true,opacity:.7})};
  const skinGeometry=new THREE.CylinderGeometry(1.8,1.65,1.58,80,1),skinMaterial=new THREE.MeshPhysicalMaterial({color:'#bee6dc',roughness:.055,transmission:.96,thickness:.5,ior:1.333,transparent:true,opacity:.20,depthWrite:false,clearcoat:1});
  this.skin=new THREE.Mesh(skinGeometry,skinMaterial);this.skin.position.y=-.57;this.skin.scale.z=.7;this.skin.renderOrder=3;this.scene.add(this.skin);
  this.group=new THREE.Group();this.scene.add(this.group);this.rotation=0;this.show={heads:true,tails:true,bonds:true};this.concentration=-1;this.meshes=[];this.last=-Infinity;
 }
 instances(points,material,radius){
  if(!points.length)return null;const mesh=new THREE.InstancedMesh(this.sphere,material,points.length),dummy=new THREE.Object3D();
  points.forEach((p,i)=>{dummy.position.fromArray(p);dummy.scale.setScalar(radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.group.add(mesh);this.meshes.push(mesh);return mesh;
 }
 segments(lines,material,radius,dashed=false){
  const pieces=[];for(const [a,b] of lines){const length=Math.hypot(...a.map((p,k)=>p-b[k]));if(length<1e-6)continue;const count=dashed?Math.max(2,Math.ceil(length/.10)):1;for(let i=0;i<count;i++){const begin=i/count,end=dashed?(i+.52)/count:1;pieces.push([a.map((v,k)=>v+(b[k]-v)*begin),a.map((v,k)=>v+(b[k]-v)*end)]);}}
  if(!pieces.length)return null;const mesh=new THREE.InstancedMesh(this.cylinder,material,pieces.length),dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  pieces.forEach(([a,b],i)=>{const delta=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));dummy.position.fromArray(a).addScaledVector(delta,.5);dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());dummy.scale.set(radius,delta.length(),radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.group.add(mesh);this.meshes.push(mesh);return mesh;
 }
 rebuild(concentration){
  this.meshes.forEach(m=>{this.group.remove(m);m.dispose();});this.meshes=[];const layout=molecularLayout(concentration);this.concentration=concentration;
  this.instances(layout.water.map(m=>m.oxygen),this.materials.oxygen,.105);this.instances(layout.water.flatMap(m=>m.hydrogens),this.materials.hydrogen,.072);this.segments(layout.water.flatMap(m=>m.hydrogens.map(h=>[m.oxygen,h])),this.materials.covalent,.027);
  const heads=this.instances(layout.heads.map(h=>h.point),this.materials.head,.115),carbons=this.instances(layout.tails.flatMap(chain=>chain.slice(1)),this.materials.tail,.045),chains=this.segments(layout.tails.flatMap(chain=>chain.slice(1).map((p,i)=>[chain[i],p])),this.materials.tail,.025);
  const bonds=this.segments([...layout.hydrogenBonds,...layout.headBonds],this.materials.bond,.015,true);this.parts={heads,tails:[carbons,chains],bonds};this.applyHighlights();
 }
 applyHighlights(){if(!this.parts)return;if(this.parts.heads)this.parts.heads.visible=this.show.heads;for(const m of this.parts.tails)if(m)m.visible=this.show.tails;if(this.parts.bonds)this.parts.bonds.visible=this.show.bonds;this.last=-Infinity;}
 draw(now,concentration,animate=true){
  if(concentration!==this.concentration)this.rebuild(concentration);if(now-this.last<1000/24)return;if(!animate && this.last>0 && this.drawnRotation===this.rotation)return;this.last=now;this.drawnRotation=this.rotation;
  this.group.rotation.y=this.rotation;this.camera.position.x=3.1+Math.sin(animate?now*.00012:0)*.16;this.camera.lookAt(0,-.22,0);this.renderer.domElement.dataset.rotation=this.rotation.toFixed(3);this.renderer.domElement.dataset.scene='spatial-molecular-lens';this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.meshes.forEach(m=>m.dispose());this.sphere.dispose();this.cylinder.dispose();Object.values(this.materials).forEach(m=>m.dispose());this.skin.geometry.dispose();this.skin.material.dispose();this.environment.dispose();this.renderer.dispose();}
}
