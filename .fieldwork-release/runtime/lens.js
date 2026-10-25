const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

export function stepLens(rig,enabled,elapsed,active){
 if(!active)return rig;
 const dt=clamp(elapsed,0,.1),target=enabled?1:0;
 let blend=rig.blend+(target-rig.blend)*(1-Math.exp(-dt/2));
 if(Math.abs(blend-target)<.0001)blend=target;
 return {time:rig.time+dt,blend};
}

// Move the camera and narrow the view together, keeping the centre plane's size.
export function lensPose(pose,compression=.5,rig={time:0,blend:0},engine='grains'){
 const travel=rig.blend*(.19*Math.sin(rig.time*.105)+.07*Math.sin(rig.time*.173));
 const setting=clamp(compression+travel,0,1);
 const scale=setting<.5?Math.exp((1-setting*2)*Math.log(.6)):Math.exp((setting*2-1)*Math.log(2.4));
 const field=engine==='field';
 const eye=field?4.6+(pose.distanceToEye-11.5)*.4:pose.distanceToEye;
 const focus=field?4.05+(pose.focus-11.1)*.4:pose.focus;
 return {...pose,distanceToEye:eye*scale,focus:focus+eye*(scale-1),aperture:pose.aperture*(field?.078125:1)*scale,lens:(field?.69:.255)/scale,lensScale:scale,compression:setting};
}
