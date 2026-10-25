import { CloudRain } from './rain.js';
// Stable volumetric lighting. The same deterministic kernel runs while drawing and at rest.
// Rain is a separate display pass over the cached cloud image.
export const vertexShader = `#version 300 es
layout(location=0) in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0,1);}`;

export const mediumGLSL = `
precision highp float;
precision highp int;
precision highp sampler3D;
in vec2 uv;
out vec4 fragColor;
uniform sampler3D volume, noiseField;
uniform sampler2D footprint;
uniform float aspect, time, fullness, lightMode, sunAngle, sunDepth;
uniform vec2 pixels;
uniform float encodedHDR;
const float PI=3.141592653589793;
float noise3(vec3 p){return texture(noiseField,p/32.).r;}
float density(vec3 p){
 vec3 q=vec3(p.x/(aspect*3.2)+.5,p.y/3.2+.5,p.z/1.4+.5);
 if(any(lessThan(q,vec3(0)))||any(greaterThan(q,vec3(1))))return 0.;
 float base=texture(volume,q).r;
 if(base<.006)return 0.;
 vec3 drift=vec3(time*.008,0,time*.004);
 vec3 warp=vec3(texture(noiseField,p*.32+11.).r,texture(noiseField,p*.32+31.).r,texture(noiseField,p*.32+57.).r)-.5;
 vec3 n=p*.95+warp*.26+drift;
 vec4 large=texture(noiseField,n);
 vec4 fine=texture(noiseField,n*2.13+vec3(13.1,7.7,3.2));
 vec4 micro=texture(noiseField,n*4.27+vec3(5.8,17.3,9.4));
 // Cellular lobes form cauliflower billows; smaller scales carve their creases.
 float lobes=(large.r*.42+large.g*.58-.50)*.60;
 float erosion=(fine.b-.48)*.20+(micro.a-.48)*.075;
 float edgeWeight=1.-smoothstep(.04,.36,base);
 // Anisotropic cellular noise pulls thin filaments along the cloud boundary.
 float fiber=texture(noiseField,vec3(n.x*3.6+n.y*1.4,n.y*.36,n.z*2.8)).b;
 float field=base-.075+lobes+erosion+(fiber-.48)*.11*edgeWeight;
 float core=smoothstep(.025,.245,field);
 float veil=smoothstep(-.018,.085,field)*.085;
 return min(1.,core*.915+veil)*smoothstep(.006,.085,base)*fullness;
}
float shadowDensity(vec3 p){
 vec3 q=vec3(p.x/(aspect*3.2)+.5,p.y/3.2+.5,p.z/1.4+.5);
 if(any(lessThan(q,vec3(0)))||any(greaterThan(q,vec3(1))))return 0.;
 float base=texture(volume,q).r;if(base<.006)return 0.;
 vec4 n=texture(noiseField,p*.95+vec3(time*.008,0,time*.004));
 float field=base-.075+(n.r*.42+n.g*.58-.50)*.60;
 return smoothstep(.012,.25,field)*smoothstep(.006,.085,base)*fullness;
}
vec3 encodeLight(vec3 c){return encodedHDR>.5?c/(1.+c):c;}
vec3 sunDirection(){return normalize(vec3(sunAngle,.52,sunDepth));}
vec3 sunRadiance(){
 vec3 c=mix(vec3(25.,23.5,21.),vec3(33.,21.,11.),min(lightMode,1.));
 return lightMode>1.?mix(c,vec3(9.,10.,16.),lightMode-1.):c;
}
vec3 skyColor(vec2 v){
 float h=clamp(v.y,0.,1.);
 vec3 low=mix(vec3(.58,.79,.91),vec3(.88,.72,.56),min(lightMode,1.));
 vec3 high=mix(vec3(.22,.49,.78),vec3(.35,.45,.65),min(lightMode,1.));
 if(lightMode>1.){low=mix(low,vec3(.60,.54,.70),lightMode-1.);high=mix(high,vec3(.15,.24,.43),lightMode-1.);}
 vec3 c=mix(low,high,pow(h,.85));
 float glow=exp(-length((v-vec2(.5+sunAngle*.3,.84))*vec2(aspect,1.))*3.5);
 c+=vec3(.065,.045,.015)*glow;
 // Inverse of the display exposure keeps the clear sky consistent in every pass.
 return -log(max(vec3(.001),1.-pow(c,vec3(2.2))))/1.25;
}
vec3 environment(vec3 d){
 vec3 horizon=mix(vec3(.49,.65,.83),vec3(.74,.51,.34),min(lightMode,1.));
 vec3 zenith=mix(vec3(.17,.37,.68),vec3(.25,.32,.52),min(lightMode,1.));
 vec3 lower=mix(vec3(.20,.27,.36),vec3(.30,.23,.22),min(lightMode,1.));
 vec3 c=d.y>0.?mix(horizon,zenith,pow(d.y,.45)):mix(horizon,lower,pow(-d.y,.35));
 if(lightMode>1.)c*=mix(vec3(1),vec3(.6,.65,.85),lightMode-1.);
 return c*.9;
}
float hg(float cosine,float g){float d=1.+g*g-2.*g*cosine;return (1.-g*g)/(4.*PI*d*sqrt(d));}
float phase(float cosine){return .88*hg(cosine,.76)+.12*hg(cosine,-.25);}
vec2 driftOffset(){return vec2(0);}
vec2 boxInterval(vec3 p,vec3 d){
 vec3 bound=vec3(aspect*1.6,1.6,.7);
 vec3 safe=vec3(abs(d.x)<1e-7?1e-7:d.x,abs(d.y)<1e-7?1e-7:d.y,abs(d.z)<1e-7?1e-7:d.z);
 vec3 a=(-bound-p)/safe,b=(bound-p)/safe;
 vec3 lo=min(a,b),hi=max(a,b);
 return vec2(max(max(lo.x,lo.y),lo.z),min(min(hi.x,hi.y),hi.z));
}
`;

