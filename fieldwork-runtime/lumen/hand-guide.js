const copy={
 loading:{step:0,title:'A little closer to the light.',text:'Allow camera access to begin. Your hand stays on this device.',hint:'Preparing your hand lens'},
 open:{step:1,title:'Open your hand to the camera.',text:'Spread your thumb and index finger. An open hand brings the whole sculpture into focus.',hint:'Palm towards the camera. Hold for a moment.'},
 pinch:{step:2,title:'Now, touch your fingertips.',text:'Bring thumb and index together. A tiny slice stays sharp as the rest falls softly out of focus.',hint:'Keep your hand at the same distance. Hold briefly.'},
 push:{step:3,title:'Push gently towards the camera.',text:'Keep a little pinch. Reach forward to move that sharp slice deeper into the sculpture.',hint:'Move from your elbow, with your palm facing the camera.'},
 pull:{step:4,title:'And slowly, draw your hand back.',text:'Bring the focus towards you. Open and close your fingers to choose how much you see.',hint:'A small movement is enough.'},
 ready:{step:4,title:'The light is in your hands.',text:'Open to see the whole. Pinch for a sliver of detail. Push and pull to wander through it.',hint:'Explore at your own pace.'},
 centre:{step:0,title:'Find a comfortable distance.',text:'Hold your hand still for a moment. We’ll bring the focus back to you.',hint:'Your finger range stays calibrated.'}
};

export class HandGuide{
 constructor(){this.reset();}
 reset(){this.stage=null;this.elapsed=0;this.held=0;this.anchor=null;this.finished=false;}
 start(){this.reset();this.stage='loading';}
 dismiss(){this.stage=null;this.finished=true;}
 update(status,controls,elapsed=0){
  if(status==='off'||status==='error'){this.reset();return null;}
  if(this.finished)return null;
  const calibration={'calibrating-open':'open','calibrating-pinch':'pinch','calibrating-centre':'centre'}[status];
  if(calibration){this.stage=calibration;this.anchor=null;this.elapsed=this.held=0;}
  else if(status==='loading')this.stage='loading';
  else if(status==='tracking'){
   const dt=Math.max(0,Math.min(.1,elapsed));
   if(['open','pinch'].includes(this.stage)){this.stage='push';this.anchor=controls.focusOffset;this.elapsed=this.held=0;}
   else if(this.stage==='centre'){this.dismiss();return null;}
   else if(this.stage==='push'||this.stage==='pull'){
    this.elapsed+=dt;
    const travel=controls.focusOffset-this.anchor;
    const reached=this.stage==='push'?travel>.13:travel<-.13;
    this.held=reached?this.held+dt:0;
    if(this.held>.18){this.stage=this.stage==='push'?'pull':'ready';this.anchor=controls.focusOffset;this.elapsed=this.held=0;}
   }else if(this.stage==='ready'){this.elapsed+=dt;if(this.elapsed>4){this.dismiss();return null;}}
  }
  if(!this.stage)return null;
  const hint=status==='holding'||status==='reacquiring'?'Bring your hand back into view. Your lens is held steady.':status==='focus-held'||status==='turn-palm'?'Turn your palm towards the camera to explore depth.':copy[this.stage].hint;
  return {...copy[this.stage],stage:this.stage,hint,leaving:this.stage==='ready'&&this.elapsed>3.1,canDismiss:['push','pull','ready'].includes(this.stage)};
 }
}
