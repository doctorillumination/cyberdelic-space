export const surfaceGLSL=`
vec3 normal(vec3 p,float eps){vec2 e=vec2(eps,0);return normalize(vec3(shape(p+e.xyy)-shape(p-e.xyy),shape(p+e.yxy)-shape(p-e.yxy),shape(p+e.yyx)-shape(p-e.yyx)));}
float shadow(vec3 p,vec3 l){float v=1.,t=.008;for(int i=0;i<19;i++){float d=shape(p+l*t);v=min(v,12.*d/t);t+=clamp(d,.012,.18);if(t>2.||v<.01)break;}return clamp(v,0.,1.);}
float occlusion(vec3 p,vec3 n){float a=0.,w=1.;for(int i=1;i<=4;i++){float h=.012+float(i)*.038;a+=(h-shape(p+n*h))*w;w*=.6;}return clamp(1.-a*3.,.12,1.);}
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
 float sparkle=pow(max(micro,0.),10.)*pow(max(dot(n,halfK),0.),18.)*.35;
 vec3 col=tint*(.035*ao+diffuse*.48*ao);
 col+=tint*(thin*back*2.9+edge*.75*thin)*transmission;
 col+=sqrt(tint)*(max(dot(n,rim),0.)*.3+max(dot(n,fill),0.)*.12)*ao;
 col+=mix(tint,vec3(1.),.72)*(spec*(.16+fresnel*.5)+sparkle)*(.35+ao*.65);
 col+=tint*thin*.13*transmission;return col;
}
`;

// Every lens sample traces the scene from a different point on a circular pupil.
// Occlusion and highlights therefore participate in defocus before display.
export const traceGLSL=`
bool hitSurface(vec3 ro,vec3 rd,out vec3 p,out float eps){
 float b=dot(ro,rd),c=dot(ro,ro)-2.65,disc=b*b-c;
 if(disc<0.)return false;
 float t=max(0.,-b-sqrt(disc)),end=-b+sqrt(disc);eps=.0003;
 for(int i=0;i<160;i++){
  p=ro+rd*t;float d=shape(p);eps=max(.00022,t*.00014*lens/.69);
  if(d<eps)return true;
  t+=max(d*.82,.00012);if(t>end)break;
 }
 return false;
}
vec3 trace(vec3 ro,vec3 rd){
 vec3 p;float eps;if(!hitSurface(ro,rd,p,eps))return vec3(0);
 return max(shade(p,rd,eps*1.5),vec3(0));
}
vec3 oldWorld(vec3 p){
 p=local(p);p.xy=rotation(.38)*p.xy;p.yz=rotation(-previousTilt)*p.yz;p.xz=rotation(-previousAngle)*p.xz;return p;
}
void main(){
 float fit=min(1.,resolution.x/resolution.y/.9);
 vec2 px=(gl_FragCoord.xy-resolution*.5)/resolution.y;
 vec3 eye=vec3(0,0,distanceToEye),central=normalize(vec3(px*lens/fit,-1.));
 vec3 point;float eps;bool hasSurface=hitSurface(eye,central,point,eps);
 float depth=hasSurface?distanceToEye-point.z:0.;
 vec3 sum=vec3(0);
 rng=gl_FragCoord.xy;
 float turn=fract(random()+frame*.618033989)*2.*PI,offset=fract(random()+frame*.754877666);
 for(int i=0;i<4;i++){
  if(float(i)>=rayCount)break;
  float sampleIndex=float(i),r=sqrt((sampleIndex+offset)/rayCount)*aperture;
  float a=turn+sampleIndex*2.39996323;
  vec2 jitter=fract(vec2(random(),random())+frame*vec2(.569840291,.438579021))-.5;
  vec3 pinhole=normalize(vec3((px+jitter/resolution.y)*lens/fit,-1.));
  vec3 focal=eye+pinhole*(focus/-pinhole.z);
  vec3 ro=eye+vec3(cos(a)*r,sin(a)*r,0.);
  sum+=trace(ro,normalize(focal-ro));
 }
 vec3 colour=sum/rayCount;
 // Reproject the same object point into the preceding camera. Reject hidden
 // surfaces instead of blending unrelated screen pixels as the object rotates.
 if(blend>0.){
  vec3 anchor=hasSurface?point:eye+central*(focus/-central.z);
  vec3 oldPoint=oldWorld(anchor);float oldDepth=previousDistanceToEye-oldPoint.z;
  vec2 projected=oldPoint.xy/max(oldDepth,.01)*fit/previousLens;
  vec2 previousUV=vec2(projected.x*resolution.y/resolution.x,projected.y)+.5;
  if(all(greaterThan(previousUV,vec2(0)))&&all(lessThan(previousUV,vec2(1)))){
   vec4 history=texture(previous,previousUV);
   float tolerance=.025+aperture*.8;
   float agreement=hasSurface?1.-smoothstep(.008,tolerance,abs(history.a-oldDepth)):(history.a==0.?1.:.25);
   float lensChange=exp(-abs(previousFocus-focus)*24.-abs(previousAperture-aperture)*40.);
   float coc=aperture*abs(depth-focus)/max(depth*focus*lens,.001)*resolution.y*fit;
   float historyLimit=hasSurface?mix(.72,.97,smoothstep(.5,2.5,coc)):.97;
   colour=mix(colour,history.rgb,min(blend,historyLimit)*agreement*lensChange);
  }
 }
 frag=vec4(colour,depth);
}
`;

export const display=`#version 300 es
precision highp float;
in vec2 uv;out vec4 frag;
uniform sampler2D image;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 c=texture(image,uv).rgb;c=pow(aces(c*1.5),vec3(.454545));frag=vec4(c,1.);}
`;
