import * as THREE from './vendor/three.module.js';
import { vertex, surface, indirect, shaderMode } from './shaders.js?v=2.24.2';
import { objectShader } from './objects.js?v=2.24.2';
import { compileGraphics } from './performance.js?v=2.24.2';
export class SurfaceCache {
 constructor(renderer,uniforms,size=768,fragmentShader=surface,objects='soft'){
   this.renderer=renderer;this.size=size;this.scene=new THREE.Scene();this.camera=new THREE.Camera();
   const type=renderer.getContext().getExtension('OES_texture_float_linear')?THREE.FloatType:THREE.HalfFloatType;
   this.target=new THREE.WebGLRenderTarget(size,size,{type,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
   this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:objectShader(fragmentShader,objects),uniforms});
   this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
 }
 resize(size){if(size!==this.size){this.size=size;this.target.setSize(size,size);}}
 rebuild(){this.quad.material=this.material;this.renderer.setRenderTarget(this.target);this.renderer.render(this.scene,this.camera);}
 async rebuildTiled(waitForGpu,shouldStop){
   const renderer=this.renderer;this.quad.material=this.material;renderer.setRenderTarget(this.target);
   await compileGraphics(renderer,this.scene,this.camera);if(shouldStop())return false;
   renderer.setScissorTest(true);
   try{
     for(let y=0;y<this.size;y+=384)for(let x=0;x<this.size;x+=384){
       if(shouldStop())return false;
       renderer.setScissor(x,y,Math.min(384,this.size-x),Math.min(384,this.size-y));
       renderer.render(this.scene,this.camera);await waitForGpu();
     }
     return true;
   }finally{renderer.setScissorTest(false);}
 }
 get texture(){return this.target.texture;}
}
export class LightingCache extends SurfaceCache {
 constructor(renderer,uniforms,objects='soft'){super(renderer,uniforms,512,shaderMode(indirect),objects);this.liveMaterial=this.material;this.fastExportMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:shaderMode(indirect,{film:true,objects}),uniforms});this.exportMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:shaderMode(indirect,{exact:true,film:true,objects}),uniforms});}
 rebuild(){this.material=this.liveMaterial.uniforms.uFilm.value?(this.liveMaterial.uniforms.uExactOptics.value?this.exportMaterial:this.fastExportMaterial):this.liveMaterial;this.material.uniforms.uLive.value=true;super.rebuild();}
 rebuildTiled(waitForGpu,shouldStop){this.material=this.liveMaterial.uniforms.uFilm.value?(this.liveMaterial.uniforms.uExactOptics.value?this.exportMaterial:this.fastExportMaterial):this.liveMaterial;this.material.uniforms.uLive.value=true;return super.rebuildTiled(waitForGpu,shouldStop);}
}
