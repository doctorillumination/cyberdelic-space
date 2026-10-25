// A reproducible wind and condensation model. Stored drawing points stay unchanged.
export function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function cloudState(stroke,time,aspect=1){
 const r=random(stroke.seed),phase=r()*Math.PI*2,speed=.0045+r()*.005,duration=76+r()*42;
 const age=Math.max(0,time-(stroke.born||0)),cycle=(age/duration)%1;
 const mass=cycle<.7?1-smooth(.38,.66,cycle):smooth(.73,.98,cycle);
 let min=1,max=0;for(const p of stroke.points){min=Math.min(min,p.x);max=Math.max(max,p.x);}
 const center=(min+max)*.5,margin=(max-min)*.5+stroke.radius*1.5/aspect;
 const travel=age*speed/aspect+.012*(Math.sin(age*.075+phase)-Math.sin(phase))/aspect;
 const period=1+2*margin,raw=center+travel;
 const wrapped=((raw+margin)%period+period)%period-margin;
 return{age,phase,duration,mass,dx:wrapped-center,dy:.008*(Math.sin(age*.065+phase)-Math.sin(phase)),scale:(.66+.34*Math.sqrt(mass))*(1+.075*(Math.sin(age*.14+phase)-Math.sin(phase)))};
}
export function livingPoint(point,index,state,aspect=1){
 const p=state.phase,indexPhase=index*.51;
 const xWave=Math.sin(state.age*.17+point.y*8+p+indexPhase*.08)-Math.sin(point.y*8+p+indexPhase*.08);
 const yWave=Math.sin(state.age*.14+point.x*9+p)-Math.sin(point.x*9+p);
 return{x:point.x+state.dx+xWave*.010/aspect,y:point.y+state.dy+yWave*.009,p:point.p||1};
}

// Each occupied vertical run contributes its lower edge, including stacked clouds.
export function cloudUndersides(mask,width,height,stride=3){
 const sources=[];
 for(let x=1;x<width-1;x+=stride){
  for(let y=1;y<height-1;y++){
   const d=mask[y*width+x];
   if(d<38||mask[(y-1)*width+x]>=38)continue;
   let thickness=0;for(let yy=y;yy<Math.min(height,y+7);yy++)if(mask[yy*width+x]>=38)thickness++;
   if(thickness<3)continue;
   let left=x,right=x;const reach=Math.floor(stride/2);
   while(left>x-reach&&mask[y*width+left-1]>=38)left--;
   while(right<x+reach&&mask[y*width+right+1]>=38)right++;
   sources.push({x:(left+right+1)/(2*width),y:Math.max(0,(y-.8)/height),width:(right-left+1)/width,strength:Math.min(1,thickness/5)});
  }
 }
 return sources;
}
export class RainModel {
 constructor(seed=71593){this.random=random(seed);this.sources=[];this.drops=[];this.carry=0;}
 setSources(sources){this.sources=sources;}
 clear(){this.drops=[];this.carry=0;}
 update(delta,amount,wind,aspect=1){
  const dt=Math.max(0,Math.min(delta,.15));if(!dt)return;
  const surviving=[];
  for(const d of this.drops){
   d.age+=dt;d.vx+=(wind*d.speed*.17/aspect-d.vx)*Math.min(dt*3,1);d.x+=d.vx*dt;d.y-=d.speed*dt;
   if(d.y>-.07&&d.x>-.1&&d.x<1.1&&d.age<5)surviving.push(d);
  }
  this.drops=surviving;
  if(!this.sources.length||amount<=0){this.carry=0;return;}
  const rate=this.sources.reduce((sum,s)=>sum+s.strength,0)*(2+amount*8);
  this.carry+=rate*dt;
  const count=Math.min(Math.floor(this.carry),Math.max(0,5000-this.drops.length));this.carry-=Math.floor(this.carry);
  for(let i=0;i<count;i++){
   const source=this.sources[Math.floor(this.random()*this.sources.length)];
   if(this.random()>source.strength)continue;
   const depth=this.random(),speed=.36+depth*1.45;
   this.drops.push({x:source.x+(this.random()-.5)*source.width,y:source.y,depth,speed,vx:wind*speed*.17/aspect,age:0,shine:.7+this.random()*.65});
  }
 }
}
