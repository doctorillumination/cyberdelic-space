import * as THREE from '../vendor/three.module.js';
import { LAB,LabElectrode,labReadouts } from './lab-model.js?v=2.23.6';
import { MolecularLens } from './lab-lens.js?v=2.23.6';
import { projectPoint } from '../camera.js';

export const electricGLSL=/* glsl */`
uniform bool uLabElectric;
uniform vec4 uLabPatches[54];
uniform vec3 uLabBlock;
uniform float uLabChargePerMass,uLabCapillaryScale;
vec2 labAcceleration(vec2 point,float radius){
 vec3 p=vec3(point,max(radius,.08))*.005-uLabBlock;
 if(max(max(abs(p.x),abs(p.y)),abs(p.z))<.0025)return vec2(0);
 vec3 E=vec3(0),Jx=vec3(0),Jy=vec3(0);
 float clearance=max(radius*.005*2.0,.0005);
 for(int i=0;i<54;i++){
  vec4 electrodeCell=uLabPatches[i];vec3 delta=p-electrodeCell.xyz;
  float r2=max(dot(delta,delta),clearance*clearance),scale=8987551792.261*electrodeCell.w/(r2*sqrt(r2));
  E+=scale*delta;
  Jx+=scale*(vec3(1,0,0)-3.0*delta*delta.x/r2);
  Jy+=scale*(vec3(0,1,0)-3.0*delta*delta.y/r2);
 }
 float coefficient=3.0*8.8541878128e-12/998.0*(79.0/82.0);
 vec2 a=(uLabChargePerMass*E.xy+coefficient*vec2(dot(E,Jx),dot(E,Jy)))/.005;
 float magnitude=length(a);return a*min(1.0,6.0/max(magnitude,.00001));
}
`;

export function attachLabPhysics(fluid){
 if(fluid.uniforms.uLabElectric)return;
 Object.assign(fluid.uniforms,{uLabElectric:{value:false},uLabPatches:{value:Array.from({length:54},()=>new THREE.Vector4())},uLabBlock:{value:new THREE.Vector3()},uLabChargePerMass:{value:0},uLabCapillaryScale:{value:1}});
 fluid.stepMaterial.fragmentShader=fluid.stepMaterial.fragmentShader.replace('void main(){',electricGLSL+'\nvoid main(){').replace(' float damping=exp(-uDt*',' if(uLabElectric && !follower)force+=labAcceleration(p,pos.z);\n float damping=exp(-uDt*').replace(' capillaryV+=(goal-capillary)',' goal*=uLabCapillaryScale;\n capillaryV+=(goal-capillary)').replace('clamp(capillary,-.15,.32)','clamp(capillary,-.15,mix(.32,.55,clamp(uLabCapillaryScale-1.0,0.0,1.0)))');
 fluid.stepMaterial.needsUpdate=true;
}

