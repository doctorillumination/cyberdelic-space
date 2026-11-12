import * as THREE from './vendor/three.module.js';
import {captureBlend,clamp} from './motion.js';
import {roomAt,roomStudyShader} from './room-study.js';

export function bakedAssetURL(manifest, filename) {
  const revision = manifest.captureId ?? manifest.sourceBlendSHA256;
  return `./assets/baked/${filename}?v=${encodeURIComponent(revision)}`;
}

function relightAssetURL(relight, filename) {
  return `./assets/relight/${filename}?v=${encodeURIComponent(relight.revision)}`;
}

function alignmentAssetURL(alignment, index) {
  return `./assets/alignment/${alignment.views[index]}?v=${encodeURIComponent(alignment.revision)}`;
}

class ViewCache {
  constructor(manifest){this.manifest=manifest;this.items=new Map();this.pending=new Map();this.protected=new Set([manifest.center]);this.loader=new THREE.TextureLoader();this.maximum=manifest.relight?5:8;}
  urls(view){
    const lighting=this.manifest.relight;
    const alignment=this.manifest.alignment;
    return [
      lighting?relightAssetURL(lighting,lighting.views[view.index]):bakedAssetURL(this.manifest,view.color),
      lighting?.depths?relightAssetURL(lighting,lighting.depths[view.index]):bakedAssetURL(this.manifest,view.depth),
      ...(alignment?[alignmentAssetURL(alignment,view.index)]:[])
    ];
  }
  async get(index){
    if(this.items.has(index)){const item=this.items.get(index);this.items.delete(index);this.items.set(index,item);return item;}
    if(this.pending.has(index))return this.pending.get(index);
    const promise=(async()=>{
      const view=this.manifest.views[index];
      const [colorURL,depthURL,flowURL]=this.urls(view);
      const [color,depth,flow]=await Promise.all([
        this.loader.loadAsync(colorURL),this.loader.loadAsync(depthURL),
        flowURL?this.loader.loadAsync(flowURL).catch(()=>null):null
      ]);
      color.colorSpace=this.manifest.relight?THREE.NoColorSpace:THREE.SRGBColorSpace;
      depth.colorSpace=THREE.NoColorSpace;
      depth.generateMipmaps=false;depth.minFilter=THREE.NearestFilter;depth.magFilter=THREE.NearestFilter;
      if(flow){
        flow.colorSpace=THREE.NoColorSpace;flow.generateMipmaps=false;
        flow.minFilter=THREE.LinearFilter;flow.magFilter=THREE.LinearFilter;
      }
      const item={color,depth,flow,matrix:new THREE.Matrix4().fromArray(view.matrix),index};
      this.items.set(index,item);this.pending.delete(index);return item;
    })().catch(error=>{this.pending.delete(index);throw error;});
    this.pending.set(index,promise);return promise;
  }
  trim(){
    for(const [index,item] of this.items){
      if(this.items.size<=this.maximum)break;
      if(this.protected.has(index))continue;
      item.color.dispose();item.depth.dispose();item.flow?.dispose();this.items.delete(index);
    }
  }
  async warmNetwork(){
    if(navigator.connection?.saveData||/2g/.test(navigator.connection?.effectiveType??''))return;
    const ordered=[...this.manifest.views].sort((a,b)=>(a.x*a.x+a.y*a.y)-(b.x*b.x+b.y*b.y));
    // Warm compressed HTTP cache only. Distant angles do not occupy GPU memory.
    for(const view of this.manifest.relight?ordered.slice(0,5):ordered){
      await Promise.all(this.urls(view).map(url=>fetch(url,{cache:'force-cache',priority:'low'}).then(r=>r.arrayBuffer()).catch(()=>null)));
    }
  }
}

