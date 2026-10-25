import * as THREE from '../vendor/three.module.js';
import { vertex } from '../shaders.js?v=2.24.2';
import { WATER } from './dispersion.js?v=2.22.0';
export const SPECTRAL_SIZE=512,SPECTRAL_SPAN=32;
const modeStep=/* glsl */`
precision highp float;precision highp int;varying vec2 vUv;
uniform sampler2D uState;uniform float uSize,uSpan,uDt,uDepth,uDrag,uSigma;
uniform int uSourceCount;uniform vec4 uSources[4];
const float PI=3.14159265359;
void main(){
 ivec2 cell=ivec2(gl_FragCoord.xy);vec2 index=vec2(cell);index-=step(vec2(uSize*.5),index)*uSize;
 vec2 k=index*(2.0*PI/uSpan);float magnitude=length(k);vec4 state=texelFetch(uState,cell,0);
 if(magnitude<.00001 || cell.x==int(uSize)*1/2 || cell.y==int(uSize)*1/2){gl_FragColor=vec4(0);return;}
 float omega2=(9.81*magnitude+uSigma/998.0*magnitude*magnitude*magnitude)*tanh(magnitude*uDepth);
 float gamma=uDrag*.5+2.0*.000001*magnitude*magnitude;
 float difference=omega2-gamma*gamma,omega=sqrt(max(abs(difference),.00000001));
 float c,s;if(difference>=0.0){c=cos(omega*uDt);s=sin(omega*uDt)/omega;}
 else{float a=exp(omega*uDt),b=1.0/a;c=.5*(a+b);s=.5*(a-b)/omega;}
 float decay=exp(-gamma*uDt);
 vec2 h=decay*((c+gamma*s)*state.xy+s*state.zw),v=decay*(-omega2*s*state.xy+(c-gamma*s)*state.zw);
 for(int i=0;i<4;i++){
  if(i>=uSourceCount)break;vec4 source=uSources[i];float sigma=source.w,q=.5*sigma*sigma*magnitude*magnitude;
  float coefficient=source.z*(uSize*uSize)*(2.0*PI*sigma*sigma/(uSpan*uSpan))*q*exp(-q);
  float phase=-dot(k,source.xy+vec2(uSpan*.5));v+=coefficient*vec2(cos(phase),sin(phase));
 }
 gl_FragColor=vec4(h,v);
}
`;
const packModes=/* glsl */`
precision highp float;precision highp int;varying vec2 vUv;
uniform sampler2D uState;uniform float uSize,uSpan;
void main(){
 ivec2 cell=ivec2(gl_FragCoord.xy);vec2 index=vec2(cell);index-=step(vec2(uSize*.5),index)*uSize;
 vec2 k=index*6.28318530718/uSpan;vec2 original=texelFetch(uState,cell,0).xy;
 float phase=.5*(uSpan/uSize)*(k.x+k.y);vec2 h=vec2(original.x*cos(phase)-original.y*sin(phase),original.x*sin(phase)+original.y*cos(phase));
 // Two real spatial derivatives share the second complex Fourier channel.
 vec2 slope=vec2(-k.y*h.x-k.x*h.y,k.x*h.x-k.y*h.y);
 gl_FragColor=vec4(h/.1,slope);
}
`;
const fftStep=/* glsl */`
precision highp float;precision highp int;varying vec2 vUv;
uniform sampler2D uState;uniform int uSize,uSubSize;uniform bool uVertical;
vec2 multiply(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
void main(){
 ivec2 cell=ivec2(gl_FragCoord.xy);int index=uVertical?cell.y:cell.x;
 int halfSize=uSubSize/2,even=(index/uSubSize)*halfSize+index%halfSize,odd=even+uSize/2;
 ivec2 a=uVertical?ivec2(cell.x,even):ivec2(even,cell.y),b=uVertical?ivec2(cell.x,odd):ivec2(odd,cell.y);
 vec4 x=texelFetch(uState,a,0),y=texelFetch(uState,b,0);float angle=6.28318530718*float(index%uSubSize)/float(uSubSize);
 vec2 twiddle=vec2(cos(angle),sin(angle));gl_FragColor=.5*vec4(x.xy+multiply(y.xy,twiddle),x.zw+multiply(y.zw,twiddle));
}
`;
const unpack=/* glsl */`
precision highp float;varying vec2 vUv;uniform sampler2D uState;
void main(){vec4 f=texture2D(uState,vUv);gl_FragColor=vec4(f.x,f.z,f.w,f.y);}
`;
function target(size,type,filter=THREE.NearestFilter){return new THREE.WebGLRenderTarget(size,size,{type,minFilter:filter,magFilter:filter,depthBuffer:false,stencilBuffer:false});}
export class SpectralWater{
 constructor(renderer,{size=SPECTRAL_SIZE,span=SPECTRAL_SPAN,depth=WATER.depth}={}){
  if(size<32 || size>512 || (size&(size-1)))throw new Error('Spectral water requires a power-of-two grid from 32 to 512.');
  this.renderer=renderer;this.size=size;this.span=span;this.depth=depth;this.index=0;this.time=0;this.queue=[];this.dirty=true;
  this.scene=new THREE.Scene();this.camera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.scene.add(this.quad);
  this.states=[target(size,THREE.FloatType),target(size,THREE.FloatType)];this.fft=[target(size,THREE.FloatType),target(size,THREE.FloatType)];
  this.field=target(size,THREE.HalfFloatType,THREE.LinearFilter);
  this.uniforms={uState:{value:null},uSize:{value:size},uSpan:{value:span*WATER.worldUnit},uDt:{value:1/60},uDepth:{value:depth},uSigma:{value:WATER.surfaceTension},uDrag:{value:.35},uSourceCount:{value:0},uSources:{value:Array.from({length:4},()=>new THREE.Vector4())}};
  this.modeMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:modeStep,uniforms:this.uniforms});
  this.packMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:packModes,uniforms:this.uniforms});
  this.fftUniforms={uState:{value:null},uSize:{value:size},uSubSize:{value:2},uVertical:{value:false}};
  this.fftMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fftStep,uniforms:this.fftUniforms});
  this.unpackMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:unpack,uniforms:{uState:{value:null}}});this.reset();
 }
 get texture(){return this.field.texture;}
 reset(){
  const previous=this.renderer.getRenderTarget(),color=this.renderer.getClearColor(new THREE.Color()),alpha=this.renderer.getClearAlpha();
  this.renderer.setClearColor(0,0);for(const t of [...this.states,...this.fft,this.field]){this.renderer.setRenderTarget(t);this.renderer.clear();}
  this.renderer.setClearColor(color,alpha);this.renderer.setRenderTarget(previous);this.index=0;this.time=0;this.queue=[];this.dirty=false;
 }
 impulse(x=0,y=0,strength=1,width=.32){
  if(![x,y,strength,width].every(Number.isFinite) || this.queue.length>=12)return;
  this.queue.push([Math.max(-this.span*.35,Math.min(this.span*.35,x))*.1,Math.max(-this.span*.35,Math.min(this.span*.35,y))*.1,Math.max(-2.8,Math.min(2.8,strength))*.12*Math.min(1,this.depth/.025),Math.max(.12,Math.min(.7,width))*.1]);
 }
 draw(material,to){this.quad.material=material;this.renderer.setRenderTarget(to);this.renderer.render(this.scene,this.camera);}
 step({dt=1/60,speed=2.8,damping=.35,depth=this.depth,surfaceTension=WATER.surfaceTension}={}){
  this.depth=Math.max(.01,Math.min(.08,depth));const u=this.uniforms;u.uState.value=this.states[this.index].texture;
  u.uDt.value=Math.max(0,Math.min(.05,dt))*Math.max(.5,Math.min(1.6,speed/2.8));u.uDepth.value=this.depth;u.uSigma.value=Math.max(.030,Math.min(.080,surfaceTension));u.uDrag.value=Math.max(.12,Math.min(3,damping));
  const count=Math.min(4,this.queue.length);u.uSourceCount.value=count;for(let i=0;i<count;i++)u.uSources.value[i].fromArray(this.queue.shift());
  const previous=this.renderer.getRenderTarget(),next=1-this.index;this.draw(this.modeMaterial,this.states[next]);this.index=next;this.time+=u.uDt.value;this.dirty=true;this.renderer.setRenderTarget(previous);
 }
 rebuild(){
  if(!this.dirty)return;const previous=this.renderer.getRenderTarget();this.uniforms.uState.value=this.states[this.index].texture;this.draw(this.packMaterial,this.fft[0]);let index=0;
  for(const vertical of [false,true])for(let subSize=2;subSize<=this.size;subSize*=2){
   this.fftUniforms.uState.value=this.fft[index].texture;this.fftUniforms.uSubSize.value=subSize;this.fftUniforms.uVertical.value=vertical;
   const next=1-index;this.draw(this.fftMaterial,this.fft[next]);index=next;
  }
  this.unpackMaterial.uniforms.uState.value=this.fft[index].texture;this.draw(this.unpackMaterial,this.field);this.renderer.setRenderTarget(previous);this.dirty=false;
 }
 dispose(){[...this.states,...this.fft,this.field].forEach(t=>t.dispose());[this.modeMaterial,this.packMaterial,this.fftMaterial,this.unpackMaterial].forEach(m=>m.dispose());this.quad.geometry.dispose();}
}
