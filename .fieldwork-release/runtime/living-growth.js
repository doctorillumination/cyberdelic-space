export const GROWTH_PERIOD=32;
const smooth=(lo,hi,value)=>{const x=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));return x*x*(3-2*x);};
export function growthVisibility(generation,progress,family,time,blend=1){
 const reach=1.5+1.7*Math.sin(time*Math.PI*2/GROWTH_PERIOD+family);
 const amount=Math.max(0,Math.min(1,reach-generation));
 return smooth(0,.12,amount)*(1-smooth(amount,amount+.09,progress))*blend;
}
export function stepGrowth(clock,enabled,elapsed,active){
 if(!active)return clock;
 const dt=Math.max(0,Math.min(.1,elapsed));
 const target=enabled?1:0;
 let blend=clock.blend+(target-clock.blend)*(1-Math.exp(-dt/1.2));
 if(Math.abs(target-blend)<.0001)blend=target;
 return {time:clock.time+(enabled?dt:0),blend};
}
export const growthGLSL=`
float livingGrowth(vec4 life,float time,float blend){
 if(life.x<.5)return 1.;
 float reach=1.5+1.7*sin(time*${(Math.PI*2/GROWTH_PERIOD).toFixed(12)}+life.w);
 float amount=clamp(reach-life.y,0.,1.);
 return smoothstep(0.,.12,amount)*(1.-smoothstep(amount,amount+.09,life.z))*blend;
}`;
