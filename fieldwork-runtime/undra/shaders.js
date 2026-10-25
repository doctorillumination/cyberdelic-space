import { FIELD, GRID } from './fluid.js?v=2.10.0';
import { LIQUID_CEILING } from './coalescence.js?v=2.20.0';
import { objectGLSL, objectShader } from './objects.js?v=2.24.2';
import { jellyOpticsGLSL } from './jelly-optics.js?v=2.20.0';
import { selectMainPath, pruneShader } from './shader-tools.js?v=2.24.2';
export const vertex = /* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
`;
// Fixed render modes let drivers remove unused tracing branches before execution.
export function shaderMode(source,{live=true,exact=false,film=false,samples,objects}={}){
  source=selectMainPath(source,live);
  source=source.replace('uniform bool uLive;',`const bool uLive=${live};`).replace('uniform bool uExactOptics;',`const bool uExactOptics=${exact};`).replace('uniform bool uFilm;',`const bool uFilm=${film};`);
  if(samples!==undefined){
    source=source.replace('uniform int uAASamples;',`const int uAASamples=${samples};`).replace('sampleIndex<32','sampleIndex<'+samples);
  }
  return objects===undefined?pruneShader(source):objectShader(source,objects);
}
export const tracer = /* glsl */`
precision highp float;
precision highp int;
varying vec2 vUv;
uniform sampler2D uParticles;
uniform sampler2D uGrid;
uniform sampler2D uBounds;
uniform sampler2D uPrevious;
uniform vec2 uResolution;
uniform float uFrame;
uniform float uBlend;
uniform float uView;
uniform float uIor;
uniform float uTension;
uniform vec3 uFloor;
uniform vec3 uAbsorption;
uniform vec3 uLiquidTint;
uniform float uPaletteMix;
uniform vec2 uBlendDirection;
uniform float uBlendSharpness;
uniform vec3 uFloorLabA;
uniform vec3 uFloorLabB;
uniform vec3 uFloorLabC;
uniform vec3 uAbsorptionB;
uniform vec3 uAbsorptionC;
uniform vec3 uTintB;
uniform vec3 uTintC;
uniform float uScattering;
uniform float uTextureStrength;
uniform int uBounces;
uniform sampler2D uSurface;
uniform sampler2D uIndirect;
uniform bool uLive;
uniform bool uExactOptics;
uniform bool uFilm;
uniform float uRayEpsilon;
uniform int uAASamples;
uniform int uTotalSamples;
uniform int uSampleOffset;
uniform int uShadowSamples;
uniform int uIndirectSamples;
uniform float uLightingSpan;
uniform vec3 uCameraOrigin;
uniform vec3 uCameraForward;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform float uCameraDistance;
uniform float uFocusDistance;
uniform float uLensRadius;
${objectGLSL}
const float PI=3.14159265359;
const float FIELD=${FIELD.toFixed(1)};
const float GRID=${GRID.toFixed(1)};
const float LIQUID_CEILING=${LIQUID_CEILING.toFixed(2)};
const float EPS=.0012;
uint rng;
float rand(){rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return float(rng)/4294967296.0;}
vec2 periodic(vec2 p){return p-FIELD*floor(p/FIELD+.5);}
vec4 particle(int id,int row){return texelFetch(uParticles,ivec2(id,row),0);}
float liquidCeiling(){return min(LIQUID_CEILING,max(.72,texelFetch(uBounds,ivec2(0),0).x));}
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*.25;}
vec4 exactSurface(vec3 p){
  vec2 tile=mod(p.xy+FIELD*.5,FIELD);ivec2 cell=ivec2(floor(tile/FIELD*GRID));
  vec4 a=texelFetch(uGrid,ivec2(cell.x*2,cell.y),0),b=texelFetch(uGrid,ivec2(cell.x*2+1,cell.y),0);
  float d=1.0,k=.06+uTension*.12;vec3 gradient=vec3(0,0,1);
  for(int i=0;i<8;i++){
    int slot=i%4;float fi=i<4?a[slot]:b[slot];if(fi<0.0)continue;int id=int(fi+.5);
    vec4 drop=particle(id,0),shape=particle(id,1);vec2 delta=periodic(p.xy-drop.xy);
    vec3 q=vec3(dot(delta,shape.xy),dot(delta,vec2(-shape.y,shape.x)),p.z-drop.z*.09);
    vec3 radii=drop.z*vec3(drop.w,1.0/drop.w,shape.z),localGradient=q/(radii*radii);
    float k0=length(q/radii),k1=length(localGradient);
    float e=k1>.00001?k0*(k0-1.0)/k1:-min(radii.x,min(radii.y,radii.z));
    vec3 rotatedGradient=vec3(shape.x*localGradient.x-shape.y*localGradient.y,shape.y*localGradient.x+shape.x*localGradient.y,localGradient.z);
    vec3 n=k1>.00001?rotatedGradient/k1:vec3(0,0,1);
    float h=clamp(.5+.5*(e-d)/k,0.0,1.0);
    gradient=mix(n,gradient,h);d=mix(e,d,h)-k*h*(1.0-h);
  }
  float gradientLength=length(gradient);
  return vec4(gradientLength>.00001?gradient/gradientLength:vec3(0,0,1),d);
}
float exactSdf(vec3 p){
  vec2 tile=mod(p.xy+FIELD*.5,FIELD);ivec2 cell=ivec2(floor(tile/FIELD*GRID));
  vec4 a=texelFetch(uGrid,ivec2(cell.x*2,cell.y),0),b=texelFetch(uGrid,ivec2(cell.x*2+1,cell.y),0);
  float distance=1.0,k=.06+uTension*.12;
  for(int i=0;i<8;i++){
    int slot=i%4;float fi=i<4?a[slot]:b[slot];if(fi<0.0)continue;int id=int(fi+.5);
    vec4 drop=particle(id,0),shape=particle(id,1);vec2 delta=periodic(p.xy-drop.xy);
    vec3 q=vec3(dot(delta,shape.xy),dot(delta,vec2(-shape.y,shape.x)),p.z-drop.z*.09);
    vec3 radii=drop.z*vec3(drop.w,1.0/drop.w,shape.z);
    float k0=length(q/radii),k1=length(q/(radii*radii));
    float e=k1>.00001?k0*(k0-1.0)/k1:-min(radii.x,min(radii.y,radii.z));
    float h=clamp(.5+.5*(e-distance)/k,0.0,1.0);
    distance=mix(e,distance,h)-k*h*(1.0-h);
  }
  return distance;
}
vec4 surfaceAt(vec2 p){return texture2D(uSurface,mod(p/FIELD+.5,1.0));}
float fluidSdf(vec3 p){
  if(!uLive)return exactSdf(p);
  vec4 surface=surfaceAt(p.xy);
  if(surface.x>.0005 && surface.x<.13 && p.z<.10)return exactSdf(p);
  if(surface.x<.0005){
    if(surface.y<.05 && p.z<.10)return exactSdf(p);
    return .10+max(p.z,0.0);
  }
  float estimate=(p.z-surface.x)*max(surface.w,.12);
  return uExactOptics && abs(estimate)<.025?exactSdf(p):estimate;
}
vec3 fluidNormal(vec3 p){
  if(!uLive || uExactOptics)return exactSurface(p).xyz;
  vec4 cached=surfaceAt(p.xy);
  if(p.z<.10 || cached.x<.055)return exactSurface(p).xyz;
  return normalize(cached.yzw);
}

// Material 0 is the studio, 1 is the substrate, 2 is the droplet surface.
float intersectLiquidScene(vec3 ro,vec3 rd,out int material,out vec3 hit){
  float floorT=rd.z<-.00001?-ro.z/rd.z:1000.0;
  if(floorT<.0005)floorT=1000.0;
  float nearT=0.0,farT=min(floorT,80.0);
  if(abs(rd.z)>.00001){
    float a=(liquidCeiling()-ro.z)/rd.z,b=(.0004-ro.z)/rd.z;
    nearT=max(0.0,min(a,b));farT=min(farT,max(a,b));
  }else if(ro.z>liquidCeiling() || ro.z<0.0){nearT=100.0;}
  float t=nearT;
  for(int i=0;i<76;i++){
    if(t>farT)break;
    vec3 p=ro+rd*t;float d=fluidSdf(p);
    // Use the exact field for the final approach, avoiding cache-cell silhouettes.
    if(uLive && abs(d)<.010)d=exactSdf(p);
    if(abs(d)<uRayEpsilon){material=2;hit=p;return t;}
    t+=max(uExactOptics?uRayEpsilon*.5:.0008,min(abs(d)*.78,.115));
  }
  if(floorT<80.0){material=1;hit=ro+rd*floorT;return floorT;}
  material=0;hit=ro+rd*30.0;return 30.0;
}
float intersectLiquidPrimary(vec3 ro,vec3 rd,out int material,out vec3 hit){
  float floorT=-ro.z/rd.z;
  vec2 floorPoint=(ro+rd*floorT).xy;
  float height=0.0;
  for(int i=0;i<4;i++)height=max(height,surfaceAt(floorPoint-rd.xy*(float(i)*liquidCeiling()/3.0)/abs(rd.z)).x);
  float t=max(0.0,floorT-(max(height,.10)+.03)/abs(rd.z));
  for(int i=0;i<36;i++){
    if(t>=floorT)break;
    vec3 p=ro+rd*t;float d=exactSdf(p);
    if(abs(d)<uRayEpsilon){material=2;hit=p;return t;}
    t+=max(.0006,abs(d)*.85);
  }
  material=1;hit=ro+rd*floorT;return floorT;
}
float intersectScene(vec3 ro,vec3 rd,out int material,out vec3 hit){
  float t=intersectLiquidScene(ro,rd,material,hit);int object;
  float objectT=intersectObjects(ro,rd,t,object);
  if(object>=0){material=3+object;hit=ro+rd*objectT;return objectT;}return t;
}
float intersectPrimary(vec3 ro,vec3 rd,out int material,out vec3 hit){
  float t=intersectLiquidPrimary(ro,rd,material,hit);int object;
  float objectT=intersectObjects(ro,rd,t,object);
  if(object>=0){material=3+object;hit=ro+rd*objectT;return objectT;}return t;
}
vec3 sky(vec3 ro,vec3 rd,bool includeEmitters){
  vec3 c=vec3(.028,.035,.018)*(.55+.45*max(rd.z,0.0));
  if(rd.z>0.0 && includeEmitters){
    vec2 q=(ro+rd*((30.0-ro.z)/rd.z)).xy;
    if(abs(q.x+12.0)<12.0 && abs(q.y-15.0)<9.0)c+=vec3(35.0,34.7,33.0);
    vec2 q2=(ro+rd*((18.0-ro.z)/rd.z)).xy;
    if(abs(q2.x-12.0)<2.8 && abs(q2.y-1.0)<9.0)c+=vec3(2.0,2.15,1.8);
  }
  return c;
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec2 grainGradient(vec2 p){
  uint h=uint(int(p.x))*1664525u+uint(int(p.y))*1013904223u+374761393u;
  h^=h>>13;h*=1274126177u;h^=h>>16;
  vec2 g=vec2(float(h&65535u),float(h>>16))/32767.5-1.0;
  return g/max(length(g),.0001);
}
float grainNoise(vec2 p){
  vec2 i=floor(p),f=fract(p),w=f*f*f*(f*(f*6.0-15.0)+10.0);
  float a=dot(grainGradient(i),f),b=dot(grainGradient(i+vec2(1,0)),f-vec2(1,0));
  float c=dot(grainGradient(i+vec2(0,1)),f-vec2(0,1)),d=dot(grainGradient(i+vec2(1,1)),f-vec2(1,1));
  return mix(mix(a,b,w.x),mix(c,d,w.x),w.y);
}
vec3 paletteWeights(vec2 p){
  vec2 q=vec2(dot(p,uBlendDirection),dot(p,vec2(-uBlendDirection.y,uBlendDirection.x)))/uView;
  vec2 a=q-vec2(-.48,.25),b=q-vec2(.48,.25),c=q-vec2(0,-.48);
  vec3 scores=-vec3(dot(a,a),dot(b,b),dot(c,c))*uBlendSharpness;
  // Normalize relative scores so distant reflected rays cannot underflow the whole palette.
  vec3 weights=exp(scores-max(scores.x,max(scores.y,scores.z)));
  return weights/(weights.x+weights.y+weights.z);
}
vec3 linearFromLab(vec3 lab){
  vec3 lms=vec3(lab.x+.3963377774*lab.y+.2158037573*lab.z,lab.x-.1055613458*lab.y-.0638541728*lab.z,lab.x-.0894841775*lab.y-1.2914855480*lab.z);
  lms=lms*lms*lms;
  return clamp(vec3(4.0767416621*lms.x-3.3077115913*lms.y+.2309699292*lms.z,-1.2684380046*lms.x+2.6097574011*lms.y-.3413193965*lms.z,-.0041960863*lms.x-.7034186147*lms.y+1.7076147010*lms.z),vec3(.0005),vec3(.25));
}
vec3 materialFloor(vec2 p){
  if(uPaletteMix<.5)return uFloor;
  vec3 weights=paletteWeights(p);
  return linearFromLab(uFloorLabA*weights.x+uFloorLabB*weights.y+uFloorLabC*weights.z);
}
vec3 materialAbsorption(vec2 p){
  if(uPaletteMix<.5)return uAbsorption;
  vec3 weights=paletteWeights(p);
  return uAbsorption*weights.x+uAbsorptionB*weights.y+uAbsorptionC*weights.z;
}
vec3 materialTint(vec2 p){
  if(uPaletteMix<.5)return uLiquidTint;
  vec3 weights=paletteWeights(p);
  return uLiquidTint*weights.x+uTintB*weights.y+uTintC*weights.z;
}
vec3 substrate(vec2 p){
  vec2 q=mat2(.80,.60,-.60,.80)*p;
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  float fine=1.0-smoothstep(.22,.65,footprint*105.0);
  float medium=1.0-smoothstep(.22,.65,footprint*48.0);
  // Keep surface detail in the material, with adjustable contrast rather than image blur.
  float wash=grainNoise(q*2.3)*.07+grainNoise(q*.61+vec2(17,4))*.035;
  float grain=grainNoise(q*48.0+vec2(2,13))*.13*medium+grainNoise(q*105.0+vec2(21,7))*.07*fine;
  return materialFloor(p)*(.93+uTextureStrength*(wash+grain));
}
vec3 cosineDirection(vec3 n){
  float phi=2.0*PI*rand(),r=sqrt(rand());
  vec3 t=normalize(cross(abs(n.z)<.9?vec3(0,0,1):vec3(0,1,0),n));vec3 b=cross(n,t);
  return normalize(t*r*cos(phi)+b*r*sin(phi)+n*sqrt(max(0.0,1.0-r*r)));
}
vec3 directLight(vec3 p,vec3 n,vec3 albedo){
  vec3 lp=vec3(-12.0+(rand()-.5)*24.0,15.0+(rand()-.5)*18.0,30.0);
  vec3 to=lp-p;float d2=dot(to,to);vec3 ld=normalize(to);
  float cosine=max(0.0,dot(n,ld));if(cosine<=0.0)return vec3(0);
  vec3 point;int mat;float t=intersectScene(p+n*.004,ld,mat,point);float visibility=1.0;bool submerged=fluidSdf(p+vec3(0,0,.008))<0.0;
  #if GLOP_OBJECTS
  if(mat>=3 && t*t<d2){int id=mat-3;visibility=uObjectMotion[id].w>.5?uObjectClarity[id]*exp(-.8*uObjectSize[id].z*2.0/max(abs(ld.z),.35))*.85:0.0;}
  #endif
  if(mat==2 && t*t<d2){
    // RGB shadow transmittance approximates clear-water occlusion.
    float facing=max(0.0,dot(fluidNormal(point),ld));
    float throughWater=mix(.62+.20*facing,.13+.18*facing,clamp(uScattering*.5,0.0,1.0));
    visibility=submerged?(exp(-(uScattering+.2)*t)*.96):throughWater;
  }
  return albedo/PI*vec3(35.0,34.7,33.0)*cosine*max(0.0,ld.z)*(24.0*18.0)/d2*visibility;
}
float fresnel(float cosine,float etaI,float etaT){
  float sint=etaI/etaT*sqrt(max(0.0,1.0-cosine*cosine));if(sint>=1.0)return 1.0;
  float cost=sqrt(max(0.0,1.0-sint*sint));
  float rs=(etaT*cosine-etaI*cost)/(etaT*cosine+etaI*cost);
  float rp=(etaI*cosine-etaT*cost)/(etaI*cosine+etaT*cost);return .5*(rs*rs+rp*rp);
}
#if GLOP_OBJECTS
vec3 objectAlbedo(int id,vec3 p){
  if(uObjectMotion[id].w<.5)return mix(vec3(.36,.39,.30),sqrt(materialFloor(p.xy))*.9,.30);
  vec3 q=vec3(objectLocal(id,p.xy),p.z-uObjectPose[id].w);
  if(uObjectMotion[id].z>.0001)q-=objectDisplacement(id,q);
  q/=uObjectSize[id].xyz;
  // Broad material-space ribbons stay attached as the jelly is carried and kneaded.
  float ribbon=.5+.5*sin(q.x*2.7+q.y*1.9+q.z*1.6+.65*sin(q.y*2.1-q.z*2.4)+float(id)*.83);
  float bloom=.5+.5*sin(q.y*2.2-q.x*1.5+q.z*2.0+float(id)*1.3);
  vec3 palette=clamp(sqrt(materialFloor(uObjectPose[id].xy))*1.25+.10,.12,.78);
  vec3 pearl=mix(vec3(.48,.72,.32),vec3(.44,.27,.70),ribbon);
  pearl=mix(pearl,vec3(.74,.38,.43),bloom*.22);
  if(uObjectFinish[id]<.5)return mix(pearl,palette,.38)*.34;
  if(uObjectFinish[id]<1.5){
    vec3 sorbet=mix(vec3(.68,.30,.19),vec3(.32,.25,.64),smoothstep(.15,.85,ribbon));
    sorbet=mix(sorbet,vec3(.22,.62,.40),smoothstep(.3,.95,bloom)*.55);
    return mix(sorbet,palette,.22)*.30;
  }
  return mix(vec3(.68,.69,.59),palette,.48)*(.32+.03*ribbon);
}
#if GLOP_SOFT
vec3 jellySheen(int id,vec3 n,vec3 view){
  if(uObjectMotion[id].w<.5 || uObjectFinish[id]>.5)return vec3(1);
  float edge=pow(1.0-max(dot(n,view),0.0),2.0);
  return mix(vec3(.86,1.0,.93),vec3(1.0,.82,.98),edge);
}
vec3 jellyScatter(int id,vec3 p,vec3 n,vec3 albedo){
  if(uObjectMotion[id].w<.5)return vec3(0);
  vec3 delta=vec3(-12,15,30)-p,ld=normalize(delta);
  float wrap=pow(max((dot(n,ld)+.5)/1.5,0.0),2.0)*.12;
  float lift=smoothstep(.015,.16,p.z),visibility=objectVisibility(p+n*.006,ld,id);
  // A bounded wrapped-light approximation adds a soft glow without extra volume rays.
  return albedo*wrap*lift*vec3(35.0,34.7,33.0)*ld.z*432.0/dot(delta,delta)*visibility;
}
${jellyOpticsGLSL}
#else
vec3 jellySheen(int id,vec3 n,vec3 view){return vec3(1);}
vec3 jellyScatter(int id,vec3 p,vec3 n,vec3 albedo){return vec3(0);}
#endif
#endif
vec3 objectShade(int id,vec3 p,vec3 incoming);
vec3 radiance(vec3 ro,vec3 rd){
  vec3 color=vec3(0),throughput=vec3(1);bool inside=false;bool previousDiffuse=false,completed=false;
  for(int bounce=0;bounce<12;bounce++){
    if(bounce>=uBounces)break;
    vec3 p;int mat;float distance=intersectScene(ro,rd,mat,p);
    if(inside){
      vec3 extinction=materialAbsorption((ro+rd*distance*.5).xy)+vec3(uScattering);
      vec3 transmission=exp(-extinction*distance);
      vec3 midpoint=ro+rd*distance*.5;
      vec3 lightDelta=vec3(-12.0,15.0,30.0)-midpoint;
      float solidAngle=(24.0*18.0)*normalize(lightDelta).z/dot(lightDelta,lightDelta);
      // Single scattering integrates the studio emitter through the tinted medium.
      vec3 source=vec3(35.0,34.7,33.0)*solidAngle/(4.0*PI)*materialTint(midpoint.xy);
      color+=throughput*(1.0-transmission)*(uScattering/extinction)*source;
      throughput*=transmission;
    }
    if(mat==0){color+=throughput*sky(ro,rd,!previousDiffuse);completed=true;break;}
    #if GLOP_OBJECTS
    if(mat>=3){
      int id=mat-3;
      if(uObjectMotion[id].w>.5 && uObjectClarity[id]>.001){color+=throughput*objectShade(id,p,rd);completed=true;break;}
      vec3 n=objectNormal(id,p),albedo=objectAlbedo(id,p);if(dot(n,rd)>0.0)n=-n;
      color+=throughput*(directLight(p,n,albedo)+jellyScatter(id,p,n,albedo));
      float F=.055+.945*pow(1.0-max(0.0,dot(-rd,n)),5.0);
      if(rand()<F){rd=reflect(rd,n);previousDiffuse=false;}
      else{throughput*=albedo;rd=cosineDirection(n);previousDiffuse=true;}
      ro=p+n*.004;inside=false;
    }else
    #endif
    if(mat==1){
      vec3 n=vec3(0,0,1),albedo=substrate(p.xy);
      color+=throughput*directLight(p,n,albedo);
      // Cosine-weighted secondary rays supply diffuse global illumination.
      throughput*=albedo;ro=p+n*.004;rd=cosineDirection(n);inside=fluidSdf(ro)<0.0;previousDiffuse=true;
    }else{
      vec3 normal=fluidNormal(p);bool entering=dot(rd,normal)<0.0;vec3 n=entering?normal:-normal;
      float etaI=entering?1.0:uIor,etaT=entering?uIor:1.0;
      float F=fresnel(clamp(dot(-rd,n),0.0,1.0),etaI,etaT);
      // Split the first water interface into an environment reflection and a transmitted path.
      if(bounce==0 && entering){color+=throughput*F*sky(p,reflect(rd,n),true);throughput*=1.0-F;rd=refract(rd,n,etaI/etaT);inside=true;ro=p-n*.004;}
      else if(rand()<F){rd=reflect(rd,n);ro=p+n*.004;inside=!entering;}
      else{rd=refract(rd,n,etaI/etaT);ro=p-n*.004;inside=entering;}
      if(length(rd)<.01){rd=reflect(rd,n);ro=p+n*.004;inside=!entering;}
    }
    if(bounce>=4){float survival=clamp(max(throughput.r,max(throughput.g,throughput.b)),.12,.95);if(rand()>survival){completed=true;break;}throughput/=survival;}
  }
  if(!completed){
    if(inside){
      vec2 floorPoint=ro.xy+rd.xy*max(ro.z,0.0)/max(abs(rd.z),.25);
      vec3 transmission=exp(-(materialAbsorption(ro.xy)+vec3(uScattering))*max(ro.z,0.0));
      color+=throughput*transmission*directLight(vec3(floorPoint,0),vec3(0,0,1),substrate(floorPoint));
    }else color+=throughput*sky(ro,rd,!previousDiffuse);
  }
  return max(color,vec3(0));
}

vec3 mediumSource(vec3 midpoint){
  vec3 lightDelta=vec3(-12.0,15.0,30.0)-midpoint;
  float solidAngle=(24.0*18.0)*normalize(lightDelta).z/dot(lightDelta,lightDelta);
  return vec3(35.0,34.7,33.0)*solidAngle/(4.0*PI)*materialTint(midpoint.xy);
}
float softShadowLive(vec3 p,vec3 direction){
  float localHeight=surfaceAt(p.xy).x;
  float depth=max(localHeight-p.z,0.0);
  float transmission=exp(-(uScattering+.2)*depth/max(direction.z,.2))*.96;
  float submerged=smoothstep(0.0,.075,depth);
  float opaque=objectVisibility(p,direction,-1);
  if(submerged>.999)return transmission*opaque;
  float t=.045,visibility=1.0;
  for(int i=0;i<16;i++){
    vec3 q=p+direction*t;if(q.z>liquidCeiling())break;
    float gap=q.z-surfaceAt(q.xy).x;
    visibility=min(visibility,5.0*max(gap,0.0)/t);
    if(gap<.002)break;
    t+=clamp(gap*.85,.035,.10);
  }
  float shadowFloor=mix(.55,.24,clamp(uScattering*.5,0.0,1.0));
  return opaque*mix(mix(shadowFloor,1.0,clamp(visibility,0.0,1.0)),transmission,submerged);
}
vec3 directLive(vec3 p,vec3 albedo,int sampleCount){
  vec3 sum=vec3(0);
  for(int i=0;i<16;i++){
    if(i>=sampleCount)break;
    vec2 offset;
    if(sampleCount==1)offset=vec2(0);
    else if(sampleCount==2)offset=i==0?vec2(-.28,-.22):vec2(.28,.22);
    else if(sampleCount==4)offset=vec2((i%2==0?-.25:.25),(i<2?-.25:.25));
    else offset=(vec2(float(i%4),float(i/4))+.5)/4.0-.5;
    vec3 lp=vec3(-12.0+offset.x*24.0,15.0+offset.y*18.0,30.0);
    vec3 delta=lp-p;float d2=dot(delta,delta);vec3 ld=normalize(delta);
    float visibility=softShadowLive(p,ld);
    sum+=albedo/PI*vec3(35.0,34.7,33.0)*ld.z*ld.z*(24.0*18.0)/d2*visibility;
  }
  return sum/float(sampleCount);
}
#if GLOP_OBJECTS
float objectSpecular(vec3 n,vec3 view,vec3 light,float roughness,float f0){
  float nv=max(dot(n,view),0.0),nl=max(dot(n,light),0.0);if(nv<=0.0 || nl<=0.0)return 0.0;
  vec3 h=normalize(view+light);float nh=max(dot(n,h),0.0),vh=max(dot(view,h),0.0);
  float alpha=roughness*roughness,a2=alpha*alpha,d=nh*nh*(a2-1.0)+1.0;
  float distribution=a2/(PI*d*d);
  float masking=2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));
  float shadowing=2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
  float fresnel=f0+(1.0-f0)*pow(1.0-vh,5.0);
  return distribution*masking*shadowing*fresnel/max(4.0*nv*nl,.0001);
}
vec3 objectSurfaceShade(int id,vec3 p,vec3 incoming,vec3 n,float diffuseScale){
  vec3 albedo=objectAlbedo(id,p),sum=vec3(0),groundIrradiance=vec3(0),view=-incoming;
  float roughness=uObjectMotion[id].w>.5?(uObjectFinish[id]<.5?.43:uObjectFinish[id]<1.5?.46:.58):.36;
  float f0=uObjectMotion[id].w>.5?.025:.04;
  vec3 sheen=jellySheen(id,n,view);
  for(int i=0;i<4;i++){
    vec2 offset=vec2(i%2==0?-.25:.25,i<2?-.25:.25);
    vec3 lp=vec3(-12.0+offset.x*24.0,15.0+offset.y*18.0,30.0),delta=lp-p,ld=normalize(delta);
    float cosine=max(dot(n,ld),0.0),visibility=objectVisibility(p+n*.006,ld,id);
    // Microfacet masking and the light hemisphere keep highlights out of the underside.
    float specular=objectSpecular(n,view,ld,roughness,f0);
    groundIrradiance+=vec3(35.0,34.7,33.0)*ld.z*ld.z*432.0/dot(delta,delta);
    sum+=(albedo*diffuseScale*.96/PI+specular*sheen)*cosine*vec3(35.0,34.7,33.0)*ld.z*432.0/dot(delta,delta)*visibility;
  }
  vec3 floorBounce=albedo*materialFloor(p.xy)*groundIrradiance*.25/PI*(.5-.5*n.z);
  // The sampled studio lights already supply glossy reflection, without counting them twice.
  float F=f0+(1.0-f0)*pow(1.0-max(dot(view,n),0.0),5.0);
  return sum*.25+(floorBounce+albedo*.08+jellyScatter(id,p,n,albedo))*diffuseScale+sky(p,reflect(incoming,n),false)*F*sheen;
}
#endif
vec3 lightAt(vec2 p){return texture2D(uIndirect,uFilm?p/uLightingSpan+.5:mod(p/FIELD+.5,1.0)).rgb;}
#if GLOP_SOFT && GLOP_OBJECTS
vec3 jellyFloorRadiance(vec2 xy){
  vec3 albedo=substrate(xy);
  #ifdef GATHERING_LIGHT
  // The lighting cache must never sample the texture it is currently writing.
  return directLive(vec3(xy,0),albedo,1);
  #else
  return uFilm?albedo*lightAt(xy):directLive(vec3(xy,0),albedo,1)+albedo*lightAt(xy);
  #endif
}
vec3 jellyBackground(vec3 ro,vec3 rd){
  // A ray leaving the flat base has already reached the substrate, not another skin hit.
  if(ro.z<=.0004 && rd.z<0.0)return jellyFloorRadiance(ro.xy-rd.xy*ro.z/rd.z);
  vec3 color=vec3(0),weight=vec3(1);bool inside=fluidSdf(ro)<0.0;
  for(int bounce=0;bounce<3;bounce++){
    vec3 hit;int material;float distance=intersectScene(ro,rd,material,hit);
    if(inside){vec3 extinction=materialAbsorption((ro+rd*distance*.5).xy)+vec3(uScattering);weight*=exp(-extinction*max(distance,0.0));}
    if(material==0)return color+weight*sky(ro,rd,true);
    if(material==1)return color+weight*jellyFloorRadiance(hit.xy);
    if(material>=3){int id=material-3;vec3 n=objectNormal(id,hit);if(dot(n,rd)>0.0)n=-n;return color+weight*objectSurfaceShade(id,hit,rd,n,1.0);}
    vec3 normal=fluidNormal(hit);bool entering=dot(rd,normal)<0.0;vec3 n=entering?normal:-normal;
    float F=fresnel(clamp(dot(-rd,n),0.0,1.0),entering?1.0:uIor,entering?uIor:1.0);
    vec3 transmitted=refract(rd,n,entering?1.0/uIor:uIor);
    if(dot(transmitted,transmitted)<.01){rd=reflect(rd,n);ro=hit+n*.003;inside=!entering;continue;}
    color+=weight*F*sky(hit,reflect(rd,n),true);weight*=1.0-F;
    rd=transmitted;ro=hit-n*.003;inside=entering;
  }
  vec2 q=ro.xy+rd.xy*max(ro.z,0.0)/max(abs(rd.z),.25);
  return color+weight*jellyFloorRadiance(q);
}
vec3 objectShade(int id,vec3 p,vec3 incoming){
  vec3 normal=objectNormal(id,p);if(dot(normal,incoming)>0.0)normal=-normal;
  float transmission=uObjectMotion[id].w>.5?jellyWeight(id):0.0;
  if(transmission<.001)return objectSurfaceShade(id,p,incoming,normal,1.0);
  vec3 origin,direction;float thickness,interfaces;
  if(!jellyThrough(id,p,incoming,normal,origin,direction,thickness,interfaces))return objectSurfaceShade(id,p,incoming,normal,1.0);
  vec3 pigment=objectAlbedo(id,p),extinction=jellyExtinction(id,pigment),attenuation=exp(-extinction*thickness);
  vec3 bodyTint=pow(clamp(pigment/max(max(pigment.r,pigment.g),pigment.b),.12,1.0),vec3(.45));
  vec3 delta=vec3(-12,15,30)-p;
  vec3 irradiance=vec3(35,34.7,33)*normalize(delta).z*432.0/dot(delta,delta)/PI;
  float haze=mix(2.1,.16,uObjectClarity[id])*(uObjectFinish[id]>1.5?1.4:1.0);
  vec3 glow=(vec3(1)-attenuation)*(vec3(haze)/extinction)*bodyTint*irradiance*.18;
  vec3 surface=objectSurfaceShade(id,p,incoming,normal,1.0-transmission);
  return surface+transmission*interfaces*(attenuation*jellyBackground(origin,direction)+glow);
}
#else
vec3 objectShade(int id,vec3 p,vec3 incoming){
  #if GLOP_OBJECTS
  vec3 n=objectNormal(id,p);if(dot(n,incoming)>0.0)n=-n;
  return objectSurfaceShade(id,p,incoming,n,1.0);
  #else
  return vec3(0);
  #endif
}
#endif
vec3 indirectLive(vec3 p,vec3 albedo){
  vec3 irradiance=vec3(0);
  // Stable cosine-weighted quadrature gives a low-noise approximation of one indirect bounce.
  for(int i=0;i<12;i++){
    if(i>=uIndirectSamples)break;
    float phi=1.1+float(i)*(uIndirectSamples==3?2.0943951:2.39996323),r=sqrt((float(i)+.5)/float(uIndirectSamples));
    vec3 rd=vec3(r*cos(phi),r*sin(phi),sqrt(1.0-r*r));
    vec3 ro=p+vec3(0,0,.004),hit;int material;float distance=intersectScene(ro,rd,material,hit);
    vec3 contribution=sky(ro,rd,false);
    if(material>=3)contribution=objectShade(material-3,hit,rd);
    if(material==2){
      vec3 n=fluidNormal(hit);bool entering=dot(rd,n)<0.0;n=entering?n:-n;
      vec3 refracted=refract(rd,n,entering?1.0/uIor:uIor);
      if(length(refracted)>.01){
        vec3 secondary;int secondaryMaterial;
        float segment=intersectScene(hit-n*.004,refracted,secondaryMaterial,secondary);
        vec3 attenuation=exp(-(materialAbsorption(((hit+secondary)*.5).xy)+vec3(uScattering))*segment);
        vec3 incident=secondaryMaterial==1?directLive(secondary,substrate(secondary.xy),1):secondaryMaterial>=3?objectShade(secondaryMaterial-3,secondary,refracted):sky(secondary,refracted,false);
        contribution=attenuation*incident+(1.0-attenuation)*mediumSource((hit+secondary)*.5)*.5;
      }
    }
    irradiance+=contribution;
  }
  return albedo*irradiance/float(uIndirectSamples);
}

vec3 reflectionLive(vec3 p,vec3 n,vec3 rd){
  vec3 reflected=reflect(rd,n),hit;int material;
  intersectScene(p+n*.004,reflected,material,hit);
  if(material==1)return uFilm?substrate(hit.xy)*lightAt(hit.xy):directLive(hit,substrate(hit.xy),1);
  if(material>=3)return objectShade(material-3,hit,reflected);
  if(material==2){vec3 otherNormal=fluidNormal(hit);float F=fresnel(abs(dot(reflected,otherNormal)),1.0,uIor);return mix(materialTint(hit.xy)*.18,sky(hit,reflect(reflected,otherNormal),true),F);}
  return sky(p,reflected,true);
}
vec4 liveRadiance(vec3 ro,vec3 rd){
  vec3 color=vec3(0),throughput=vec3(1);bool inside=false,completed=false;float depth=uCameraDistance;
  for(int bounce=0;bounce<6;bounce++){
    vec3 hit;int material;float distance;
    if(bounce==0)distance=intersectPrimary(ro,rd,material,hit);
    else distance=intersectScene(ro,rd,material,hit);
    if(bounce==0)depth=max(.1,dot(hit-uCameraOrigin,uCameraForward));
    if(inside){vec3 extinction=materialAbsorption((ro+rd*distance*.5).xy)+vec3(uScattering),transmission=exp(-extinction*distance);color+=throughput*(1.0-transmission)*(uScattering/extinction)*mediumSource(ro+rd*distance*.5);throughput*=transmission;}
    if(material==0){color+=throughput*sky(ro,rd,true);completed=true;break;}
    if(material>=3){color+=throughput*objectShade(material-3,hit,rd);completed=true;break;}
    if(material==1){vec3 albedo=substrate(hit.xy);vec3 lightField=lightAt(hit.xy); color+=throughput*(uFilm?albedo*lightField:directLive(hit,albedo,uShadowSamples)+albedo*lightField);completed=true;break;}
    vec3 normal=bounce==0?exactSurface(hit).xyz:fluidNormal(hit);bool entering=dot(rd,normal)<0.0;vec3 n=entering?normal:-normal;
    float etaI=entering?1.0:uIor,etaT=entering?uIor:1.0;
    float F=fresnel(clamp(dot(-rd,n),0.0,1.0),etaI,etaT);
    if(F>.999){rd=reflect(rd,n);ro=hit+n*.004;inside=!entering;continue;}
    color+=throughput*F*reflectionLive(hit,n,rd);
    throughput*=1.0-F;
    rd=refract(rd,n,etaI/etaT);ro=hit-n*.004;inside=entering;
  }
  if(!completed){
    // Narrow joins can trap a ray in internal reflections. Preserve its remaining energy.
    vec2 floorPoint=ro.xy+rd.xy*max(ro.z,0.0)/max(abs(rd.z),.25);
    vec3 extinction=materialAbsorption(ro.xy)+vec3(uScattering),transmission=inside?exp(-extinction*max(ro.z,0.0)):vec3(1);
    vec3 albedo=substrate(floorPoint),indirectLight=lightAt(floorPoint);
    color+=throughput*transmission*(uFilm?albedo*indirectLight:directLive(vec3(floorPoint,0),albedo,1)+albedo*indirectLight);
  }
  return vec4(max(color,vec3(0)),depth);
}
void cameraPixel(vec2 uv,out vec3 origin,out vec3 direction){
  vec2 film=(uv-.5)*vec2(uResolution.x/uResolution.y,1.0)*uView;
  origin=uCameraOrigin;
  direction=normalize(uCameraForward*uCameraDistance+uCameraRight*film.x+uCameraUp*film.y);
}
void main(){
  rng=uint(gl_FragCoord.x)*1973u+uint(gl_FragCoord.y)*9277u+uint(uFrame)*26699u+89173u;rng|=1u;
  vec3 ro,rd,c=vec3(0);
  if(uLive){
    vec4 sampleSum=vec4(0);
    for(int sampleIndex=0;sampleIndex<32;sampleIndex++){
      if(sampleIndex>=uAASamples)break;
      // Fixed strata keep moving highlights stable without temporal accumulation.
      int sampleId=sampleIndex+uSampleOffset,total=uTotalSamples>0?uTotalSamples:uAASamples;
      float index=float(sampleId);
      int reversed=(sampleId&1)*128+((sampleId>>1)&1)*64+((sampleId>>2)&1)*32+((sampleId>>3)&1)*16+((sampleId>>4)&1)*8+((sampleId>>5)&1)*4+((sampleId>>6)&1)*2+(sampleId>>7);
      vec2 jitter=vec2((index+.5)/float(total)-.5,float(reversed)/256.0+.5/float(total)-.5);
      if(total==1)jitter=vec2(0);
      cameraPixel(vUv+jitter/uResolution,ro,rd);
      if(uFilm && uLensRadius>0.0){
        vec3 focalPoint=ro+rd*(uFocusDistance/dot(rd,uCameraForward));
        float angle=2.0*PI*fract((index+.5)*.754877666),radius=sqrt(fract((index+.5)*.569840296))*uLensRadius;
        ro+=(uCameraRight*cos(angle)+uCameraUp*sin(angle))*radius;
        rd=normalize(focalPoint-ro);
      }
      sampleSum+=liveRadiance(ro,rd);
    }
    vec4 current=sampleSum/float(uAASamples);
    gl_FragColor=mix(current,texture2D(uPrevious,vUv),uBlend);
  }else{
    cameraPixel(vUv+(vec2(rand(),rand())-.5)/uResolution,ro,rd);
    if(uLensRadius>0.0){
      vec3 focalPoint=ro+rd*(uFocusDistance/dot(rd,uCameraForward));
      float angle=2.0*PI*rand(),radius=sqrt(rand())*uLensRadius;
      ro+=(uCameraRight*cos(angle)+uCameraUp*sin(angle))*radius;
      rd=normalize(focalPoint-ro);
    }
    c=radiance(ro,rd);
    gl_FragColor=vec4(mix(c,texture2D(uPrevious,vUv).rgb,uBlend),1.0);
  }
}
`;
export const display = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uClean;
uniform float uBeautyMix;
uniform vec2 uResolution;
uniform bool uSmoothEdges;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
vec3 graded(vec2 uv){
  vec3 c;
  if(uBeautyMix<=0.0)c=texture2D(uClean,uv).rgb;
  else if(uBeautyMix>=1.0)c=texture2D(uImage,uv).rgb;
  else c=mix(texture2D(uClean,uv).rgb,texture2D(uImage,uv).rgb,uBeautyMix);
  float vignette=1.0-.14*dot(uv-.5,uv-.5);
  return pow(aces(c*1.12)*vignette,vec3(1.0/2.2));
}
float edgeLuma(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
  vec2 texel=1.0/uResolution;
  vec3 center=graded(vUv);
  if(!uSmoothEdges){gl_FragColor=vec4(center,1);return;}
  float n=edgeLuma(graded(vUv+vec2(0,texel.y))),s=edgeLuma(graded(vUv-vec2(0,texel.y)));
  float e=edgeLuma(graded(vUv+vec2(texel.x,0))),w=edgeLuma(graded(vUv-vec2(texel.x,0))),m=edgeLuma(center);
  float low=min(m,min(min(n,s),min(e,w))),high=max(m,max(max(n,s),max(e,w)));
  if(high-low<max(.025,high*.12)){gl_FragColor=vec4(center,1);return;}
  // Smooth only current-frame edges, keeping motion free of temporal trails.
  vec2 direction=vec2(-(n-s),e-w);
  float reduction=max((n+s+e+w)*.03125,.0078125);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduction),vec2(-2),vec2(2))*texel;
  vec3 a=.5*(graded(vUv-direction/6.0)+graded(vUv+direction/6.0));
  vec3 b=a*.5+.25*(graded(vUv-direction*.5)+graded(vUv+direction*.5));
  float l=edgeLuma(b);gl_FragColor=vec4(l<low || l>high?a:b,1);
}
`;

export const surface = tracer.slice(0,tracer.indexOf('vec3 fluidNormal')) + /* glsl */`
void main(){
  vec2 xy=(vUv-.5)*FIELD;
  float floorDistance=exactSdf(vec3(xy,0.0));
  if(floorDistance>=-.0001){gl_FragColor=vec4(0,max(floorDistance,0.0),0,1);return;}
  float lo=0.0,hi=liquidCeiling();
  for(int i=0;i<12;i++){float mid=(lo+hi)*.5;if(exactSdf(vec3(xy,mid))>0.0)hi=mid;else lo=mid;}
  vec3 p=vec3(xy,(lo+hi)*.5);vec3 n=exactSurface(p).xyz;
  gl_FragColor=vec4(p.z,n);
}`;
export const indirect = '#define GATHERING_LIGHT\n'+tracer.slice(0,tracer.indexOf('vec3 reflectionLive')) + /* glsl */`
void main(){vec3 p=vec3((vUv-.5)*(uFilm?uLightingSpan:FIELD),0.0);vec3 light=indirectLive(p,vec3(1));if(uFilm)light+=directLive(p,vec3(1),uShadowSamples);gl_FragColor=vec4(light,1.0);}
`;
export const depthOfField = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uFocusDistance;
uniform float uLensRadius;
uniform float uCameraDistance;
uniform float uView;
float blurRadius(float depth){return min(uResolution.y*.032,uLensRadius*uCameraDistance*abs(1.0/max(depth,.1)-1.0/uFocusDistance)*uResolution.y/uView);}
void main(){
  vec4 center=textureLod(uSource,vUv,0.0);float radius=blurRadius(center.a);
  if(radius<.5){gl_FragColor=center;return;}
  float level=max(0.0,log2(max(radius,1.0))-1.2);
  vec3 sum=textureLod(uSource,vUv,level).rgb;float weight=1.0;
  for(int i=0;i<16;i++){
    float angle=float(i)*2.39996323,r=sqrt((float(i)+.5)/16.0);
    vec2 offset=vec2(cos(angle),sin(angle))*r*radius/uResolution;
    vec4 sampleColor=textureLod(uSource,clamp(vUv+offset,vec2(0),vec2(1)),level);
    // Sharp foreground surfaces should not smear across a more distant focus plane.
    float support=sampleColor.a<center.a-.18?smoothstep(.25,1.5,blurRadius(sampleColor.a)):1.0;
    sum+=sampleColor.rgb*support;weight+=support;
  }
  gl_FragColor=vec4(sum/weight,center.a);
}
`;

export const liveTracer=shaderMode(tracer,{live:true,exact:false,samples:1});
export const exportTracer=shaderMode(tracer,{live:true,exact:true,film:true,samples:16});
export const fastExportTracer=shaderMode(tracer,{live:true,exact:false,film:true,samples:16});
export const stillTracer=shaderMode(tracer,{live:false,exact:true});
