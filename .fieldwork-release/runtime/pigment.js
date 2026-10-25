// Broad, smooth pigment fields live in object coordinates, so they turn with it.
export const pigmentGLSL=`
float pigmentHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float pigmentNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(pigmentHash(i),pigmentHash(i+vec3(1,0,0)),f.x),mix(pigmentHash(i+vec3(0,1,0)),pigmentHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(pigmentHash(i+vec3(0,0,1)),pigmentHash(i+vec3(1,0,1)),f.x),mix(pigmentHash(i+vec3(0,1,1)),pigmentHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 pigmentPalette(float t){
 vec3 a=vec3(.18,.065,.28),b=vec3(.68,.16,.22),c=vec3(.94,.43,.17),d=vec3(.86,.75,.37),e=vec3(.42,.68,.49),f=vec3(.065,.48,.56),g=vec3(.11,.22,.53),h=vec3(.45,.29,.57);
 float x=clamp(t,0.,.99999)*7.;float s=smoothstep(0.,1.,fract(x));
 if(x<1.)return mix(a,b,s);if(x<2.)return mix(b,c,s);if(x<3.)return mix(c,d,s);if(x<4.)return mix(d,e,s);if(x<5.)return mix(e,f,s);if(x<6.)return mix(f,g,s);return mix(g,h,s);
}
vec3 paintedPigment(vec3 p,vec3 n,float phase){
 float drift=phase*.32;
 vec3 warp=p+vec3(pigmentNoise(p*1.7+2.),pigmentNoise(p*1.4+7.),pigmentNoise(p*1.9-4.))*.48;
 float wash=.5+.34*sin(dot(warp,vec3(1.45,.8,-1.1))+drift);
 float side=.5+.36*sin(dot(warp,vec3(-.75,1.6,1.35))-drift*.7+2.1);
 float under=.5+.32*sin(dot(warp,vec3(.7,-1.1,1.7))+drift*.45-1.9);
 float turn=smoothstep(-.8,.8,dot(n,normalize(vec3(.9,.25,-.7))));
 vec3 colour=mix(pigmentPalette(wash),pigmentPalette(side),.15+turn*.46);
 float underside=(1.-smoothstep(-.8,.55,p.y))*(.22+.25*max(-n.y,0.));
 colour=mix(colour,pigmentPalette(under),underside);
 float glaze=.94+.12*pigmentNoise(p*4.2+vec3(1.2,4.1,8.));
 return colour*glaze;
}
`;
