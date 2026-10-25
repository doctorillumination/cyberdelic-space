export const GROW_DELAY = 420;
export const GROW_DURATION = 3500;
export const GROW_MIN = .06;
export const GROW_MAX = .72;
export const BRUSH_RADIUS = 1.9;
export const SPLIT_MIN_RADIUS = .04;

export function grownSplitPlan(volume,freeSlots) {
  if(!Number.isFinite(volume) || volume<=0 || !Number.isInteger(freeSlots) || freeSlots<1)return null;
  const radius=Math.cbrt(volume);
  const pieces=Math.min(4,Math.max(2,Math.floor((radius/.4)**3)+1),freeSlots+1,Math.floor(volume/SPLIT_MIN_RADIUS**3+1e-6));
  if(pieces<2)return null;
  return {pieces,volume:volume/pieces,radius:Math.cbrt(volume/pieces)};
}

export class HoldToGrow {
  constructor() { this.cancel(); }
  start(x,y,time,pointerType='mouse') {
    this.current={x,y,time,touch:pointerType==='touch',growing:false};
  }
  move(x,y) {
    const hold=this.current;
    if(!hold)return false;
    const tolerance=hold.touch?(hold.growing?26:18):(hold.growing?14:8);
    if(Math.hypot(x-hold.x,y-hold.y)>tolerance){this.cancel();return true;}
    return false;
  }
  sample(time) {
    const hold=this.current;
    if(!hold)return null;
    const age=Math.max(0,time-hold.time);
    if(age<GROW_DELAY)return {phase:'waiting',progress:age/GROW_DELAY,radius:0};
    const starting=!hold.growing;hold.growing=true;
    const t=Math.min(1,(age-GROW_DELAY)/GROW_DURATION),ease=t*t*(3-2*t);
    return {phase:starting?'start':'growing',progress:t,radius:GROW_MIN+(GROW_MAX-GROW_MIN)*ease};
  }
  cancel() { this.current=null; }
}

// Keep packed active rows intact when uploading them into a larger texture.
export function padRows(data,count,rows,capacity) {
  if(!Number.isInteger(count) || count<1 || count>capacity || data.length!==count*rows*4)throw new RangeError('Invalid packed droplet rows.');
  const padded=new Float32Array(capacity*rows*4);
  for(let row=0;row<rows;row++)padded.set(data.subarray(row*count*4,(row+1)*count*4),row*capacity*4);
  return padded;
}
