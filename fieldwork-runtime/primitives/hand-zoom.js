(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MIN_ZOOM=(typeof module!=='undefined'?require('./field.js'):root.PrimitivesField).MIN_ZOOM;
  const CLOSED_SPAN=.24,OPEN_SPAN=.84,LOG_MIN=Math.log(MIN_ZOOM),LOG_MAX=Math.log(16);
  function zoomForSpan(distance){if(distance<=CLOSED_SPAN)return 16;if(distance>=OPEN_SPAN)return MIN_ZOOM;return Math.exp(LOG_MIN+(1-(distance-CLOSED_SPAN)/(OPEN_SPAN-CLOSED_SPAN))*(LOG_MAX-LOG_MIN));}
  function palm(hand,aspect){
    if(!Array.isArray(hand)||hand.length!==21||hand.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
    const points=[0,5,9,17].map(i=>hand[i]);
    const size=Math.hypot((hand[0].x-hand[9].x)*aspect,hand[0].y-hand[9].y);
    if(size<.025||size>.65)return null;
    return {x:points.reduce((sum,p)=>sum+p.x*aspect,0)/4,y:points.reduce((sum,p)=>sum+p.y,0)/4};
  }
  function separation(hands,aspect=4/3){
    if(!Array.isArray(hands)||hands.length!==2)return null;
    const a=palm(hands[0],aspect),b=palm(hands[1],aspect);if(!a||!b)return null;
    const distance=Math.hypot(a.x-b.x,a.y-b.y);
    return distance>=.08?distance:null;
  }
  class Gesture{
    constructor(){this.reset(1);}
    reset(zoom){this.zoom=clamp(zoom,MIN_ZOOM,16);this.target=Math.log(this.zoom);this.candidate=null;this.lastResult=null;this.lastMotion=-Infinity;this.samples=[];this.tracking=false;}
    lose(){this.candidate=null;this.samples=[];this.tracking=false;this.target=Math.log(this.zoom);}
    update(hands,time,aspect,currentZoom=this.zoom){
      const distance=separation(hands,aspect);
      if(distance===null||!Number.isFinite(time)){this.lose();return false;}
      if(this.lastResult!==null&&(time<=this.lastResult||time-this.lastResult>220))this.lose();
      this.lastResult=time;
      this.samples.push(distance);if(this.samples.length>3)this.samples.shift();
      const clean=[...this.samples].sort((a,b)=>a-b)[Math.floor(this.samples.length/2)];
      if(this.candidate===null){this.candidate=time;this.zoom=clamp(currentZoom,MIN_ZOOM,16);this.target=Math.log(this.zoom);}
      if(time-this.candidate<120)return false;
      this.tracking=true;
      const next=Math.log(zoomForSpan(clean));
      if(Math.abs(next-this.target)>.012||next===LOG_MIN||next===LOG_MAX){if(next!==this.target)this.lastMotion=time;this.target=next;}
      return true;
    }
    sample(time,dt){
      if(this.lastResult===null||time-this.lastResult>200)this.lose();
      const current=Math.log(this.zoom),delta=(this.target-current)*(1-Math.exp(-Math.max(0,dt)/.06));
      let next=clamp(current+clamp(delta,-dt*4,dt*4),LOG_MIN,LOG_MAX);
      if(Math.abs(this.target-next)<.0004)next=this.target;
      this.zoom=next===LOG_MAX?16:next===LOG_MIN?MIN_ZOOM:Math.exp(next);
      return {zoom:this.zoom,tracking:this.tracking,still:!this.tracking||(time-this.lastMotion>120&&Math.abs(this.target-Math.log(this.zoom))<.006)};
    }
  }
  const api=Object.freeze({Gesture,separation,zoomForSpan});root.PrimitivesHandZoom=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
