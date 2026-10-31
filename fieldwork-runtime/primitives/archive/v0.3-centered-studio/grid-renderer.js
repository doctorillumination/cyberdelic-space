(function(root){
  'use strict';
  const PAPER='#faf9f3',INKS=['#E82A83','#174BAD','#13A365','#EFCB23','#EF6636','#7957B5','#252821'];
  const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);};
  class Renderer{
    constructor(){
      this.quarter=document.createElement('canvas');this.context=this.quarter.getContext('2d');
      this.paths=Object.fromEntries(root.InkGeometry.forms.map(form=>[form.id,new Path2D(form.d)]));
    }
    layout(width,height,model,ratio=1){
      const roomX=Math.max(1,width/2-30*ratio),roomY=Math.max(1,height/2-49*ratio);
      const spacing=Math.min(roomX/model.nx,roomY/model.ny)*.98;
      const halfWidth=model.nx*spacing,halfHeight=model.ny*spacing,{zoom,focusX,focusY}=model.settings;
      return {cx:width/2,cy:height/2,halfWidth,halfHeight,spacing,zoom,
        originX:width/2-focusX*halfWidth*model.spread.x*zoom,originY:height/2-focusY*halfHeight*model.spread.x*zoom};
    }
    source(context,model,layout,bounds=null){
      const s=model.settings,{halfWidth,halfHeight,spacing}=layout,spread=model.spread.x;
      const draw=(cell,parts,growth,cx=cell.x,cy=cell.y)=>{
        if(growth<.002||cell.amount<.002||!parts.length)return;
        const base=spacing*spread*s.scale/100*Math.max(0,Math.min(1.3,cell.amount))*growth;
        const x=cx*halfWidth*spread,y=cy*halfHeight*spread;
        const radius=base+(s.alignment==='loose'?spacing*.3:0);
        if(bounds&&(x+radius<bounds.left||x-radius>bounds.right||y+radius<bounds.top||y-radius>bounds.bottom))return;
        if(s.symmetry==='eightfold'&&x+base*1.2<y)return;
        for(const part of parts){
          const pose=root.InkGrid.partMotion(s,model.time,cell,part),size=base*part.size*pose.breathe;
          context.save();context.translate(x+pose.dx*spacing*spread,y+pose.dy*spacing*spread);context.rotate(pose.angle);context.scale(size,size);
          context.fillStyle=INKS[part.ink];context.fill(this.paths[part.shape],'nonzero');context.restore();
        }
      };
      context.globalAlpha=s.opacity;context.globalCompositeOperation=s.blend;
      for(const cell of model.cells.values()){
        if(model.transition>=1){draw(cell,cell.parts,1);continue;}
        const stagger=((cell.i*.371+cell.j*.193)%1)*.24;
        const progress=clamp((model.transition-stagger)/(1-stagger));
        if(cell.travelFrom){
          const p=ease(progress),x=cell.travelFrom.x+(cell.x-cell.travelFrom.x)*p,y=cell.travelFrom.y+(cell.y-cell.travelFrom.y)*p;
          draw(cell,cell.parts,1-Math.sin(progress*Math.PI)*.12,x,y);
        }else{
          draw(cell,cell.before,1-ease(progress/.58));
          draw(cell,cell.parts,ease((progress-.26)/.74));
        }
      }
    }
    render(canvas,model,ratio=1){
      const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height,s=model.settings;
      const layout=this.layout(width,height,model,ratio),{cx,cy,originX,originY,zoom}=layout;
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=PAPER;ctx.fillRect(0,0,width,height);
      const transforms=root.InkGrid.symmetryTransforms(s.symmetry);
      if(s.focusX===0&&s.focusY===0){
        const qw=s.symmetry==='mirror'?Math.ceil(width/2):Math.ceil(Math.min(width,height)/2),qh=s.symmetry==='mirror'?Math.ceil(height/2):qw;
        if(this.quarter.width!==qw||this.quarter.height!==qh){this.quarter.width=qw;this.quarter.height=qh;}
        const q=this.context;q.setTransform(1,0,0,1,0,0);q.globalAlpha=1;q.globalCompositeOperation='source-over';q.fillStyle=PAPER;q.fillRect(0,0,qw,qh);
        q.setTransform(zoom,0,0,zoom,0,0);
        this.source(q,model,layout,{left:0,top:0,right:qw/zoom,bottom:qh/zoom});
        for(const [a,b,c,d]of transforms){
          ctx.save();ctx.setTransform(a,b,c,d,cx,cy);
          if(s.symmetry==='eightfold'){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(qw,0);ctx.lineTo(qw,qw);ctx.closePath();ctx.clip();}
          ctx.drawImage(this.quarter,0,0);ctx.restore();
        }
      }else{
        // Redraw vectors at the camera scale instead of enlarging a raster image.
        const extent=Math.max(width,height)*4;
        for(const [a,b,c,d]of transforms){
          const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>{
            x=(x-originX)/zoom;y=(y-originY)/zoom;return {x:a*x+b*y,y:c*x+d*y};
          });
          const bounds={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
          if(bounds.right<0||bounds.bottom<0)continue;
          ctx.save();ctx.setTransform(a*zoom,b*zoom,c*zoom,d*zoom,originX,originY);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(extent,0);ctx.lineTo(extent,extent);
          if(s.symmetry!=='eightfold')ctx.lineTo(0,extent);ctx.closePath();ctx.clip();this.source(ctx,model,layout,bounds);ctx.restore();
        }
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return layout;
    }
  }
  root.InkGridRenderer=Object.freeze({Renderer,PAPER,INKS});
})(globalThis);
