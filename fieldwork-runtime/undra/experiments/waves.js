import * as THREE from '../vendor/three.module.js';
import { vertex } from '../shaders.js?v=2.24.2';
export const WAVE_SPAN=24, WAVE_SIZE=384, WAVE_DT=1/120;
export function waveParameters(size=WAVE_SIZE,span=WAVE_SPAN,speed=2.8){
  const dx=span/size,c=Math.min(Math.max(.1,speed),dx/WAVE_DT*.65);
  return {dx,speed:c,courant:c*WAVE_DT/dx,dt:WAVE_DT};
}
export const waveStep=/* glsl */`
precision highp float;varying vec2 vUv;
uniform sampler2D uState;uniform float uSize,uSpan,uDt,uSpeed,uDamping;
uniform vec3 uImpulse;
void main(){
 vec2 e=vec2(1.0/uSize,0),xy=(vUv-.5)*uSpan;vec2 state=texture2D(uState,vUv).rg;
 float neighbours=texture2D(uState,vUv+e.xy).r+texture2D(uState,vUv-e.xy).r+texture2D(uState,vUv+e.yx).r+texture2D(uState,vUv-e.yx).r;
 float dx=uSpan/uSize,lap=(neighbours-4.0*state.x)/(dx*dx);
 float edge=smoothstep(.36,.49,max(abs(vUv.x-.5),abs(vUv.y-.5)));
 float velocity=(state.y+uSpeed*uSpeed*lap*uDt)*exp(-(uDamping+edge*16.0)*uDt);
 float radius2=dot(xy-uImpulse.xy,xy-uImpulse.xy)/.07;
 velocity+=uImpulse.z*exp(-radius2)*(1.0-radius2);
 float height=state.x+velocity*uDt;
 // Limit impulsive input while preserving smooth finite wave propagation.
 gl_FragColor=vec4(clamp(height,-.16,.16),clamp(velocity,-3.0,3.0),0,1);
}
`;
export class GPUWaves{
  constructor(renderer,{size=WAVE_SIZE,span=WAVE_SPAN}={}){
    this.renderer=renderer;this.size=size;this.span=span;this.index=0;this.time=0;this.queue=[];
    this.scene=new THREE.Scene();this.camera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.scene.add(this.quad);
    this.targets=[0,1].map(()=>new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false}));
    this.uniforms={uState:{value:null},uSize:{value:size},uSpan:{value:span},uDt:{value:WAVE_DT},uSpeed:{value:2.8},uDamping:{value:.65},uImpulse:{value:new THREE.Vector3()}};
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:waveStep,uniforms:this.uniforms});this.quad.material=this.material;this.reset();
  }
  get texture(){return this.targets[this.index].texture;}
  reset(){
    const previous=this.renderer.getRenderTarget(),color=this.renderer.getClearColor(new THREE.Color()),alpha=this.renderer.getClearAlpha();
    this.renderer.setClearColor(0,0);for(const target of this.targets){this.renderer.setRenderTarget(target);this.renderer.clear();}
    this.renderer.setClearColor(color,alpha);this.renderer.setRenderTarget(previous);this.index=0;this.time=0;this.queue=[];
  }
  impulse(x=0,y=0,strength=.6){
    if(![x,y,strength].every(Number.isFinite))return;
    if(this.queue.length<12)this.queue.push([Math.max(-this.span*.42,Math.min(this.span*.42,x)),Math.max(-this.span*.42,Math.min(this.span*.42,y)),Math.max(-1.8,Math.min(1.8,strength))]);
  }
  step({speed=2.8,damping=.65}={}){
    this.uniforms.uState.value=this.texture;this.uniforms.uSpeed.value=waveParameters(this.size,this.span,speed).speed;
    this.uniforms.uDamping.value=Math.max(.12,Math.min(4,damping));this.uniforms.uImpulse.value.fromArray(this.queue.shift() || [0,0,0]);
    const previous=this.renderer.getRenderTarget(),next=1-this.index;this.renderer.setRenderTarget(this.targets[next]);this.renderer.render(this.scene,this.camera);this.index=next;this.time+=WAVE_DT;this.renderer.setRenderTarget(previous);
  }
  dispose(){this.targets.forEach(target=>target.dispose());this.material.dispose();this.quad.geometry.dispose();}
}
export function coupleDroplets(fluid,waves){
  Object.assign(fluid.uniforms,{uRipple:{value:waves.texture},uRippleSpan:{value:waves.span},uRippleTexel:{value:1/waves.size},uRippleGain:{value:1}});
  const anchor='float damping=exp(-uDt*';
  if(!fluid.stepMaterial.fragmentShader.includes(anchor))throw new Error('Droplet wave coupling needs review.');
  fluid.stepMaterial.fragmentShader=fluid.stepMaterial.fragmentShader.replace('void main(){',`uniform sampler2D uRipple;uniform float uRippleSpan,uRippleTexel,uRippleGain;
void main(){`).replace(anchor,`vec2 rippleUV=p/uRippleSpan+.5,e=vec2(uRippleTexel,0);
 vec2 slope=vec2(texture2D(uRipple,rippleUV+e.xy).r-texture2D(uRipple,rippleUV-e.xy).r,texture2D(uRipple,rippleUV+e.yx).r-texture2D(uRipple,rippleUV-e.yx).r)/(2.0*uRippleTexel*uRippleSpan);
 force-=slope*38.0*uRippleGain;
 ${anchor}`).replace('capillaryV+=(goal-capillary)',`goal+=clamp(texture2D(uRipple,rippleUV).r*8.0*uRippleGain,-.16,.20);
 capillaryV+=(goal-capillary)`);
  fluid.stepMaterial.needsUpdate=true;
}