const markup=`
<div id="lab-identity"><a href="./" aria-label="Return to glop">← glop</a><span>EXPERIMENTAL / WATER LAB</span></div>
<button id="lab-toggle" aria-expanded="true" aria-controls="lab-panel" hidden>Water lab</button>
<aside id="lab-panel" aria-label="Water experiments">
 <span class="lab-eyebrow">PLAY FIRST. NOTICE WHAT CHANGES.</span><h2>Water, alive.</h2>
 <div class="lab-tabs" role="group" aria-label="Choose an experiment"><button data-lab-mode="charge" aria-pressed="true">Charge</button><button data-lab-mode="soap" aria-pressed="false">Detergent</button><button data-lab-mode="inspect" aria-pressed="false">Close-up</button><button id="lab-close" aria-label="Hide learning controls">×</button></div>
 <p id="lab-prompt">Move the silver block. Bring a droplet close and see where it wants to go.</p>
 <div id="lab-charge-controls">
  <label>Block charge <output id="lab-charge-out">0.00 nC</output><input id="lab-charge" aria-label="Block charge" type="range" min="-.6" max=".6" step=".01" value="0"></label>
  <div class="lab-actions"><button id="lab-reverse">Reverse charge</button><button id="lab-neutral-block">Discharge</button></div>
  <span class="lab-label">Give the water a net charge</span><div class="lab-options" role="group" aria-label="Water charge"><button data-water-charge="0" aria-pressed="true">Neutral</button><button data-water-charge="1" aria-pressed="false">Positive</button><button data-water-charge="-1" aria-pressed="false">Negative</button></div>
 </div>
 <div id="lab-soap-controls" hidden><label>Detergent (SDS) <output id="lab-soap-out">0.00 mM</output><input id="lab-soap" aria-label="Detergent concentration" type="range" min="0" max="20" step=".05" value="0"></label><div class="lab-actions"><button id="lab-add-soap">Add a little detergent</button><button id="lab-clean-water">Pure water</button></div></div>
 <div class="lab-reading"><span>Surface tension</span><strong id="lab-gamma">72.8 <small>mN/m</small></strong></div>
 <div id="lab-drop-reading" class="lab-reading" hidden><span id="lab-radius-label">Selected drop</span><strong id="lab-pressure"></strong></div>
 <p id="lab-discovery" class="lab-discovery">Neutral water is attracted by either sign. Predict what will happen before reversing the block.</p>
 <div id="lab-highlights" hidden><div class="lab-options lab-molecular-options" role="group" aria-label="Molecular highlights"><button data-highlight="heads" aria-pressed="true"><i class="lab-head-dot"></i>Heads</button><button data-highlight="tails" aria-pressed="true"><i class="lab-tail-dot"></i>Tails</button><button data-highlight="bonds" aria-pressed="true">H bonds</button></div><p class="lab-key"><span><i class="lab-head-dot"></i>Hydrophilic: water-loving</span><span><i class="lab-tail-dot"></i>Hydrophobic: water-avoiding</span></p></div>
 <details id="lab-why"><summary>Why does this happen?</summary><div id="lab-explanation"></div></details>
 <details class="lab-deeper"><summary>Equations, sources, and model limits</summary><p>For a small water sphere in air: <span class="lab-equation">F = qE + ½α∇|E|²</span>, with <span class="lab-equation">α = 4πε₀R³(εᵣ − 1)/(εᵣ + 2)</span>. The block uses an approximate equipotential conductor. Neutral water follows stronger fields with either polarity. A charged drop also feels qE.</p><p>For a spherical interface: <span class="lab-equation">Δp = 2γ/R</span>. Charge stability: <span class="lab-equation">q<sub>R</sub> = 8π√(ε₀γR³)</span>. The selected radius is a volume-equivalent sphere, not the contact angle of the displayed drop.</p><p>This is a visual physics sandbox. SI electric forces are coupled to glop's existing parcel model, with bounded acceleration and artistic drag. Near contact the field is regularized. Full coupled electrohydrodynamics, mutual droplet electrostatics, charge relaxation, and calibrated wetting are omitted. Detergent changes capillary cohesion and response in proportion to an illustrative SDS tension curve, not a measured contact angle. The molecular lens is a spatial teaching illustration, not molecular dynamics. Sizes, populations, and motion are enlarged or slowed; counterions are omitted.</p><p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2917862/" target="_blank" rel="noopener">Electric polarization</a> · <a href="https://pubs.acs.org/doi/10.1021/jacs.5b07845" target="_blank" rel="noopener">Water and SDS</a> · <a href="https://www.nist.gov/publications/temperature-effect-nanostructure-sds-micelles-water" target="_blank" rel="noopener">Micelles</a></p></details>
 <div class="lab-bottom"><button id="lab-reset">Fresh droplets</button><button id="lab-pause">Pause</button></div>
</aside>
<div id="lab-lens" hidden><div class="lab-lens-title"><span id="lab-lens-title">Inside a droplet</span><span>ILLUSTRATED MOLECULAR SCALE</span></div><canvas id="lab-molecules" aria-label="Three-dimensional molecular close-up. Water has red oxygen and pearl hydrogen. Teal hydrophilic heads face water; gold hydrophobic tails point into air or gather inside micelles. Drag to rotate." ></canvas><div class="lab-lens-foot"><span>Water below. Air above.</span><span>Drag to turn</span></div></div>
<div id="lab-block-label" aria-hidden="true"></div>
<div id="lab-selected-ring" aria-hidden="true" hidden></div>
`;
const explanations={
 charge:'<p>Water is neutral overall, but an electric field polarizes it. A stronger field pulls a neutral drop toward the block, regardless of the block’s sign.</p><p>Giving water a net charge adds another force. Like charges can repel; opposite charges attract. A conductor’s surface charge also rearranges, so very close encounters are more subtle.</p><p>Try neutral water first. Reverse the block. Then give the water a net charge and compare.</p>',
 soap:'<p>Creating new water surface costs energy. Surface tension is that cost per area. Detergent gathers at the interface and lowers it, so stretching a drop costs less.</p><p>The same water now has weaker capillary cohesion and a softer deformation response. Its volume stays the same. We are not assuming that lowering surface tension alone determines how a drop spreads on a solid.</p><p>SDS is a model surfactant. Its curve and approximate 8.2 mM micelle threshold depend on temperature, salt, and purity.</p>',
 inspect:'<p>Teal sulfate heads interact with water. Gold nonpolar tails favour less contact with water. At the surface, heads stay hydrated while tails extend into air.</p><p>Above an approximate concentration threshold, tails collect inside micelles and heads face the surrounding water. Detergent reorganizes the interface; water keeps its hydrogen-bond network.</p><p>Red spheres are oxygen; pearl spheres are hydrogen. Solid links join each water molecule. Dashed blue links illustrate hydrogen bonds between molecules and interactions near heads.</p>'
};

