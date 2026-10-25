import {pigmentGLSL} from './pigment.js';
export const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
export const specimen = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;out vec4 frag;
uniform vec2 resolution;
uniform float frame, angle, tilt, phase, focus, aperture, transmission, distanceToEye, seed, blend, lens;
uniform sampler2D previous;
const float PI=3.14159265359;
vec2 rng;
float random(){rng+=vec2(1.2345,2.3456);vec3 p=fract(vec3(rng.xyx)*vec3(.1031,.1030,.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
mat2 rotation(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 local(vec3 p){p.xz=rotation(angle)*p.xz;p.yz=rotation(tilt)*p.yz;p.xy=rotation(-.38)*p.xy;return p;}
// Recursive distance estimation preserves detail as the macro lens approaches.
float shape(vec3 p){
 p=local(p);p/=vec3(.94,1.14,.91);
 vec3 z=p;float dr=1.;float r=0.;float power=8.0+seed*.025;
 for(int i=0;i<9;i++){
  r=length(z);if(r>2.5)break;
  float safeR=max(r,.00001);
  float theta=acos(clamp(z.z/safeR,-1.,1.));float phi=atan(z.y,z.x);
  dr=pow(safeR,power-1.)*power*dr+1.;
  float zr=pow(safeR,power);theta*=power;phi*=power;
  z=zr*vec3(sin(theta)*cos(phi),sin(phi)*sin(theta),cos(theta));
  z.xy=rotation(.08+seed*.012)*z.xy;z+=p;
 }
 return .5*log(max(r,.00001))*r/dr*.78;
}
vec3 normal(vec3 p,float eps){vec2 e=vec2(eps,0);return normalize(vec3(shape(p+e.xyy)-shape(p-e.xyy),shape(p+e.yxy)-shape(p-e.yxy),shape(p+e.yyx)-shape(p-e.yyx)));}
float shadow(vec3 p,vec3 l){float v=1.,t=.008;for(int i=0;i<19;i++){float d=shape(p+l*t);v=min(v,12.*d/t);t+=clamp(d,.012,.18);if(t>2.||v<.01)break;}return clamp(v,0.,1.);}
float occlusion(vec3 p,vec3 n){float a=0.,w=1.;for(int i=1;i<=4;i++){float h=.012+float(i)*.038;a+=(h-shape(p+n*h))*w;w*=.6;}return clamp(1.-a*3.,.12,1.);}
${pigmentGLSL}
vec3 shade(vec3 p,vec3 rd,float eps){
 vec3 n=normal(p,eps),v=-rd,lp=local(p);
 vec3 tint=paintedPigment(lp,normalize(local(n)),phase);
 vec3 key=normalize(vec3(-1.4,2.2,2.6)),rim=normalize(vec3(1.7,.7,-1.8)),fill=normalize(vec3(-1.,-.2,-1.2));
 float ao=occlusion(p,n),sh=shadow(p+n*.004,key);
 float ndv=max(dot(n,v),0.),fresnel=.035+.965*pow(1.-ndv,5.);
 float diffuse=max(dot(n,key),0.)*sh;
 // Interior distance probes make thin branches pass more backlight.
 float thickness=0.;for(int i=1;i<=5;i++){float h=float(i)*.027;thickness+=max(0.,h-shape(p-n*h));}thickness=clamp(thickness*1.55,0.,1.);
 float thin=exp(-thickness*6.5);
 float back=pow(max(dot(-n,rim),0.),1.5)*.8+pow(max(dot(v,rim+n*.35),0.),4.)*.8;
 float edge=pow(1.-ndv,2.5);
 vec3 halfK=normalize(key+v),halfR=normalize(rim+v);
 float spec=pow(max(dot(n,halfK),0.),100.)*sh*3.8+pow(max(dot(n,halfR),0.),70.)*2.5;
 float micro=sin(lp.x*490.+sin(lp.z*290.))*sin(lp.y*430.+lp.z*380.);
 float sparkle=pow(max(micro,0.),10.)*pow(max(dot(n,halfK),0.),18.)*1.8;
 vec3 col=tint*(.035*ao+diffuse*.48*ao);
 col+=tint*(thin*back*2.9+edge*.75*thin)*transmission;
 col+=sqrt(tint)*(max(dot(n,rim),0.)*.3+max(dot(n,fill),0.)*.12)*ao;
 col+=mix(tint,vec3(1.),.72)*(spec*(.16+fresnel*.5)+sparkle)*(.35+ao*.65);
 col+=tint*thin*.13*transmission;return col;
}
vec3 trace(vec3 ro,vec3 rd){
 float b=dot(ro,rd),c=dot(ro,ro)-2.65;float disc=b*b-c;if(disc<0.)return vec3(0);
 float t=max(0.,-b-sqrt(disc)),end=-b+sqrt(disc);bool hit=false;float eps=.0005;
 for(int i=0;i<150;i++){
  vec3 p=ro+rd*t;float d=shape(p);eps=max(.00024,t*.00016*lens/.69);
  if(d<eps){hit=true;break;}t+=max(d*.82,.00013);if(t>end)break;
 }
 if(!hit)return vec3(0);
 return max(shade(ro+rd*t,rd,eps*1.5),vec3(0));
}
void main(){
 rng=gl_FragCoord.xy+vec2(frame*17.38,frame*43.77);
 vec2 px=(gl_FragCoord.xy+vec2(random(),random())-.5-resolution*.5)/resolution.y;
 vec3 ro=vec3(0,0,distanceToEye);float fit=min(1.,resolution.x/resolution.y/.9);vec3 rd=normalize(vec3(px*lens/fit,-1.));
 vec3 focal=ro+rd*(focus/-rd.z);
 float a=random()*PI*2.,r=sqrt(random())*aperture;
 ro.xy+=vec2(cos(a),sin(a))*r;rd=normalize(focal-ro);
 vec3 col=trace(ro,rd);vec3 old=texture(previous,uv).rgb;
 frag=vec4(mix(col,old,blend),1.);
}`;
export const display = `#version 300 es
precision highp float;
in vec2 uv;out vec4 frag;uniform sampler2D image;uniform vec2 resolution;uniform float frame;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 c=texture(image,uv).rgb;c=pow(aces(c*1.45),vec3(.454545));
 float grain=fract(sin(dot(gl_FragCoord.xy+frame,vec2(12.9898,78.233)))*43758.5453)-.5;
 c+=grain*.018*sqrt(max(c,vec3(0)));frag=vec4(c,1.);}`;
