/* Primitives: vector ink on a shared plane. No network or build step. */
(function(){
  'use strict';
  const G=window.InkGeometry, P=window.InkPhysics, $=id=>document.getElementById(id);
  const canvas=$('stage'), ctx=canvas.getContext('2d'), wrap=$('canvas-wrap');
  const WORLD={width:1000,height:680}, PAPER='#faf9f3';
  const inks=[
    {name:'Rose',hex:'#E82A83'}, {name:'Cobalt',hex:'#174BAD'},
    {name:'Emerald',hex:'#13A365'}, {name:'Sunflower',hex:'#EFCB23'},
    {name:'Tangerine',hex:'#EF6636'}, {name:'Violet',hex:'#7957B5'},
    {name:'Carbon',hex:'#252821'}
  ];
  const paths=Object.fromEntries(G.forms.map(f=>[f.id,new Path2D(f.d)]));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const state={bodies:[],selected:null,ink:0,opacity:.76,blend:'multiply',spring:35,damping:58,
    paused:reduced.matches,breathe:false,returnHome:false,zoom:1,seed:2901,filter:'all',nextId:1,time:0};
  let viewport={width:1,height:1,scale:1,x:0,y:0},pointer=null,lastTime=0,accumulator=0,toastTimer;
  let cardCanvases=[];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
  function selected(){return state.bodies.find(b=>b.id===state.selected);}
  function makeBody(shape,color,x,y,size,angle=0){
    return {id:state.nextId++,shape,color,x,y,tx:x,ty:y,hx:x,hy:y,vx:0,vy:0,size,baseSize:size,angle,phase:state.nextId*.83};
  }
  function syncList(){
    const select=$('piece-select');
    select.replaceChildren(new Option('Select a piece…',''));
    for(const b of state.bodies)select.add(new Option(`${String(b.id).padStart(2,'0')} / ${G.byId[b.shape].name} / ${inks.find(i=>i.hex===b.color)?.name||b.color}`,String(b.id)));
    select.value=state.selected===null?'':String(state.selected);
    $('stage-count').textContent=`${state.bodies.length} ${state.bodies.length===1?'piece':'pieces'}`;
  }
  function choose(id){
    state.selected=id;
    const b=selected();
    $('selection-name').textContent=b?`${String(b.id).padStart(2,'0')} / ${G.byId[b.shape].name}`:'Select a piece to make it your own.';
    $('selection-actions').hidden=!b;
    $('size').disabled=!b;$('rotation').disabled=!b;
    $('size').value=b?b.size/b.baseSize*100:100;
    $('size-value').textContent=b?`${Math.round(b.size/b.baseSize*100)}%`:'100%';
    $('rotation').value=b?Math.round(b.angle*180/Math.PI):0;
    $('rotation-value').textContent=b?`${Math.round(b.angle*180/Math.PI)}°`:'0°';
    $('piece-select').value=b?String(b.id):'';
    if(b){const index=inks.findIndex(i=>i.hex===b.color);if(index>=0)setInk(index,false);}
  }
  function setInk(index,recolor=true){
    state.ink=index;
    document.querySelectorAll('.swatch').forEach((s,i)=>{s.classList.toggle('active',i===index);s.setAttribute('aria-pressed',String(i===index));});
    $('colour-name').textContent=inks[index].name;$('colour-code').textContent=inks[index].hex;
    if(recolor&&selected()){selected().color=inks[index].hex;syncList();}
  }
  function addShape(id){
    if(state.bodies.length>=180){toast('This study is full. Clear a few pieces to add more.');return;}
    const rand=P.random(state.seed+state.nextId*17);
    const b=makeBody(id,inks[state.ink].hex,500+(rand()-.5)*200,340+(rand()-.5)*140,210);
    state.bodies.push(b);syncList();choose(b.id);
    $('stage-hint').textContent='Your new piece is ready. Drag it into the conversation.';
    if(document.body.classList.contains('library-only')){setView(false);$('canvas-wrap').scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});}
    toast(`${G.byId[id].name} added`);
  }
  function study(seed=state.seed){
    state.seed=seed;state.bodies=[];state.nextId=1;state.selected=null;state.zoom=1;state.time=0;state.breathe=false;$('breathe').checked=false;
    const r=P.random(seed), first=seed===2901;
    function add(shape,color,x,y,size,angle=0){
      const shift=first?0:(r()-.5)*20;
      state.bodies.push(makeBody(shape,inks[color].hex,x+shift,y+shift,size,angle));
    }
    const c=first?0:Math.floor(r()*inks.length);
    const ink=i=>(i+c)%inks.length;
    add('double-ring',ink(1),190,210,225);
    add('circle',ink(3),216,210,116);
    add('x',ink(0),500,210,230);
    add('ring',ink(2),520,210,245);
    add('checker',ink(6),800,210,220);
    add('ring',ink(0),800,210,248);
    add('dot-ring',ink(1),190,480,238);
    add('cross',ink(3),190,480,197);
    add('fine-cross',ink(2),190,480,197,Math.PI/4);
    add('four-petals',ink(0),500,480,235);
    add('ring',ink(1),520,480,200);
    add('circle',ink(3),520,480,105);
    add('target',ink(2),800,480,228);
    add('diamond-checks',ink(0),800,480,235);
    state.zoom=1;$('zoom-value').textContent='100%';
    $('stage-label').textContent='Overlap study';$('stage-hint').textContent='Drag a shape. Let the colours meet.';
    syncList();choose(null);resize();
  }
  function transform(){
    const scale=Math.min(viewport.width/WORLD.width,viewport.height/WORLD.height)*state.zoom;
    viewport.scale=scale;viewport.x=(viewport.width-WORLD.width*scale)/2;viewport.y=(viewport.height-WORLD.height*scale)/2;
  }
  function resize(){
    const bounds=wrap.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    viewport.width=bounds.width;viewport.height=bounds.height;
    const dpr=Math.min(devicePixelRatio||1,2.5);
    canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);
    transform();
  }
  function effectiveSize(b){return b.size*(state.breathe?1+Math.sin(state.time*1.35+b.phase)*.055:1);}
  function drawBody(context,b,scale=1){
    context.save();context.translate(b.x,b.y);context.rotate(b.angle);
    const s=effectiveSize(b)*scale;context.scale(s,s);context.fillStyle=b.color;
    context.fill(paths[b.shape],'nonzero');context.restore();
  }
  function paint(){
    const dpr=canvas.width/viewport.width;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.fillStyle=PAPER;ctx.fillRect(0,0,viewport.width,viewport.height);
    ctx.save();ctx.translate(viewport.x,viewport.y);ctx.scale(viewport.scale,viewport.scale);
    ctx.globalCompositeOperation=state.blend;ctx.globalAlpha=state.opacity;
    for(const b of state.bodies)drawBody(ctx,b);
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const b=selected();
    if(b){
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.strokeStyle='#47654b';ctx.lineWidth=.8/viewport.scale;ctx.setLineDash([3/viewport.scale,4/viewport.scale]);
      const s=effectiveSize(b)*.5+10/viewport.scale;ctx.strokeRect(-s,-s,s*2,s*2);
      ctx.setLineDash([]);ctx.fillStyle=PAPER;ctx.lineWidth=1/viewport.scale;
      for(const [x,y]of[[-s,-s],[s,-s],[s,s],[-s,s]]){ctx.fillRect(x-2/viewport.scale,y-2/viewport.scale,4/viewport.scale,4/viewport.scale);ctx.strokeRect(x-2/viewport.scale,y-2/viewport.scale,4/viewport.scale,4/viewport.scale);}
      ctx.restore();
    }
    ctx.restore();
  }
  function frame(timestamp){
    const elapsed=lastTime?Math.min((timestamp-lastTime)/1000,.1):0;lastTime=timestamp;
    if(!state.paused){
      state.time+=elapsed;accumulator+=elapsed;
      const config=P.coefficients(state.spring,state.damping);
      while(accumulator>=P.STEP){
        for(const b of state.bodies){P.step(b,P.STEP,config);P.contain(b,WORLD.width,WORLD.height);}
        accumulator-=P.STEP;
      }
    }else accumulator=0;
    paint();requestAnimationFrame(frame);
  }
  function toWorld(event){
    const b=canvas.getBoundingClientRect();
    return {x:(event.clientX-b.left-viewport.x)/viewport.scale,y:(event.clientY-b.top-viewport.y)/viewport.scale};
  }
  const hitCtx=document.createElement('canvas').getContext('2d');
  function hit(p){
    for(let i=state.bodies.length-1;i>=0;i--){
      const b=state.bodies[i],dx=p.x-b.x,dy=p.y-b.y,c=Math.cos(-b.angle),s=Math.sin(-b.angle),size=effectiveSize(b);
      if(hitCtx.isPointInPath(paths[b.shape],(dx*c-dy*s)/size,(dx*s+dy*c)/size,'nonzero'))return b;
    }
    return null;
  }
  function release(event){
    if(!pointer||event.pointerId!==pointer.id)return;
    const b=state.bodies.find(b=>b.id===pointer.body);
    if(b){
      if(state.returnHome){b.tx=b.hx;b.ty=b.hy;}
      else{b.hx=b.tx;b.hy=b.ty;}
    }
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    pointer=null;canvas.classList.remove('dragging');
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||pointer)return;
    const p=toWorld(event),b=hit(p);choose(b?.id??null);canvas.focus({preventScroll:true});
    if(!b)return;
    pointer={id:event.pointerId,body:b.id,dx:p.x-b.x,dy:p.y-b.y};
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');
    event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
    const p=toWorld(event);
    if(pointer?.id===event.pointerId){
      const b=selected();if(!b)return;
      b.tx=p.x-pointer.dx;b.ty=p.y-pointer.dy;P.contain(b,WORLD.width,WORLD.height);
      if(state.paused){b.x=b.tx;b.y=b.ty;b.vx=0;b.vy=0;}
      $('stage-hint').textContent='Same shapes. New conversations.';
    }else if(!pointer)canvas.style.cursor=hit(p)?'grab':'default';
  });
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('keydown',event=>{
    const b=selected();
    if(event.key==='Escape'){choose(null);return;}
    if(event.code==='Space'){event.preventDefault();togglePause();return;}
    if(!b)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const d=event.shiftKey?20:5;
      b.tx+=(event.key==='ArrowRight'?d:event.key==='ArrowLeft'?-d:0);b.ty+=(event.key==='ArrowDown'?d:event.key==='ArrowUp'?-d:0);
      P.contain(b,WORLD.width,WORLD.height);b.hx=b.tx;b.hy=b.ty;
      if(state.paused){b.x=b.tx;b.y=b.ty;}
    }
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove();}
  });
  function togglePause(){state.paused=!state.paused;syncPause();}
  function syncPause(){$('pause').setAttribute('aria-pressed',String(state.paused));$('pause-icon').textContent=state.paused?'▷':'Ⅱ';$('pause-text').textContent=state.paused?'Play':'Pause';}
  function remove(){if(!selected())return;state.bodies=state.bodies.filter(b=>b.id!==state.selected);syncList();choose(null);}
  function setView(library){
    document.body.classList.toggle('library-only',library);
    $('playground-tab').classList.toggle('active',!library);$('library-tab').classList.toggle('active',library);
    $('playground-tab').setAttribute('aria-pressed',String(!library));$('library-tab').setAttribute('aria-pressed',String(library));
    $('library-instruction').firstChild.textContent=library?'Choose a form to begin an encounter ':'Click a form to add it to the playground ';
    requestAnimationFrame(()=>{resize();drawCards();});
  }
  function drawCards(){
    const dpr=Math.min(devicePixelRatio||1,2);
    cardCanvases.forEach(({canvas:card,form,color})=>{
      const rect=card.getBoundingClientRect();if(!rect.width)return;
      card.width=Math.round(rect.width*dpr);card.height=Math.round(rect.height*dpr);
      const c=card.getContext('2d'),s=Math.min(card.width,card.height)*.66;
      c.translate(card.width/2,card.height/2+card.height*.035);c.scale(s,s);c.fillStyle=color;c.globalAlpha=.87;c.fill(paths[form.id],'nonzero');
    });
  }
  function buildLibrary(){
    const library=$('shape-library');library.replaceChildren();cardCanvases=[];
    G.forms.filter(f=>state.filter==='all'||f.family===state.filter).forEach(form=>{
      const card=document.createElement('button');card.className='shape-card';card.setAttribute('aria-label',`Add ${form.name}`);
      const number=document.createElement('span');number.className='shape-number';number.textContent=String(form.index+1).padStart(2,'0');
      const plus=document.createElement('span');plus.className='shape-add';plus.textContent='+';plus.setAttribute('aria-hidden','true');
      const image=document.createElement('canvas');image.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='shape-label';label.textContent=form.name;
      const family=document.createElement('span');family.className='shape-family';family.textContent=form.family;
      card.append(number,plus,image,label,family);card.addEventListener('click',()=>addShape(form.id));library.append(card);
      cardCanvases.push({canvas:image,form,color:inks[[0,1,2,6,1,0,1,0,2,3,0,1,2,4,5,6,0,3,2,1,0,2,6,1,2,0,4,3,5,1,2,0][form.index]].hex});
    });
    requestAnimationFrame(drawCards);
  }
  inks.forEach((ink,i)=>{
    const button=document.createElement('button');button.className='swatch';button.style.background=ink.hex;button.title=ink.name;button.setAttribute('aria-label',`${ink.name} ink`);button.setAttribute('aria-pressed',String(i===0));button.addEventListener('click',()=>setInk(i));$('swatches').append(button);
  });
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
    state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});buildLibrary();
  }));
  $('playground-tab').addEventListener('click',()=>setView(false));$('library-tab').addEventListener('click',()=>setView(true));
  $('new-study').addEventListener('click',()=>{study(state.seed+1);toast(`Study ${state.seed}`);});
  $('fit').addEventListener('click',()=>{
    state.zoom=1;state.bodies.forEach(b=>{b.tx=b.hx;b.ty=b.hy;if(state.paused){b.x=b.tx;b.y=b.ty;}});
    $('zoom-value').textContent='100%';transform();
  });
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await wrap.requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}
  });
  $('pause').addEventListener('click',togglePause);
  $('nudge').addEventListener('click',()=>{
    if(state.paused){state.paused=false;syncPause();}
    const rand=P.random(state.seed+Math.floor(state.time*1000));state.bodies.forEach(b=>{b.vx+=(rand()-.5)*1100;b.vy+=(rand()-.5)*1100;});
  });
  $('breathe').addEventListener('change',event=>{state.breathe=event.target.checked;});
  $('return-home').addEventListener('change',event=>{state.returnHome=event.target.checked;});
  $('opacity').addEventListener('input',event=>{state.opacity=Number(event.target.value)/100;$('opacity-value').textContent=`${event.target.value}%`;});
  function setBlend(mode){
    state.blend=mode;
    $('blend-multiply').classList.toggle('active',mode==='multiply');$('blend-normal').classList.toggle('active',mode==='source-over');
    $('blend-multiply').setAttribute('aria-pressed',String(mode==='multiply'));$('blend-normal').setAttribute('aria-pressed',String(mode==='source-over'));
    $('blend-note').textContent=mode==='multiply'?'Layers multiply into deeper, mixed colours.':'Translucent colour, with the upper layer leading.';
  }
  $('blend-multiply').addEventListener('click',()=>setBlend('multiply'));$('blend-normal').addEventListener('click',()=>setBlend('source-over'));
  function motionLabels(){
    $('spring-value').textContent=state.spring<30?'Gentle':state.spring<65?'Soft':'Snappy';
    $('damping-value').textContent=state.damping<30?'Bouncy':state.damping<75?'Balanced':'Settled';
  }
  $('spring').addEventListener('input',event=>{state.spring=Number(event.target.value);motionLabels();});
  $('damping').addEventListener('input',event=>{state.damping=Number(event.target.value);motionLabels();});
  $('size').addEventListener('input',event=>{
    const b=selected();if(!b)return;b.size=b.baseSize*Number(event.target.value)/100;P.contain(b,WORLD.width,WORLD.height);$('size-value').textContent=`${event.target.value}%`;
  });
  $('rotation').addEventListener('input',event=>{const b=selected();if(!b)return;b.angle=Number(event.target.value)*Math.PI/180;$('rotation-value').textContent=`${event.target.value}°`;});
  $('piece-select').addEventListener('change',event=>choose(event.target.value?Number(event.target.value):null));
  $('duplicate').addEventListener('click',()=>{
    const b=selected();if(!b)return;
    if(state.bodies.length>=180){toast('This study is full.');return;}
    const copy=makeBody(b.shape,b.color,b.x+30,b.y+30,b.size,b.angle);copy.baseSize=b.baseSize;P.contain(copy,WORLD.width,WORLD.height);
    state.bodies.push(copy);syncList();choose(copy.id);
  });
  $('front').addEventListener('click',()=>{const b=selected();if(!b)return;state.bodies=state.bodies.filter(p=>p!==b);state.bodies.push(b);syncList();});
  $('remove').addEventListener('click',remove);
  $('clear').addEventListener('click',()=>{state.bodies=[];syncList();choose(null);$('stage-hint').textContent='An open page. Add a shape from the library below.';});
  function zoom(delta){state.zoom=clamp(Math.round((state.zoom+delta)*10)/10,.5,2);$('zoom-value').textContent=`${Math.round(state.zoom*100)}%`;transform();}
  $('zoom-out').addEventListener('click',()=>zoom(-.1));$('zoom-in').addEventListener('click',()=>zoom(.1));
  function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('export').addEventListener('click',()=>{
    const output=document.createElement('canvas');output.width=2400;output.height=1632;
    const c=output.getContext('2d');c.fillStyle=PAPER;c.fillRect(0,0,output.width,output.height);c.scale(2.4,2.4);
    c.globalCompositeOperation=state.blend;c.globalAlpha=state.opacity;state.bodies.forEach(b=>drawBody(c,b));
    output.toBlob(blob=>{if(blob){download(blob,`primitives-${state.seed}.png`);toast('Image saved without selection guides.');}},'image/png');
  });
  function snapshot(){return {format:'primitives-study',version:1,seed:state.seed,
    settings:{opacity:state.opacity,blend:state.blend,spring:state.spring,damping:state.damping,returnHome:state.returnHome,breathe:state.breathe,paused:state.paused,time:state.time},
    pieces:state.bodies.map(({id,shape,color,x,y,tx,ty,hx,hy,size,baseSize,angle,phase})=>({id,shape,color,x,y,tx,ty,hx,hy,size,baseSize,angle,phase}))};}
  $('save-study').addEventListener('click',()=>{download(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),`primitives-study-${state.seed}.json`);toast('Study saved. Load it here to continue.');});
  $('load-study').addEventListener('click',()=>$('study-file').click());
  function validateStudy(data){
    if(data.format!=='primitives-study'||data.version!==1||!Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295||!Array.isArray(data.pieces)||data.pieces.length>180)throw new Error('This is not a supported Primitives study.');
    const s=data.settings,finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
    if(!s||!finite(s.opacity,.15,1)||!['multiply','source-over'].includes(s.blend)||!finite(s.spring,0,100)||!finite(s.damping,0,100)||!finite(s.time,0,1e8)||['returnHome','breathe','paused'].some(k=>typeof s[k]!=='boolean'))throw new Error('The study settings are invalid.');
    const ids=new Set();
    for(const b of data.pieces){
      if(!b||!Object.prototype.hasOwnProperty.call(G.byId,b.shape)||!/^#[0-9a-f]{6}$/i.test(b.color)||!Number.isInteger(b.id)||b.id<1||b.id>1e7||ids.has(b.id)||!finite(b.size,1,1000)||!finite(b.baseSize,1,1000)||b.size/b.baseSize<.399||b.size/b.baseSize>2.001||!finite(b.angle,-Math.PI,Math.PI)||!finite(b.phase,0,1e8)||['x','y','tx','ty','hx','hy'].some(k=>!finite(b[k],-1000,2000)))throw new Error('A piece in this study is invalid.');
      ids.add(b.id);
    }
    return data;
  }
  $('study-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>1e6)throw new Error('This file is too large for a Primitives study.');
      const data=validateStudy(JSON.parse(await file.text()));
      const bodies=data.pieces.map(b=>({id:b.id,shape:b.shape,color:b.color,x:b.x,y:b.y,tx:b.tx,ty:b.ty,hx:b.hx,hy:b.hy,size:b.size,baseSize:b.baseSize,angle:b.angle,phase:b.phase,vx:0,vy:0}));
      state.bodies=bodies;state.seed=data.seed;
      for(const key of ['opacity','blend','spring','damping','returnHome','breathe','paused','time'])state[key]=data.settings[key];
      state.nextId=Math.max(0,...bodies.map(b=>b.id))+1;
      state.zoom=1;$('zoom-value').textContent='100%';transform();setBlend(state.blend);
      $('opacity').value=state.opacity*100;$('opacity-value').textContent=`${Math.round(state.opacity*100)}%`;
      $('spring').value=state.spring;$('damping').value=state.damping;$('breathe').checked=state.breathe;$('return-home').checked=state.returnHome;
      $('stage-hint').textContent='Drag a shape. Let the colours meet.';
      motionLabels();syncPause();syncList();choose(null);setView(false);toast('Study restored.');
    }catch(error){toast(error instanceof SyntaxError?'This file is not valid JSON.':error.message);}
    event.target.value='';
  });
  new ResizeObserver(()=>{resize();drawCards();}).observe(wrap);
  window.addEventListener('resize',drawCards);
  document.addEventListener('visibilitychange',()=>{lastTime=0;accumulator=0;});
  setInk(0,false);syncPause();buildLibrary();study();if(location.hash==='#library')setView(true);requestAnimationFrame(frame);
  // A read-only diagnostic surface supports local verification without mutating the study.
  window.Primitives=Object.freeze({version:'0.1.0',snapshot:()=>JSON.parse(JSON.stringify(snapshot())),validateStudy});
})();
