(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./physics.js'):root.InkPhysics;
  const G=typeof module!=='undefined'?require('./geometry.js'):root.InkGeometry;
  const defaults=Object.freeze({cells:40,spread:104,scale:100,layers:6,coverage:80,variety:100,alignment:'centered',zoom:1,focusX:0,focusY:0,symmetry:'mirror',vocabulary:'core',opacity:.76,blend:'multiply',motion:55,pace:42,evolve:true,grow:false,breathe:true,paused:false});
  const pools=Object.freeze({
    core:['circle','ring','double-ring','target','dot-ring','satellite','cross','x','fine-cross','asterisk','diamond-checks','checker','checker-ring','checker-cross','four-petals','six-petals','star'],
    all:G.forms.map(f=>f.id),
    radial:G.forms.filter(f=>f.family==='radial'||['circle','ring'].includes(f.id)).map(f=>f.id),
    graphic:['cross','x','fine-cross','asterisk','checker','diamond-checks','checker-ring','checker-cross','bars','ladder','stripes'],
    simple:G.forms.filter(f=>f.family==='simple').map(f=>f.id)
  });
  const limits={cells:[4,64],spread:[45,120],scale:[65,165],layers:[1,6],coverage:[0,100],variety:[0,100],zoom:[1,16],focusX:[-1.2,1.2],focusY:[-1.2,1.2],opacity:[.15,1],motion:[0,100],pace:[0,100]};
  function validateSettings(input){
    if(!input||typeof input!=='object')throw new Error('Grid settings are missing.');
    const settings={};
    for(const key of Object.keys(defaults)){
      const value=input[key];
      if(key in limits){const [min,max]=limits[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid grid setting: ${key}.`);}
      else if(['evolve','grow','breathe','paused'].includes(key)){if(typeof value!=='boolean')throw new Error(`Invalid grid setting: ${key}.`);}
      else if(key==='symmetry'){if(!['mirror','rotate','eightfold'].includes(value))throw new Error('Invalid symmetry.');}
      else if(key==='vocabulary'){if(!Object.prototype.hasOwnProperty.call(pools,value))throw new Error('Invalid shape vocabulary.');}
      else if(key==='blend'){if(!['multiply','source-over'].includes(value))throw new Error('Invalid ink blend.');}
      else if(key==='alignment'){if(!['centered','loose'].includes(value))throw new Error('Invalid alignment.');}
      settings[key]=value;
    }
    if(!Number.isInteger(settings.cells)||settings.cells%2||!Number.isInteger(settings.layers))throw new Error('Grid counts must be whole, even dimensions.');
    return settings;
  }
  function dimensions(settings){const nx=settings.cells/2;return {nx,ny:settings.symmetry==='mirror'?Math.max(2,Math.round(nx*.55)):nx};}
  function hash(seed,i,j,generation){return (Math.imul(i+1,73856093)^Math.imul(j+1,19349663)^Math.imul(generation+1,83492791)^seed)>>>0;}
  function recipe(seed,generation,i,j,settings){
    const random=P.random(hash(seed,i,j,generation)),pool=pools[settings.vocabulary];
    const patch=P.random(hash(seed^0x68bc21eb,Math.floor(i/3),Math.floor(j/3),generation));
    const field=P.random(hash(seed^0x02e5be93,i,j,generation));
    const occupied=field()<.62?patch():field();
    if(occupied>=settings.coverage/100)return [];
    const weight=field()<.55?patch():field();
    const varied=1+Math.floor(Math.pow(weight,1.55)*settings.layers);
    const count=Math.max(1,Math.round(settings.layers+(varied-settings.layers)*settings.variety/100));
    const band=Math.floor(Math.hypot(i,j)*.7),motif=Math.floor(random()*pool.length);
    const colors=[0,1,2,3,0,1,2,6,5,4];
    return Array.from({length:count},(_,layer)=>{
      const shape=layer===0&&count>=4&&pool.includes('circle')&&random()<.55?'circle':pool[(motif+band+layer*(3+generation%3))%pool.length];
      const ink=colors[(Math.floor(random()*7)+band+layer*2)%colors.length];
      const angle=Math.floor(random()*4)*Math.PI/2;
      const loose=settings.alignment==='loose';
      return {shape,ink,angle:loose?angle:0,size:layer===0?1:[1,.86,.72,.58][Math.floor(random()*4)],
        dx:loose&&layer>0?(random()-.5)*.27:0,dy:loose&&layer>0?(random()-.5)*.27:0,phase:random()*Math.PI*2};
    });
  }
  function foldPoint(x,y,symmetry){
    if(symmetry==='mirror')return {x:Math.abs(x),y:Math.abs(y)};
    if(symmetry==='eightfold'){const a=Math.abs(x),b=Math.abs(y);return {x:Math.max(a,b),y:Math.min(a,b)};}
    if(x>=0&&y>=0)return {x,y};
    if(x<0&&y>=0)return {x:y,y:-x};
    if(x<0&&y<0)return {x:-x,y:-y};
    return {x:-y,y:x};
  }
  function symmetryTransforms(symmetry){
    if(symmetry==='mirror')return [[1,0,0,1],[-1,0,0,1],[1,0,0,-1],[-1,0,0,-1]];
    const turns=[[1,0,0,1],[0,1,-1,0],[-1,0,0,-1],[0,-1,1,0]];
    return symmetry==='rotate'?turns:turns.concat(turns.map(([a,b,c,d])=>[c,d,a,b]));
  }
  function partMotion(settings,time,cell,part){
    const t=time*(.35+settings.pace*.012),motion=settings.motion/100,phase=cell.i*1.71+cell.j*.83;
    const loose=settings.alignment==='loose';
    return {dx:loose?part.dx+Math.sin(t+part.phase)*.085*motion:0,dy:loose?part.dy+Math.cos(t*.8+part.phase)*.085*motion:0,
      angle:loose?part.angle+Math.sin(t*.65+part.phase)*.32*motion:0,
      breathe:settings.breathe?1+Math.sin(t*1.3+phase)*.075*motion:1};
  }
  class Model{
    constructor(seed=29001,settings={}){
      if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error('Use a seed from 0 to 4294967295.');
      this.seed=seed;this.settings=validateSettings({...defaults,...settings});this.generation=0;this.time=0;this.transition=1;
      this.cells=new Map();this.spread={x:this.settings.spread/100,y:0,tx:this.settings.spread/100,ty:0,vx:0,vy:0};
      this.nextRemix=this.period();this.nextGrow=6;this.growthIndex=0;this.layout(true);
    }
    period(){return 13-this.settings.pace*.09;}
    layout(instant=false){
      const {nx,ny}=dimensions(this.settings);this.nx=nx;this.ny=ny;
      for(const cell of this.cells.values())cell.target=0;
      for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
        const key=`${i}:${j}`,tx=(i+.5)/nx,ty=(j+.5)/ny;
        let cell=this.cells.get(key);
        if(!cell){
          cell={key,i,j,x:tx,y:ty,tx,ty,vx:0,vy:0,amount:instant?1:0,velocity:0,target:1,travelFrom:null};
          cell.parts=recipe(this.seed,this.generation,i,j,this.settings);
          cell.before=recipe(this.seed,Math.max(0,this.generation-1),i,j,this.settings);
          this.cells.set(key,cell);
        }
        cell.tx=tx;cell.ty=ty;cell.target=1;
        if(instant){cell.x=tx;cell.y=ty;cell.vx=0;cell.vy=0;cell.amount=1;cell.velocity=0;}
      }
      if(instant)for(const [key,cell]of this.cells)if(!cell.target)this.cells.delete(key);
    }
    configure(patch){
      const next=validateSettings({...this.settings,...patch}),previous=this.settings;this.settings=next;
      if(next.cells!==previous.cells||next.symmetry!==previous.symmetry)this.layout(next.paused);
      if(['layers','vocabulary','coverage','variety','alignment'].some(key=>next[key]!==previous[key]))this.rebuild();
      if(next.alignment==='centered'&&previous.alignment!=='centered')for(const cell of this.cells.values()){cell.x=cell.tx;cell.y=cell.ty;cell.vx=0;cell.vy=0;}
      if(next.evolve!==previous.evolve||next.pace!==previous.pace)this.nextRemix=this.time+this.period();
      if(next.grow!==previous.grow)this.nextGrow=this.time+6;
      this.spread.tx=next.spread/100;
      if(next.paused){this.spread.x=this.spread.tx;this.spread.vx=0;}
    }
    rebuild(travel=false){
      for(const cell of this.cells.values()){
        cell.before=cell.parts;cell.parts=recipe(this.seed,this.generation,cell.i,cell.j,this.settings);cell.travelFrom=null;
      }
      if(travel&&!this.settings.paused){
        const paired=new Set();
        for(const cell of this.cells.values()){
          if(!cell.target||paired.has(cell.key))continue;
          const random=P.random(hash(this.seed^0x51ed270b,cell.i,cell.j,this.generation));
          if(random()>.22)continue;
          const neighbour=this.cells.get(this.generation%2?`${cell.i+1}:${cell.j}`:`${cell.i}:${cell.j+1}`);
          if(!neighbour?.target||paired.has(neighbour.key)||(!cell.before.length&&!neighbour.before.length))continue;
          paired.add(cell.key);paired.add(neighbour.key);
          cell.parts=neighbour.before;neighbour.parts=cell.before;
          cell.travelFrom={x:neighbour.x,y:neighbour.y};neighbour.travelFrom={x:cell.x,y:cell.y};
        }
      }
      this.transition=this.settings.paused?1:0;
    }
    remix(){this.generation++;this.rebuild(true);this.nextRemix=this.time+this.period();}
    disturb(x,y,strength=1){
      if(this.settings.paused)return;
      const p=foldPoint(x,y,this.settings.symmetry);
      for(const cell of this.cells.values()){
        const dx=(cell.x-p.x)*this.nx,dy=(cell.y-p.y)*this.ny,d=Math.hypot(dx,dy);
        if(d<2.4&&cell.target){
          const push=Math.exp(-d*d*.8)*strength;
          if(this.settings.alignment==='loose'){
            cell.vx+=((d>.02?dx/d:.6)*push*.8)/this.nx;
            cell.vy+=((d>.02?dy/d:.6)*push*.8)/this.ny;
          }
          cell.velocity+=push*2.2;
        }
      }
    }
    nudge(){
      const random=P.random(hash(this.seed,this.generation,0,Math.floor(this.time*100)));
      for(const cell of this.cells.values()){
        if(this.settings.alignment==='loose'){cell.vx+=(random()-.5)*1.6/this.nx;cell.vy+=(random()-.5)*1.6/this.ny;}
        cell.velocity+=(random()-.3)*3;
      }
    }
    step(dt=P.STEP){
      if(this.settings.paused)return;
      this.time+=dt;this.transition=Math.min(1,this.transition+dt/(1.65-this.settings.pace*.009));
      if(this.settings.evolve&&this.time>=this.nextRemix)this.remix();
      if(this.settings.grow&&this.time>=this.nextGrow){
        const cycle=[48,64,48,32,18,8,4,12,24,40];
        this.configure({cells:cycle[this.growthIndex++%cycle.length]});this.nextGrow=this.time+6;
      }
      const config=P.coefficients(36,40);
      P.step(this.spread,dt,config);
      for(const [key,cell]of this.cells){
        P.step(cell,dt,config);
        cell.velocity+=(config.stiffness*(cell.target-cell.amount)-config.friction*cell.velocity)*dt;
        cell.amount+=cell.velocity*dt;
        if(!cell.target&&Math.abs(cell.amount)<.001&&Math.abs(cell.velocity)<.01)this.cells.delete(key);
      }
    }
    snapshot(){return {format:'primitives-grid',version:2,seed:this.seed,generation:this.generation,time:this.time,transition:this.transition,growthIndex:this.growthIndex,
      nextRemix:this.nextRemix,nextGrow:this.nextGrow,settings:{...this.settings},spread:{...this.spread},cells:[...this.cells.values()].map(cell=>({...cell,parts:cell.parts.map(p=>({...p})),before:cell.before.map(p=>({...p})),travelFrom:cell.travelFrom?{...cell.travelFrom}:null}))};}
    static restore(data){
      const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
      if(!data||data.format!=='primitives-grid'||![1,2].includes(data.version)||!Number.isInteger(data.generation)||!finite(data.generation,0,1e7)||!finite(data.time,0,1e8)||!finite(data.transition,0,1)||!Number.isInteger(data.growthIndex)||!finite(data.growthIndex,0,1e8)||!finite(data.nextRemix,0,1e8+20)||!finite(data.nextGrow,0,1e8+20))throw new Error('This is not a supported Primitives grid.');
      const migrated=data.version===1?{...defaults,...data.settings,alignment:'loose',coverage:100,variety:0}:data.settings;
      const model=new Model(data.seed,validateSettings(migrated));
      model.generation=data.generation;model.time=data.time;model.transition=data.transition;model.growthIndex=data.growthIndex;
      model.nextRemix=data.nextRemix;model.nextGrow=data.nextGrow;
      if(data.version===1){model.cells.clear();model.layout(true);return model;}
      const position=(v)=>finite(v,-2,3),velocity=(v)=>finite(v,-100,100);
      const validParts=parts=>Array.isArray(parts)&&parts.length<=6&&parts.every(p=>p&&Object.prototype.hasOwnProperty.call(G.byId,p.shape)&&Number.isInteger(p.ink)&&p.ink>=0&&p.ink<7&&finite(p.angle,-7,7)&&finite(p.size,.1,1.3)&&finite(p.dx,-.2,.2)&&finite(p.dy,-.2,.2)&&finite(p.phase,0,7));
      if(!Array.isArray(data.cells)||data.cells.length>1024||!data.spread||!['x','y','tx','ty'].every(k=>position(data.spread[k]))||!['vx','vy'].every(k=>velocity(data.spread[k])))throw new Error('Invalid grid motion.');
      const cells=new Map();
      for(const c of data.cells){
        if(!c||!Number.isInteger(c.i)||!Number.isInteger(c.j)||c.i<0||c.j<0||c.i>=32||c.j>=32||c.key!==`${c.i}:${c.j}`||cells.has(c.key)||!['x','y','tx','ty'].every(k=>position(c[k]))||!['vx','vy','velocity'].every(k=>velocity(c[k]))||!finite(c.amount,-1,2)||![0,1].includes(c.target)||!validParts(c.parts)||!validParts(c.before)||(c.travelFrom!==null&&(!c.travelFrom||!position(c.travelFrom.x)||!position(c.travelFrom.y))))throw new Error('Invalid grid cell.');
        const clone={};for(const key of ['key','i','j','x','y','tx','ty','vx','vy','amount','velocity','target'])clone[key]=c[key];
        const cloneParts=parts=>parts.map(p=>({shape:p.shape,ink:p.ink,angle:p.angle,size:p.size,dx:p.dx,dy:p.dy,phase:p.phase}));
        clone.parts=cloneParts(c.parts);clone.before=cloneParts(c.before);clone.travelFrom=c.travelFrom?{x:c.travelFrom.x,y:c.travelFrom.y}:null;cells.set(c.key,clone);
      }
      model.cells=cells;for(const key of ['x','y','tx','ty','vx','vy'])model.spread[key]=data.spread[key];
      return model;
    }
  }
  const api=Object.freeze({Model,defaults,pools,dimensions,recipe,foldPoint,symmetryTransforms,partMotion,validateSettings});
  root.InkGrid=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
