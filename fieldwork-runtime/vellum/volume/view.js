/* Vellum in volume. Estuary's fluid and material renderer, with a small parent interface. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
  const settings={current:1,turbulence:.8,memory:.4,speed:1,opacity:.70,threads:14,diffusion:1,orbit:.10,palette:4,form:1};
  let seed=21,paused=true,active=false,engine,sketch,last=0,accumulator=0,raf=0;
  const DT=1/45;
  function notify(state,extra={}){
    parent.postMessage({type:'vellum-volume-state',state,seed,form:settings.form,palette:settings.palette,...extra},'*');
  }
  function dimensions(){const scale=Math.min(1.65,devicePixelRatio||1,1600/Math.max(innerWidth,innerHeight));return [Math.round(innerWidth*scale),Math.round(innerHeight*scale)];}
  function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
  function cameraMatrix(yaw,pitch,distance,target=[0,0,0]){
    const offset=[Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance];
    const eye=offset.map((v,i)=>v+target[i]);
    const z=offset.map(v=>v/distance),l=Math.hypot(z[0],z[2]);
    const x=[z[2]/l,0,-z[0]/l],y=[z[1]*x[2],z[2]*x[0]-z[0]*x[2],-z[1]*x[0]];
    const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    return {eye,x,y,z,target,distance,matrix:new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])};
  }
  class Estuary {
    constructor(gl,canvas){
      if(!(gl instanceof WebGL2RenderingContext)||!gl.getExtension('EXT_color_buffer_float')||!gl.getExtension('OES_texture_float_linear'))throw new Error('This study needs WebGL 2 with floating point colour buffers. Try a current desktop browser with hardware acceleration enabled.');
      this.gl=gl;this.canvas=canvas;this.vao=gl.createVertexArray();this.programs={};this.resources=[];this.geometryResources=[];this.screenResources=[];
      this.time=0;this.steps=0;this.eddies=[];this.yaw=.34;this.pitch=.14;this.distance=7.3;this.targetDistance=7.3;this.interactionCount=0;this.orbitHoldUntil=0;this.orbitTravel=0;this.orbitLift=0;
      const s=EstuaryShaders;
      for(const [name,frag] of Object.entries(s.kernels))this.programs[name]=this.program(s.quad,frag);
      this.programs.ink=this.program(s.inkVertex,s.inkFragment);
      this.programs.composite=this.program(s.quad,s.composite);
      const V=EstuaryVolume,make=()=>this.target(V.W,V.H,null,this.resources,true);
      this.velocity=[make(),make()];this.pressure=[make(),make()];this.curl=make();this.divergence=make();
      this.ink=[make(),make()];this.transported=make();
      this.reset(seed);this.resize();
    }
    program(vertex,fragment){
      const gl=this.gl;
      const compile=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(msg);}return s;};
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();
      gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
      const uniforms={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const info=gl.getActiveUniform(p,i);uniforms[info.name.replace('[0]','')]={location:gl.getUniformLocation(p,info.name),type:info.type};}
      return {p,uniforms};
    }
    texture(w,h,data=null,collection=this.resources,half=false,linear=false){
      const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,half?gl.RGBA16F:gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,data);
      collection.push({texture:t});return t;
    }
    target(w,h,data=null,collection=this.resources,linear=false,half=false){
      const gl=this.gl,texture=this.texture(w,h,data,collection,half,linear),framebuffer=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Floating point framebuffer is unavailable.');
      collection.push({framebuffer});gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return {texture,framebuffer,w,h};
    }
    dispose(collection){const gl=this.gl;for(const r of collection){if(r.texture)gl.deleteTexture(r.texture);if(r.framebuffer)gl.deleteFramebuffer(r.framebuffer);}collection.length=0;}
    clear(target){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
    reset(newSeed){
      const gl=this.gl;this.dispose(this.geometryResources);
      this.model=EstuaryGrowth.grow(newSeed,settings.form);const m=this.model,V=this.volume=EstuaryVolume.build(m);
      this.flow=this.texture(V.w,V.h,V.flow,this.geometryResources,false,true);
      this.guide=this.texture(V.w,V.h,V.guide,this.geometryResources,false,true);
      this.deposit=this.texture(V.w,V.h,V.deposit,this.geometryResources,false,true);
      this.rest=this.texture(m.size,m.size,m.nodes,this.geometryResources);
      this.material=[this.target(m.size,m.size,null,this.geometryResources),this.target(m.size,m.size,null,this.geometryResources)];
      for(const t of this.material){gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,m.size,m.size,gl.RGBA,gl.FLOAT,m.nodes);}
      this.links=this.texture(m.segmentSize,m.segmentSize,m.links,this.geometryResources);
      this.shapes=this.texture(m.segmentSize,m.segmentSize,m.shapes,this.geometryResources);
      
      for(const t of [...this.velocity,...this.pressure,this.curl,this.divergence,...this.ink,this.transported])this.clear(t);
      this.time=0;this.steps=0;this.eddies=[];this.interactionCount=0;this.warm=65;this.dirty=true;
      this.center=[0,0,0];this.targetCenter=[0,0,0];
      accumulator=0;last=0;
      $('loading').hidden=false;notify('loading');
      document.body.dataset.ready='loading';
    }
    resize(){
      const gl=this.gl;this.dispose(this.screenResources);
      this.width=this.canvas.width;this.height=this.canvas.height;
      this.accumulation=this.texture(this.width,this.height,null,this.screenResources,true);
      this.optical=this.texture(this.width,this.height,null,this.screenResources,true);
      this.framebuffer=gl.createFramebuffer();this.screenResources.push({framebuffer:this.framebuffer});gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.accumulation,0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,this.optical,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Translucent material framebuffer is unavailable.');
    }
    use(program,values,textures={}){
      const gl=this.gl;gl.useProgram(program.p);gl.bindVertexArray(this.vao);
      let unit=0;for(const [key,texture] of Object.entries(textures)){const u=program.uniforms[key];if(!u)continue;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture.texture||texture);gl.uniform1i(u.location,unit++);}
      for(const [key,value] of Object.entries(values)){
        const u=program.uniforms[key];if(!u)continue;
        if(u.type===gl.FLOAT_MAT4)gl.uniformMatrix4fv(u.location,false,value);
        else if(u.type===gl.FLOAT_VEC4)gl.uniform4fv(u.location,value);
        else if(u.type===gl.FLOAT_VEC3)gl.uniform3fv(u.location,value);
        else if(u.type===gl.FLOAT_VEC2)gl.uniform2fv(u.location,value);
        else if(u.type===gl.INT||u.type===gl.BOOL)gl.uniform1i(u.location,value);
        else gl.uniform1f(u.location,value);
      }
    }
    pass(name,target,textures,values={}){
      const gl=this.gl;gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,target.w,target.h);
      this.use(this.programs[name],{dt:DT,time:this.time,...settings,...values},Object.fromEntries(textures.map((t,i)=>['u'+i,t])));
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    fluidStep(force=true){
      const e=new Float32Array(24),s=new Float32Array(24),p=new Float32Array(24);
      this.eddies.forEach((v,i)=>{e.set([...v.center,v.radius],i*4);s.set([...v.axis,v.strength*v.life],i*4);p.set([...v.push.map(x=>x*v.life),0],i*4);v.life*=Math.exp(-DT*1.1);});
      this.eddies=this.eddies.filter(v=>v.life>.012);
      this.pass('advect',this.velocity[1],[this.velocity[0],this.flow],{eddies:e,spins:s,pushes:p,current:force?settings.current:0});this.velocity.reverse();
      this.pass('curl',this.curl,[this.velocity[0]]);
      this.pass('confine',this.velocity[1],[this.velocity[0],this.curl]);this.velocity.reverse();
      this.pass('divergence',this.divergence,[this.velocity[0]]);
      for(let i=0;i<22;i++){this.pass('pressure',this.pressure[1],[this.pressure[0],this.divergence]);this.pressure.reverse();}
      this.pass('project',this.velocity[1],[this.velocity[0],this.pressure[0]]);this.velocity.reverse();
    }
    pigmentStep(){
      this.pass('transport',this.transported,[this.ink[0],this.velocity[0]]);
      this.pass('pigment',this.ink[1],[this.ink[0],this.velocity[0],this.transported,this.deposit]);this.ink.reverse();
    }
    advanceMaterial(){this.pass('material',this.material[1],[this.material[0],this.velocity[0],this.rest,this.guide,this.flow]);this.material.reverse();}
    step(){this.fluidStep();this.pigmentStep();this.advanceMaterial();this.time+=DT;this.steps++;}
    camera(){
      const aspect=innerWidth/innerHeight;
      const distance=this.distance*(aspect<1?1/Math.max(.48,aspect):1);
      return cameraMatrix(this.yaw,Math.max(-1.2,Math.min(1.2,this.pitch+this.orbitLift)),distance,this.center);
    }
    advanceCamera(elapsed,now){
      if(now<this.orbitHoldUntil||settings.orbit===0)return;
      const ease=Math.min(1,(now-this.orbitHoldUntil)/2000),angle=elapsed*settings.orbit*ease;
      this.yaw+=angle;this.orbitTravel+=angle;
      this.orbitLift=Math.sin(this.orbitTravel*.7)*.065;this.dirty=true;
    }
    render(){
      const gl=this.gl,cam=this.camera();
      const values={view:cam.matrix,projection:perspective(.72,innerWidth/innerHeight,.1,30),
        positionSize:this.model.size,segmentSize:this.model.segmentSize,time:this.time,palette:settings.palette,
        resolution:[this.width,this.height],threadCount:settings.threads,opacity:settings.opacity,diffusion:settings.diffusion};
      const textures={positions:this.material[0],links:this.links,shapes:this.shapes,dye:this.ink[0]};
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,this.width,this.height);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE);
      this.use(this.programs.ink,values,textures);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.model.segmentCount);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.width,this.height);
      this.use(this.programs.composite,{resolution:[this.width,this.height]},{u0:this.accumulation});
      gl.drawArrays(gl.TRIANGLES,0,3);gl.depthMask(true);this.dirty=false;
    }
    pickDepth(x,y){
      const cam=this.camera(),data=this.sample(this.material[0]),distance=cam.distance,tan=Math.tan(.72/2),aspect=innerWidth/innerHeight;
      let best=75*75,depth=0;
      for(let i=0;i<this.model.nodeCount*4;i+=4){
        if(data[i+3]===0)continue;
        const p=[data[i]-cam.target[0],data[i+1]-cam.target[1],data[i+2]-cam.target[2]],dot=a=>a.reduce((s,v,j)=>s+v*p[j],0),z=dot(cam.z),d=distance-z;
        const sx=(dot(cam.x)/(d*tan*aspect)*.5+.5)*innerWidth,sy=(.5-dot(cam.y)/(d*tan)*.5)*innerHeight;
        const dist=(x-sx)**2+(y-sy)**2;if(dist<best){best=dist;depth=z;}
      }
      return depth;
    }
    stir(x,y,dx=0,dy=0,depth=0){
      const cam=this.camera(),aspect=innerWidth/innerHeight,half=Math.tan(.72/2)*(cam.distance-depth);
      const sx=(x/innerWidth*2-1)*half*aspect,sy=(1-y/innerHeight*2)*half;
      const center=cam.x.map((v,i)=>cam.target[i]+v*sx+cam.y[i]*sy+cam.z[i]*depth);
      if(Math.hypot(...center)>2.75)return;
      const push=cam.x.map((v,i)=>(v*dx-cam.y[i]*dy)*.07);
      const existing=this.eddies.find(v=>Math.hypot(...v.center.map((a,i)=>a-center[i]))<.3);
      if(existing){existing.center=center;existing.push=push;existing.life=1;}
      else {if(this.eddies.length===6)this.eddies.shift();this.eddies.push({center,axis:cam.z,radius:.82,strength:6.5,push,life:1});}
      this.interactionCount++;
    }
    sample(target){const gl=this.gl,data=new Float32Array(target.w*target.h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.readPixels(0,0,target.w,target.h,gl.RGBA,gl.FLOAT,data);return data;}
    diagnostics(){
      const data=this.sample(this.material[0]);let finite=true,displacement=0,maximum=0;
      for(let i=0;i<this.model.nodeCount*4;i+=4){const d=Math.hypot(data[i]-this.model.nodes[i],data[i+1]-this.model.nodes[i+1],data[i+2]-this.model.nodes[i+2]);displacement+=d;maximum=Math.max(maximum,d);finite=finite&&Number.isFinite(d);}
      return {seed,form:this.model.formName,steps:this.steps,time:this.time,paused,branches:this.model.branches,nodes:this.model.nodeCount,segments:this.model.segmentCount,
        finite,meanDisplacement:displacement/this.model.nodeCount,maxDisplacement:maximum,eddies:this.eddies.length,interactions:this.interactionCount,
        strands:this.model.strands,diffuseStrands:this.model.diffuseStrands,forms:this.model.forms,volumeSize:EstuaryVolume.N,skinDraws:0,renderSize:[this.width,this.height],glError:this.gl.getError(),settings:{...settings}};
    }
  }
  function kick(){if(active&&!raf)raf=requestAnimationFrame(frame);}
  function configure(message){
    const nextSeed=Math.max(1,Math.min(2147483647,Math.trunc(Number(message.seed)||seed)));
    const nextForm=Math.max(0,Math.min(3,Math.trunc(Number(message.form)||0)));
    const nextPalette=Math.max(0,Math.min(5,Math.trunc(Number(message.palette)||0)));
    const rebuild=seed!==nextSeed||settings.form!==nextForm;
    seed=nextSeed;settings.form=nextForm;settings.palette=nextPalette;settings.orbit=message.orbit===false?0:.10;
    active=message.active===true;paused=message.running!==true;last=0;accumulator=0;
    if(!active){engine?.releasePointer?.();}
    if(engine){if(rebuild)engine.reset(seed);engine.dirty=true;}
    kick();
  }
  addEventListener('message',event=>{
    if(event.source!==parent||event.data?.type!=='vellum-volume')return;
    if(location.protocol!=='file:'&&event.origin!==location.origin)return;
    const message=event.data;
    if(message.action==='configure')configure(message);
    else if(message.action==='save'&&engine){
      engine.render();notify('print',{data:engine.canvas.toDataURL('image/png'),width:engine.width,height:engine.height,steps:engine.steps});
    }
  });
  function installPointer(canvas){
    let pointer=null;
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    const release=()=>{pointer=null;if(engine)engine.orbitHoldUntil=performance.now()+3000;canvas.classList.remove('dragging');};
    engine.releasePointer=release;
    canvas.addEventListener('pointerdown',event=>{
      if(pointer||(event.pointerType==='mouse'&&event.button!==0))return;
      canvas.setPointerCapture(event.pointerId);pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
      engine.orbitHoldUntil=Infinity;canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove',event=>{
      if(pointer?.id!==event.pointerId)return;
      engine.yaw-=(event.clientX-pointer.x)*.006;
      engine.pitch=Math.max(-1.15,Math.min(1.15,engine.pitch+(event.clientY-pointer.y)*.006));
      pointer.x=event.clientX;pointer.y=event.clientY;engine.dirty=true;kick();
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(pointer?.id===event.pointerId)release();});
    canvas.addEventListener('wheel',event=>{event.preventDefault();engine.targetDistance=Math.max(3.65,Math.min(8.5,engine.targetDistance*Math.exp(event.deltaY*.001)));engine.dirty=true;kick();},{passive:false});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();paused=true;notify('error',{message:'The graphics context was interrupted. Reload Vellum to return to the 3D view.'});});
  }
  function frame(now){
    raf=0;if(!active||document.hidden||!engine){last=0;return;}
    const elapsed=last?Math.min((now-last)/1000,.08):0;last=now;
    if(engine.warm>0){
      for(let i=0;i<5&&engine.warm>0;i++,engine.warm--){engine.fluidStep();engine.pigmentStep();if(engine.warm<28)engine.advanceMaterial();engine.time+=DT;}
      if(engine.warm===0){engine.time=0;$('loading').hidden=true;document.body.dataset.ready='true';notify('ready');}
    }else if(!paused){
      accumulator=Math.min(.08,accumulator+elapsed*settings.speed);let steps=0;
      while(accumulator>=DT&&steps<3){engine.step();accumulator-=DT;steps++;}
      engine.advanceCamera(elapsed,now);
    }
    const approaching=Math.abs(engine.targetDistance-engine.distance)>.0001;
    if(approaching)engine.distance+=(engine.targetDistance-engine.distance)*Math.min(1,elapsed*7);
    if(!paused||engine.dirty||engine.warm>0||approaching)engine.render();
    kick();
  }
  addEventListener('keydown',event=>{
    let key=event.code==='Space'?'pause':({s:'save',h:'hide',f:'fullscreen',Escape:'escape'})[event.key]||({S:'save',H:'hide',F:'fullscreen'})[event.key];
    if(key){event.preventDefault();notify('shortcut',{key});}
  });
  document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;kick();});
  sketch=new p5(p=>{
    p.setup=()=>{
      try{
        p.pixelDensity(1);p.setAttributes({version:2,alpha:false,antialias:false,preserveDrawingBuffer:true});
        const renderer=p.createCanvas(...dimensions(),p.WEBGL);renderer.parent('canvas-container');p.noLoop();
        p.randomSeed(seed);p.noiseSeed(seed);engine=new Estuary(p.drawingContext,renderer.elt);installPointer(renderer.elt);
        renderer.elt.setAttribute('aria-label','Flowing ink in three dimensions. Drag to rotate the view.');
        window.vellumVolume={engine,settings,diagnostics:()=>({...engine.diagnostics(),active}),step:n=>{for(let i=0;i<n;i++)engine.step();engine.render();},render:()=>engine.render()};
        addEventListener('resize',()=>{p.resizeCanvas(...dimensions(),true);engine.resize();engine.dirty=true;kick();});
        notify('available');kick();
      }catch(error){
        console.error(error);$('loading').hidden=true;$('error').hidden=false;$('error').textContent=error.message;
        document.body.dataset.ready='error';notify('error',{message:error.message});
      }
    };
  });
})();
