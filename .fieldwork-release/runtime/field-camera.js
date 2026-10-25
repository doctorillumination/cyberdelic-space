const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// The sculpted studies use one continuous focus plane, without surface picking.
// Small, slow changes retain the original oil study's macro lens character.
export function fieldCameraPose(base,time,blend){
 const mix=clamp(blend,0,1);
 const eye=base.distanceToEye+mix*.12*Math.sin(time*.065);
 return {...base,roll:0,lightTurn:0,
  distanceToEye:eye,
  focus:base.focus+(eye-base.distanceToEye)+mix*.035*Math.sin(time*.055),
  aperture:base.aperture*(1+mix*.12*Math.sin(time*.08)),
  tilt:base.tilt+mix*.045*Math.sin(time*.06),
  transmission:clamp(base.transmission*(1+mix*.04*Math.sin(time*.05)),0,1)
 };
}
