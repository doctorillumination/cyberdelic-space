import {surfaceGLSL,traceGLSL,display} from './field-rendering.js';
export {display};
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
uniform float frame, angle, tilt, phase, focus, aperture, transmission, distanceToEye, seed, blend, lens, rayCount;
uniform float previousAngle,previousTilt,previousDistanceToEye,previousLens,previousFocus,previousAperture;
uniform sampler2D previous;
const float PI=3.14159265359;
vec2 rng;
float random(){rng+=vec2(1.2345,2.3456);vec3 p=fract(vec3(rng.xyx)*vec3(.1031,.1030,.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
mat2 rotation(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 local(vec3 p){p.xz=rotation(angle)*p.xz;p.yz=rotation(tilt)*p.yz;p.xy=rotation(-.38)*p.xy;return p;}
// Recursive distance estimation preserves detail as the macro lens approaches.
float shape(vec3 p){
 p=local(p);p/=vec3(.94,1.14,.91);
 vec3 z=p;float dr=1.;float r=0.;float power=3.0+seed*.13;
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
${pigmentGLSL}
${surfaceGLSL}
${traceGLSL}
`;
