(function(){
  'use strict';
  const $=id=>document.getElementById(id),Grid=window.InkGrid,P=window.InkPhysics;
  const canvas=$('grid-stage'),wrap=$('grid-wrap'),renderer=new window.InkGridRenderer.Renderer();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let model=new Grid.Model(29001,{paused:reduced.matches,evolve:!reduced.matches});
  let lastTime=0,accumulator=0,needsPaint=true,ratio=1,layout=null,lastSync='',toastTimer,lastPointer=0,activePointer=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const presets={
    open:{cells:8,spread:100,scale:100,layers:3,coverage:70,variety:100,alignment:'centered',zoom:1,focusX:0,focusY:0,symmetry:'mirror',vocabulary:'core'},
    woven:{cells:20,spread:104,scale:100,layers:5,coverage:82,variety:100,alignment:'centered',zoom:1,focusX:0,focusY:0,symmetry:'mirror',vocabulary:'core'},
    dense:{cells:40,spread:104,scale:100,layers:6,coverage:80,variety:100,alignment:'centered',zoom:1,focusX:0,focusY:0,symmetry:'mirror',vocabulary:'core'},
    kaleidoscope:{cells:32,spread:104,scale:100,layers:6,coverage:78,variety:100,alignment:'centered',zoom:1,focusX:0,focusY:0,symmetry:'eightfold',vocabulary:'radial'}
  };
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
  function sync(){
    const s=model.settings;
    for(const key of ['cells','spread','scale','layers','coverage','variety','opacity','motion','pace']){
      const input=$(`grid-${key}`),value=key==='opacity'?Math.round(s.opacity*100):s[key];
      input.value=value;
      $(`grid-${key}-value`).textContent=key==='pace'?(value<30?'Drifting':value<65?'Unhurried':'Lively'):key==='layers'?`Up to ${value}`:String(value)+(['spread','scale','coverage','variety','opacity','motion'].includes(key)?'%':'');
    }
    for(const key of ['evolve','grow','breathe'])$(`grid-${key}`).checked=s[key];
    $('grid-vocabulary').value=s.vocabulary;
    if(document.activeElement!==$('grid-seed'))$('grid-seed').value=model.seed;
    document.querySelectorAll('[data-symmetry]').forEach(b=>{const active=b.dataset.symmetry===s.symmetry;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-blend]').forEach(b=>{const active=b.dataset.blend===s.blend;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-alignment]').forEach(b=>{const active=b.dataset.alignment===s.alignment;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-preset]').forEach(b=>{const active=Object.entries(presets[b.dataset.preset]).every(([key,value])=>s[key]===value);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('grid-pause').setAttribute('aria-pressed',String(s.paused));$('grid-pause-icon').textContent=s.paused?'▷':'Ⅱ';$('grid-pause-text').textContent=s.paused?'Play':'Pause';
    $('cells-readout').textContent=`${model.nx*2} × ${model.ny*2}`;$('grid-count').textContent=`${model.nx*2} × ${model.ny*2} cells`;
    $('generation').textContent=`GEN ${String(model.generation+1).padStart(3,'0')}`;
    const name={mirror:'Mirrored',rotate:'Quarter turns',eightfold:'Eightfold'}[s.symmetry];
    $('grid-label').textContent=`${name} / ${s.paused?'paused':s.grow?'growing':s.evolve?'evolving':'playing'}`;
    $('symmetry-caption').textContent={mirror:'Four reflections, one shared motion.',rotate:'A quarter turn, echoed around the centre.',eightfold:'Eight echoes, folded into one field.'}[s.symmetry];
    $('fewer').disabled=s.cells===4;$('more').disabled=s.cells===64;
    $('grid-zoom').value=s.zoom;$('grid-zoom-value').textContent=`${Math.round(s.zoom*100)}%`;
    $('zoom-less').disabled=s.zoom===1;$('zoom-more').disabled=s.zoom===16;
    $('grid-hint').textContent=s.zoom>1?'Drag to explore. Double-click to return.':'Scroll to zoom. Double-click a mark to look closer.';
    wrap.classList.toggle('is-zoomed',s.zoom>1);
    canvas.dataset.symmetry=s.symmetry;wrap.dataset.symmetry=s.symmetry;canvas.dataset.columns=String(s.cells);canvas.dataset.rows=String(model.ny*2);
    lastSync=`${s.cells}/${model.generation}/${s.paused}/${s.grow}/${s.evolve}`;
  }
  function configure(patch){model.configure(patch);sync();needsPaint=true;}
  function resize(){
    const bounds=wrap.getBoundingClientRect();ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(2,Math.round(bounds.width*ratio/2)*2);canvas.height=Math.max(2,Math.round(bounds.height*ratio/2)*2);needsPaint=true;
  }
  function frame(timestamp){
    const dt=lastTime?Math.min((timestamp-lastTime)/1000,.1):0;lastTime=timestamp;
    if(!model.settings.paused&&!document.hidden){
      accumulator+=dt;
      while(accumulator>=P.STEP){model.step(P.STEP);accumulator-=P.STEP;}
      needsPaint=true;
    }else accumulator=0;
    if(needsPaint){layout=renderer.render(canvas,model,ratio);needsPaint=false;}
    const s=model.settings;
    if(lastSync!==`${s.cells}/${model.generation}/${s.paused}/${s.grow}/${s.evolve}`)sync();
    requestAnimationFrame(frame);
  }
  function remix(){model.remix();needsPaint=true;sync();}
  function pause(){configure({paused:!model.settings.paused});}
  function count(delta){configure({cells:clamp(model.settings.cells+delta,4,64),grow:false});}
  function newSeed(value){
    if(!Number.isInteger(value)||value<0||value>4294967295){toast('Use a whole seed from 0 to 4294967295.');return;}
    model=new Grid.Model(value,{...model.settings});needsPaint=true;sync();
  }
  function gesture(event,strength=1){
    if(!layout)return;
    const rect=canvas.getBoundingClientRect(),spread=Math.max(.1,model.spread.x);
    const px=(event.clientX-rect.left)*canvas.width/rect.width-layout.originX;
    const py=(event.clientY-rect.top)*canvas.height/rect.height-layout.originY;
    model.disturb(px/layout.halfWidth/spread/layout.zoom,py/layout.halfHeight/spread/layout.zoom,strength);
  }
  function zoomTo(value,event=null){
    value=clamp(value,1,16);let {focusX,focusY}=model.settings;
    if(event&&layout){
      const rect=canvas.getBoundingClientRect(),spread=Math.max(.1,model.spread.x);
      const x=((event.clientX-rect.left)*canvas.width/rect.width-layout.cx)/(layout.halfWidth*spread);
      const y=((event.clientY-rect.top)*canvas.height/rect.height-layout.cy)/(layout.halfHeight*spread);
      focusX+=x/model.settings.zoom-x/value;focusY+=y/model.settings.zoom-y/value;
    }
    configure({zoom:value,focusX:value===1?0:clamp(focusX,-1.2,1.2),focusY:value===1?0:clamp(focusY,-1.2,1.2)});
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||activePointer!==null)return;
    activePointer={id:event.pointerId,x:event.clientX,y:event.clientY,focusX:model.settings.focusX,focusY:model.settings.focusY,panning:model.settings.zoom>1};
    canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});if(!activePointer.panning)gesture(event,2.1);event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
    if(activePointer?.id===event.pointerId&&activePointer.panning&&layout){
      const rect=canvas.getBoundingClientRect(),spread=Math.max(.1,model.spread.x),scale=canvas.width/rect.width;
      configure({focusX:clamp(activePointer.focusX-(event.clientX-activePointer.x)*scale/(layout.halfWidth*spread*layout.zoom),-1.2,1.2),
        focusY:clamp(activePointer.focusY-(event.clientY-activePointer.y)*scale/(layout.halfHeight*spread*layout.zoom),-1.2,1.2)});return;
    }
    if(event.timeStamp-lastPointer<32)return;lastPointer=event.timeStamp;
    if(model.settings.zoom===1)gesture(event,activePointer?.id===event.pointerId ? .55 : .20);
  });
  function release(event){if(activePointer?.id!==event.pointerId)return;activePointer=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoomTo(model.settings.zoom*Math.exp(-event.deltaY*.0025),event);},{passive:false});
  canvas.addEventListener('dblclick',event=>{event.preventDefault();zoomTo(model.settings.zoom<2?6:1,event);});
  canvas.addEventListener('keydown',event=>{
    if(event.code==='Space'){event.preventDefault();pause();}
    else if(event.key.toLowerCase()==='r'){event.preventDefault();remix();}
    else if(event.key==='+'||event.key==='='){event.preventDefault();count(2);}
    else if(event.key==='-'||event.key==='_'){event.preventDefault();count(-2);}
    else if(event.key==='0'){event.preventDefault();zoomTo(1);}
    else if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();configure({spread:clamp(model.settings.spread+(event.key==='ArrowUp'?3:-3),45,120)});
    }
  });
  $('grid-pause').addEventListener('click',pause);$('remix').addEventListener('click',remix);
  $('fewer').addEventListener('click',()=>count(-2));$('more').addEventListener('click',()=>count(2));
  $('grid-nudge').addEventListener('click',()=>{if(model.settings.paused)configure({paused:false});model.nudge();needsPaint=true;});
  for(const key of ['cells','spread','scale','layers','coverage','variety','opacity','motion','pace'])$(`grid-${key}`).addEventListener('input',event=>{
    const value=Number(event.target.value);configure({[key]:key==='opacity'?value/100:value,...(key==='cells'?{grow:false}:{})});
  });
  for(const key of ['evolve','grow','breathe'])$(`grid-${key}`).addEventListener('change',event=>configure({[key]:event.target.checked}));
  $('grid-vocabulary').addEventListener('change',event=>configure({vocabulary:event.target.value}));
  document.querySelectorAll('[data-symmetry]').forEach(button=>button.addEventListener('click',()=>configure({symmetry:button.dataset.symmetry})));
  document.querySelectorAll('[data-blend]').forEach(button=>button.addEventListener('click',()=>configure({blend:button.dataset.blend})));
  document.querySelectorAll('[data-alignment]').forEach(button=>button.addEventListener('click',()=>configure({alignment:button.dataset.alignment})));
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{configure({...presets[button.dataset.preset],grow:false});}));
  $('seed-go').addEventListener('click',()=>newSeed(Number($('grid-seed').value)));
  $('seed-next').addEventListener('click',()=>newSeed((model.seed+1)>>>0));$('seed-prev').addEventListener('click',()=>newSeed((model.seed-1)>>>0));
  $('grid-seed').addEventListener('keydown',event=>{if(event.key==='Enter')newSeed(Number(event.target.value));});
  $('grid-reset').addEventListener('click',()=>{model=new Grid.Model(29001,{paused:reduced.matches,evolve:!reduced.matches});sync();needsPaint=true;toast('Original grid restored.');});
  $('grid-fit').addEventListener('click',()=>configure({spread:104,zoom:1,focusX:0,focusY:0}));
  $('grid-zoom').addEventListener('input',event=>zoomTo(Number(event.target.value)));
  $('zoom-less').addEventListener('click',()=>zoomTo(model.settings.zoom/1.5));
  $('zoom-more').addEventListener('click',()=>zoomTo(model.settings.zoom*1.5));
  $('zoom-fit').addEventListener('click',()=>zoomTo(1));
  $('grid-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await wrap.requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}});
  function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('grid-export').addEventListener('click',()=>{
    const output=document.createElement('canvas');output.width=2400;output.height=Math.round(2400*canvas.height/canvas.width/2)*2;
    const exporter=new window.InkGridRenderer.Renderer();exporter.render(output,model,ratio*2400/canvas.width);
    output.toBlob(blob=>{if(blob){download(blob,`primitives-grid-${model.seed}-${model.generation}.png`);toast('Grid image saved.');}},'image/png');
  });
  $('grid-save').addEventListener('click',()=>{download(new Blob([JSON.stringify(model.snapshot(),null,2)],{type:'application/json'}),`primitives-grid-${model.seed}.json`);toast('Grid saved with its seed, composition, and timing.');});
  $('grid-load').addEventListener('click',()=>$('grid-file').click());
  $('grid-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error('This grid file is too large.');
      const restored=Grid.Model.restore(JSON.parse(await file.text()));
      if(reduced.matches)restored.configure({paused:true});model=restored;accumulator=0;lastTime=0;sync();needsPaint=true;toast('Grid restored.');
    }catch(error){toast(error instanceof SyntaxError?'This file is not valid JSON.':error.message);}
    event.target.value='';
  });
  new ResizeObserver(resize).observe(wrap);document.addEventListener('visibilitychange',()=>{lastTime=0;accumulator=0;});
  reduced.addEventListener('change',event=>{if(event.matches)configure({paused:true});});
  sync();resize();requestAnimationFrame(frame);
})();
