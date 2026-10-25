import {growSpecimen} from './growth.js';
export const SHAPES=[
 {id:'oil',name:'Fractal oil',group:'Sculpted fractals',engine:'field',description:'Folded matter, catching light like wet paint.',angle:.48,tilt:.2},
 {id:'coral',name:'Living coral',group:'Branching forms',engine:'grains',growth:true,description:'A crystalline colony, unfolding into finer branches.'},
 {id:'lorenz',name:'Lorenz wings',group:'Strange attractors',engine:'grains',description:'Two intertwined wings, woven from a chaotic flow.'},
 {id:'rossler',name:'Rössler ribbon',group:'Strange attractors',engine:'grains',description:'A spiralling ribbon that folds back through itself.'},
 {id:'aizawa',name:'Aizawa vessel',group:'Strange attractors',engine:'grains',description:'A tangled vessel, with a narrow passage through its heart.'},
 {id:'thomas',name:'Thomas labyrinth',group:'Strange attractors',engine:'grains',description:'A soft, threefold maze of continuous wandering.'},
 {id:'antler',name:'Antler grove',group:'Branching forms',engine:'grains',growth:true,description:'Open limbs divide into a delicate, breathing crown.'},
 {id:'fern',name:'Glass fern',group:'Recursive geometry',engine:'grains',description:'A fern-like recursion, lifted into a thin, curling volume.'},
 {id:'sierpinski',name:'Sierpiński crystal',group:'Recursive geometry',engine:'grains',description:'Triangular chambers nested inside a suspended crystal.'},
 {id:'julia',name:'Julia lace',group:'Sculpted fractals',engine:'field',description:'A porous, folded lattice at the edge of coming apart.',angle:.48,tilt:.2},
 {id:'bulb',name:'Mandelbulb',group:'Sculpted fractals',engine:'field',description:'A dense world of endlessly repeated buds and ridges.',angle:.48,tilt:.2}
];
export function shapeById(id){return SHAPES.find(s=>s.id===id)||SHAPES.find(s=>s.id==='coral');}
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/Math.max(.00000001,Math.hypot(...a)));
function randomSource(seed){let n=((seed+7)*16807)%2147483647;return()=>{n=n*16807%2147483647;return(n-1)/2147483646;};}
function pack(positions,radii,normals,facets,development,baseCount){
 const count=radii.length;
 let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){const j=i%3;lo[j]=Math.min(lo[j],positions[i]);hi[j]=Math.max(hi[j],positions[i]);}
 const centre=lo.map((v,i)=>(v+hi[i])*.5);let extent=0;
 for(let i=0;i<count;i++){const j=i*3;for(let k=0;k<3;k++)positions[j+k]-=centre[k];extent=Math.max(extent,Math.hypot(positions[j],positions[j+1],positions[j+2]));}
 const scale=1.2/Math.max(.00001,extent);
 for(let i=0;i<positions.length;i++)positions[i]*=scale;
 for(let i=0;i<radii.length;i++)radii[i]*=scale;
 return {positions:new Float32Array(positions),radii:new Float32Array(radii),normals:new Float32Array(normals),facets:new Float32Array(facets),development:new Float32Array(development||count*4),count,baseCount:baseCount??count};
}
const systems={
 lorenz:{dt:.007,initial:[.1,.2,.1],flow:([x,y,z])=>[10*(y-x),x*(28-z)-y,x*y-8*z/3],view:([x,y,z])=>[x,z,y],thickness:.055},
 rossler:{dt:.025,initial:[.1,.1,.1],flow:([x,y,z])=>[-y-z,x+.2*y,.2+z*(x-5.7)],view:([x,y,z])=>[x,y,z],thickness:.025},
 aizawa:{dt:.012,initial:[.1,0,0],flow:([x,y,z])=>[(z-.7)*x-3.5*y,3.5*x+(z-.7)*y,.6+.95*z-z*z*z/3-(x*x+y*y)*(1+.25*z)+.1*z*x*x*x],view:([x,y,z])=>[x,.75*z-.66*y,.66*z+.75*y],thickness:.0055},
 thomas:{dt:.045,initial:[.1,.2,.3],flow:([x,y,z])=>[Math.sin(y)-.208186*x,Math.sin(z)-.208186*y,Math.sin(x)-.208186*z],view:p=>p,thickness:.015}
};
function rk4(p,dt,f){const a=f(p),b=f(plus(p,mul(a,dt*.5))),c=f(plus(p,mul(b,dt*.5))),d=f(plus(p,mul(c,dt)));return p.map((v,i)=>v+dt*(a[i]+2*b[i]+2*c[i]+d[i])/6);}
function attractor(id,seed){
 const system=systems[id],rand=randomSource(seed),positions=[],radii=[],normals=[],facets=[];
 let p=system.initial.map(v=>v+(rand()-.5)*.02);
 for(let i=0;i<3500;i++)p=rk4(p,system.dt,system.flow);
 for(let i=0;i<78000;i++){
  const next=rk4(p,system.dt,system.flow),point=system.view(p),direction=norm(system.view(next).map((v,j)=>v-point[j]));
  const u=norm(cross(direction,Math.abs(direction[1])>.9?[1,0,0]:[0,1,0])),v=cross(direction,u);
  for(let j=0;j<3;j++){
   const phi=rand()*Math.PI*2,normal=plus(mul(u,Math.cos(phi)),mul(v,Math.sin(phi)));
   const rr=system.thickness*(.75+rand()*.5),grain=plus(point,mul(normal,rr));
   positions.push(...grain);normals.push(...normal);radii.push(system.thickness*(.72+rand()*.96));facets.push(rand());
  }
  p=next;
  if(!p.every(Number.isFinite)||Math.hypot(...p)>1000)throw Error('The flow escaped its bounded study.');
 }
 return pack(positions,radii,normals,facets);
}
function fern(seed){
 const rand=randomSource(seed),positions=[],radii=[],normals=[],facets=[];let x=0,y=0,z=0;
 for(let i=0;i<245000;i++){
  const r=rand(),xx=x,yy=y;
  if(r<.01){x=0;y=.16*yy;z*=.2;}
  else if(r<.86){x=.85*xx+.04*yy;y=-.04*xx+.85*yy+1.6;z=.85*z+.026*Math.sin(xx*2.4);}
  else if(r<.93){x=.2*xx-.26*yy;y=.23*xx+.22*yy+1.6;z=.2*z+.11*xx+.08;}
  else{x=-.15*xx+.28*yy;y=.26*xx+.24*yy+.44;z=.2*z-.11*xx-.08;}
  if(i<30)continue;
  const normal=norm([rand()-.5,rand()-.5,(rand()>.5?1:-1)*(.5+rand())]);
  positions.push(x+normal[0]*.008,y+normal[1]*.008,z+normal[2]*.014+.15*Math.sin(y*.8));
  normals.push(...normal);radii.push(.006+rand()*.007);facets.push(rand());
 }
 return pack(positions,radii,normals,facets);
}
function sierpinski(seed){
 const rand=randomSource(seed),positions=[],radii=[],normals=[],facets=[];
 const vertices=[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];let p=[0,0,0];
 for(let i=0;i<240020;i++){
  const v=vertices[Math.floor(rand()*4)];p=p.map((x,j)=>(x+v[j])*.5);
  if(i<20)continue;
  const normal=norm(p.map((x,j)=>x+(rand()-.5)*.2));
  positions.push(...p);normals.push(...normal);radii.push(.0019+rand()*.0021);facets.push(rand());
 }
 return pack(positions,radii,normals,facets);
}
function antler(seed){
 const rand=randomSource(seed),strokes=[];
 function limb(start,direction,length,width,level,family){
  direction=norm(direction);const u=norm(cross(direction,Math.abs(direction[1])>.9?[1,0,0]:[0,1,0])),v=cross(direction,u);
  const curl=(rand()-.5)*.8,bend=(rand()-.5)*.8;
  const point=t=>plus(plus(plus(start,mul(direction,length*t)),mul(u,length*curl*t*t)),mul(v,length*bend*t*t));
  strokes.push({point,u,v,length,width,level,family});
  if(level===6)return;
  const count=rand()<.2?3:2,twist=rand()*6.283;
  for(let i=0;i<count;i++){
   const phi=twist+i*6.283/count,spread=.5+rand()*.5;
   const d=plus(plus(mul(direction,.7),mul(u,Math.cos(phi)*spread)),mul(v,Math.sin(phi)*spread));
   limb(point(.93),d,length*(.65+rand()*.1),width*.65,level+1,family);
  }
 }
 for(let i=0;i<5;i++){const phi=i*Math.PI*2/5;limb([0,-.5,0],[Math.cos(phi)*.65,.8,Math.sin(phi)*.65],.6,.028,0,i*.9);}
 let total=0;for(const s of strokes){s.weight=s.length*Math.sqrt(s.width);total+=s.weight;}
 const positions=[],radii=[],normals=[],facets=[],development=[];
 const ordered=[...strokes.filter(s=>s.level<4),...strokes.filter(s=>s.level>=4)];let baseCount=0;
 for(const s of ordered){
  const count=Math.max(6,Math.round(270000*s.weight/total));
  for(let i=0;i<count;i++){
   const t=rand(),phi=rand()*6.283,n=plus(mul(s.u,Math.cos(phi)),mul(s.v,Math.sin(phi))),rr=s.width*(1-t*.55)*(1+.12*Math.sin(t*30));
   positions.push(...plus(s.point(t),mul(n,rr)));normals.push(...n);radii.push(Math.max(.0014,s.width*(.2+rand()*.32)));facets.push(rand());
   development.push(...(s.level>=4?[1,s.level-4,t,s.family]:[0,0,0,0]));
   if(s.level<4)baseCount++;
  }
 }
 return pack(positions,radii,normals,facets,development,baseCount);
}
export function createShape(id,seed=1){
 if(id==='coral')return growSpecimen(seed);
 if(systems[id])return attractor(id,seed);
 if(id==='fern')return fern(seed);
 if(id==='sierpinski')return sierpinski(seed);
 if(id==='antler')return antler(seed);
 throw Error('This study uses the sculpted fractal renderer.');
}
