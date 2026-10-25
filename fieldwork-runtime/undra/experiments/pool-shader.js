export const waterOptics=/* glsl */`
precision highp float;varying vec2 vUv;
uniform sampler2D uWaves;uniform float uSpan,uTexel,uDepth;
const float PI=3.14159265359,IOR=1.333;
vec3 surface(vec2 p){
 vec3 f=texture2D(uWaves,p/uSpan+.5).rgb;float limit=uDepth*.55,q=tanh(f.x/limit);
 return vec3(q*limit,f.yz*(1.0-q*q));
}
vec3 waterNormal(vec2 p){vec3 f=surface(p);return normalize(vec3(-f.yz,1));}
float height(vec2 p){return uDepth+surface(p).x;}
float fresnel(float cosine){
 float sin2=(1.0-cosine*cosine)/(IOR*IOR),transmitted=sqrt(max(0.0,1.0-sin2));
 float rs=(cosine-IOR*transmitted)/(cosine+IOR*transmitted),rp=(IOR*cosine-transmitted)/(IOR*cosine+transmitted);
 return .5*(rs*rs+rp*rp);
}
vec3 lightPosition(){return vec3(-3.0,4.0,10.0);}
vec2 floorLanding(vec2 point){
 float h=height(point);vec3 incoming=normalize(vec3(point,h)-lightPosition()),direction=refract(incoming,waterNormal(point),1.0/IOR);
 return point+direction.xy*h/max(-direction.z,.15);
}
`;
export const causticShader=waterOptics+/* glsl */`
void main(){
 vec2 floorPoint=(vUv-.5)*uSpan,source=floorPoint;
 for(int i=0;i<4;i++)source+=floorPoint-floorLanding(source);
 float e=uSpan*uTexel*1.15;
 vec2 dx=(floorLanding(source+vec2(e,0))-floorLanding(source-vec2(e,0)))/(2.0*e);
 vec2 dy=(floorLanding(source+vec2(0,e))-floorLanding(source-vec2(0,e)))/(2.0*e);
 float determinant=dx.x*dy.y-dx.y*dy.x,focus=1.0/max(abs(determinant),.18);
 vec3 n=waterNormal(source),light=normalize(lightPosition()-vec3(source,height(source)));
 float transmission=1.0-fresnel(max(.01,dot(n,light)));
 // Bounded geometric-optics focusing avoids singular, sparkling caustic peaks.
 gl_FragColor=vec4(clamp(focus*.80+.20,.35,3.6)*transmission,0,0,1);
}
`;
export const poolShader=waterOptics+/* glsl */`
uniform sampler2D uCaustics;uniform float uView,uTime;
uniform vec2 uResolution;uniform vec3 uFloor,uTint,uAbsorption;
uniform vec3 uCameraOrigin,uCameraForward,uCameraRight,uCameraUp;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 substrate(vec2 p){
 float wash=noise(p*.65)*.65+noise(p*1.7)*.35;
 float vein=abs(sin(p.x*2.4+p.y*1.3+wash*5.0));
 float line=1.0-smoothstep(.025,.13,vein);
 vec3 albedo=mix(uFloor*3.0,uTint*.44,.18);
 return albedo*(.90+.16*wash-line*.07);
}
float box(vec2 p,vec2 radius,float edge){vec2 q=abs(p)-radius;return 1.0-smoothstep(-edge,edge,max(q.x,q.y));}
vec3 environment(vec3 p,vec3 direction){
 vec3 c=mix(vec3(.025,.040,.048),vec3(.10,.12,.13),clamp(direction.z,0.0,1.0));
 if(direction.z>0.0){
  vec2 q=(p+direction*(10.0-p.z)/max(direction.z,.001)).xy;
  float window=box(q-vec2(-2.0,3.7),vec2(5.0,2.6),.12);
  float vertical=1.0-box(vec2(q.x+2.0,0),vec2(.035,10),.025);
  float horizontal=1.0-box(vec2(0,q.y-3.7),vec2(10,.035),.025);
  c+=vec3(18.0,18.6,19.4)*window*vertical*horizontal;
  vec2 rotated=mat2(.94,-.342,.342,.94)*(q-vec2(6,-3));
  c+=vec3(7.0,5.2,3.9)*box(rotated,vec2(.55,6.0),.28);
 }
 return c;
}
vec3 optics(vec2 uv){
 vec2 film=(uv-.5)*vec2(uResolution.x/uResolution.y,1.0)*uView;
 vec3 ro=uCameraOrigin,rd=normalize(uCameraForward*20.0+uCameraRight*film.x+uCameraUp*film.y);
 float t=(uDepth-ro.z)/rd.z;
 for(int i=0;i<7;i++){
  vec3 p=ro+rd*t,f=surface(p.xy);float derivative=rd.z-dot(f.yz,rd.xy);
  t-=(p.z-uDepth-f.x)/min(derivative,-.25);
 }
 vec3 hit=ro+rd*t,n=waterNormal(hit.xy);float cosine=clamp(dot(-rd,n),.001,1.0),F=fresnel(cosine);
 vec3 transmitted=refract(rd,n,1.0/IOR);float path=max(.001,hit.z/max(-transmitted.z,.15));
 vec2 floorPoint=(hit+transmitted*path).xy;
 vec3 attenuation=exp(-(uAbsorption*.42+vec3(.014,.008,.005))*path);
 vec3 light=normalize(lightPosition()-vec3(floorPoint,0));
 float focus=texture2D(uCaustics,floorPoint/uSpan+.5).r;
 vec3 floorLight=substrate(floorPoint)*(vec3(.52,.65,.75)+vec3(2.9,2.8,2.6)*max(light.z,0.0)*focus);
 vec3 through=attenuation*floorLight+(1.0-attenuation)*uTint*.18;
 return through*(1.0-F)+environment(hit,reflect(rd,n))*F;
}
vec3 grade(vec3 c){c=max(c,vec3(0));return pow(clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.0,1.0),vec3(1.0/2.2));}
void main(){
 vec2 e=.25/uResolution;vec3 colour=.5*(optics(vUv+e)+optics(vUv-e));
 gl_FragColor=vec4(grade(colour)*(1.0-.10*dot(vUv-.5,vUv-.5)),1);
}
`;
