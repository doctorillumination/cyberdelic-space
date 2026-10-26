/* Material curves advected by the same velocity field as the wet pigment. */
(function(root){
  'use strict';
  class InkFilaments {
    constructor(model,fluid){
      if(!fluid)throw new Error('Material filaments need the liquid velocity field');
      this.fluid=fluid;this.gl=fluid.gl;this.canvas=fluid.canvas;this.lastTick=-1;
      const gl=this.gl;
      const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      const link=(vertex,fragment,varying)=>{
        const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
        gl.attachShader(p,vs);gl.attachShader(p,fs);
        if(varying)gl.transformFeedbackVaryings(p,[varying],gl.SEPARATE_ATTRIBS);
        gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
        if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;
      };
      this.updateProgram=link(`#version 300 es
        precision highp float;
        layout(location=0) in vec4 material;
        layout(location=1) in vec4 position;
        layout(location=2) in vec4 rest;
        uniform sampler2D velocity;uniform float water,time;
        out vec4 nextPosition;
        void main(){
          vec2 ua=position.xy/vec2(1600.,1000.);ua.y=1.-ua.y;
          vec2 ub=position.zw/vec2(1600.,1000.);ub.y=1.-ub.y;
          vec4 v=vec4(texture(velocity,ua).xy*vec2(1.,-1.),texture(velocity,ub).xy*vec2(1.,-1.));
          float anchor=material.w>4. ? .10 : .012;
          nextPosition=position+v*(.65+water*.32)+(rest-position)*anchor;
          if(fract(time*.05+material.y*.37)<.0017)nextPosition=rest;
          gl_Position=vec4(0,0,0,1);
        }`,`#version 300 es
        precision highp float;out vec4 frag;void main(){frag=vec4(0);}`,'nextPosition');
      this.program=link(`#version 300 es
        precision highp float;
        layout(location=0) in vec4 material;
        layout(location=1) in vec4 segment;
        layout(location=2) in vec4 rest;
        uniform float time;
        out float pigment,opacity,phase;
        void main(){
          vec2 position=gl_VertexID==0?segment.xy:segment.zw;
          float t=material.x,seed=material.y;
          float stretch=length(segment.zw-segment.xy);
          float dilution=min(1.,(length(rest.zw-rest.xy)+.5)/(stretch+.5))*(1.-smoothstep(5.,14.,stretch));
          if(dilution<=0.){pigment=material.z;opacity=0.;phase=0.;gl_Position=vec4(2.,2.,2.,1.);return;}
          pigment=material.z;
          float density=material.w>4.?3.0:material.w;
          opacity=density*dilution*(.7+.3*sin(seed*17.))*(.65+.35*pow(.5+.5*sin(t*29.-time*.23+seed),2.));
          phase=fract(position.x/1600.*.72+position.y/1000.*.26+time*.0015);
          gl_Position=vec4(position/vec2(1600.,1000.)*vec2(2.,-2.)+vec2(-1.,1.),0,1);
        }`,`#version 300 es
        precision highp float;in float pigment,opacity,phase;out vec4 frag;
        uniform vec3 inks[3];uniform float concentration,reference;uniform sampler2D palette;
        void main(){
          vec3 rgb=reference>.5?inks[int(pigment+.1)]:texture(palette,vec2(phase,.5)).rgb;
          float a=min(.86,opacity*(.075+concentration*.18));
          frag=vec4(rgb*a,a);
        }`);
      const locations=(program,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,name)]));
      this.updateUniforms=locations(this.updateProgram,['velocity','water','time']);
      this.renderUniforms=locations(this.program,['time','concentration','reference','inks[0]','palette']);
      gl.useProgram(this.updateProgram);gl.uniform1i(this.updateUniforms.velocity,1);
      gl.useProgram(this.program);gl.uniform1i(this.renderUniforms.palette,0);gl.uniform3fv(this.renderUniforms['inks[0]'],new Float32Array([.003,.24,.70,.91,.40,.008,.016,.28,.15]));
      this.material=gl.createBuffer();this.rest=gl.createBuffer();this.positions=[gl.createBuffer(),gl.createBuffer()];this.feedback=gl.createTransformFeedback();this.vaos={update:new Map(),render:new Map()};
      this.palette=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.palette);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      this.build(model);
    }
    static geometry(model){
      const rand=InkFlow.randomSource(model.seed+8001);
      const plan=model.paths.map(path=>({path,fibres:path.ring?(path.length>500?192:96):path.major?160:path.wild?16:80,steps:Math.max(20,Math.ceil(path.length/1.25))}));
      const count=plan.reduce((sum,p)=>sum+p.fibres*p.steps,0),rest=new Float32Array(count*4),material=new Float32Array(count*4);
      let index=0;
      for(const {path,fibres,steps} of plan){
        const samples=[];
        for(let k=0;k<=steps;k++){const t=Math.min(.999999,k/steps);samples.push({...InkFlow.sample(path,t),t});}
        for(let j=0;j<fibres;j++){
          const lane=(rand()*2-1),phase=rand()*6.28,pick=rand();let colour=path.color;
          if(path.color===1&&pick<.12)colour=2;else if(path.color===2&&pick<.08)colour=0;else if(path.color===0&&pick<.015)colour=2;
          for(let k=0;k<steps;k++){
            for(let end=0;end<2;end++){
              const q=samples[k+end],t=q.t;
              let width=path.width*(.16+.84*Math.pow(.5+.5*Math.sin(t*17+path.phase),2));
              if(!path.closed)width*=Math.pow(Math.max(.0001,Math.sin(Math.PI*t)),.35);
              const fold=(InkFlow.noise(q.x*.05,q.y*.05+lane*2,model.seed+17)-.5)*path.width*.3;
              const off=lane*width+fold+Math.sin(t*97+phase)*.4;
              rest[index*4+end*2]=q.x+q.nx*off;rest[index*4+end*2+1]=q.y+q.ny*off;
            }
            const t=(k+.5)/steps,pool=path.ring&&path.length<500;
            const density=pool?5:1+1.6*Math.exp(-Math.pow((t-(.18+.62*(path.phase/6.2831853)))/.055,2));
            material.set([t,phase,colour,density],index*4);index++;
          }
        }
      }
      return {count,rest,material};
    }
    build(model){
      const gl=this.gl,{count,rest,material}=InkFilaments.geometry(model);
      this.count=count;
      gl.bindBuffer(gl.ARRAY_BUFFER,this.material);gl.bufferData(gl.ARRAY_BUFFER,material,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.rest);gl.bufferData(gl.ARRAY_BUFFER,rest,gl.STATIC_DRAW);
      for(const p of this.positions){gl.bindBuffer(gl.ARRAY_BUFFER,p);gl.bufferData(gl.ARRAY_BUFFER,rest,gl.DYNAMIC_COPY);}
      if(!this.vaos.update.size)for(const position of this.positions)for(const [kind,divisor] of [['update',0],['render',1]]){
        const vao=gl.createVertexArray();gl.bindVertexArray(vao);
        [this.material,position,this.rest].forEach((buffer,index)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,4,gl.FLOAT,false,0,0);gl.vertexAttribDivisor(index,divisor);});
        this.vaos[kind].set(position,vao);
      }
      gl.bindVertexArray(null);
      for(let i=0;i<55;i++)this.step(.6,i/30);
    }
    step(water,time){
      const gl=this.gl,p=this.updateProgram,u=this.updateUniforms;gl.useProgram(p);gl.bindVertexArray(this.vaos.update.get(this.positions[0]));
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.fluid.velocity[0].texture);gl.uniform1f(u.water,water);gl.uniform1f(u.time,time);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.positions[1]);
      gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,this.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);this.positions.reverse();
    }
    advance(tick,params){
      if(tick!==this.lastTick){this.step(params.water,tick/30);this.lastTick=tick;}
    }
    render(tick,params,paletteIndex){
      this.advance(tick,params);
      const gl=this.gl,p=this.program,u=this.renderUniforms;gl.useProgram(p);gl.bindVertexArray(this.vaos.render.get(this.positions[0]));
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(u.time,tick/30);
      if(this.lastConcentration!==params.pigment){gl.uniform1f(u.concentration,params.pigment);this.lastConcentration=params.pigment;}
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.palette);
      if(this.lastPalette!==paletteIndex){gl.uniform1f(u.reference,paletteIndex===0?1:0);const data=new Uint8Array(256*4);for(let i=0;i<256;i++)data.set([...InkPigments.sample(paletteIndex,i/256),255],i*4);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,data);this.lastPalette=paletteIndex;}
      gl.drawArraysInstanced(gl.LINES,0,2,this.count);gl.bindVertexArray(null);
    }
    destroy(){const gl=this.gl;for(const b of [this.material,this.rest,...this.positions])gl.deleteBuffer(b);for(const map of Object.values(this.vaos))for(const vao of map.values())gl.deleteVertexArray(vao);gl.deleteTransformFeedback(this.feedback);gl.deleteTexture(this.palette);gl.deleteProgram(this.program);gl.deleteProgram(this.updateProgram);}
  }
  root.InkFilaments=InkFilaments;
  if(typeof module!=='undefined')module.exports=InkFilaments;
})(typeof window!=='undefined'?window:globalThis);
