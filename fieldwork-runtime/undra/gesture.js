export class DoubleTapGesture {
  constructor(){this.current=null;this.previous=null;}
  start(x,y,time){this.current={x,y,time,moved:false};}
  move(x,y){
    if(this.current && Math.hypot(x-this.current.x,y-this.current.y)>12)this.current.moved=true;
  }
  release(x,y,time){
    const tap=this.current;this.current=null;
    if(!tap || tap.moved || time-tap.time>280 || Math.hypot(x-tap.x,y-tap.y)>14){this.previous=null;return false;}
    const previous=this.previous;
    if(previous && time-previous.time<=350 && Math.hypot(x-previous.x,y-previous.y)<=26){this.previous=null;return true;}
    this.previous={x,y,time};return false;
  }
  cancel(){this.current=null;this.previous=null;}
}
