// Broad, smooth pigment fields live in object coordinates, so they turn with it.
export const pigmentGLSL=`
float pigmentHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float pigmentNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(pigmentHash(i),pigmentHash(i+vec3(1,0,0)),f.x),mix(pigmentHash(i+vec3(0,1,0)),pigmentHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(pigmentHash(i+vec3(0,0,1)),pigmentHash(i+vec3(1,0,1)),f.x),mix(pigmentHash(i+vec3(0,1,1)),pigmentHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 pigmentPalette(float t){
 vec3 a=vec3(.30,.018,.32),b=vec3(1.,.035,.075),c=vec3(1.,.28,.015),d=vec3(.97,.80,.23),e=vec3(.24,.8,.43),f=vec3(.012,.66,.82),g=vec3(.025,.10,.95),h=vec3(.56,.035,.64);
 float x=clamp(t,0.,.99999)*7.;float s=smoothstep(0.,1.,fract(x));
 if(x<1.)return mix(a,b,s);if(x<2.)return mix(b,c,s);if(x<3.)return mix(c,d,s);if(x<4.)return mix(d,e,s);if(x<5.)return mix(e,f,s);if(x<6.)return mix(f,g,s);return mix(g,h,s);
}
vec3 paintedPigment(vec3 p,vec3 n,float phase){
 float drift=phase*.32;
 vec3 warp=p+vec3(pigmentNoise(p*1.7+2.),pigmentNoise(p*1.4+7.),pigmentNoise(p*1.9-4.))*.48;
 float wash=.5+.42*sin(dot(warp,vec3(1.45,.8,-1.1))+drift);
 float side=.5+.36*sin(dot(warp,vec3(-.75,1.6,1.35))-drift*.7+2.1);
 float under=.5+.32*sin(dot(warp,vec3(.7,-1.1,1.7))+drift*.45-1.9);
 float turn=.5+.5*sin(dot(warp,vec3(.9,.25,-.7))*1.4);
 vec3 colour=mix(pigmentPalette(wash),pigmentPalette(side),.04+turn*.22);
 float underside=(1.-smoothstep(-.8,.55,p.y))*(.12+.15*(1.-smoothstep(-.9,.7,p.y)));
 colour=mix(colour,pigmentPalette(under),underside);
 float glaze=.94+.12*pigmentNoise(p*4.2+vec3(1.2,4.1,8.));
 return colour*glaze;
}
`;
