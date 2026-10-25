import { RainModel } from './cloud-life.js';
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec4 drop;
layout(location=2) in vec4 motion;
uniform vec2 pixels;
out vec2 local;
out vec2 uv;
out float depth;
out float opacity;
void main(){
 depth=drop.z;opacity=drop.w;
 vec2 velocity=vec2(motion.x,-motion.y)*pixels;
 vec2 along=normalize(velocity),across=vec2(-along.y,along.x);
 float halfLength=clamp(length(velocity)*.011,.8,30.);
 float width=.38+depth*depth*1.15;
 vec2 position=drop.xy*pixels+along*corner.y*halfLength+across*corner.x*width*2.;
 local=corner;uv=position/pixels;gl_Position=vec4(uv*2.-1.,0,1);
}`;
const fragment=`#version 300 es
precision highp float;
in vec2 local,uv;in float depth,opacity;
uniform sampler2D cloudImage;
uniform float encodedHDR,lightMode;
out vec4 fragColor;
void main(){
 float shutter=pow(max(0.,1.-local.y*local.y),2.);
 float streak=exp(-local.x*local.x*5.)*shutter;
 if(streak<.008)discard;
 vec4 under=texture(cloudImage,clamp(uv,vec2(0),vec2(1)));
 float visible=mix(1.-under.a*.99,1.,pow(depth,3.));
 vec3 c=under.rgb;if(encodedHDR>.5)c/=max(vec3(.001),1.-c);
 vec3 background=pow(1.-exp(-max(c,vec3(0))*1.25),vec3(1./2.2));
 vec3 light=mix(vec3(.76,.87,.98),vec3(1.,.90,.72),min(lightMode,1.));
 if(lightMode>2.5)light=vec3(.92,.69,.43);
 else if(lightMode>1.)light=mix(light,vec3(.57,.70,.91),lightMode-1.);
 // A narrow highlight and darker refracted side give each translucent streak depth.
 vec3 color=mix(background*.64,light,smoothstep(-.9,.2,local.x));
 float alpha=streak*opacity*visible*(.20+depth*.28);
 fragColor=vec4(color,alpha);
}`;
function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
export class CloudRain {
 constructor(gl){
  this.gl=gl;this.model=new RainModel();this.data=new Float32Array(5000*8);this.program=gl.createProgram();
  gl.attachShader(this.program,compile(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
  for(let i=1;i<=2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,32,(i-1)*16);gl.vertexAttribDivisor(i,1);}
  gl.bindVertexArray(null);
  this.uniforms=Object.fromEntries(['pixels','cloudImage','encodedHDR','lightMode'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
 }
 setSources(sources){this.model.setSources(sources);}
 clear(){this.model.clear();}
 update(dt,amount,wind,aspect){this.model.update(dt,amount,wind,aspect);}
 draw(settings,width,height,encodedHDR){
  const gl=this.gl,drops=this.model.drops;if(!settings.rainAmount||!drops.length)return;
  for(let i=0;i<drops.length;i++){
   const d=drops[i],j=i*8;
   this.data[j]=d.x;this.data[j+1]=d.y;this.data[j+2]=d.depth;this.data[j+3]=Math.min(1,d.age*18)*settings.rainAmount*d.shine;
   this.data[j+4]=d.vx;this.data[j+5]=d.speed;this.data[j+6]=0;this.data[j+7]=0;
  }
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data.subarray(0,drops.length*8));
  gl.uniform2f(this.uniforms.pixels,width,height);gl.uniform1i(this.uniforms.cloudImage,3);gl.uniform1f(this.uniforms.encodedHDR,encodedHDR);gl.uniform1f(this.uniforms.lightMode,settings.lightMode);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLES,0,6,drops.length);gl.disable(gl.BLEND);gl.bindVertexArray(null);
 }
}
