export const CAMERA_DISTANCE = 20;
export const MAX_TILT = 22;
const dot = (a,b) => a.reduce((sum,v,i) => sum + v*b[i],0);
export function cameraFrame(degrees = 10) {
  const tilt = Math.max(0,Math.min(MAX_TILT,Number(degrees) || 0));
  const angle = tilt*Math.PI/180, sine = Math.sin(angle), cosine = Math.cos(angle);
  return { tilt, origin: [0,-sine*CAMERA_DISTANCE,cosine*CAMERA_DISTANCE], forward: [0,sine,-cosine], right: [1,0,0], up: [0,cosine,sine] };
}
export function cameraRay(frame,u,v,view,aspect) {
  const x = (u-.5)*view*aspect, y = (v-.5)*view;
  const direction = frame.forward.map((value,i) => value*CAMERA_DISTANCE + frame.right[i]*x + frame.up[i]*y);
  const length = Math.hypot(...direction);
  return { origin: frame.origin, direction: direction.map(value => value/length) };
}
export function pointOnPlane(ray,height=0) {
  const distance = (height-ray.origin[2])/ray.direction[2];
  return ray.origin.map((value,i) => value + ray.direction[i]*distance);
}
export function focusDistance(frame,position,view,aspect) {
  const point = pointOnPlane(cameraRay(frame,.5,position,view,aspect),.18);
  return dot(point.map((value,i) => value-frame.origin[i]),frame.forward);
}
export function projectPoint(frame,point,view,aspect) {
  const relative = point.map((value,i) => value-frame.origin[i]), depth = dot(relative,frame.forward);
  return [dot(relative,frame.right)*CAMERA_DISTANCE/depth/(view*aspect)+.5,dot(relative,frame.up)*CAMERA_DISTANCE/depth/view+.5];
}
