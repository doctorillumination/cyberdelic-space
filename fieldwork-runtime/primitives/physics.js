(function(root){
  'use strict';
  const STEP=1/120;
  function random(seed) {
    let a=seed>>>0;
    return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
  }
  function coefficients(spring,damping) {
    const stiffness=28+spring*2.5;
    const ratio=.14+damping*.016;
    return {stiffness,friction:2*Math.sqrt(stiffness)*ratio};
  }
  function step(body, dt, config) {
    const {stiffness,friction}=config;
    body.vx+=(stiffness*(body.tx-body.x)-friction*body.vx)*dt;
    body.vy+=(stiffness*(body.ty-body.y)-friction*body.vy)*dt;
    body.x+=body.vx*dt; body.y+=body.vy*dt;
    if(Math.abs(body.x-body.tx)<.001&&Math.abs(body.vx)<.001){body.x=body.tx;body.vx=0;}
    if(Math.abs(body.y-body.ty)<.001&&Math.abs(body.vy)<.001){body.y=body.ty;body.vy=0;}
  }
  function contain(body,width,height) {
    const r=body.size*.47;
    const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
    body.tx=limit(body.tx,r,width-r);body.ty=limit(body.ty,r,height-r);
    if(body.x<r){body.x=r;body.vx=Math.abs(body.vx)*.3;}
    if(body.x>width-r){body.x=width-r;body.vx=-Math.abs(body.vx)*.3;}
    if(body.y<r){body.y=r;body.vy=Math.abs(body.vy)*.3;}
    if(body.y>height-r){body.y=height-r;body.vy=-Math.abs(body.vy)*.3;}
  }
  const api={STEP,random,coefficients,step,contain};
  root.InkPhysics=Object.freeze(api);
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
