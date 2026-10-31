(function(){
  'use strict';
  const $=id=>document.getElementById(id),Grid=window.InkGrid,P=window.InkPhysics,Field=window.PrimitivesField;
  const canvas=$('grid-stage'),wrap=$('grid-wrap'),controls=$('controls');
  const renderer=new window.InkGridRenderer.Renderer({immersive:true}),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const actions=new window.PrimitivesInteraction(new Grid.Model(29001,{paused:reduced.matches,evolve:!reduced.matches}),()=>{dirty=true;sync();});
  let layout=null,ratio=1,lastTime=0,accumulator=0,dirty=true,uiTimer,toastTimer,panel=null,gesture=null,lastHover=0,lastSignature='';
  const pointers=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const model=()=>actions.model;
  const handView=new window.PrimitivesHandView(actions,(width,height,m)=>renderer.layout(width,height,m,ratio),()=>[canvas.width,canvas.height,ratio]);
  const handInput=window.PrimitivesHandInput.attach({
    getZoom:()=>model().presentation().settings.zoom,begin:()=>handView.begin(),zoom:(zoom,still,dt)=>handView.update(zoom,still,dt),
    release:()=>handView.release(),cancel:()=>handView.cancel(),notify:text=>message(text),state:()=>showUI()
  },{video:$('hand-video'),button:$('camera'),panel:$('hand-panel'),message:$('hand-message'),overlay:$('hand-overlay'),close:$('hand-close'),preview:$('hand-preview-toggle'),retry:$('hand-retry')});
  function manualView(){handInput.manual();}
  function stopHands(){handInput.stop();handView.cancel();}
  function label(button,text){button.setAttribute('aria-label',text);button.title=text;}
  function showUI(){document.body.dataset.ui='visible';$('reveal').hidden=true;scheduleHide();}
  function hideUI(){
    const keyboardFocus=document.activeElement?.matches(':focus-visible');
    if(panel||(keyboardFocus&&(controls.contains(document.activeElement)||document.activeElement===$('fullscreen')))||controls.matches(':hover')){scheduleHide();return;}
    document.body.dataset.ui='quiet';$('reveal').hidden=false;
  }
  function scheduleHide(){clearTimeout(uiTimer);uiTimer=setTimeout(hideUI,4000);}
  function message(text){$('status').textContent=text;$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  function closePanels(returnFocus=false){
    const previous=panel;panel=null;
    for(const id of ['composition','more','patterns']){$(`${id}-panel`).hidden=true;$(id).setAttribute('aria-expanded','false');}
    if(returnFocus&&previous)$(previous==='patterns'?'composition':previous).focus({preventScroll:true});scheduleHide();
  }
  function openPanel(id,event){
    const already=panel===id;closePanels();if(already)return;
    panel=id;$(`${id}-panel`).hidden=false;$(id).setAttribute('aria-expanded','true');showUI();clearTimeout(uiTimer);
    if(id==='patterns')drawPatternPreviews();
    if(event.detail===0)$(`${id}-panel`).querySelector('button,input,a').focus({preventScroll:true});
  }
  function sync(){
    const m=model(),s=m.settings;
    const rows={density:[s.cells,`${s.cells} columns`],coverage:[s.coverage,`${s.coverage}% filled`],layers:[s.layers,`Up to ${s.layers} layers`],pace:[s.pace,`Pace ${s.pace}`]};
    for(const [id,[value,text]]of Object.entries(rows)){$(id).value=value;$(id).setAttribute('aria-valuetext',text);$(`${id}-value`).textContent=text;}
    document.querySelectorAll('[data-symmetry]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.symmetry===s.symmetry)));
    const selectedPattern=Field.patterns.find(pattern=>pattern.id===s.pattern);
    $('pattern-value').textContent=selectedPattern.name;$('pattern-description').textContent=selectedPattern.description;
    document.querySelectorAll('button[data-pattern]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pattern===s.pattern)));
    $('pause').setAttribute('aria-pressed',String(s.paused));$('pause-symbol').setAttribute('href',s.paused?'#play-icon':'#pause-icon');label($('pause'),s.paused?'Play animation':'Pause animation');
    $('energy').setAttribute('aria-pressed',String(s.energy));label($('energy'),s.energy?'Return to calm motion':'Turn on Cyber motion');
    $('auto-change').setAttribute('aria-pressed',String(s.evolve));$('loose').setAttribute('aria-pressed',String(s.alignment==='loose'));
    const zoomed=Math.abs(Math.log(s.zoom))>.001||Math.abs(s.focusX)+Math.abs(s.focusY)>.001;
    $('fit').hidden=!zoomed;document.body.dataset.zoomed=String(zoomed);
    canvas.dataset.symmetry=s.symmetry;canvas.dataset.pattern=s.pattern;canvas.dataset.columns=String(s.cells);canvas.dataset.rows=String(m.ny*2);canvas.dataset.energy=String(s.energy);canvas.dataset.generation=String(m.generation);canvas.dataset.zoom=String(s.zoom);
    canvas.setAttribute('aria-label',s.symmetry==='none'?'A woven field of translucent shapes.':'A living symmetrical field of translucent shapes.');
    lastSignature=`${s.cells}/${m.generation}/${s.energy}/${s.paused}`;
  }
  function resize(){
    ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(2,Math.round(wrap.clientWidth*ratio/2)*2);canvas.height=Math.max(2,Math.round(wrap.clientHeight*ratio/2)*2);dirty=true;
  }
  function frame(timestamp){
    const dt=lastTime?Math.min((timestamp-lastTime)/1000,.1):0;lastTime=timestamp;
    handView.step(dt);
    const m=model();
    if(!m.settings.paused&&!document.hidden){accumulator+=dt;while(accumulator>=P.STEP){m.step(P.STEP);accumulator-=P.STEP;}dirty=true;}else accumulator=0;
    if(dirty){
      layout=renderer.render(canvas,m,ratio);document.body.dataset.zoomed=String(layout.zoom>1.01);
      const columns=layout.columns?String(layout.columns):'',rows=layout.rows?String(layout.rows):'';
      if(canvas.dataset.visibleColumns!==columns)canvas.dataset.visibleColumns=columns;
      if(canvas.dataset.visibleRows!==rows)canvas.dataset.visibleRows=rows;
      dirty=false;
    }
    const s=m.settings;if(lastSignature!==`${s.cells}/${m.generation}/${s.energy}/${s.paused}`)sync();
    requestAnimationFrame(frame);
  }
  function anchor(point){
    if(!layout)return {x:0,y:0};const rect=canvas.getBoundingClientRect(),spread=Math.max(.1,model().spread.x);
    return {x:((point.clientX-rect.left)*canvas.width/rect.width-layout.cx)/(layout.halfWidth*spread),y:((point.clientY-rect.top)*canvas.height/rect.height-layout.cy)/(layout.halfHeight*spread)};
  }
  function fieldPoint(point){
    if(!layout)return {x:0,y:0};const rect=canvas.getBoundingClientRect(),spread=Math.max(.1,model().spread.x);
    return {x:((point.clientX-rect.left)*canvas.width/rect.width-layout.originX)/(layout.halfWidth*spread*layout.zoom),y:((point.clientY-rect.top)*canvas.height/rect.height-layout.originY)/(layout.halfHeight*spread*layout.zoom)};
  }
  function startPinch(){
    const points=[...pointers.values()],s=actions.beginView();
    const mid={clientX:(points[0].clientX+points[1].clientX)/2,clientY:(points[0].clientY+points[1].clientY)/2},a=anchor(mid);
    gesture={kind:'pinch',distance:Math.max(1,Math.hypot(points[0].clientX-points[1].clientX,points[0].clientY-points[1].clientY)),zoom:s.zoom,worldX:s.focusX+a.x/s.zoom,worldY:s.focusY+a.y/s.zoom};
    document.body.dataset.dragging='true';
  }
  canvas.addEventListener('pointerdown',event=>{
    if((event.button!==0&&event.pointerType!=='touch')||pointers.size>=2)return;
    manualView();closePanels();pointers.set(event.pointerId,{clientX:event.clientX,clientY:event.clientY});canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
    if(pointers.size===2)startPinch();
    else if(layout?.zoom>1.01){const s=actions.beginView();gesture={kind:'pan',anchor:anchor(event),focusX:s.focusX,focusY:s.focusY,zoom:s.zoom};document.body.dataset.dragging='true';}
    else{gesture={kind:'pulse'};actions.pulse(fieldPoint(event),2);showUI();}
    event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
    if(pointers.has(event.pointerId))pointers.set(event.pointerId,{clientX:event.clientX,clientY:event.clientY});
    if(gesture?.kind==='pinch'&&pointers.size===2){
      const p=[...pointers.values()],distance=Math.hypot(p[0].clientX-p[1].clientX,p[0].clientY-p[1].clientY),zoom=clamp(gesture.zoom*distance/gesture.distance,window.PrimitivesField.MIN_ZOOM,16);
      const a=anchor({clientX:(p[0].clientX+p[1].clientX)/2,clientY:(p[0].clientY+p[1].clientY)/2});
      actions.setView({zoom,focusX:gesture.worldX-a.x/zoom,focusY:gesture.worldY-a.y/zoom});return;
    }
    if(gesture?.kind==='pan'&&pointers.has(event.pointerId)){
      const a=anchor(event);actions.setView({focusX:gesture.focusX-(a.x-gesture.anchor.x)/gesture.zoom,focusY:gesture.focusY-(a.y-gesture.anchor.y)/gesture.zoom});return;
    }
    if(event.timeStamp-lastHover>32&&layout?.zoom<=1.01){actions.pulse(fieldPoint(event),pointers.size ? .55 : .16);lastHover=event.timeStamp;}
  });
  function release(event){
    if(!pointers.has(event.pointerId))return;pointers.delete(event.pointerId);
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(pointers.size===1){const point=[...pointers.values()][0],s=actions.beginView();gesture={kind:'pan',anchor:anchor(point),focusX:s.focusX,focusY:s.focusY,zoom:s.zoom};}
    else{gesture=null;document.body.dataset.dragging='false';}scheduleHide();
  }
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',event=>{
    manualView();
    event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?wrap.clientHeight:1),zoom=model().presentation().settings.zoom;
    actions.zoomTo(zoom*Math.exp(-delta*.0025),anchor(event));
  },{passive:false});
  canvas.addEventListener('dblclick',event=>{event.preventDefault();manualView();if(model().presentation().settings.zoom<1.8)actions.zoomTo(6,anchor(event));else actions.fit();});
  window.addEventListener('pointermove',event=>{if(event.clientY>innerHeight-105&&!pointers.size)showUI();},{passive:true});
  controls.addEventListener('pointerenter',showUI);controls.addEventListener('pointerleave',scheduleHide);controls.addEventListener('focusin',showUI);controls.addEventListener('focusout',scheduleHide);
  $('reveal').addEventListener('click',()=>{showUI();$('pause').focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{
    if(event.key==='Tab'){showUI();return;}
    if(event.key==='Escape'){closePanels(true);return;}
    if(event.target.matches('input,button,a')||event.metaKey||event.ctrlKey||event.altKey)return;
    if(['0','+','=','-','[',']','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))manualView();
    if(event.code==='Space'){event.preventDefault();actions.pause();showUI();}
    else if(event.key.toLowerCase()==='r'){event.preventDefault();actions.remix();}
    else if(event.key==='0'){event.preventDefault();actions.fit();}
    else if(event.key==='+'||event.key==='='){event.preventDefault();actions.zoomTo(model().presentation().settings.zoom*1.3);}
    else if(event.key==='-'){event.preventDefault();actions.zoomTo(model().presentation().settings.zoom/1.3);}
    else if(event.key==='['||event.key===']'){event.preventDefault();actions.configure({cells:clamp(model().settings.cells+(event.key===']'?2:-2),4,64),grow:false});}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const s=actions.beginView(),d=.12/s.zoom;
      actions.setView({focusX:s.focusX+(event.key==='ArrowRight'?d:event.key==='ArrowLeft'?-d:0),focusY:s.focusY+(event.key==='ArrowDown'?d:event.key==='ArrowUp'?-d:0)});
    }
  });
  $('composition').addEventListener('click',event=>openPanel('composition',event));$('more').addEventListener('click',event=>openPanel('more',event));
  $('patterns').addEventListener('click',event=>openPanel('patterns',event));
  $('patterns-close').addEventListener('click',()=>{closePanels();$('composition').focus({preventScroll:true});});
  $('patterns-back').addEventListener('click',event=>openPanel('composition',event));
  function drawPatternPreviews(){
    const m=model(),inks=['#e82a83','#00a7a1','#4979c4','#eb6438'];
    for(const pattern of Field.labPatterns){
      const preview=$(`preview-${pattern.id}`),ctx=preview.getContext('2d');
      ctx.globalAlpha=1;ctx.fillStyle='#faf9f3';ctx.fillRect(0,0,preview.width,preview.height);
      const s={...m.settings,pattern:pattern.id};
      for(let y=0;y<preview.height/6;y++)for(let x=0;x<preview.width/6;x++){
        const i=x-preview.width/12,j=y-preview.height/12,count=Field.ecology(m.seed,m.generation,i,j,s);if(!count)continue;
        ctx.fillStyle=inks[Math.floor(Field.hash(m.seed^0x62ac,Math.floor(i/4),Math.floor(j/4))*inks.length)];
        ctx.globalAlpha=Math.min(.92,.29+count*.12);ctx.fillRect(x*6+1,y*6+1,4,4);
      }
      ctx.globalAlpha=1;
    }
  }
  for(const pattern of Field.labPatterns){
    const button=document.createElement('button');button.className='pattern-card';button.dataset.pattern=pattern.id;
    button.setAttribute('aria-label',pattern.name);button.setAttribute('aria-description',pattern.description);button.setAttribute('aria-pressed','false');button.title=pattern.description;
    const preview=document.createElement('canvas');preview.id=`preview-${pattern.id}`;preview.width=pattern.id==='dissolve'?672:336;preview.height=144;preview.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.className='pattern-name';name.textContent=pattern.name;
    const family=document.createElement('span');family.className='pattern-family';family.textContent=pattern.family;
    button.append(preview,name,family);$('pattern-options').append(button);
    button.addEventListener('click',()=>{actions.configure({pattern:pattern.id,symmetry:'none'});$('status').textContent=`${pattern.name}. ${pattern.description}`;showUI();});
  }
  $('pause').addEventListener('click',()=>{actions.pause();showUI();});$('remix').addEventListener('click',()=>{actions.remix();showUI();});
  $('energy').addEventListener('click',()=>{manualView();closePanels();actions.toggleEnergy();showUI();$('status').textContent=model().settings.energy?'Cyber motion on. Eased zooms and rolling rows and columns.':'Calm motion on.';});
  $('fit').addEventListener('click',()=>{manualView();actions.fit();showUI();});
  const rangeSettings={density:'cells',coverage:'coverage',layers:'layers',pace:'pace'};
  for(const [id,key]of Object.entries(rangeSettings))$(id).addEventListener('input',event=>{if(key==='cells')manualView();actions.configure({[key]:Number(event.target.value),...(key==='cells'?{grow:false}:{})});});
  document.querySelectorAll('[data-symmetry]').forEach(button=>button.addEventListener('click',()=>{manualView();actions.configure({symmetry:button.dataset.symmetry});actions.fit();}));
  $('auto-change').addEventListener('click',()=>actions.configure({evolve:!model().settings.evolve}));
  $('loose').addEventListener('click',()=>actions.configure({alignment:model().settings.alignment==='centered'?'loose':'centered'}));
  $('reset').addEventListener('click',()=>{stopHands();actions.replace(new Grid.Model(29001,{paused:reduced.matches,evolve:!reduced.matches}));closePanels(true);showUI();});
  $('fullscreen').hidden=!document.fullscreenEnabled;
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('Fullscreen is unavailable in this browser.');}});
  document.addEventListener('fullscreenchange',()=>label($('fullscreen'),document.fullscreenElement?'Leave fullscreen':'Enter fullscreen'));
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('save').addEventListener('click',()=>{
    const output=document.createElement('canvas');output.width=2400;output.height=Math.max(2,Math.round(2400*canvas.height/canvas.width/2)*2);
    new window.InkGridRenderer.Renderer({immersive:true}).render(output,model(),ratio*2400/canvas.width);
    output.toBlob(blob=>{if(blob){download(blob,`primitives-${model().seed}-${model().generation}.png`);$('status').textContent='Artwork saved.';}},'image/png');
  });
  $('save-study').addEventListener('click',()=>{download(new Blob([JSON.stringify(model().snapshot(),null,2)],{type:'application/json'}),`primitives-study-${model().seed}.json`);closePanels(true);});
  $('load-study').addEventListener('click',()=>$('study-file').click());
  $('study-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error('This study is too large.');
      const restored=Grid.Model.restore(JSON.parse(await file.text()));if(reduced.matches)restored.configure({paused:true});
      stopHands();actions.replace(restored);accumulator=0;lastTime=0;closePanels(true);showUI();$('status').textContent='Study restored.';
    }catch(error){message(error instanceof SyntaxError?'This file is not a valid study.':error.message);}
    event.target.value='';
  });
  new ResizeObserver(resize).observe(wrap);document.addEventListener('visibilitychange',()=>{lastTime=0;accumulator=0;});
  reduced.addEventListener('change',event=>{if(event.matches)actions.configure({paused:true});});
  sync();resize();showUI();requestAnimationFrame(frame);
})();
