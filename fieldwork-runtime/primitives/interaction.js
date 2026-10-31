(function(root){
  'use strict';
  const MIN_ZOOM=(typeof module!=='undefined'?require('./field.js'):root.PrimitivesField).MIN_ZOOM;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // Pointer, touch, and hand inputs share the same view actions.
  class Interaction{
    constructor(model,onChange=()=>{}){this.model=model;this.onChange=onChange;}
    replace(model){this.model=model;this.onChange('composition');}
    configure(patch){this.model.configure(patch);this.onChange('composition');}
    pause(){this.configure({paused:!this.model.settings.paused});}
    remix(){this.model.remix();this.onChange('composition');}
    pulse(point,strength=1){this.model.disturb(point.x,point.y,strength);}
    beginView(){if(this.model.settings.energy)this.model.holdCamera();this.model.viewOverride=null;return {...this.model.settings};}
    setView(view,hold=true){
      if(hold)this.beginView();const zoom=clamp(view.zoom??this.model.settings.zoom,MIN_ZOOM,16),limit=Math.max(0,1-1/zoom)*.96;
      this.model.configure({zoom,focusX:clamp(view.focusX??this.model.settings.focusX,-limit,limit),focusY:clamp(view.focusY??this.model.settings.focusY,-limit,limit)});
      this.onChange('view');
    }
    zoomTo(value,anchor={x:0,y:0}){
      const s=this.beginView(),zoom=clamp(value,MIN_ZOOM,16);
      this.setView({zoom,focusX:s.focusX+anchor.x/s.zoom-anchor.x/zoom,focusY:s.focusY+anchor.y/s.zoom-anchor.y/zoom},false);
    }
    fit(){this.setView({zoom:1,focusX:0,focusY:0});}
    toggleEnergy(){
      const energy=!this.model.settings.energy;
      this.configure({energy,...(!energy?{zoom:1,focusX:0,focusY:0}:{})});
    }
  }
  root.PrimitivesInteraction=Interaction;if(typeof module!=='undefined')module.exports=Interaction;
})(globalThis);
