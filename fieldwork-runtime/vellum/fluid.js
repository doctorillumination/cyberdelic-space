/* A small projected velocity solver transports the wet pigment layer. */
(function(root){
  'use strict';
  class WetInk {
    constructor(model,width=2000,height=1250) {
      this.canvas=document.createElement('canvas');this.canvas.width=width;this.canvas.height=height;
      const gl=this.gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
      if(!gl||!gl.getExtension('EXT_color_buffer_float')||!gl.getExtension('OES_texture_float_linear'))throw new Error('Wet ink GPU format unavailable');
      this.w=width;this.h=height;this.sw=512;this.sh=320;this.time=0;
      this.resources=[];
      this.vertex=`#version 300 es
      out vec2 uv;
      void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
      this.programs={};this.uniforms=new Map();this.eddyData=new Float32Array(32);
      const header=`#version 300 es
      precision highp float; in vec2 uv; out vec4 frag;
      uniform sampler2D u0,u1,u2,u3;uniform vec2 texel;uniform float time,water,speed;
      uniform vec4 eddies[8];
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      `;
      const programs={
        velocity:`vec2 v=texture(u0,uv).xy;vec2 back=uv-v/vec2(1600,1000);v=texture(u0,back).xy*.992;
          vec4 field=texture(u1,uv);vec2 target=(field.xy-.5)*12.;float strength=field.z;
          float n=noise(uv*17.+vec2(time*.002,0.));
          vec2 ambient=vec2(noise(uv*19.+vec2(0,time*.002))-0.5,n-.5);
          v=mix(v,target*speed,.04*strength);v+=ambient*.018*(.35+water);
          v+=vec2(noise(uv*vec2(179.,113.)+vec2(time*.009,5.))-.5,noise(uv*vec2(191.,127.)+vec2(31.,time*.011))-.5)*.065*strength;
          for(int i=0;i<8;i++){vec2 d=(uv-eddies[i].xy)*vec2(1600,1000);float m=exp(-dot(d,d)/(eddies[i].z*eddies[i].z+1.));v+=vec2(-d.y,d.x)*.004*m*eddies[i].w;}
          frag=vec4(clamp(v,vec2(-7.),vec2(7.)),0,1);`,
        curl:`float l=texture(u0,uv-vec2(texel.x,0)).y,r=texture(u0,uv+vec2(texel.x,0)).y;
          float b=texture(u0,uv-vec2(0,texel.y)).x,t=texture(u0,uv+vec2(0,texel.y)).x;
          frag=vec4(.5*(r-l-t+b),0,0,1);`,
        vorticity:`float l=abs(texture(u1,uv-vec2(texel.x,0)).x),r=abs(texture(u1,uv+vec2(texel.x,0)).x);
          float b=abs(texture(u1,uv-vec2(0,texel.y)).x),t=abs(texture(u1,uv+vec2(0,texel.y)).x);
          vec2 gradient=.5*vec2(r-l,t-b);gradient/=length(gradient)+.0001;
          vec2 force=vec2(gradient.y,-gradient.x)*texture(u1,uv).x*(.22+water*.08);
          frag=vec4(clamp(texture(u0,uv).xy+force,vec2(-7),vec2(7)),0,1);`,
        divergence:`float l=texture(u0,uv-vec2(texel.x,0)).x,r=texture(u0,uv+vec2(texel.x,0)).x;
          float b=texture(u0,uv-vec2(0,texel.y)).y,t=texture(u0,uv+vec2(0,texel.y)).y;
          frag=vec4(.5*(r-l+t-b),0,0,1);`,
        pressure:`float l=texture(u0,uv-vec2(texel.x,0)).x,r=texture(u0,uv+vec2(texel.x,0)).x;
          float b=texture(u0,uv-vec2(0,texel.y)).x,t=texture(u0,uv+vec2(0,texel.y)).x;
          frag=vec4((l+r+b+t-texture(u1,uv).x)*.25,0,0,1);`,
        project:`float l=texture(u1,uv-vec2(texel.x,0)).x,r=texture(u1,uv+vec2(texel.x,0)).x;
          float b=texture(u1,uv-vec2(0,texel.y)).x,t=texture(u1,uv+vec2(0,texel.y)).x;
          vec2 v=texture(u0,uv).xy-.5*vec2(r-l,t-b);frag=vec4(v,0,1);`,
        transport:`vec2 v=texture(u1,uv).xy/vec2(1600,1000)*(1.+water*.8);frag=texture(u0,uv-v);`,
        pigment:`vec2 v=texture(u1,uv).xy/vec2(1600,1000)*(1.+water*.8);vec2 back=uv-v;
          vec4 transported=texture(u3,uv),reversed=texture(u3,uv+v);
          vec4 ink=transported+.5*(texture(u0,uv)-reversed);
          vec4 a=texture(u0,back+texel*.7),b=texture(u0,back-texel*.7),c=texture(u0,back+vec2(texel.x,-texel.y)*.7),d=texture(u0,back+vec2(-texel.x,texel.y)*.7);
          ink=clamp(ink,min(min(a,b),min(c,d)),max(max(a,b),max(c,d)));
          ink=mix(ink,(a+b+c+d)*.25,.001)*(.995-water*.001);
          vec4 deposit=texture(u2,uv);deposit.rgb*=deposit.a;
          frag=ink*(1.-deposit.a)+deposit;`,
        display:`vec4 ink=texture(u0,uv);frag=ink*.22;`
      };
      for(const [key,body] of Object.entries(programs))this.programs[key]=this.program(header+`void main(){${body}}`);
      this.velocity=[this.target(this.sw,this.sh),this.target(this.sw,this.sh)];
      this.pressure=[this.target(this.sw,this.sh),this.target(this.sw,this.sh)];this.divergence=this.target(this.sw,this.sh);
      this.curl=this.target(this.sw,this.sh);
      this.ink=[this.target(width,height),this.target(width,height)];
      this.transported=this.target(width,height);
      this.deposit=this.texture();this.field=this.texture();this.makeField(model);
      gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
    }
    program(fragment){
      const gl=this.gl;
      const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,this.vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
      this.uniforms.set(p,Object.fromEntries(['u0','u1','u2','u3','texel','time','water','speed','eddies[0]'].map(name=>[name,gl.getUniformLocation(p,name)])));
      return p;
    }
    texture(){const gl=this.gl,t=gl.createTexture();this.resources.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
    target(w,h){const gl=this.gl,texture=this.texture(),framebuffer=gl.createFramebuffer();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Wet ink framebuffer unavailable');gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return {texture,framebuffer,w,h};}
    makeField(model){
      const w=this.sw,h=this.sh,values=new Float32Array(w*h*3),data=new Uint8Array(w*h*4),scale=model.w/w;
      for(const p of model.paths) {
        for(let k=1;k<p.points.length;k+=3) {
          const a=p.points[k-1],b=p.points[k],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,x=b.x/scale,y=b.y/scale,r=(p.width*2.5+14)/scale;
          for(let iy=Math.max(0,Math.floor(y-r));iy<=Math.min(h-1,Math.ceil(y+r));iy++)for(let ix=Math.max(0,Math.floor(x-r));ix<=Math.min(w-1,Math.ceil(x+r));ix++) {
            const d=((ix-x)**2+(iy-y)**2)/(r*r),weight=Math.exp(-d*3),j=(iy*w+ix)*3;
            if(weight>values[j+2]){values[j]=dx/len*1.4;values[j+1]=-dy/len*1.4;values[j+2]=weight;}
          }
        }
      }
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*3,i=((h-1-y)*w+x)*4;data[i]=128+values[j]/12*255;data[i+1]=128+values[j+1]/12*255;data[i+2]=values[j+2]*255;data[i+3]=255;}
      const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.field);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    }
    pass(name,target,textures,params={}){
      const gl=this.gl,p=this.programs[name],u=this.uniforms.get(p);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,target?.framebuffer??null);gl.viewport(0,0,target?.w??this.w,target?.h??this.h);
      textures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.texture??t);if(u['u'+i]!==null)gl.uniform1i(u['u'+i],i);});
      if(u.texel!==null)gl.uniform2f(u.texel,1/(target?.w??this.w),1/(target?.h??this.h));
      if(u.time!==null)gl.uniform1f(u.time,this.time);if(u.water!==null)gl.uniform1f(u.water,params.water??.6);if(u.speed!==null)gl.uniform1f(u.speed,.4+(params.flow??.6)*1.4);
      if(params.eddies&&u['eddies[0]']!==null){const es=this.eddyData;es.fill(0);params.eddies.slice(-8).forEach((v,i)=>{es.set([v.x/1600,1-v.y/1000,v.r,v.life],i*4);});gl.uniform4fv(u['eddies[0]'],es);}
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    upload(canvas){const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.deposit);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);}
    warmVelocity(params){
      for(let k=0;k<45;k++){
        this.time++;
        this.pass('velocity',this.velocity[1],[this.velocity[0],this.field],{...params,eddies:[]});this.velocity.reverse();
        this.pass('curl',this.curl,[this.velocity[0]]);this.pass('vorticity',this.velocity[1],[this.velocity[0],this.curl],params);this.velocity.reverse();
        this.pass('divergence',this.divergence,[this.velocity[0]]);
        for(let i=0;i<10;i++){this.pass('pressure',this.pressure[1],[this.pressure[0],this.divergence]);this.pressure.reverse();}
        this.pass('project',this.velocity[1],[this.velocity[0],this.pressure[0]]);this.velocity.reverse();
      }
    }
    update(canvas,params,eddies=[],paint=true){
      this.time++;this.upload(canvas);
      this.pass('velocity',this.velocity[1],[this.velocity[0],this.field],{...params,eddies});this.velocity.reverse();
      this.pass('curl',this.curl,[this.velocity[0]]);
      this.pass('vorticity',this.velocity[1],[this.velocity[0],this.curl],params);this.velocity.reverse();
      this.pass('divergence',this.divergence,[this.velocity[0]]);
      for(let i=0;i<10;i++){this.pass('pressure',this.pressure[1],[this.pressure[0],this.divergence]);this.pressure.reverse();}
      this.pass('project',this.velocity[1],[this.velocity[0],this.pressure[0]]);this.velocity.reverse();
      this.pass('transport',this.transported,[this.ink[0],this.velocity[0]],params);
      this.pass('pigment',this.ink[1],[this.ink[0],this.velocity[0],this.deposit,this.transported],params);this.ink.reverse();
      if(paint)this.pass('display',null,[this.ink[0]]);
    }
    destroy(){const gl=this.gl;for(const t of this.resources)gl.deleteTexture(t);for(const a of [...this.velocity,...this.pressure,this.divergence,this.curl,...this.ink,this.transported])gl.deleteFramebuffer(a.framebuffer);for(const p of Object.values(this.programs))gl.deleteProgram(p);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }
  root.WetInk=WetInk;
})(window);
