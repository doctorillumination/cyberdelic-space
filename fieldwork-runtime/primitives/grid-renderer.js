(function(root){
  'use strict';
  const PAPER='#faf9f3',INKS=['#E82A83','#174BAD','#13A365','#EFCB23','#EF6636','#7957B5','#252821'];
  const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);};
  class Renderer{
    constructor(options={}){
      this.immersive=Boolean(options.immersive);
      this.quarter=document.createElement('canvas');this.context=this.quarter.getContext('2d');
      this.paths=Object.fromEntries(root.InkGeometry.forms.map(form=>[form.id,new Path2D(form.d)]));
      this.fieldCaches=new Map();this.formIndex=Object.fromEntries(root.InkGeometry.forms.map((form,i)=>[form.id,i]));this.atlases=new Map();
    }
    layout(width,height,model,ratio=1){
      if(model.settings.energy||model.settings.symmetry==='none')return root.PrimitivesCyber.frame(width,height,model,ratio);
      const roomX=Math.max(1,width/2-30*ratio),roomY=Math.max(1,height/2-49*ratio);
      const spacing=this.immersive?Math.max(width/(model.nx*2),height/(model.ny*2))*1.05:Math.min(roomX/model.nx,roomY/model.ny)*.98;
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
    glyphs(pixels=16){
      if(this.atlases.has(pixels))return this.atlases.get(pixels);
      const stride=pixels+4,atlas=document.createElement('canvas');atlas.width=root.InkGeometry.forms.length*stride;atlas.height=INKS.length*stride;
      const ctx=atlas.getContext('2d');
      for(let ink=0;ink<INKS.length;ink++)for(const [shape,index]of Object.entries(this.formIndex)){
        ctx.setTransform(pixels,0,0,pixels,index*stride+stride/2,ink*stride+stride/2);ctx.fillStyle=INKS[ink];ctx.fill(this.paths[shape],'nonzero');
      }
      const result={canvas:atlas,stride,pixels};this.atlases.set(pixels,result);if(this.atlases.size>8)this.atlases.delete(this.atlases.keys().next().value);return result;
    }
    field(canvas,model,ratio){
      const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height,s=model.settings,F=root.PrimitivesField;
      const frame=this.layout(width,height,model,ratio),{cellWidth:cw,cellHeight:ch,left,top,columns,rows}=frame;
      model.field.setWindow(frame);
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=PAPER;ctx.fillRect(0,0,width,height);
      ctx.globalAlpha=s.opacity;ctx.globalCompositeOperation=s.blend;
      const context=(generation,settings)=>{
        const key=[model.seed,generation,settings.pattern,settings.layers,settings.coverage,settings.variety,settings.vocabulary,settings.alignment].join('/');
        if(!this.fieldCaches.has(key)){this.fieldCaches.set(key,new Map());if(this.fieldCaches.size>4)this.fieldCaches.delete(this.fieldCaches.keys().next().value);}
        return {generation,settings:{...settings,symmetry:'none'},cache:this.fieldCaches.get(key)};
      };
      const current=context(model.generation,s),prior=model.transition<1?context(model.fieldBefore.generation,model.fieldBefore.settings):null;
      const parts=(owner,i,j,source)=>{
        let value=source.cache.get(owner);
        if(value===undefined){value=root.InkGrid.recipe(model.seed,source.generation,i,j,source.settings);source.cache.set(owner,value);}
        return value;
      };
      const size=frame.spacing*s.scale/100*.90,phase=model.field.phase(),atlas=frame.spacing<35?this.glyphs(Math.max(8,Math.round(frame.spacing*.9/2)*2)):null;
      let visible=0,drawn=0;
      const draw=(owner,x,y)=>{
        const px=(x-left)*cw,py=(y-top)*ch;if(px<=0||py<=0||px>=width||py>=height)return;
        visible++;const i=owner%F.WORLD-F.WORLD/2,j=Math.floor(owner/F.WORLD)-F.WORLD/2,cell={i,j};
        const now=parts(owner,i,j,current);
        const stagger=F.hash(model.seed^0x921,i,j)*.24,progress=clamp((model.transition-stagger)/(1-stagger));
        const drawParts=(stack,growth)=>{
          if(!stack.length||growth<.002)return;
          const shared=s.alignment==='centered'?root.InkGrid.partMotion(s,model.time,cell,stack[0]):null;
          for(const part of stack){
            const pose=shared||root.InkGrid.partMotion(s,model.time,cell,part),cx=px+pose.dx*cw,cy=py+pose.dy*ch;
            const edge=Math.max(0,Math.min(cx,width-cx,cy,height-cy)-.25),extent=Math.abs(Math.cos(pose.angle))+Math.abs(Math.sin(pose.angle));
            const mark=Math.min(size*part.size*pose.breathe*growth,edge*2/extent);if(mark<.1)continue;
            if(atlas){
              if(shared)ctx.drawImage(atlas.canvas,this.formIndex[part.shape]*atlas.stride+2,part.ink*atlas.stride+2,atlas.pixels,atlas.pixels,cx-mark/2,cy-mark/2,mark,mark);
              else{ctx.setTransform(Math.cos(pose.angle),Math.sin(pose.angle),-Math.sin(pose.angle),Math.cos(pose.angle),cx,cy);ctx.drawImage(atlas.canvas,this.formIndex[part.shape]*atlas.stride+2,part.ink*atlas.stride+2,atlas.pixels,atlas.pixels,-mark/2,-mark/2,mark,mark);ctx.setTransform(1,0,0,1,0,0);}
            }else{const co=Math.cos(pose.angle)*mark,si=Math.sin(pose.angle)*mark;ctx.setTransform(co,si,-si,co,cx,cy);ctx.fillStyle=INKS[part.ink];ctx.fill(this.paths[part.shape],'nonzero');}
            drawn++;
          }
        };
        if(prior){drawParts(parts(owner,i,j,prior),1-ease(progress/.65));drawParts(now,ease((progress-.18)/.82));}else drawParts(now,1);
      };
      if(phase.axis===0){
        for(let row=Math.floor(top)-1;row<=Math.ceil(top+rows)+1;row++){
          const shift=model.field.shift(row,phase.beat)*phase.amount;
          for(let col=Math.floor(left-shift)-1;col<=Math.ceil(left+columns-shift)+1;col++)draw(model.field.ownerAt(col,row),col+.5+shift,row+.5);
        }
      }else{
        for(let col=Math.floor(left)-1;col<=Math.ceil(left+columns)+1;col++){
          const shift=model.field.shift(col,phase.beat)*phase.amount;
          for(let row=Math.floor(top-shift)-1;row<=Math.ceil(top+rows-shift)+1;row++)draw(model.field.ownerAt(col,row),col+.5,row+.5+shift);
        }
      }
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return {...frame,visibleCells:visible,drawnLayers:drawn,shuffleAxis:phase.axis};
    }
    cyber(canvas,model,ratio=1){
      const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height,s=model.settings;
      const frame=this.layout(width,height,model,ratio),{cellWidth:cw,cellHeight:ch,left,top,columns,rows}=frame;
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=PAPER;ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation=s.blend;ctx.globalAlpha=s.opacity;
      const periodX=model.nx*2,periodY=model.ny*2,transforms=root.InkGrid.symmetryTransforms(s.symmetry);
      const minTileX=Math.floor((left+model.nx)/periodX),maxTileX=Math.floor((left+columns+model.nx-1e-7)/periodX);
      const minTileY=Math.floor((top+model.ny)/periodY),maxTileY=Math.floor((top+rows+model.ny-1e-7)/periodY);
      const size=frame.spacing*s.scale/100*.94;
      for(const cell of model.cells.values()){
        if(!cell.target||cell.amount<.002)continue;
        const p=root.PrimitivesCyber.position(cell,model);
        if(s.symmetry==='eightfold'&&p.y>p.x+1e-8)continue;
        const planeEdge=Math.min(p.x,model.nx-p.x,p.y,model.ny-p.y),planeScale=Math.min(1,planeEdge/.49);
        const stagger=((cell.i*.371+cell.j*.193)%1)*.24,progress=clamp((model.transition-stagger)/(1-stagger));
        const sets=model.transition>=1?[[cell.parts,1]]:[[cell.before,1-ease(progress/.65)],[cell.parts,ease((progress-.18)/.82)]];
        for(let tileY=minTileY;tileY<=maxTileY;tileY++)for(let tileX=minTileX;tileX<=maxTileX;tileX++)for(const [a,b,c,d]of transforms){
          const x=(a*p.x+c*p.y+tileX*periodX-left)*cw,y=(b*p.x+d*p.y+tileY*periodY-top)*ch;
          if(x<=0||y<=0||x>=width||y>=height)continue;
          for(const [parts,growth]of sets){
            if(growth<.002)continue;
            const base=size*Math.max(0,Math.min(1.3,cell.amount))*planeScale*growth;
            for(const part of parts){
              const pose=root.InkGrid.partMotion(s,model.time,cell,part);
              const px=x+(a*pose.dx+c*pose.dy)*cw,py=y+(b*pose.dx+d*pose.dy)*ch;
              const edge=Math.min(px,width-px,py,height-py)-.25;
              // Arriving marks grow at the boundary instead of leaving cropped fragments.
              const rotationExtent=Math.abs(Math.cos(pose.angle))+Math.abs(Math.sin(pose.angle));
              const markSize=Math.min(base*part.size*pose.breathe,Math.max(0,edge*2/rotationExtent));if(markSize<.1)continue;
              ctx.save();ctx.translate(px,py);ctx.transform(a,b,c,d,0,0);ctx.rotate(pose.angle);ctx.scale(markSize,markSize);
              ctx.fillStyle=INKS[part.ink];ctx.fill(this.paths[part.shape],'nonzero');ctx.restore();
            }
          }
        }
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return frame;
    }
    render(canvas,model,ratio=1){
      model=model.presentation?model.presentation():model;
      if(model.settings.symmetry==='none')return this.field(canvas,model,ratio);
      if(model.settings.energy)return this.cyber(canvas,model,ratio);
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
