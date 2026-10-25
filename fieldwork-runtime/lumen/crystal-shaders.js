import {growthGLSL} from './living-growth.js';
export const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;

export const crystalVertex = `#version 300 es
precision highp float;
layout(location=0)in vec3 position;
layout(location=1)in float radius;
layout(location=2)in float facet;
layout(location=3)in vec3 surfaceNormal;
layout(location=4)in vec4 development;
uniform vec2 resolution;
uniform float angle,tilt,distanceToEye,focus,aperture,phase,roll,focusBand,growthTime,growthBlend,lens;
out vec3 tint;
out float energy,softness,sparkle,depth,growthAlpha;
out vec3 macroNormal;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 spectrum(float x){
 vec3 red=vec3(1.,.008,.001),amber=vec3(1.,.33,.008),ivory=vec3(.78,1.,.64),ice=vec3(.045,.68,1.),blue=vec3(.004,.04,1.);
 x=clamp(x,0.,.9999)*4.;
 if(x<1.)return mix(red,amber,smoothstep(0.,1.,x));
 if(x<2.)return mix(amber,ivory,smoothstep(0.,1.,x-1.));
 if(x<3.)return mix(ivory,ice,smoothstep(0.,1.,x-2.));
 return mix(ice,blue,smoothstep(0.,1.,x-3.));
}
${growthGLSL}
void main(){
 growthAlpha=livingGrowth(development,growthTime,growthBlend);
 if(growthAlpha<.001){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
 vec3 p=position;
 p.xy=rot(.32+roll)*p.xy;p.xz=rot(angle)*p.xz;p.yz=rot(tilt)*p.yz;
 vec3 n=surfaceNormal;
 n.xy=rot(.32+roll)*n.xy;n.xz=rot(angle)*n.xz;n.yz=rot(tilt)*n.yz;
 macroNormal=n;
 depth=distanceToEye-p.z;
 // A more distant eye and narrower view retain size with less perspective.

 float fit=min(1.,resolution.x/resolution.y/.9);
 vec2 screen=p.xy/(depth*lens)*fit;
 screen.x*=resolution.y/resolution.x;
 gl_Position=vec4(screen*2.,0.,1.);
 float projected=radius*(.45+.55*growthAlpha)*resolution.y/(depth*lens)*fit;
 // Keep a narrow plane of tracked surface grains crisp as the lens moves.
 float defocus=max(0.,abs(depth-focus)-focusBand);
 defocus*=smoothstep(0.,focusBand*.6+.001,defocus);
 float coc=aperture*defocus/depth*resolution.y/(focus*lens)*fit;
 float size=sqrt(projected*projected+coc*coc+.14);
 gl_PointSize=clamp(size*2.,1.,180.);
 energy=projected*projected/(size*size);
 softness=clamp(coc/max(projected,.01),0.,1.);
 tint=spectrum(.5+p.x*.72+p.y*.08+.2*sin(phase));
 sparkle=facet;
}`;

export const crystalFragment = `#version 300 es
precision highp float;
in vec3 tint,macroNormal;
in float energy,softness,sparkle,depth,growthAlpha;
uniform float transmission,lightPass,lightTurn,distanceToEye;
out vec4 frag;
void main(){
 vec2 q=gl_PointCoord*2.-1.;
 float r2=dot(q,q);
 if(r2>1.)discard;
 float z=sqrt(max(0.,1.-r2));
 vec3 n=vec3(q.x,-q.y,z);
 vec3 key=normalize(vec3(-.8+lightTurn,1.5,1.3));
 vec3 rim=normalize(vec3(1.4-lightTurn,.5,-1.));
 float facing=abs(macroNormal.z);
 float edge=pow(1.-facing,1.6);
 float lit=max(dot(macroNormal,key),0.);
 float rear=max(dot(-macroNormal,rim),0.);
 float microDiffuse=max(dot(n,key),0.);
 float spec=pow(max(dot(n,normalize(key+vec3(0,0,1))),0.),95.);
 float beadEdge=pow(1.-z,2.);
 // Broad curved faces carry discrete light; grazing edges remain brighter.
 float shellLight=.19+edge*.55+lit*.32;
 vec3 reflected=tint*(.04+microDiffuse*.3)*(.28+lit*.8);
 vec3 transmitted=tint*(.06+edge*.6+rear*.2)*(beadEdge*.35+.4)*transmission;
 vec3 light=reflected+transmitted;
 vec3 defocused=tint*(.1+lit*.14+edge*.42+rear*.12)*(.4+transmission*.6);
 light=mix(light,defocused,softness);
 float disk=mix(smoothstep(0.,.12,z),smoothstep(0.,.2,1.-r2),softness);
 if(lightPass>.5){
  float highlight=spec*(.05+lit*.2+edge*.1)*pow(sparkle,3.);
  frag=vec4(mix(tint,vec3(1.),.72)*highlight*energy*disk*growthAlpha,0.);
  return;
 }
 // Optical depth is carried by a thin, uneven shell rather than a dense core.
 float opacity=.1*energy*disk*growthAlpha*shellLight*exp(-(depth-distanceToEye+1.1)*.28);
 frag=vec4(light*opacity,opacity);
}`;

export const display = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 frag;
uniform sampler2D image,highlights;
uniform float frame;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
 vec4 light=texture(image,uv);
 vec3 c=light.rgb/max(light.a,.00001)*(1.-exp(-light.a*2.8));
 c+=texture(highlights,uv).rgb*.75;
 c=pow(aces(c*3.8),vec3(.454545));
 float grain=fract(sin(dot(gl_FragCoord.xy+frame,vec2(12.9898,78.233)))*43758.5453)-.5;
 c+=grain*.018*sqrt(max(c,vec3(0)));
 frag=vec4(c,1.);
}`;
