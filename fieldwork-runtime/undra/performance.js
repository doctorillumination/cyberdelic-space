export class FramePacer {
  constructor(fps=60){this.setRate(fps);}
  setRate(fps){this.fps=[30,60].includes(Number(fps))?Number(fps):60;this.next=0;}
  reset(){this.next=0;}
  ready(now){
    if(now+.5<this.next)return false;
    const interval=1000/this.fps;
    this.next=this.next && now-this.next<interval?this.next+interval:now+interval;
    return true;
  }
}

// Bound the queue while allowing the CPU and GPU to overlap their work.
export class FrameFence {
  constructor(gl){this.gl=gl;this.pending=[];this.skipped=0;}
  ready(){
    const gl=this.gl;
    while(this.pending.length){
      const status=gl.clientWaitSync(this.pending[0],0,0);
      if(status===gl.TIMEOUT_EXPIRED)break;
      gl.deleteSync(this.pending.shift());
      if(status===gl.WAIT_FAILED)return false;
    }
    if(this.pending.length>=2){this.skipped++;return false;}
    return true;
  }
  submit(){const sync=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(sync){this.pending.push(sync);this.gl.flush();}}
  clear(){for(const sync of this.pending)this.gl.deleteSync(sync);this.pending=[];}
}

export async function waitForGpu(gl,{timeoutMs=15000}={}){
  const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  if(!sync)throw new Error('Graphics were reset. Reload the artwork and try again.');
  try{
    gl.flush();
    const started=performance.now();
    while(true){
      if(gl.isContextLost())throw new Error('Graphics were reset. Reload the artwork and try again.');
      const status=gl.clientWaitSync(sync,0,0);
      if(status===gl.ALREADY_SIGNALED || status===gl.CONDITION_SATISFIED)return;
      if(status===gl.WAIT_FAILED)throw new Error('A video frame could not finish rendering.');
      if(performance.now()-started>timeoutMs)throw new Error('Graphics stopped responding. Try compatibility mode or a smaller render.');
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }finally{gl.deleteSync(sync);}
}

export function renderDimensions(width,height,{dpr=1,quality='balanced',safe=false,maxSize=16384}={}){
  const pixels=safe?900000:({balanced:2400000,high:4200000,ultra:8000000}[quality] || 2400000);
  const detail=quality==='ultra'?3:quality==='high'?2.5:Math.min(dpr,2);
  const fit=(scale,budget)=>{
    scale=Math.min(scale,Math.sqrt(budget/(width*height)),maxSize/width,maxSize/height);
    return [Math.max(2,Math.floor(width*scale)),Math.max(2,Math.floor(height*scale))];
  };
  return {render:fit(detail,pixels),display:fit(Math.min(dpr,2),Math.max(pixels,4200000))};
}

export class RefinementTiles {
  constructor(size=256){this.size=size;this.index=0;}
  reset(){this.index=0;}
  next(width,height){
    const columns=Math.ceil(width/this.size),rows=Math.ceil(height/this.size),index=this.index++;
    const x=index%columns*this.size,y=Math.floor(index/columns)*this.size;
    const complete=this.index===columns*rows;if(complete)this.reset();
    return {x,y,width:Math.min(this.size,width-x),height:Math.min(this.size,height-y),complete};
  }
}

export async function compileGraphics(renderer,scene,camera,{timeoutMs=20000}={}){
  let timer;
  try{
    await Promise.race([renderer.compileAsync(scene,camera),new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Graphics compilation took too long. Try compatibility mode and copy the graphics diagnostics.')),timeoutMs);
    })]);
  }finally{clearTimeout(timer);}
}