function makeMaterial(manifest){
  const lighting=manifest.relight;
  const alignment=manifest.alignment;
  const uniforms={weights:{value:new THREE.Vector4(1,0,0,0)},rest:{value:true},
    worldFromCamera:{value:new THREE.Matrix4()},clipFromWorld:{value:new THREE.Matrix4()},
    breaths:{value:new THREE.Vector2()},headTurns:{value:new THREE.Vector2()},
    shoulderRolls:{value:new THREE.Vector2()},weightShift:{value:0},
    fingerFlexes:{value:new THREE.Vector4()},releaseFlex:{value:0},
    displayLut:{value:null},lightDips:{value:new THREE.Vector2()},
    rayScale:{value:new THREE.Vector2(manifest.camera.sensorWidth/(2*manifest.camera.lens),manifest.camera.sensorWidth/(2*manifest.camera.lens)*(manifest.height/manifest.width))},
    pixelSize:{value:new THREE.Vector2(lighting?.width??manifest.width,lighting?.height??manifest.height)},
    depthRange:{value:manifest.depthRange}};
  const colorPipeline=lighting?`
    uniform sampler2D displayLut;
    uniform vec2 lightDips;
    const float passHeight=${lighting.height.toFixed(1)};
    const float strip=${(lighting.height+2*lighting.padding).toFixed(1)};
    const float atlasHeight=3.0*strip;
    const float lutSize=${lighting.lutSize.toFixed(1)};
    vec3 radiance(sampler2D map,vec2 uv,vec2 gradX,vec2 gradY,float layer){
      vec2 atlasScale=vec2(1.0,passHeight/atlasHeight);
      vec2 address=clamp(uv,0.0,1.0)*atlasScale+vec2(0.0,(layer*strip+${lighting.padding.toFixed(1)})/atlasHeight);
      vec3 encoded=textureGrad(map,address,gradX*atlasScale,gradY*atlasScale).rgb;
      return (exp2(encoded*${lighting.stops.toFixed(1)})-1.0)/${lighting.scale.toFixed(1)};
    }
    vec3 sampleColor(sampler2D map,vec2 uv,vec2 gradX,vec2 gradY){
      return radiance(map,uv,gradX,gradY,0.0)
        +(1.0-lightDips.x)*radiance(map,uv,gradX,gradY,1.0)
        +(1.0-lightDips.y)*radiance(map,uv,gradX,gradY,2.0);
    }
    vec3 displaySlice(vec2 rg,float b){
      vec2 tile=vec2(mod(b,8.0),floor(b/8.0));
      vec2 address=(tile*lutSize+rg*(lutSize-1.0)+.5)/(8.0*lutSize);
      return textureLod(displayLut,address,0.0).rgb;
    }
    vec3 displayColor(vec3 sceneLinear){
      vec3 address=clamp(log2(1.0+sceneLinear*${lighting.scale.toFixed(1)})/${lighting.stops.toFixed(1)},0.0,1.0);
      float blue=address.b*(lutSize-1.0);
      float lower=floor(blue),upper=min(lower+1.0,lutSize-1.0);
      return mix(displaySlice(address.rg,lower),displaySlice(address.rg,upper),blue-lower);
    }`:`
    vec3 sampleColor(sampler2D map,vec2 uv,vec2 gradX,vec2 gradY){
      return textureGrad(map,uv,gradX,gradY).rgb;
    }`;
  const displayOutput=lighting?'gl_FragColor=vec4(displayColor(chosen.color),1.0);':`
        gl_FragColor=vec4(chosen.color,1.0);
        #include <colorspace_fragment>`;
  let declarations='',samples='',layerVotes='',depthSelection='',combine='';
  let alignedSamples='';
  if(alignment){
    uniforms.alignedViews={value:false};
    uniforms.flowOffsets={value:Array.from({length:4},()=>new THREE.Vector2())};
    declarations+='uniform bool alignedViews;uniform vec2 flowOffsets[4];\n';
  }
  for(let i=0;i<4;i++){
    const weight=`weights.${'xyzw'[i]}`;
    uniforms['color'+i]={value:null};uniforms['depth'+i]={value:null};uniforms['fromView'+i]={value:new THREE.Matrix4()};
    declarations+=`uniform sampler2D color${i};uniform sampler2D depth${i};uniform mat4 fromView${i};\n`;
    if(alignment){
      uniforms['flow'+i]={value:null};
      declarations+=`uniform sampler2D flow${i};\n`;
      alignedSamples+=`if(${weight}>.00001){
        vec2 uv=inverseAlignment(flow${i},targetUV,flowOffsets[${i}]);
        color+=${weight}*sqrt(sampleColor(color${i},uv,gradX,gradY));
        if(${weight}>largest){largest=${weight};depth=readDepth(depth${i},uv);}
      }\n`;
    }
    samples+=`vec2 uv${i}=targetUV;vec4 projected${i};float z${i};
      for(int iteration=0;iteration<3;iteration++){
        z${i}=readDepth(depth${i},uv${i});
        projected${i}=fromView${i}*viewPoint(uv${i},z${i});
        uv${i}+=targetUV-(projected${i}.xy/projected${i}.w*.5+.5);
      }
      z${i}=readDepth(depth${i},uv${i});
      projected${i}=fromView${i}*viewPoint(uv${i},z${i});
      float error${i}=length((projected${i}.xy/projected${i}.w*.5+.5-targetUV)*pixelSize);
      float valid${i}=(1.0-smoothstep(.7,2.5,error${i}))*step(0.0,uv${i}.x)*step(uv${i}.x,1.0)*step(0.0,uv${i}.y)*step(uv${i}.y,1.0)*step(z${i},depthRange-.01);
      float support${i}=valid${i}*${weight};
      vec3 rgb${i}=sampleColor(color${i},uv${i},gradX,gradY);
      float edge${i}=${lighting?.version>=2?`texture2D(depth${i},uv${i}).b`:'0.0'};
    `;
    const agreeingViews=Array.from({length:4},(_,j)=>i===j?`support${i}`:`support${j}*depthAgreement(projected${i}.w,projected${j}.w)`);
    layerVotes+=`float layer${i}=${agreeingViews.join('+')};\n`;
    depthSelection+=`if(support${i}>.001&&layer${i}>=minimumSupport)nearest=min(nearest,projected${i}.w);\n`;
    combine+=`float weight${i}=support${i}*depthAgreement(nearest,projected${i}.w)*mix(1.0,.015,edge${i});
      result+=rgb${i}*weight${i};total+=weight${i};\n`;
  }
  const alignmentShader=alignment?`
      vec2 readFlow(sampler2D map,vec2 uv,float direction){
        const float strip=${(alignment.height+2*alignment.padding).toFixed(1)};
        vec2 address=vec2(uv.x,(clamp(uv.y,0.0,1.0)*${alignment.height.toFixed(1)}+direction*strip+${alignment.padding.toFixed(1)})/(4.0*strip));
        vec2 pixels=(textureLod(map,address,0.0).rg*255.0-${alignment.zero.toFixed(1)})/${alignment.unitsPerPixel.toFixed(1)};
        return pixels*vec2(1.0,-1.0)/pixelSize;
      }
      vec2 inverseAlignment(sampler2D map,vec2 targetUV,vec2 offset){
        vec2 amount=abs(offset);
        vec2 uv=targetUV;
        for(int i=0;i<2;i++){
          vec2 x=readFlow(map,uv,offset.x>=0.0?0.0:1.0);
          vec2 y=readFlow(map,uv,offset.y>=0.0?2.0:3.0);
          uv=targetUV-amount.x*x-amount.y*y;
        }
        return uv;
      }
      RoomSample sampleAlignedRoom(vec2 targetUV,vec2 gradX,vec2 gradY){
        // Blend nearby viewpoints in a perceptual space to keep partial coverage from brightening dark edges.
        vec3 color=vec3(0.0);
        float largest=0.0,depth=depthRange;
        ${alignedSamples}
        return RoomSample(color*color,depth);
      }`:'';
  return new THREE.ShaderMaterial({uniforms,toneMapped:false,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform vec4 weights;uniform bool rest;uniform vec2 rayScale;uniform vec2 pixelSize;uniform float depthRange;
      uniform mat4 worldFromCamera;uniform mat4 clipFromWorld;
      ${declarations}
      ${roomStudyShader}
      ${colorPipeline}
      float readDepth(sampler2D map,vec2 uv){return dot(texture2D(map,uv).rg,vec2(65280.0,255.0))/65535.0*depthRange;}
      float depthAgreement(float a,float b){
        float tolerance=max(.012,min(a,b)*.003);
        return 1.0-smoothstep(tolerance,tolerance*2.0,abs(a-b));
      }
      vec4 viewPoint(vec2 uv,float z){return vec4((uv*2.0-1.0)*rayScale*z,-z,1.0);}
      float figurePlane(float x){return x<0.0?-3.55:-2.62;}
      vec2 poseOffset(vec2 uv,vec3 eye,out bool movingDigit){
        vec3 ray=(worldFromCamera*viewPoint(uv,1.0)).xyz-eye;
        float z=(figurePlane(ray.x)-eye.y)/ray.y;
        vec4 shift=clipFromWorld*vec4(figureMotion(eye+ray*z),0.0);
        vec2 screen=uv*2.0-1.0;
        vec2 offset=(shift.xy-screen*shift.w)*.5/(z+shift.w);
        float handY=ray.x<0.0?-3.89:-2.83;
        float handZ=(handY-eye.y)/ray.y;
        vec4 handShift=clipFromWorld*vec4(fingerMotion(eye+ray*handZ),0.0);
        vec2 fingers=(handShift.xy-screen*handShift.w)*.5/(handZ+handShift.w);
        movingDigit=dot(fingers,fingers)>1e-12;
        return offset+fingers;
      }
      bool figureSurface(vec3 p){
        return abs(p.y-figurePlane(p.x))<.39&&p.z>(p.x<0.0?.94:.38);
      }
      struct RoomSample {vec3 color;float depth;};
      ${alignmentShader}
      RoomSample sampleRoom(vec2 targetUV,vec2 gradX,vec2 gradY){
        if(rest){
          return RoomSample(sampleColor(color0,targetUV,gradX,gradY),readDepth(depth0,targetUV));
        }
        ${alignment?'if(alignedViews)return sampleAlignedRoom(targetUV,gradX,gradY);':''}
        ${samples}
        // Require agreement at the same depth before a near sample can cover the room behind it.
        ${layerVotes}
        float strongest=max(max(layer0,layer1),max(layer2,layer3));
        float minimumSupport=max(.001,strongest*.72);
        float nearest=1000.0;
        ${depthSelection}
        if(nearest<1000.0){
          vec3 result=vec3(0.0);float total=0.0;
          ${combine}
          if(total>.000001)return RoomSample(result/total,nearest);
        }
        // A single nearby view fills a hole without blending competing silhouettes.
        float closest=max(max(weights.x,weights.y),max(weights.z,weights.w));
        if(closest==weights.x)return RoomSample(sampleColor(color0,targetUV,gradX,gradY),readDepth(depth0,targetUV));
        if(closest==weights.y)return RoomSample(sampleColor(color1,targetUV,gradX,gradY),readDepth(depth1,targetUV));
        if(closest==weights.z)return RoomSample(sampleColor(color2,targetUV,gradX,gradY),readDepth(depth2,targetUV));
        return RoomSample(sampleColor(color3,targetUV,gradX,gradY),readDepth(depth3,targetUV));
      }
      void main(){
        // The raster footprint stays continuous even when reprojection jumps at a depth edge.
        vec2 gradX=dFdx(vUv),gradY=dFdy(vUv);
        vec3 eye=worldFromCamera[3].xyz;
        vec2 posedUV=vUv;
        bool movingFingers=false;
        for(int iteration=0;iteration<2;iteration++){
          bool movingDigit;
          posedUV=vUv-poseOffset(posedUV,eye,movingDigit);
          movingFingers=movingFingers||movingDigit;
        }
        RoomSample chosen=sampleRoom(posedUV,gradX,gradY);
        vec3 world=(worldFromCamera*viewPoint(posedUV,chosen.depth)).xyz;
        // Feather at the silhouettes while keeping the surrounding room registered.
        if(!movingFingers&&distance(posedUV,vUv)>.000001&&!figureSurface(world)){
          RoomSample base=sampleRoom(vUv,gradX,gradY);
          vec3 baseWorld=(worldFromCamera*viewPoint(vUv,base.depth)).xyz;
          if(!figureSurface(baseWorld)){
            chosen=base;
          }
        }
        ${displayOutput}
      }`
  });
}

export class BakedViewer {
  constructor(canvas,manifest){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default'});
    const lighting=manifest.relight;
    const alignment=manifest.alignment;
    const limit=this.renderer.capabilities.maxTextureSize;
    if(lighting&&Math.max(lighting.width,3*(lighting.height+2*lighting.padding))>limit){
      manifest={...manifest,relight:null};
    }
    if(alignment&&(!manifest.relight||alignment.relightRevision!==manifest.relight.revision||
      Math.max(alignment.width,4*(alignment.height+2*alignment.padding))>limit)){
      manifest={...manifest,alignment:null};
    }
    this.manifest=manifest;this.cache=new ViewCache(manifest);this.material=makeMaterial(manifest);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.scene=new THREE.Scene();this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.screenCamera=new THREE.Camera();
    const fov=THREE.MathUtils.radToDeg(2*Math.atan(manifest.camera.sensorWidth/(2*manifest.camera.lens*manifest.aspect)));
    this.camera=new THREE.PerspectiveCamera(fov,manifest.aspect,.04,60);this.camera.up.set(0,0,1);
    this.target=new THREE.Vector3().fromArray(manifest.camera.target);this.currentFromWorld=new THREE.Matrix4();
    this.material.uniforms.worldFromCamera.value=this.camera.matrixWorld;
    this.material.uniforms.clipFromWorld.value=this.currentFromWorld;
    this.indices=[manifest.center,manifest.center,manifest.center,manifest.center];this.dirty=true;this.pendingKey='';this.x=0;this.y=0;
  }
  async start(){
    const lighting=this.manifest.relight;
    const [center,display]=await Promise.all([
      this.cache.get(this.manifest.center),
      lighting?this.cache.loader.loadAsync(relightAssetURL(lighting,lighting.display)):null
    ]);
    if(display){
      display.flipY=false;display.colorSpace=THREE.NoColorSpace;display.generateMipmaps=false;
      display.minFilter=THREE.LinearFilter;display.magFilter=THREE.LinearFilter;
      this.material.uniforms.displayLut.value=display;
    }
    this.bind([center,center,center,center]);
    this.setView(0,0);this.setRoomTime(0);this.draw();
    this.cache.warmNetwork();
  }
  bind(items){
    this.indices=items.map(item=>item.index);this.items=items;
    const uniforms=this.material.uniforms;
    items.forEach((item,i)=>{
      uniforms['color'+i].value=item.color;
      uniforms['depth'+i].value=item.depth;
      if(uniforms['flow'+i])uniforms['flow'+i].value=item.flow;
    });
    if(uniforms.alignedViews)uniforms.alignedViews.value=items.every(item=>item.flow);
    this.dirty=true;
  }
  setSize(width,height){this.renderer.setSize(width,height,false);this.dirty=true;}
  setRoomTime(seconds){
    const room=roomAt(seconds),uniforms=this.material.uniforms;
    uniforms.breaths.value.set(...room.breath);
    uniforms.headTurns.value.set(...room.headTurns);
    uniforms.shoulderRolls.value.set(...room.shoulderRolls);
    uniforms.weightShift.value=room.weightShift;
    uniforms.fingerFlexes.value.set(...room.fingerFlexes);
    uniforms.releaseFlex.value=room.releaseFlex;
    uniforms.lightDips.value.set(...room.lightDips);
    this.dirty=true;
  }
  setView(x,y){
    this.x=x;this.y=y;
    const camera=this.camera;camera.position.fromArray(this.manifest.camera.position);
    camera.position.x+=x*this.manifest.limits.x;camera.position.z+=y*this.manifest.limits.y;
    camera.lookAt(this.target);camera.updateMatrixWorld(true);
    this.currentFromWorld.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const resting=x===0&&y===0;
    this.material.uniforms.rest.value=resting;
    if(resting){
      this.pendingKey='';this.cache.protected=new Set([this.manifest.center]);
      const center=this.cache.items.get(this.manifest.center);
      if(center&&this.indices.some(index=>index!==this.manifest.center))this.bind([center,center,center,center]);
      this.material.uniforms.weights.value.set(1,0,0,0);
    }else{
      const blend=captureBlend(x,y,this.manifest.columns,this.manifest.rows),key=blend.indices.join(',');
      if(key!==this.pendingKey){
        this.pendingKey=key;
        this.cache.protected=new Set([...this.indices,...blend.indices,this.manifest.center]);
        Promise.all(blend.indices.map(index=>this.cache.get(index))).then(items=>{
          if(this.pendingKey!==key){this.cache.trim();return;}
          this.bind(items);this.setView(this.x,this.y);this.cache.protected=new Set([...blend.indices,this.manifest.center]);this.cache.trim();
        }).catch(error=>{console.warn('A baked view could not load; retaining the current view.',error);this.pendingKey='';});
      }
      const a=this.manifest.views[this.indices[0]],b=this.manifest.views[this.indices[1]],c=this.manifest.views[this.indices[2]];
      const fx=b.x===a.x?0:clamp((x-a.x)/(b.x-a.x),0,1),fy=c.y===a.y?0:clamp((y-a.y)/(c.y-a.y),0,1);
      this.material.uniforms.weights.value.set((1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy);
    }
    if(this.material.uniforms.flowOffsets){
      const {columns,rows,views}=this.manifest;
      this.material.uniforms.flowOffsets.value.forEach((offset,i)=>{
        const view=views[this.indices[i]];
        offset.set(clamp((x-view.x)*(columns-1)/2,-1,1),clamp((y-view.y)*(rows-1)/2,-1,1));
      });
    }
    this.items.forEach((item,i)=>this.material.uniforms['fromView'+i].value.multiplyMatrices(this.currentFromWorld,item.matrix));
    this.dirty=true;
  }
  draw(){
    if(!this.dirty)return false;
    // New asynchronously loaded views also get their matrices before drawing.
    this.items.forEach((item,i)=>this.material.uniforms['fromView'+i].value.multiplyMatrices(this.currentFromWorld,item.matrix));
    this.renderer.render(this.scene,this.screenCamera);this.dirty=false;return true;
  }
  diagnostics(){return {renderer:'baked-light-field',triangles:this.renderer.info.render.triangles,
    drawCalls:this.renderer.info.render.calls,residentViews:this.cache.items.size,bakedViews:this.manifest.views.length,
    camera:this.camera.position.toArray(),lean:[this.x,this.y],lighting:this.manifest.relight?'cycles-light-groups':'baked',
    alignment:this.material.uniforms.alignedViews?.value?'optical-flow':'depth'};}
}