export class WaterLab{
 constructor({canvas,fluid,objects,settings,onChange,onTakeOver,onReset,onPause,onOpen,getRunning,getFrame,getView}){
  Object.assign(this,{canvas,fluid,objects,settings,onChange,onTakeOver,onReset,onPause,onOpen,getRunning,getFrame,getView});this.mode='charge';this.charge=0;this.waterCharge=0;this.concentration=0;this.radius=.25;this.selected=-1;this.lastRead=-Infinity;this.lastDistribution=-Infinity;this.drops=[];this.pose=[0,.25];this.electrode=new LabElectrode();this.lens=null;this.visible=true;this.busy=false;
  const style=document.createElement('link');style.rel='stylesheet';style.href='experiments/water-lab.css?v=2.23.6';document.head.append(style);
  const root=document.createElement('div');root.id='water-lab';root.innerHTML=markup;document.body.append(root);this.root=root;document.body.classList.add('learning');canvas.dataset.learningLab='true';canvas.setAttribute('aria-label',canvas.getAttribute('aria-label')+' Experimental learning mode. Drag the silver charged block. Use Detergent to soften the same water, or Close-up to inspect a droplet.');
  this.$=id=>root.querySelector('#'+id);this.attach(fluid);this.bind();this.setMode('charge');
 }
 bind(){
  this.root.querySelectorAll('[data-lab-mode]').forEach(b=>b.onclick=()=>this.setMode(b.dataset.labMode));
  this.$('lab-charge').oninput=e=>{this.charge=Number(e.target.value)*1e-9;this.readings();};
  this.$('lab-reverse').onclick=()=>{this.charge=-this.charge;this.readings();};this.$('lab-neutral-block').onclick=()=>{this.charge=0;this.readings();};
  this.root.querySelectorAll('[data-water-charge]').forEach(b=>b.onclick=()=>{this.waterCharge=Number(b.dataset.waterCharge)*LAB.chargePerMass;this.lastDistribution=-Infinity;this.readings();});
  this.$('lab-soap').oninput=e=>{this.concentration=Number(e.target.value);this.readings();};
  this.$('lab-add-soap').onclick=()=>{this.concentration=Math.min(20,this.concentration+(this.concentration<.5?.05:1));this.readings();};this.$('lab-clean-water').onclick=()=>{this.concentration=0;this.readings();};
  this.root.querySelectorAll('[data-highlight]').forEach(b=>b.onclick=()=>{const key=b.dataset.highlight;this.lens.show[key]=!this.lens.show[key];b.setAttribute('aria-pressed',String(this.lens.show[key]));this.lens.applyHighlights();this.canvas.dataset.labHighlights=JSON.stringify(this.lens.show);});
  this.$('lab-reset').onclick=()=>{this.onReset();this.selected=-1;this.lastRead=-Infinity;this.ensureBlock();this.readings();};this.$('lab-pause').onclick=()=>{this.onPause();this.$('lab-pause').textContent=this.getRunning()?'Pause':'Resume';};
  this.$('lab-close').onclick=()=>this.setVisible(false);this.$('lab-toggle').onclick=()=>this.setVisible(true);
 }
 attach(fluid){this.fluid=fluid;attachLabPhysics(fluid);this.lastDistribution=-Infinity;}
 ensureBlock(){
  if(this.mode!=='charge')return;if(this.objects.bodies.length)return;this.body=this.objects.add('cube',{soft:false});this.body.size=[.5,.5,.5];[this.body.x,this.body.y]=this.pose;this.objects.sync();this.onChange();
 }
 setMode(mode){
  this.onTakeOver();if(this.body)this.pose=[this.body.x,this.body.y];this.objects.clear();this.body=null;this.mode=mode;this.ensureBlock();
  this.$('lab-charge-controls').hidden=mode!=='charge';this.$('lab-soap-controls').hidden=mode==='charge';this.$('lab-highlights').hidden=mode!=='inspect';this.$('lab-lens').hidden=mode!=='inspect';this.$('lab-block-label').hidden=mode!=='charge';this.$('lab-selected-ring').hidden=mode==='charge' || this.selected<0;
  this.root.querySelectorAll('[data-lab-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.labMode===mode)));
  this.$('lab-prompt').textContent={charge:'Move the silver block. Give it a little charge, then bring water close.',soap:'The same water, a little softer. Add detergent, then stretch and gather the droplets.',inspect:'Touch a droplet to look closer. The water stays here; the lens lets you imagine its molecular scale.'}[mode];this.$('lab-explanation').innerHTML=explanations[mode];
  if(mode==='inspect' && !this.lens){this.lens=new MolecularLens(this.$('lab-molecules'));let held=null,x=0,rotation=0;const c=this.$('lab-molecules');c.onpointerdown=e=>{held=e.pointerId;x=e.clientX;rotation=this.lens.rotation;c.setPointerCapture(held);};c.onpointermove=e=>{if(e.pointerId===held)this.lens.rotation=rotation+(e.clientX-x)*.008;};c.onpointerup=c.onpointercancel=c.onlostpointercapture=()=>held=null;}
  this.settings.flow=mode==='charge'?.03:.12;this.settings.viscosity=.45;this.$('lab-why').open=false;this.lastDistribution=-Infinity;this.readings();this.onChange();
 }
 setVisible(visible){if(visible)this.onOpen?.();this.visible=visible;this.$('lab-panel').hidden=!visible;this.$('lab-toggle').hidden=visible;this.$('lab-toggle').setAttribute('aria-expanded',String(visible));}
 readings(){
  const state=labReadouts(this.radius,this.concentration);this.settings.tension=.58*state.tensionRatio;this.fluid.uniforms.uLabCapillaryScale.value=1/state.tensionRatio;
  this.$('lab-gamma').innerHTML=(state.gamma*1000).toFixed(1)+' <small>mN/m</small>';this.$('lab-charge').value=this.charge*1e9;this.$('lab-charge-out').value=(this.charge>0?'+':'')+(this.charge*1e9).toFixed(2)+' nC';this.$('lab-soap').value=this.concentration;this.$('lab-soap-out').value=this.concentration.toFixed(2)+' mM';
  this.$('lab-drop-reading').hidden=this.selected<0;this.$('lab-radius-label').textContent=(state.radius*1000).toFixed(1)+' mm equivalent radius';this.$('lab-pressure').textContent=Math.round(state.pressure)+' Pa';
  this.root.querySelectorAll('[data-water-charge]').forEach(b=>b.setAttribute('aria-pressed',String(Math.sign(this.waterCharge)===Number(b.dataset.waterCharge))));
  this.$('lab-discovery').textContent=this.mode==='charge'?(this.charge===0?(this.waterCharge===0?'The uncharged block pushes water when you move it. Add charge and predict what changes.':'A neutral conductor can attract charged water by induction. Its surface charge rearranges.') :this.waterCharge===0?'Neutral water is attracted by either sign. Predict what will happen before reversing the block.':Math.sign(this.waterCharge)===Math.sign(this.charge)?'The block and water have the same sign. Look for repulsion, especially farther from the block.':'The block and water have opposite signs. Look for attraction.'):this.mode==='soap'?'Less surface tension means less energy needed to stretch the water. Try the same gesture before and after adding detergent.':state.micelleFraction>0?'Tails gather inside micelles. Heads face the water. The water–water hydrogen bonds remain.':'Teal heads stay with water. Gold tails extend toward air. Add detergent to reveal them.';
  Object.assign(this.canvas.dataset,{labMode:this.mode,labBlockCharge:String(this.charge),labWaterChargePerMass:String(this.waterCharge),labSurfaceTension:String(state.gamma),labConcentration:String(this.concentration),labTensionRatio:String(state.tensionRatio)});this.lastDistribution=-Infinity;this.onChange();
 }
 select(picked){
  if(picked.id<0)return false;this.selected=picked.id;this.readSelected();this.$('lab-selected-ring').hidden=false;this.readings();return this.mode==='inspect';
 }
 readSelected(){
  const state=this.fluid.inspect();this.drops=Array.from({length:this.fluid.count},(_,i)=>({x:state[i*4],y:state[i*4+1],radius:state[i*4+2]}));
  if(this.selected>=this.drops.length)this.selected=-1;
  if(this.selected>=0){this.radius=this.drops[this.selected].radius;this.selectedPoint=[this.drops[this.selected].x,this.drops[this.selected].y,this.radius*.82];}
  this.canvas.dataset.labFinite=String(state.every(Number.isFinite));
  if(this.selected>=0){const readout=labReadouts(this.radius,this.concentration);this.$('lab-radius-label').textContent=(readout.radius*1000).toFixed(1)+' mm equivalent radius';this.$('lab-pressure').textContent=Math.round(readout.pressure)+' Pa';}
 }
 beforeStep(now){
  const u=this.fluid.uniforms;u.uLabElectric.value=this.mode==='charge' && !!this.body && (this.charge!==0 || this.waterCharge!==0);u.uLabChargePerMass.value=this.waterCharge;
  if(!u.uLabElectric.value)return;u.uLabBlock.value.set(this.body.x*.005,this.body.y*.005,this.body.size[2]*.005);
  if(now-this.lastDistribution>250){
   if(this.waterCharge!==0)this.readSelected();const patches=this.electrode.update(this.body,this.charge,this.drops,this.waterCharge);patches.forEach((p,i)=>u.uLabPatches.value[i].fromArray(p));this.lastDistribution=now;
  }
 }
 tick(now){
  if(this.busy || document.hidden)return;if((this.mode==='inspect' || this.selected>=0) && now-this.lastRead>500){this.readSelected();this.lastRead=now;}
  this.$('lab-pause').textContent=this.getRunning()?'Pause':'Resume';
  const frame=this.getFrame(),view=this.getView(),project=p=>{const [u,v]=projectPoint(frame,p,view,innerWidth/innerHeight);return [u*innerWidth,(1-v)*innerHeight];};
  if(this.body){const [x,y]=project([this.body.x,this.body.y,1.04]);const label=this.$('lab-block-label');label.style.left=x+'px';label.style.top=y+'px';label.textContent=this.charge===0?'neutral':(this.charge>0?'+':'−')+' '+Math.abs(this.charge*1e9).toFixed(2)+' nC';this.canvas.dataset.labBlockPosition=this.body.x.toFixed(3)+','+this.body.y.toFixed(3);this.canvas.dataset.labBlockScreen=x.toFixed(1)+','+y.toFixed(1);}
  if(this.selectedPoint){const [x,y]=project(this.selectedPoint),ring=this.$('lab-selected-ring');ring.style.left=x+'px';ring.style.top=y+'px';this.canvas.dataset.labSelected=String(this.selected);}
  if(this.mode==='inspect')this.lens.draw(now,this.concentration,this.getRunning());
 }
 setBusy(busy){this.busy=busy;this.root.querySelectorAll('button,input').forEach(e=>e.disabled=busy);}
 dispose(){this.lens?.dispose();}
}

export function conductorMaterial(material){
 material.fragmentShader=material.fragmentShader.replace('if(uObjectMotion[id].w<.5)return mix(vec3(.36,.39,.30),sqrt(materialFloor(p.xy))*.9,.30);','if(uObjectMotion[id].w<.5)return vec3(.035,.039,.043);').replace('):.36;','):.23;').replace('uObjectMotion[id].w>.5?.025:.04','uObjectMotion[id].w>.5?.025:.62');material.needsUpdate=true;
}