export const previewShader = `#version 300 es
${mediumGLSL}
void main(){
 vec2 coord=uv-driftOffset();vec3 sky=skyColor(uv);
 if(texture(footprint,coord).r<.008){fragColor=vec4(encodeLight(sky),0);return;}
 vec2 xy=(coord-.5)*vec2(aspect*3.2,3.2);
 vec3 sun=sunDirection(),L=vec3(0);float T=1.;
 const float jitter=.5;
 for(int i=0;i<96;i++){
  vec3 p=vec3(xy,.7-(float(i)+jitter)*1.4/96.);
  float d=density(p);
  if(d>.002){
   float optical=0.;float t=.012;
   for(int j=0;j<10;j++){float ds=.023+float(j)*.019;optical+=shadowDensity(p+sun*t)*ds;t+=ds;}
   float direct=exp(-optical*32.);
   vec3 light=sunRadiance()*phase(dot(vec3(0,0,-1),sun))*direct+environment(vec3(0,1,0))*.65;
   float alpha=1.-exp(-d*32.*1.4/96.);
   L+=T*alpha*light;T*=1.-alpha;
   if(T<.005)break;
  }
 }
 fragColor=vec4(encodeLight(L+T*sky),1.-T);
}`;

const displayShader = `#version 300 es
precision highp float;
in vec2 uv;out vec4 fragColor;
uniform sampler2D image;
uniform vec2 pixels;
uniform float encodedHDR;
vec3 readLight(vec2 coord){vec3 c=texture(image,coord).rgb;return encodedHDR>.5?c/max(vec3(.001),1.-c):c;}
void main(){
 vec4 center=texture(image,uv);vec3 c=readLight(uv);
 // No final blur: resolved billows and thin cloud filaments retain native detail.
 if(center.a>.001){
  vec3 bloom=vec3(0);
  for(int i=0;i<4;i++){
   float a=float(i)*1.570796;
   vec3 n=readLight(uv+vec2(cos(a),sin(a))*2./pixels);
   bloom+=max(n-vec3(2.),vec3(0));
  }
  c+=bloom*.0015;
 }
 c=1.-exp(-max(c,vec3(0))*1.25);
 fragColor=vec4(pow(c,vec3(1./2.2)),1);
}`;

function compile(gl,source,type){
 const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;
}
function program(gl,fragment){
 const p=gl.createProgram();gl.attachShader(p,compile(gl,vertexShader,gl.VERTEX_SHADER));gl.attachShader(p,compile(gl,fragment,gl.FRAGMENT_SHADER));gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
 return p;
}
export class CloudRenderer {
 constructor(gl,preview){
  this.gl=gl;this.rain=new CloudRain(gl);this.preview=preview;this.display=program(gl,displayShader);this.locations=new Map();
  this.floatTargets=Boolean(gl.getExtension('EXT_color_buffer_float'));this.frames=0;
 }
 uniform(p,name){const key=(p===this.preview?'volume:':'display:')+name;if(!this.locations.has(key))this.locations.set(key,this.gl.getUniformLocation(p,name));return this.locations.get(key);}
 allocate(w,h){
  const gl=this.gl;
  if(this.texture)gl.deleteTexture(this.texture);if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);
  this.width=w;this.height=h;this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,this.floatTargets?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,this.floatTargets?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
  this.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Could not allocate the cloud lighting buffer.');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 ready(){
  if(!this.fence)return true;const gl=this.gl,result=gl.clientWaitSync(this.fence,0,0);
  if(result===gl.TIMEOUT_EXPIRED)return false;
  if(result===gl.WAIT_FAILED)throw new Error('The GPU could not complete the cloud lighting pass.');
  gl.deleteSync(this.fence);this.fence=null;return true;
 }
 submit(){this.fence=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);this.gl.flush();}
 reset(){this.invalid=true;}
 render(settings){
  const gl=this.gl,w=gl.canvas.width,h=gl.canvas.height;
  if(w!==this.width||h!==this.height)this.allocate(w,h);
  gl.viewport(0,0,w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.useProgram(this.preview);
  for(const name of ['aspect','time','fullness','lightMode','sunAngle','sunDepth'])gl.uniform1f(this.uniform(this.preview,name),settings[name]);
  gl.uniform1f(this.uniform(this.preview,'encodedHDR'),this.floatTargets?0:1);gl.uniform2f(this.uniform(this.preview,'pixels'),w,h);
  for(const [name,unit] of [['volume',0],['noiseField',1],['footprint',2]])gl.uniform1i(this.uniform(this.preview,name),unit);
  gl.drawArrays(gl.TRIANGLES,0,6);this.frames++;this.invalid=false;this.present(settings);
 }
 present(settings){
  if(!this.texture)return;
  const gl=this.gl,w=this.width,h=this.height;
  gl.viewport(0,0,w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(this.display);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.texture);
  gl.uniform1i(this.uniform(this.display,'image'),3);
  gl.uniform1f(this.uniform(this.display,'encodedHDR'),this.floatTargets?0:1);
  gl.uniform2f(this.uniform(this.display,'pixels'),w,h);
  gl.drawArrays(gl.TRIANGLES,0,6);this.rain.draw(settings,w,h,this.floatTargets?0:1);this.submit();
 }
}
