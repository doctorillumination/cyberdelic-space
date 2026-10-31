import {FIELD_APERTURE_SCALE} from './lens.js';

function units(pose,engine){
 // Sculpted fields occupy a larger depth range and use a smaller physical pupil.
 return {focus:engine==='field'?1.35:1,aperture:(pose.lensScale??1)*(engine==='field'?FIELD_APERTURE_SCALE:1)};
}

export function readHandLens(pose,engine){
 const scale=units(pose,engine);
 return {focusOffset:(pose.focus-pose.distanceToEye)/scale.focus,aperture:pose.aperture/scale.aperture};
}

export function applyHandLens(pose,controls,blend,engine){
 const amount=Math.max(0,Math.min(1,blend)),scale=units(pose,engine);
 return {...pose,
  focus:pose.focus+(pose.distanceToEye+controls.focusOffset*scale.focus-pose.focus)*amount,
  aperture:pose.aperture+(controls.aperture*scale.aperture-pose.aperture)*amount,
  focusBand:(pose.focusBand??0)*(1-amount)
 };
}
