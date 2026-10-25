const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Independent, smooth periods keep the orbit and lens from moving in lockstep.
// Time advances only while the artwork is playing and not being dragged.
export function cinematicPose(base,time,blend){
 const mix=clamp(blend,0,1);
 const eye=base.distanceToEye+mix*(.27*Math.sin(time*.15)+.16*Math.sin(time*.37));
 const normalized=clamp(base.aperture/1.3,.001,.999);
 const apertureWave=1.35*Math.sin(time*.23)+.65*Math.sin(time*.51);
 const logit=Math.log(normalized/(1-normalized));
 const breathingAperture=1.3/(1+Math.exp(-logit-apertureWave));
 return {
  angle:base.angle,
  tilt:base.tilt+mix*(.13*Math.sin(time*.17)+.065*Math.sin(time*.39)),
  roll:mix*.045*Math.sin(time*.19),
  phase:base.phase+mix*base.drift*.6*Math.sin(time*.13),
  distanceToEye:eye,
  focus:eye+(base.focus-base.distanceToEye)+mix*(.56*Math.sin(time*.24)+.25*Math.sin(time*.57)),
  aperture:base.aperture+mix*(breathingAperture-base.aperture),
  transmission:clamp(base.transmission*(1+mix*.1*Math.sin(time*.13)),0,1),
  lightTurn:mix*.22*Math.sin(time*.16)
 };
}

export function stepCamera(rig,base,elapsed,active){
 if(!active)return {rig,angle:base.angle,phase:base.phase,pose:cinematicPose(base,rig.time,rig.blend)};
 const dt=clamp(elapsed,0,.1);
 const time=rig.time+dt;
 const target=base.cinema?1:0;
 let blend=rig.blend+(target-rig.blend)*(1-Math.exp(-dt/1.4));
 if(Math.abs(blend-target)<.0001)blend=target;
 const acceleration=1+blend*(.28*Math.sin(time*.33)+.16*Math.sin(time*.71));
 const angle=base.angle+dt*base.speed*.24*acceleration;
 const phase=base.phase+dt*base.drift*.065;
 const next={time,blend};
 return {rig:next,angle,phase,pose:cinematicPose({...base,angle,phase},time,blend)};
}
