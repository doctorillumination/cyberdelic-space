/* Dropped pigment follows the liquid velocity and gathers along wet channels. */
(function(root){
  'use strict';
  class InkDroplets{
    constructor(model,fluid){
      this.fluid=fluid;this.gl=fluid?.gl;this.capacity=model.camera?(fluid?196608:8192):(fluid?61440:4096);this.perDrop=fluid?3072:256;
      this.metadata=new Float32Array(this.capacity*4);this.states=[new Float32Array(this.capacity*4),new Float32Array(this.capacity*4)];
      if(this.gl)this.prepareGPU();
      this.reset(model);
    }
    static makeDrop(seed,x,y,colour,time,count){
      const rand=InkFlow.randomSource(seed),state=new Float32Array(count*4),material=new Float32Array(count*4);
      for(let i=0;i<count;i++){
        const a=rand()*Math.PI*2,r=Math.sqrt(rand())*(7+rand()*5),px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
        state.set([px,py,px,py],i*4);material.set([time,80+rand()*40,colour,a+rand()*.3],i*4);
      }
      return {state,material};
    }
    static makeBloom(seed,emitter,time,count){
      const rand=InkFlow.randomSource(seed),state=new Float32Array(count*4),material=new Float32Array(count*4);
      const segments=16;
      for(let start=0;start<count;start+=segments){
        const phase=rand()*Math.PI*2,lane=(rand()-.5)*emitter.r*(emitter.pool?.7:1.3),length=emitter.r*(1.5+rand()*1.5),birth=time+rand()*.4,life=7+rand()*5;
        const point=t=>{const along=(t-.5)*length,normal=lane+Math.sin(t*Math.PI*2+phase)*1.1;return {x:emitter.x-emitter.ny*along+emitter.nx*normal,y:emitter.y+emitter.nx*along+emitter.ny*normal};};
        for(let j=0;j<Math.min(segments,count-start);j++){
          const a=point(j/segments),b=point((j+1)/segments),i=start+j;
          state.set([a.x,a.y,b.x,b.y],i*4);material.set([birth,life,emitter.color,-1-phase],i*4);
        }
      }
      return {state,material};
    }
    static makeStrands(seed,paths,time,count){
      const random=InkFlow.randomSource(seed),state=new Float32Array(count*4),material=new Float32Array(count*4),total=paths.reduce((sum,path)=>sum+path.length,0);
      const segments=64;
      for(let start=0;start<count;start+=segments){
        let distance=random()*total,path=paths.at(-1);for(const candidate of paths){distance-=candidate.length;if(distance<=0){path=candidate;break;}}
        const span=Math.min(.95,segments*1.3/path.length),begin=random()*(1-span),phase=random()*Math.PI*2,load=InkDroplets.strandLoad(-1-phase),lane=(random()-.5)*(load<.3?64:load>1.2?9:25),life=7+random()*5;
        const point=t=>{const q=InkFlow.sample(path,t),off=lane*(.65+.35*Math.sin(t*23+path.phase)**2)+Math.sin(t*97+phase)*.16;return {x:q.x+q.nx*off,y:q.y+q.ny*off};};
        for(let j=0;j<Math.min(segments,count-start);j++){
          const a=point(begin+j/segments*span),b=point(begin+(j+1)/segments*span),i=start+j;
          state.set([a.x,a.y,b.x,b.y],i*4);material.set([time,life,path.color,-1-phase],i*4);
        }
      }
      return {state,material};
    }
    static strandLoad(phase){return .15+1.7*Math.pow(.5+.5*Math.sin(phase*7.13),4);}
    static portraitVelocity(field,x,y,time){
      const q=InkFlow.guideAt(field,x,y),index=(Math.max(0,Math.min(field.h-1,Math.floor(y/field.paperHeight*field.h)))*field.w+Math.max(0,Math.min(field.w-1,Math.floor(x/field.paperWidth*field.w))))*4;
      const pool=field.data[index+3]/255,distance=Math.hypot(q.dx,q.dy),pull=.014*(1-pool*.85)+Math.max(0,Math.min(1,(distance-16)/14))*.07;
      const sx=x*.23+time*.21,sy=y*.23-time*.17,fx=x*.47-time*.13,fy=y*.47+time*.19;
      const spin=(.055+pool*.16)*q.density;
      return {vx:q.vx*.8+Math.max(-1.5,Math.min(1.5,q.dx*pull))+(Math.sin(sx)*Math.cos(sy)+Math.sin(fx)*Math.cos(fy)*.28)*spin,vy:q.vy*.8+Math.max(-1.5,Math.min(1.5,q.dy*pull))-(Math.cos(sx)*Math.sin(sy)+Math.cos(fx)*Math.sin(fy)*.28)*spin};
    }
    prepareGPU(){
      const gl=this.gl;
      const link=(vertex,fragment,varying)=>{
        const program=gl.createProgram();
        for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
          const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
          if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
          gl.attachShader(program,shader);gl.deleteShader(shader);
        }
        if(varying)gl.transformFeedbackVaryings(program,[varying],gl.SEPARATE_ATTRIBS);
        gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));return program;
      };
      this.updateProgram=link(`#version 300 es
        precision highp float;layout(location=0) in vec4 material;layout(location=1) in vec4 state;
        uniform sampler2D velocity,guide,channel;uniform float time,water,portrait;out vec4 nextState;
        vec2 follow(vec2 p){
          vec2 uv=p/vec2(1600.,1000.);uv.y=1.-uv.y;
          vec4 bank=texture(channel,uv);vec2 current=(bank.xy-.5)*vec2(12.,-12.);
          vec2 v=texture(velocity,uv).xy*vec2(1.,-1.),toward=(texture(guide,uv).xy-.5)*vec2(500.,-500.);
          v=mix(v,current,.6)*.8;
          float pull=.014*(1.-bank.a*.85)+smoothstep(16.,30.,length(toward))*.07;
          vec2 s=p*.23+vec2(time*.21,-time*.17),f=p*.47+vec2(-time*.13,time*.19);
          vec2 curl=vec2(sin(s.x)*cos(s.y),-cos(s.x)*sin(s.y))+vec2(sin(f.x)*cos(f.y),-cos(f.x)*sin(f.y))*.28;
          v+=curl*(.055+bank.a*.16)*texture(guide,uv).z;
          v+=clamp(toward*pull,vec2(-1.5),vec2(1.5));
          return clamp(p+v*(.65+water*.35),vec2(1.),vec2(1599.,999.));
        }
        void main(){
          float age=time-material.x;
          if(material.y<=0.||age<0.||age>material.y){nextState=state;gl_Position=vec4(2,2,2,1);return;}
          if(portrait>.5){nextState=vec4(follow(state.xy),material.w<0.?follow(state.zw):state.xy);gl_Position=vec4(0,0,0,1);return;}
          vec2 uv=state.xy/vec2(1600.,1000.);uv.y=1.-uv.y;
          vec2 v=texture(velocity,uv).xy*vec2(1.,-1.);
          vec2 toward=(texture(guide,uv).xy-.5)*vec2(500.,-500.);
          v+=clamp(toward*.009,vec2(-1.15),vec2(1.15))*smoothstep(.3,3.,age);
          float spread=(1.-smoothstep(.1,3.5,age))*(.28+water*.45)*mix(1.,.5,portrait);
          v+=vec2(cos(material.w),sin(material.w))*spread*mix(1.,.18,portrait);
          v+=vec2(sin(material.w*7.+time*1.7),cos(material.w*9.-time*1.4))*.055;
          vec2 p=state.xy+v*(.65+water*.35);
          nextState=vec4(clamp(p,vec2(1),vec2(1599,999)),state.xy);gl_Position=vec4(0,0,0,1);
        }`,`#version 300 es
        precision highp float;out vec4 frag;void main(){frag=vec4(0);}`,'nextState');
      this.program=link(`#version 300 es
        precision highp float;layout(location=0) in vec4 material;layout(location=1) in vec4 state;
        uniform sampler2D guide;uniform float time,concentration,heads,deposit,portrait;out float opacity,pigment,depth,across,halfWidth;
        void main(){
          float age=time-material.x;pigment=material.z;depth=0.;across=0.;halfWidth=1.;
          if(material.y<=0.||age<0.||age>material.y){opacity=0.;gl_Position=vec4(2,2,2,1);return;}
          vec2 p=(portrait>.5?gl_VertexID<2:gl_VertexID==0)?state.xy:state.zw,uv=p/vec2(1600.,1000.);uv.y=1.-uv.y;
          vec4 bank=texture(guide,uv);float wet=bank.z;
          opacity=(.18+concentration*.18)*(.75+wet*.65)*(1.-smoothstep(material.y*.6,material.y,age));
          if(portrait>.5){
            float load=material.w<0.?.15+1.7*pow(.5+.5*sin(material.w*7.13),4.):.7;
            float supply=.15+bank.a*1.4;
            opacity*=load*supply*min(1.,1.8/(length(state.xy-state.zw)+.15));
            depth=bank.a*load;
            halfWidth=(.26+.48*sqrt(load/1.85))*.5;
            vec2 direction=state.zw-state.xy;direction/=length(direction)+.001;
            float side=gl_VertexID%2==0?-1.:1.;across=side*(halfWidth+.8);
            p+=vec2(-direction.y,direction.x)*across;
          }
          opacity=min(.9,opacity)*mix(1.,mix(.25,.35,portrait)*(1.-smoothstep(1.,4.,age)),deposit);
          if(length(state.xy-state.zw)>16.)opacity=0.;
          gl_Position=vec4(p/vec2(1600.,1000.)*vec2(2.,-2.)+vec2(-1.,1.),0,1);gl_PointSize=mix(1.5,2.8,deposit);
        }`,`#version 300 es
        precision highp float;in float opacity,pigment,depth,across,halfWidth;uniform vec3 inks[3];uniform float heads,portrait;out vec4 frag;
        void main(){
          float a=opacity;if(heads>.5)a*=.6*(1.-smoothstep(.1,.5,length(gl_PointCoord-.5)));
          if(portrait>.5)a*=clamp(halfWidth+.5-abs(across),0.,1.);
          vec3 rgb=inks[int(pigment+.1)];if(portrait>.5)rgb=pow(rgb,vec3(1.+min(1.2,depth*.8)));
          frag=vec4(rgb*a,a);
        }`);
      const locations=(program,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,name)]));
      this.updateUniforms=locations(this.updateProgram,['velocity','guide','channel','time','water','portrait']);
      this.renderUniforms=locations(this.program,['guide','time','concentration','heads','deposit','portrait','inks[0]']);
      this.material=gl.createBuffer();this.positions=[gl.createBuffer(),gl.createBuffer()];this.feedback=gl.createTransformFeedback();this.vaos={update:new Map(),render:new Map()};
      gl.bindBuffer(gl.ARRAY_BUFFER,this.material);gl.bufferData(gl.ARRAY_BUFFER,this.metadata,gl.DYNAMIC_DRAW);
      for(const position of this.positions){
        gl.bindBuffer(gl.ARRAY_BUFFER,position);gl.bufferData(gl.ARRAY_BUFFER,this.states[0],gl.DYNAMIC_COPY);
        for(const [kind,divisor] of [['update',0],['render',1]]){
          const vao=gl.createVertexArray();gl.bindVertexArray(vao);
          [this.material,position].forEach((buffer,index)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,4,gl.FLOAT,false,0,0);gl.vertexAttribDivisor(index,divisor);});
          this.vaos[kind].set(position,vao);
        }
      }
      gl.bindVertexArray(null);
    }
    reset(model){
      const capacity=model.camera?(this.fluid?196608:8192):(this.fluid?61440:4096);
      if(capacity!==this.capacity){
        this.capacity=capacity;this.metadata=new Float32Array(capacity*4);this.states=[new Float32Array(capacity*4),new Float32Array(capacity*4)];
        if(this.gl){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.material);gl.bufferData(gl.ARRAY_BUFFER,this.metadata,gl.DYNAMIC_DRAW);for(const buffer of this.positions){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,this.states[0],gl.DYNAMIC_COPY);}}
      }
      this.model=model;this.cursor=0;this.serial=0;this.count=0;this.lastTick=-1;this.metadata.fill(0);
      if(this.gl){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.material);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.metadata);}
    }
    drop(x,y,colour,tick){
      const packet=InkDroplets.makeDrop(this.model.seed+ ++this.serial*1009,x,y,colour,tick/30,this.perDrop);
      if(this.model.camera)for(let i=1;i<packet.material.length;i+=4)packet.material[i]*=.1;
      this.inject(packet);
    }
    bloom(emitter,tick){if(emitter)this.inject(InkDroplets.makeBloom(this.model.seed+ ++this.serial*1009,emitter,tick/30,this.gl?512:64));}
    seedContours(paths,tick){if(paths.length)this.inject(InkDroplets.makeStrands(this.model.seed,paths,tick/30,this.gl?98304:8192));}
    feedContours(paths,tick){if(paths.length)this.inject(InkDroplets.makeStrands(this.model.seed+ ++this.serial*1009,paths,tick/30,this.gl?4096:512));}
    inject({state,material}){
      const count=state.length/4;if(this.cursor+count>this.capacity)this.cursor=0;
      const offset=this.cursor*4;
      this.metadata.set(material,offset);
      if(this.gl){
        const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.material);gl.bufferSubData(gl.ARRAY_BUFFER,offset*4,material);
        for(const buffer of this.positions){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,offset*4,state);}
      }else for(const positions of this.states)positions.set(state,offset);
      this.cursor+=count;this.count=Math.min(this.capacity,Math.max(this.count,this.cursor));
    }
    advance(tick,params,vortices=[]){
      if(!this.count||tick===this.lastTick)return;
      this.lastTick=tick;const time=tick/30;
      if(this.gl){
        const gl=this.gl,u=this.updateUniforms;gl.useProgram(this.updateProgram);gl.bindVertexArray(this.vaos.update.get(this.positions[0]));
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.fluid.velocity[0].texture);gl.uniform1i(u.velocity,0);
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.fluid.guide);gl.uniform1i(u.guide,1);gl.uniform1f(u.time,time);gl.uniform1f(u.water,params.water);gl.uniform1f(u.portrait,this.model.camera?1:0);
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.fluid.field);gl.uniform1i(u.channel,2);
        // Release the upload binding before this buffer becomes a feedback destination.
        gl.bindBuffer(gl.ARRAY_BUFFER,null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.positions[1]);
        gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,this.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);this.positions.reverse();
      }else{
        const state=this.states[0];
        for(let i=0;i<this.count;i++){
          const j=i*4,age=time-this.metadata[j],life=this.metadata[j+1];if(!life||age<0||age>life)continue;
          if(this.model.camera){
            const a=InkDroplets.portraitVelocity(this.model.transport,state[j],state[j+1],time),b=this.metadata[j+3]<0?InkDroplets.portraitVelocity(this.model.transport,state[j+2],state[j+3],time):null;
            const previousX=state[j],previousY=state[j+1];
            state[j]=Math.max(1,Math.min(1599,state[j]+a.vx));state[j+1]=Math.max(1,Math.min(999,state[j+1]+a.vy));
            state[j+2]=b?Math.max(1,Math.min(1599,state[j+2]+b.vx)):previousX;state[j+3]=b?Math.max(1,Math.min(999,state[j+3]+b.vy)):previousY;continue;
          }
          const q=InkFlow.guideAt(this.model.transport,state[j],state[j+1]),phase=this.metadata[j+3],gather=Math.max(0,Math.min(1,(age-.3)/2.7)),spread=Math.max(0,1-age/3.5)*(.28+params.water*.45);
          let vx=q.vx+Math.max(-1.15,Math.min(1.15,q.dx*.009))*gather,vy=q.vy+Math.max(-1.15,Math.min(1.15,q.dy*.009))*gather;
          vx+=Math.cos(phase)*spread;vy+=Math.sin(phase)*spread;
          for(const v of vortices){const dx=state[j]-v.x,dy=state[j+1]-v.y,m=Math.exp(-(dx*dx+dy*dy)/(v.r*v.r))*v.life;vx+=(-dy*.0025+(v.dx??0)*.16)*m;vy+=(dx*.0025+(v.dy??0)*.16)*m;}
          state[j+2]=state[j];state[j+3]=state[j+1];state[j]=Math.max(1,Math.min(1599,state[j]+vx));state[j+1]=Math.max(1,Math.min(999,state[j+1]+vy));
        }
      }
    }
    render(tick,params,palette,context,deposit=false){
      if(this.gl){
        if(!this.count)return;const gl=this.gl,u=this.renderUniforms;
        gl.useProgram(this.program);gl.bindVertexArray(this.vaos.render.get(this.positions[0]));gl.bindFramebuffer(gl.FRAMEBUFFER,deposit?this.fluid.ink[0].framebuffer:null);gl.viewport(0,0,this.fluid.w,this.fluid.h);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.fluid.guide);gl.uniform1i(u.guide,2);
        gl.uniform1f(u.time,tick/30);gl.uniform1f(u.concentration,params.pigment);gl.uniform1f(u.deposit,deposit?1:0);
        gl.uniform1f(u.portrait,this.model.camera?1:0);
        if(this.lastPalette!==palette){gl.uniform3fv(u['inks[0]'],new Float32Array([0,1,2].flatMap(ink=>InkPigments.swatch(palette,ink).map(value=>value/255))));this.lastPalette=palette;}
        gl.uniform1f(u.heads,0);gl.drawArraysInstanced(this.model.camera?gl.TRIANGLE_STRIP:gl.LINES,0,this.model.camera?4:2,this.count);if(!this.model.camera){gl.uniform1f(u.heads,1);gl.drawArraysInstanced(gl.POINTS,0,1,this.count);}gl.bindVertexArray(null);
      }else{
        if(!deposit)context.clearRect(0,0,1600,1000);context.lineWidth=deposit?.8:1.2;const state=this.states[0],time=tick/30;
        if(this.model.camera){
          const field=this.model.transport,traces=Array.from({length:18},()=>new Path2D());
          for(let i=0;i<this.count;i++){
            const j=i*4,age=time-this.metadata[j],life=this.metadata[j+1],length=Math.hypot(state[j]-state[j+2],state[j+1]-state[j+3]);
            if(!life||age<0||age>life||length>16)continue;
            const index=(Math.max(0,Math.min(field.h-1,Math.floor(state[j+1]/1000*field.h)))*field.w+Math.max(0,Math.min(field.w-1,Math.floor(state[j]/1600*field.w))))*4;
            const load=this.metadata[j+3]<0?InkDroplets.strandLoad(this.metadata[j+3]):.7,reservoir=field.guide[index+3]/255;
            const fade=1-Math.max(0,Math.min(1,(age-life*.6)/(life*.4)));
            const strength=load*(.15+reservoir*1.4)*Math.min(1,1.8/(length+.15))*fade;
            const bucket=Math.min(5,Math.floor(strength*3)),trace=traces[this.metadata[j+2]*6+bucket];
            trace.moveTo(state[j],state[j+1]);trace.lineTo(state[j+2],state[j+3]);
          }
          for(let colour=0;colour<3;colour++)for(let bucket=0;bucket<6;bucket++){
            const rgb=InkPigments.swatch(palette,colour).map(value=>Math.round(Math.pow(value/255,1+bucket*.16)*255));
            context.strokeStyle=`rgba(${rgb.join(',')},${(.035+bucket*.075)*(.4+params.pigment*1.2)*(deposit?.35:1)})`;context.lineWidth=.45+bucket*.07;context.stroke(traces[colour*6+bucket]);
          }
          return;
        }
        for(let colour=0;colour<3;colour++){
          context.strokeStyle=`rgba(${InkPigments.swatch(palette,colour).join(',')},${deposit?.10:.22})`;context.beginPath();
          for(let i=0;i<this.count;i++){const j=i*4,age=time-this.metadata[j];if(this.metadata[j+2]!==colour||!this.metadata[j+1]||age<0||age>this.metadata[j+1])continue;context.moveTo(state[j],state[j+1]);context.lineTo(state[j+2]+.2,state[j+3]+.2);}
          context.stroke();
        }
      }
    }
    destroy(){if(!this.gl)return;const gl=this.gl;for(const buffer of [this.material,...this.positions])gl.deleteBuffer(buffer);for(const set of Object.values(this.vaos))for(const vao of set.values())gl.deleteVertexArray(vao);gl.deleteTransformFeedback(this.feedback);gl.deleteProgram(this.program);gl.deleteProgram(this.updateProgram);}
  }
  root.InkDroplets=InkDroplets;if(typeof module!=='undefined')module.exports=InkDroplets;
})(typeof window!=='undefined'?window:globalThis);
