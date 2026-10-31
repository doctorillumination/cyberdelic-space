(function(root){
  'use strict';
  const Cyber=typeof module!=='undefined'?require('./cyber-motion.js'):root.PrimitivesCyber;
  class HandView{
    constructor(actions,layout,viewport){this.actions=actions;this.layout=layout;this.viewport=viewport;this.active=false;this.releasing=false;this.lock=0;}
    begin(){
      const m=this.actions.model,current=m.presentation(),[width,height]=this.viewport();
      const frame=this.layout(width,height,current);
      this.actions.beginView();this.base={columns:frame.columns,rows:frame.rows,centerColumn:frame.left+frame.columns/2,centerRow:frame.top+frame.rows/2,zoom:m.settings.zoom};
      this.active=true;this.releasing=false;this.lock=0;this.landing=null;this.lastZoom=m.settings.zoom;
      if(m.settings.energy||m.settings.symmetry==='none')m.viewOverride={columns:this.base.columns,rows:this.base.rows,centerColumn:this.base.centerColumn,centerRow:this.base.centerRow};
      this.actions.onChange('view');
    }
    update(zoom,still,dt){
      if(!this.active)this.begin();
      const m=this.actions.model,[width,height,ratio=1]=this.viewport(),previousZoom=this.lastZoom;
      if(!m.settings.paused&&dt>0)m.handMotion=Math.max(m.handMotion||0,Math.min(1,Math.max(0,Math.log(previousZoom/zoom))/dt*.55));
      this.actions.setView({zoom},false);m.cameraHoldUntil=m.time+6;m.energyStartedAt=m.cameraHoldUntil;
      this.lastZoom=zoom;if(!m.settings.energy&&m.settings.symmetry!=='none')return;
      if(!this.base.columns){this.active=false;this.begin();}
      const shape=f=>({columns:f.columns,rows:f.rows,centerColumn:f.left+f.columns/2,centerRow:f.top+f.rows/2});
      if(!still&&this.landing){
        // Resume from the visible landing frame, without mixing in a newly rounded target.
        this.base={...m.viewOverride,zoom:previousZoom};this.landing=null;this.lock=0;
      }
      const factor=zoom/this.base.zoom,continuous={columns:this.base.columns/factor,rows:this.base.rows/factor,centerColumn:this.base.centerColumn,centerRow:this.base.centerRow};
      if(!still){m.viewOverride=continuous;return;}
      const fit=shape(Cyber.frame(width,height,{...m,viewOverride:null,cyberCamera:null},ratio));
      const changed=this.landing&&Object.keys(fit).some(key=>fit[key]!==this.landing.to[key]);
      if(!this.landing||(this.lock===1&&changed)){
        this.landing={from:this.landing?{...m.viewOverride}:continuous,to:fit};this.lock=0;
      }
      this.lock=Math.min(1,this.lock+dt/.28);
      const p=this.lock,t=p*p*p*(10+p*(-15+6*p)),{from,to}=this.landing;
      const mix=(a,b,scale=false)=>p===1?b:scale?a*Math.pow(b/a,t):a+(b-a)*t;
      m.viewOverride={columns:mix(from.columns,to.columns,true),rows:mix(from.rows,to.rows,true),centerColumn:mix(from.centerColumn,to.centerColumn),centerRow:mix(from.centerRow,to.centerRow)};
    }
    release(){this.releasing=this.active;}
    step(dt){
      if(!this.releasing)return;
      this.update(this.actions.model.settings.zoom,true,dt);
      if((!this.actions.model.settings.energy&&this.actions.model.settings.symmetry!=='none')||this.lock===1){this.actions.model.viewOverride=null;this.active=false;this.releasing=false;this.actions.onChange('view');}
    }
    cancel(){this.active=false;this.releasing=false;this.actions.model.viewOverride=null;this.actions.model.handMotion=0;}
  }
  root.PrimitivesHandView=HandView;if(typeof module!=='undefined')module.exports=HandView;
})(globalThis);
