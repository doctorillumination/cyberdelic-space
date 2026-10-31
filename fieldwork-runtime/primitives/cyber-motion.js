(function(root){
  'use strict';
  const Field=typeof module!=='undefined'?require('./field.js'):root.PrimitivesField;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mod=(v,n)=>((v%n)+n)%n;
  function random(seed,a,b=0){let h=(seed^Math.imul(a+1,374761393)^Math.imul(b+1,668265263))>>>0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
  function camera(seconds,settings,seed){
    const poses=[[settings.zoom,settings.focusX,settings.focusY],[1,0,0],[6,.24,-.18],[1.4,-.05,.04],[9,-.29,.23],[2.2,.12,-.1],[1,0,0],[7,.26,.2]];
    const base=[1.1,1.3,1.5,1.25,1.7,1.2,1.55,1.35],holds=[.7,.8,.7,.9,.8,.7,.8,.8];
    const period=22/(.85+settings.pace*.012),elapsed=Math.max(0,seconds),cycle=Math.floor(elapsed/period);
    const durations=base.map((v,i)=>v*(.85+random(seed^0x71ac2,cycle,i)*.3));
    const total=durations.reduce((sum,v,i)=>sum+v+holds[i],0);let phase=(elapsed%period)/period*total,leg=0;
    while(leg<7&&phase>durations[leg]+holds[leg]){phase-=durations[leg]+holds[leg];leg++;}
    const p=clamp(phase/durations[leg]),t=p*p*p*(10+p*(-15+6*p)),a=poses[leg],b=poses[(leg+1)%poses.length];
    const zoom=clamp(Math.exp(Math.log(a[0])+(Math.log(b[0])-Math.log(a[0]))*t),Field.MIN_ZOOM,16),limit=Math.max(0,1-1/zoom)*.96;
    return {zoom,focusX:clamp(a[1]+(b[1]-a[1])*t,-limit,limit),focusY:clamp(a[2]+(b[2]-a[2])*t,-limit,limit),
      from:{zoom:a[0],focusX:a[1],focusY:a[2]},to:{zoom:b[0],focusX:b[1],focusY:b[2]},progress:t,
      leg,cycle,settled:p===1,duration:durations[leg]/total*period};
  }
  function frame(width,height,model,ratio=1){
    const {settings:s,nx,ny}=model,spread=model.spread.x;
    const naturalCell=Math.max(width/(2*nx),height/(2*ny))*spread;
    const even=v=>Math.max(2,Math.round(v/2)*2);
    const maxColumns=Math.max(2,Math.min(480,Math.floor(width/(Field.MIN_CELL*ratio)/2)*2)),maxRows=Math.max(2,Math.min(480,Math.floor(height/(Field.MIN_CELL*ratio)/2)*2));
    const fitted=pose=>{
      const columns=Math.min(maxColumns,even(width/(naturalCell*pose.zoom))),rows=Math.min(maxRows,even(columns*height/width));
      return {columns,rows,cellWidth:width/columns,cellHeight:height/rows,
        centerColumn:Math.round(pose.focusX*nx),centerRow:Math.round(pose.focusY*ny)};
    };
    const motion=model.cyberCamera;let override=!motion&&model.viewOverride;
    if(override){const cap=Math.max(1,override.columns/maxColumns,override.rows/maxRows);if(cap>1)override={...override,columns:override.columns/cap,rows:override.rows/cap};}
    const from=override?{...override,cellWidth:width/override.columns,cellHeight:height/override.rows}:fitted(motion?motion.from:s);
    const to=motion?fitted(motion.to):from,t=motion?motion.progress:1;
    // Fit the destinations once, then glide between them without rounding each animation frame.
    const mix=(a,b)=>t===0?a:t===1?b:a+(b-a)*t;
    const pitch=(a,b)=>t===0?a:t===1?b:a*Math.pow(b/a,t);
    const cellWidth=pitch(from.cellWidth,to.cellWidth),cellHeight=pitch(from.cellHeight,to.cellHeight);
    const columns=from.columns===to.columns?from.columns:t===0?from.columns:t===1?to.columns:width/cellWidth;
    const rows=from.rows===to.rows?from.rows:t===0?from.rows:t===1?to.rows:height/cellHeight;
    const centerColumn=mix(from.centerColumn,to.centerColumn),centerRow=mix(from.centerRow,to.centerRow);
    const locked=override?[columns,rows,centerColumn-columns/2,centerRow-rows/2].every(Number.isInteger):t===0||t===1||(from.columns===to.columns&&from.rows===to.rows&&from.centerColumn===to.centerColumn&&from.centerRow===to.centerRow);
    return {columns,rows,cellWidth,cellHeight,left:centerColumn-columns/2,top:centerRow-rows/2,locked,
      cx:width/2,cy:height/2,zoom:s.zoom,spacing:Math.min(cellWidth,cellHeight),
      halfWidth:nx*cellWidth/(spread*s.zoom),halfHeight:ny*cellHeight/(spread*s.zoom),
      originX:width/2-centerColumn*cellWidth,originY:height/2-centerRow*cellHeight};
  }
  function lane(laneIndex,time,axis,settings,seed){
    const clock=time*(.5+settings.pace*.004),beat=Math.floor(clock),fraction=clock-beat,active=beat%2,cycle=Math.floor(beat/2);
    const moving=.55+random(seed^0xa165,laneIndex+axis*101,beat)*.12;
    const p=clamp(fraction/moving),ease=p*p*(3-2*p),stride=random(seed^0x12f5,laneIndex,axis)>.8?2:1;
    const direction=(laneIndex+axis)%2===0?1:-1;
    const distance=active===axis?cycle+ease:cycle+(active>axis?1:0);
    return direction*distance*stride;
  }
  function position(cell,model){
    return {x:mod(cell.i+.5+lane(cell.j,model.time,0,model.settings,model.seed),model.nx),
      y:mod(cell.j+.5+lane(cell.i,model.time,1,model.settings,model.seed),model.ny)};
  }
  const api=Object.freeze({camera,frame,lane,position,mod});root.PrimitivesCyber=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
