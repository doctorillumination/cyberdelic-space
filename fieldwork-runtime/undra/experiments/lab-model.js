import { ChargedBlock,PHYSICS,surfactant,laplacePressure,rayleighLimit } from './education-physics.js?v=2.23.6';

export const LAB={metresPerUnit:.005,blockEdge:1,referenceRadius:.001,chargePerMass:.8e-6,accelerationLimit:6};
export const massForRadius=radius=>4*Math.PI/3*PHYSICS.rho*radius**3;
export function labReadouts(radius,concentration){
 const state=surfactant(concentration),r=Math.max(.0001,radius*LAB.metresPerUnit);
 return {...state,radius:r,pressure:laplacePressure(r,state.gamma),chargeLimit:rayleighLimit(r,state.gamma),tensionRatio:state.gamma/PHYSICS.gammaWater};
}
export function acceleration(E,J,chargePerMass=0){
 const coefficient=3*PHYSICS.epsilon0/PHYSICS.rho*(PHYSICS.epsilonWater-1)/(PHYSICS.epsilonWater+2);
 return [0,1,2].map(j=>chargePerMass*E[j]+coefficient*E.reduce((sum,e,i)=>sum+e*J[i*3+j],0));
}
export class LabElectrode{
 constructor(){this.block=new ChargedBlock({edge:LAB.blockEdge*LAB.metresPerUnit});}
 update(body,netCharge,drops=[],chargePerMass=0){
  this.block.centre=[body.x,body.y,body.size[2]].map(v=>v*LAB.metresPerUnit);this.block.charge=netCharge;
  const physical=drops.map(d=>({x:d.x*LAB.metresPerUnit,y:d.y*LAB.metresPerUnit,radius:d.radius*LAB.metresPerUnit,charge:chargePerMass*massForRadius(d.radius*LAB.metresPerUnit)}));
  this.block.redistribute(physical,chargePerMass===0?0:1);
  const charges=this.block.patchCharges ?? this.block.weights.map(weight=>weight*netCharge);
  return this.block.points.map((p,i)=>[...p,charges[i]]);
 }
}

// A spatial teaching model with slower motion and enlarged molecules, not molecular dynamics.
export function molecularLayout(concentration=0){
 const state=surfactant(concentration),water=[],heads=[],tails=[],hydrogenBonds=[],surface=.22;
 const noise=i=>{const v=Math.sin(i*127.1+43.7)*43758.5453;return v-Math.floor(v);};
 const micelle=state.micelleFraction>0;
 for(let i=0;i<30;i++){
  const x=(noise(i*5)-.5)*3.15,y=-.06-noise(i*5+1)*1.38,z=(noise(i*5+2)-.5)*1.45;
  if(micelle && Math.hypot(x-.72,y+.88,z)<.52)continue;
  const angle=noise(i*5+3)*Math.PI*2,tilt=(noise(i*5+4)-.5)*.8,arm=.19,half=52.25*Math.PI/180;
  water.push({oxygen:[x,y,z],hydrogens:[-half,half].map(a=>[x+Math.sin(angle+a)*arm,y+Math.cos(angle+a)*arm*Math.cos(tilt),z+Math.cos(angle+a)*arm*Math.sin(tilt)])});
 }
 for(let i=0;i<water.length;i++)for(let j=0;j<water.length;j++)if(i!==j){
  const donor=water[i],acceptor=water[j].oxygen,d=donor.oxygen.map((v,k)=>acceptor[k]-v),length=Math.hypot(...d);
  if(length>.60 || length<.27)continue;
  for(const h of donor.hydrogens){const v=h.map((p,k)=>p-donor.oxygen[k]),cos=v.reduce((s,p,k)=>s+p*d[k],0)/(.19*length);if(cos>.86){hydrogenBonds.push([h,acceptor]);break;}}
 }
 function amphiphile(head,direction,micellar=false){
  heads.push({point:head,micellar});const chain=[head];
  const side=Math.abs(direction[0])<.8?[1,0,0]:[0,0,1];
  for(let i=1;i<=12;i++)chain.push(head.map((p,k)=>p+direction[k]*i*.061+side[k]*(i%2?.038:-.038)));
  tails.push(chain);
 }
 const count=Math.round(state.coverage*9);
 for(let i=0;i<count;i++)amphiphile([-1.35+i*2.7/Math.max(1,count-1),surface,-.45+.9*noise(i+200)],[.06*Math.sin(i),1,.06*Math.cos(i)]);
 if(micelle)for(let i=0;i<20;i++){
  const y=1-2*(i+.5)/20,a=i*2.39996323,r=Math.sqrt(1-y*y),n=[r*Math.cos(a),y,r*Math.sin(a)],centre=[.72,-.88,0];
  amphiphile(centre.map((v,k)=>v+n[k]*.40),n.map(v=>-v*.45),true);
 }
 const headBonds=[];
 for(const head of heads)for(const m of water){
  for(const h of m.hydrogens){const d=h.map((v,k)=>v-head.point[k]);if(Math.hypot(...d)<.36){headBonds.push([h,head.point]);break;}}
 }
 return {water,heads,tails,hydrogenBonds,headBonds,surface,micelle};
}
