export const PHYSICS={epsilon0:8.8541878128e-12,rho:998,epsilonWater:80,airViscosity:1.81e-5,temperature:293.15,gasConstant:8.314462618,gammaWater:.0728,gammaSDS:.039,cmc:8.2};
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
export function surfactant(concentration=0){
 const c=Math.max(0,Math.min(20,finite(concentration))),monomer=Math.min(c,PHYSICS.cmc)/1000,K=1e4;
 // Illustrative adsorption curve anchored to representative room-temperature SDS values.
 const reduction=(PHYSICS.gammaWater-PHYSICS.gammaSDS)*Math.log1p(K*monomer)/Math.log1p(K*PHYSICS.cmc/1000);
 return {concentration:c,gamma:PHYSICS.gammaWater-reduction,coverage:K*monomer/(1+K*monomer),micelleFraction:Math.max(0,(c-PHYSICS.cmc)/Math.max(c,.001))};
}
export function polarizability(radius,relativePermittivity=PHYSICS.epsilonWater){return 4*Math.PI*PHYSICS.epsilon0*radius**3*(relativePermittivity-1)/(relativePermittivity+2);}
export function laplacePressure(radius,gamma){return 2*gamma/radius;}
export function rayleighLimit(radius,gamma){return 8*Math.PI*Math.sqrt(PHYSICS.epsilon0*gamma*radius**3);}
export function capillaryFrequency(radius,gamma){return Math.sqrt(8*gamma/(PHYSICS.rho*radius**3))/(2*Math.PI);}
export function electricForce(field,jacobian,radius,charge=0){
 const alpha=polarizability(radius),force=field.map(v=>charge*v);
 for(let j=0;j<3;j++)for(let i=0;i<3;i++)force[j]+=alpha*field[i]*jacobian[i*3+j];
 return force;
}
function solve(matrix,rhs){
 const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
 for(let k=0;k<n;k++){
  let best=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[best][k]))best=i;
  [a[k],a[best]]=[a[best],a[k]];const pivot=a[k][k];if(Math.abs(pivot)<1e-15)throw new Error('Electrode solve is singular.');
  for(let j=k;j<=n;j++)a[k][j]/=pivot;
  for(let i=0;i<n;i++)if(i!==k){const factor=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=factor*a[k][j];}
 }
 return a.map(row=>row[n]);
}
function inverse(matrix){
 const n=matrix.length,a=matrix.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>i===j?1:0)]);
 for(let k=0;k<n;k++){
  let best=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[best][k]))best=i;
  [a[k],a[best]]=[a[best],a[k]];const pivot=a[k][k];
  for(let j=0;j<2*n;j++)a[k][j]/=pivot;
  for(let i=0;i<n;i++)if(i!==k){const factor=a[i][k];for(let j=0;j<2*n;j++)a[i][j]-=factor*a[k][j];}
 }
 return a.map(row=>row.slice(n));
}
export class ChargedBlock{
 constructor({edge=.012,divisions=3}={}){
  this.edge=edge;this.centre=[0,0,edge*.5];this.charge=.5e-9;this.points=[];
  for(let axis=0;axis<3;axis++)for(const side of [-1,1])for(let a=0;a<divisions;a++)for(let b=0;b<divisions;b++){
   const p=[0,0,0],other=[0,1,2].filter(v=>v!==axis);p[axis]=side*edge*.5;p[other[0]]=((a+.5)/divisions-.5)*edge;p[other[1]]=((b+.5)/divisions-.5)*edge;this.points.push(p);
  }
  const n=this.points.length,width=edge/divisions,self=4*Math.log(1+Math.SQRT2)/width;
  const matrix=this.points.map((p,i)=>[...this.points.map((q,j)=>i===j?self:1/Math.hypot(...p.map((v,k)=>v-q[k]))),-1]);matrix.push([...Array(n).fill(1),0]);
  const rhs=[...Array(n).fill(0),1],result=solve(matrix,rhs);this.weights=result.slice(0,n);this.potentialCoefficient=result[n];this.inverse=inverse(matrix);this.patchCharges=null;
 }
 redistribute(drops,charge){
  if(charge===0){this.patchCharges=null;return;}
  const rhs=this.points.map(p=>-drops.reduce((sum,drop)=>sum+(drop.charge ?? charge)/Math.max(drop.radius,Math.hypot(p[0]+this.centre[0]-drop.x,p[1]+this.centre[1]-drop.y,p[2]+this.centre[2]-drop.radius)),0));rhs.push(this.charge);
  const solution=this.inverse.map(row=>row.reduce((sum,v,j)=>sum+v*rhs[j],0));this.patchCharges=solution.slice(0,this.points.length);this.distributionCharge=this.charge;this.distributionPotential=solution[this.points.length];
 }
 field(point){
  if(this.patchCharges && this.distributionCharge!==this.charge)this.patchCharges=null;
  if(point.every((v,i)=>Math.abs(v-this.centre[i])<this.edge*.5))return {E:[0,0,0],J:Array(9).fill(0),potential:(this.patchCharges?this.distributionPotential:this.charge*this.potentialCoefficient)/(4*Math.PI*PHYSICS.epsilon0)};
  const E=[0,0,0],J=Array(9).fill(0),ke=1/(4*Math.PI*PHYSICS.epsilon0);let potential=0;
  for(let i=0;i<this.points.length;i++){
   const delta=point.map((v,k)=>v-this.centre[k]-this.points[i][k]),r2=Math.max(1e-12,delta.reduce((s,v)=>s+v*v,0)),r=Math.sqrt(r2),patchCharge=this.patchCharges?this.patchCharges[i]:this.charge*this.weights[i],scale=ke*patchCharge/(r2*r);
   potential+=ke*patchCharge/r;
   for(let a=0;a<3;a++){E[a]+=scale*delta[a];for(let b=0;b<3;b++)J[a*3+b]+=scale*((a===b?1:0)-3*delta[a]*delta[b]/r2);}
  }
  return {E,J,potential};
 }
}
export class EducationWorld{
 constructor(){this.block=new ChargedBlock();this.dropCharge=0;this.concentration=0;this.time=0;this.reset();}
 reset(){
  this.time=0;this.drops=Array.from({length:16},(_,i)=>{const angle=i*Math.PI*2/16,r=.019+(i%3)*.006;return {x:Math.cos(angle)*r,y:Math.sin(angle)*r,radius:.0008+(i%4)*.00013,vx:0,vy:0,force:[0,0,0]};});
 }
 step(dt=1/240){
  dt=Math.max(0,Math.min(1/240,finite(dt)));this.time+=dt;
  const q=this.dropCharge;this.block.redistribute(this.drops,q);const ke=1/(4*Math.PI*PHYSICS.epsilon0),forces=this.drops.map((drop,index)=>{
   const point=[drop.x,drop.y,drop.radius],{E,J}=this.block.field(point);
   for(let j=0;j<this.drops.length;j++)if(j!==index && q!==0){
    const other=this.drops[j],d=[point[0]-other.x,point[1]-other.y,point[2]-other.radius],r2=Math.max((drop.radius+other.radius)**2,d.reduce((sum,v)=>sum+v*v,0)),scale=ke*q/(r2*Math.sqrt(r2));
    for(let a=0;a<3;a++){E[a]+=scale*d[a];for(let b=0;b<3;b++)J[a*3+b]+=scale*((a===b?1:0)-3*d[a]*d[b]/r2);}
   }
   return electricForce(E,J,drop.radius,q);
  });
  for(let i=0;i<this.drops.length;i++){
   const drop=this.drops[i],force=forces[i],mass=4*Math.PI/3*PHYSICS.rho*drop.radius**3,drag=6*Math.PI*PHYSICS.airViscosity*drop.radius,damping=Math.exp(-drag/mass*dt);
   drop.force=force;drop.vx=(drop.vx+force[0]/mass*dt)*damping;drop.vy=(drop.vy+force[1]/mass*dt)*damping;drop.x+=drop.vx*dt;drop.y+=drop.vy*dt;
   const half=this.block.edge*.5,dx=drop.x-this.block.centre[0],dy=drop.y-this.block.centre[1];
   const closest=[Math.max(-half,Math.min(half,dx)),Math.max(-half,Math.min(half,dy))],away=[dx-closest[0],dy-closest[1]],distance=Math.hypot(...away),clearance=drop.radius*3;
   if(distance<clearance){
    let n=distance>1e-12?away.map(v=>v/distance):Math.abs(dx)>Math.abs(dy)?[Math.sign(dx)||1,0]:[0,Math.sign(dy)||1];
    drop.x=this.block.centre[0]+closest[0]+n[0]*clearance;drop.y=this.block.centre[1]+closest[1]+n[1]*clearance;
    const inward=drop.vx*n[0]+drop.vy*n[1];if(inward<0){drop.vx-=inward*n[0];drop.vy-=inward*n[1];}
   }
   for(const axis of ['x','y'])if(Math.abs(drop[axis])>.048-drop.radius){drop[axis]=Math.sign(drop[axis])*(.048-drop.radius);drop[axis==='x'?'vx':'vy']=0;}
  }
 }
}
