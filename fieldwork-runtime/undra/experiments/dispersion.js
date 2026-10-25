export const WATER={gravity:9.81,density:998,surfaceTension:.0728,viscosity:1e-6,worldUnit:.1,depth:.025};
export function waveFrequency(k,depth=WATER.depth,surfaceTension=WATER.surfaceTension){
  if(!Number.isFinite(k) || k<=0)return 0;
  depth=Math.max(.005,Math.min(.12,Number.isFinite(depth)?depth:WATER.depth));
  return Math.sqrt((WATER.gravity*k+surfaceTension/WATER.density*k**3)*Math.tanh(k*depth));
}
export function evolveMode(height,velocity,k,dt,{depth=WATER.depth,drag=.35,surfaceTension=WATER.surfaceTension}={}){
  const omega=waveFrequency(k,depth,surfaceTension);if(!omega)return [0,0];
  const gamma=Math.max(0,drag)*.5+2*WATER.viscosity*k*k;
  const difference=omega*omega-gamma*gamma,damped=Math.sqrt(Math.max(Math.abs(difference),1e-12));
  const c=difference>=0?Math.cos(damped*dt):Math.cosh(damped*dt),s=(difference>=0?Math.sin(damped*dt):Math.sinh(damped*dt))/damped,a=Math.exp(-gamma*dt);
  return [a*((c+gamma*s)*height+s*velocity),a*(-omega*omega*s*height+(c-gamma*s)*velocity)];
}
