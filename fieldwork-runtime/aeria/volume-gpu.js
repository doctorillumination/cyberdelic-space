// Rasterize billow spheres on the GPU instead of visiting millions of voxels in JavaScript.
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec4 shape;
layout(location=1) in vec4 material;
uniform vec3 grid;
uniform vec2 tiles;
uniform float aspect, projection;
uniform int slices;
out vec3 local;out vec2 worldUV;
flat out float strength;
void main(){
 vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
 vec2 c=corners[gl_VertexID];float layer=projection>.5?floor((shape.z+.7)/1.4*grid.z):material.z+float(gl_InstanceID%slices);
 layer=clamp(layer,0.,grid.z-1.);
 float dz=((layer+.5)/grid.z*1.4-.7-shape.z)/(shape.w*material.x);
 vec2 p=shape.xy+c*shape.w/vec2(aspect*3.2,3.2);
 vec2 tile=vec2(mod(layer,tiles.x),floor(layer/tiles.x));
 vec2 uv=projection>.5?p:(tile+p)/tiles;
 gl_Position=vec4(uv*2.-1.,0,1);
 if(abs(dz)>=1.||(projection<.5&&layer>material.w))gl_Position=vec4(2,2,0,1);
 worldUV=p;local=vec3(c,dz);strength=material.y;
}`;
const fragment = `#version 300 es
precision highp float;
in vec3 local;in vec2 worldUV;
flat in float strength;
out vec4 color;
void main(){if(any(lessThan(worldUV,vec2(0)))||any(greaterThan(worldUV,vec2(1))))discard;float r=dot(local,local);if(r>=1.)discard;color=vec4((1.-sqrt(r))*strength,0,0,1);}`;
function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
export class VolumeGPU {
 constructor(gl,volume,footprint,nx=384,ny=256,nz=96){
  Object.assign(this,{gl,volume,footprint,nx,ny,nz,columns:Math.ceil(Math.sqrt(nz)),pending:[],clear:true});this.rows=Math.ceil(nz/this.columns);
  const p=this.program=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
  this.locations={};for(const name of ['grid','tiles','aspect','projection','slices'])this.locations[name]=gl.getUniformLocation(p,name);
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  for(let i=0;i<2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,32,i*16);}
  gl.bindVertexArray(null);
  this.atlas=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.atlas);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,nx*this.columns,ny*this.rows,0,gl.RED,gl.UNSIGNED_BYTE,null);
  this.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.atlas,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Could not allocate cloud geometry.');
  this.maskFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.maskFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,footprint,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  this.readBuffer=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.readBuffer);gl.bufferData(gl.PIXEL_PACK_BUFFER,nx*ny,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);this.mask=new Uint8Array(nx*ny);
 }
 reset(){this.pending.length=0;this.slices=0;this.clear=true;this.revision=(this.revision||0)+1;}
 sphere(x,y,z,r,stretch=1,strength=1){
  const first=Math.max(0,Math.floor((z-r*stretch+.7)/1.4*this.nz)),last=Math.min(this.nz-1,Math.ceil((z+r*stretch+.7)/1.4*this.nz));
  if(first>last)return;this.slices=Math.max(this.slices||0,last-first+1);this.pending.push(x,y,z,r,stretch,strength,first,last);
 }
 flush(aspect,readMask=false){
  const gl=this.gl,{nx,ny,nz,columns,rows}=this,n=this.pending.length/8,slices=this.slices||1;
  gl.bindVertexArray(this.vao);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.pending),gl.STREAM_DRAW);this.pending.length=0;this.slices=0;
  gl.uniform1i(this.locations.slices,slices);gl.uniform3f(this.locations.grid,nx,ny,nz);gl.uniform2f(this.locations.tiles,columns,rows);gl.uniform1f(this.locations.aspect,aspect);
  gl.enable(gl.BLEND);gl.blendEquation(gl.MAX);gl.blendFunc(gl.ONE,gl.ONE);gl.clearColor(0,0,0,0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,nx*columns,ny*rows);if(this.clear)gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(this.locations.projection,0);for(let i=0;i<2;i++)gl.vertexAttribDivisor(i,slices);if(n)gl.drawArraysInstanced(gl.TRIANGLES,0,6,n*slices);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.volume);
  for(let z=0;z<nz;z++)gl.copyTexSubImage3D(gl.TEXTURE_3D,0,0,0,z,(z%columns)*nx,Math.floor(z/columns)*ny,nx,ny);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.maskFramebuffer);gl.viewport(0,0,nx,ny);if(this.clear)gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(this.locations.projection,1);for(let i=0;i<2;i++)gl.vertexAttribDivisor(i,1);if(n)gl.drawArraysInstanced(gl.TRIANGLES,0,6,n);
  gl.disable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.bindVertexArray(null);this.clear=false;
  if(readMask&&!this.readFence){gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.readBuffer);gl.readPixels(0,0,nx,ny,gl.RED,gl.UNSIGNED_BYTE,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);this.readRevision=this.revision;this.readFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 pollMask(){
  if(!this.readFence)return null;const gl=this.gl,status=gl.clientWaitSync(this.readFence,0,0);if(status===gl.TIMEOUT_EXPIRED)return null;
  gl.deleteSync(this.readFence);this.readFence=null;if(status===gl.WAIT_FAILED||this.readRevision!==this.revision)return null;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.readBuffer);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,this.mask);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);return this.mask;
 }
}
