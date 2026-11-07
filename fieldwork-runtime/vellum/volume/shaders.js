/* Vellum's transported strands and wash, extended to three spatial dimensions. */
(function(root){
  'use strict';
  const quad=`#version 300 es
  precision highp float;out vec2 uv;
  void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
  const volume=`
  const int N=48,TILES=8;const float DOMAIN=5.8;
  ivec2 address(ivec3 p){p=clamp(p,ivec3(0),ivec3(N-1));return ivec2(p.x+(p.z%TILES)*N,p.y+(p.z/TILES)*N);}
  ivec3 cell(){ivec2 p=ivec2(gl_FragCoord.xy);return ivec3(p.x%N,p.y%N,p.x/N+(p.y/N)*TILES);}
  bool boundary(ivec3 p){return any(lessThan(p,ivec3(1)))||any(greaterThan(p,ivec3(N-2)));}
  vec4 get(sampler2D s,ivec3 p){return texelFetch(s,address(p),0);}
  float pressureAt(sampler2D s,ivec3 p){return get(s,clamp(p,ivec3(1),ivec3(N-2))).r;}
  vec4 sampleVolume(sampler2D s,vec3 p){
    p=clamp(p,vec3(.5),vec3(float(N)-1.5));float z=floor(p.z),f=fract(p.z);
    vec2 size=vec2(float(N*TILES),float(N*(N/TILES)));
    vec2 a=(p.xy+.5+vec2(mod(z,float(TILES))*float(N),floor(z/float(TILES))*float(N)))/size;
    z+=1.;vec2 b=(p.xy+.5+vec2(mod(z,float(TILES))*float(N),floor(z/float(TILES))*float(N)))/size;
    return mix(texture(s,a),texture(s,b),f);
  }
  vec3 wall(vec3 v,ivec3 c){if(boundary(c))return vec3(0);if(c.x==N-2)v.x=0.;if(c.y==N-2)v.y=0.;if(c.z==N-2)v.z=0.;return v;}
  vec3 microCurrent(vec3 p,float time){p=p*17.+vec3(time*.31,-time*.23,time*.19);vec3 f=p*2.1+vec3(1.2,4.7,2.3);return vec3(sin(p.y)*cos(p.z),sin(p.z)*cos(p.x),sin(p.x)*cos(p.y))+.35*vec3(sin(f.y)*cos(f.z),sin(f.z)*cos(f.x),sin(f.x)*cos(f.y));}
  `;
  const header=`#version 300 es
  precision highp float;precision highp int;
  in vec2 uv;out vec4 frag;uniform sampler2D u0,u1,u2,u3,u4;
  uniform float dt,time,current,turbulence,memory,diffusion;
  uniform vec4 eddies[6],spins[6],pushes[6];
  ${volume}`;
  const kernels={
    advect:`ivec3 c=cell();if(boundary(c)){frag=vec4(0);return;}
      vec3 q=vec3(c),v=get(u0,c).xyz;v=sampleVolume(u0,q-v*dt).xyz*exp(-dt*.18);
      vec4 channel=get(u1,c);vec3 p=((q+.5)/float(N)-.5)*DOMAIN;
      vec3 target=channel.xyz*float(N)/DOMAIN*current;
      v=mix(v,target,1.-exp(-dt*(1.+channel.w*3.)));
      v+=microCurrent(p*.22,time)*dt*turbulence*.13*channel.w;
      for(int i=0;i<6;i++){vec3 d=p-eddies[i].xyz;float w=exp(-dot(d,d)/(eddies[i].w*eddies[i].w+.001));
        v+=(cross(spins[i].xyz,d)*spins[i].w+pushes[i].xyz)*w*dt*float(N)/DOMAIN;}
      frag=vec4(wall(clamp(v,vec3(-18),vec3(18)),c),1);`,
    curl:`ivec3 c=cell();vec3 l=get(u0,c-ivec3(1,0,0)).xyz,r=get(u0,c+ivec3(1,0,0)).xyz,
      b=get(u0,c-ivec3(0,1,0)).xyz,t=get(u0,c+ivec3(0,1,0)).xyz,d=get(u0,c-ivec3(0,0,1)).xyz,u=get(u0,c+ivec3(0,0,1)).xyz;
      vec3 w=.5*vec3(t.z-b.z-u.y+d.y,u.x-d.x-r.z+l.z,r.y-l.y-t.x+b.x);frag=vec4(w,length(w));`,
    confine:`ivec3 c=cell();vec3 g=.5*vec3(get(u1,c+ivec3(1,0,0)).w-get(u1,c-ivec3(1,0,0)).w,
      get(u1,c+ivec3(0,1,0)).w-get(u1,c-ivec3(0,1,0)).w,get(u1,c+ivec3(0,0,1)).w-get(u1,c-ivec3(0,0,1)).w);
      vec3 v=get(u0,c).xyz+cross(g/(length(g)+.0001),get(u1,c).xyz)*dt*turbulence*1.8;frag=vec4(wall(v,c),1);`,
    divergence:`ivec3 c=cell();if(boundary(c)){frag=vec4(0);return;}vec3 v=get(u0,c).xyz;
      float d=v.x-get(u0,c-ivec3(1,0,0)).x+v.y-get(u0,c-ivec3(0,1,0)).y+v.z-get(u0,c-ivec3(0,0,1)).z;frag=vec4(d,0,0,1);`,
    pressure:`ivec3 c=cell();if(boundary(c)){frag=vec4(0);return;}
      float p=pressureAt(u0,c-ivec3(1,0,0))+pressureAt(u0,c+ivec3(1,0,0))+pressureAt(u0,c-ivec3(0,1,0))+
      pressureAt(u0,c+ivec3(0,1,0))+pressureAt(u0,c-ivec3(0,0,1))+pressureAt(u0,c+ivec3(0,0,1));frag=vec4((p-get(u1,c).r)/6.,0,0,1);`,
    project:`ivec3 c=cell();float p=pressureAt(u1,c);vec3 grad=vec3(pressureAt(u1,c+ivec3(1,0,0)),pressureAt(u1,c+ivec3(0,1,0)),pressureAt(u1,c+ivec3(0,0,1)))-p;frag=vec4(wall(get(u0,c).xyz-grad,c),1);`,
    material:`ivec2 c=ivec2(gl_FragCoord.xy);vec4 p=texelFetch(u0,c,0),rest=texelFetch(u2,c,0);
      if(rest.w==0.){frag=vec4(0);return;}
      vec3 q=(p.xyz/DOMAIN+.5)*float(N)-.5;
      vec4 bank=sampleVolume(u3,q);vec3 v=sampleVolume(u1,q).xyz*DOMAIN/float(N);
      vec3 halfway=p.xyz+v*dt*.5;v=sampleVolume(u1,(halfway/DOMAIN+.5)*float(N)-.5).xyz*DOMAIN/float(N);
      float wet=sampleVolume(u4,q).w;
      v+=microCurrent(p.xyz,time)*(.025+.04*bank.w)*turbulence*wet;
      if(rest.w>4.)v+=(bank.xyz-p.xyz)*memory*.35*bank.w;
      vec3 next=p.xyz+v*dt;
      float anchor=memory*(rest.w>4.?.18:.8);
      next=mix(next,rest.xyz,1.-exp(-dt*anchor));
      vec3 delta=next-rest.xyz;float span=length(delta),limit=rest.w>4.?.85:.65;if(span>limit)next=rest.xyz+delta*(limit/span);
      if(fract(time/24.+fract(rest.w))<dt/24.)next=rest.xyz;
      frag=vec4(next,rest.w);`,
    transport:`ivec3 c=cell();if(boundary(c)){frag=vec4(0);return;}vec3 q=vec3(c),v=get(u1,c).xyz;frag=sampleVolume(u0,q-v*dt);`,
    pigment:`ivec3 c=cell();if(boundary(c)){frag=vec4(0);return;}vec3 q=vec3(c),v=get(u1,c).xyz,back=q-v*dt;
      vec4 transported=get(u2,c),reversed=sampleVolume(u2,q+v*dt),ink=transported+.5*(get(u0,c)-reversed);
      ivec3 a=ivec3(floor(back));vec4 lo=vec4(1e6),hi=vec4(-1e6);
      for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec4 n=get(u0,a+ivec3(x,y,z));lo=min(lo,n);hi=max(hi,n);}
      ink=clamp(ink,lo,hi);
      vec4 neighbors=(get(u0,c-ivec3(1,0,0))+get(u0,c+ivec3(1,0,0))+get(u0,c-ivec3(0,1,0))+get(u0,c+ivec3(0,1,0))+get(u0,c-ivec3(0,0,1))+get(u0,c+ivec3(0,0,1)))/6.;
      vec4 source=get(u3,c);float pool=source.w;
      ink=mix(ink,neighbors,(.004+diffusion*.018)*(1.-pool*.7))*exp(-dt*(.24-pool*.16));
      ink.xyz+=source.xyz*dt*.25;frag=vec4(max(ink.xyz,vec3(0)),pool);`
  };
  const palette=`
  uniform int palette;
  vec3 inkColor(int lineage){
    vec3 a=vec3(.003,.24,.70),b=vec3(.91,.40,.008),c=vec3(.016,.28,.15);
    if(palette==1){a=vec3(.19,.20,.44);b=vec3(.79,.40,.32);c=vec3(.55,.37,.62);}
    if(palette==2){a=vec3(.063,.337,.341);b=vec3(.41,.50,.227);c=vec3(.55,.30,.16);}
    if(palette==3){a=vec3(.13,.23,.59);b=vec3(.62,.24,.18);c=vec3(.75,.59,.22);}
    if(palette==4){a=vec3(.008,.57,.66);b=vec3(.97,.16,.18);c=vec3(1.,.66,.015);}
    if(palette==5){a=vec3(.35,.055,.92);b=vec3(.96,.08,.47);c=vec3(.015,.45,.98);}
    return lineage==0?a:lineage==1?b:c;
  }
  vec3 absorb(int lineage){return -log(max(inkColor(lineage),vec3(.035)));}
  `;
  const inkVertex=`#version 300 es
  precision highp float;precision highp int;
  uniform sampler2D positions,links,shapes,dye;uniform int positionSize,segmentSize;
  uniform mat4 view,projection;uniform vec2 resolution;uniform float time,opacity,threadCount,diffusion;
  ${palette}
  out vec3 vAbsorb;out float vAlpha,vAcross,vWidth;
  vec4 fetchIndex(sampler2D s,int id,int size){return texelFetch(s,ivec2(id%size,id/size),0);}
  void main(){
    int seg=gl_InstanceID,c=gl_VertexID%6;bool end=c==1||c==2||c==4;float side=(c==2||c==4||c==5)?1.:-1.;
    vec4 ids=fetchIndex(links,seg,segmentSize),s=fetchIndex(shapes,seg,segmentSize);
    vec4 a=fetchIndex(positions,int(ids.x),positionSize),b=fetchIndex(positions,int(ids.y),positionSize);
    float stretch=length(b.xyz-a.xyz),dilution=min(1.,(ids.z+.0006)/(stretch+.0006))*(1.-smoothstep(.055,.15,stretch));
    vec4 va=view*vec4(a.xyz,1),vb=view*vec4(b.xyz,1),ca=projection*va,cb=projection*vb;
    vec2 d=(cb.xy/cb.w-ca.xy/ca.w)*resolution;float len=length(d);vec2 perp=vec2(-d.y,d.x)/max(len,.001);
    float load=s.w,type=floor(ids.w),breadth=fract(ids.w);
    float physicalWidth=breadth*resolution.y/(2.*tan(.72/2.)*max(.5,-mix(va.z,vb.z,.5)));
    vWidth=type==1.?clamp(physicalWidth,.65,2.4):type==2.?clamp(physicalWidth*.35,.28,.65):clamp(physicalWidth,.22,.8);
    float fringe=.65;vAcross=side*(vWidth+fringe);
    vec4 clip=end?cb:ca;clip.xy+=perp*vAcross*2./resolution*clip.w;gl_Position=clip;
    float life=fract(time/24.+s.y),fade=smoothstep(0.,.035,life)*(1.-smoothstep(.93,1.,life));
    vAlpha=load*dilution*(.7+.3*sin(s.y*17.))*(.65+.35*pow(.5+.5*sin(s.x*29.-time*.23+s.y),2.));
    ivec3 cell=clamp(ivec3(((end?b.xyz:a.xyz)/5.8+.5)*48.),ivec3(0),ivec3(47));
    ivec2 voxel=ivec2(cell.x+(cell.z%8)*48,cell.y+(cell.z/8)*48);
    float suspension=texelFetch(dye,voxel,0)[int(s.z+.1)];
    float visibility=type==1.?diffusion*1.4:threadCount/14.;
    vAlpha*=fade*(.075+opacity*.18)*visibility*(1.+min(.25,suspension*2.));
    vAbsorb=absorb(int(s.z+.1));
    if(len>resolution.y*.18||len<.001||va.z>-.1||vb.z>-.1)vAlpha=0.;
  }`;
  const inkFragment=`#version 300 es
  precision highp float;in vec3 vAbsorb;in float vAlpha,vAcross,vWidth;
  layout(location=0)out vec4 accumulation;layout(location=1)out vec4 optical;
  void main(){float coverage=clamp(vWidth+.5-abs(vAcross),0.,1.);float a=min(.9,vAlpha)*coverage;
    accumulation=vec4(vAbsorb*a,0);optical=vec4(a,0,0,0);}`;
  const composite=`#version 300 es
  precision highp float;in vec2 uv;out vec4 frag;uniform sampler2D u0;uniform vec2 resolution;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  void main(){
    vec2 p=uv-.5;float vignette=1.-dot(p,p)*.10;
    vec3 paper=vec3(.954,.941,.891)*vignette+(hash(gl_FragCoord.xy)-.5)*.008;
    vec3 depth=texture(u0,uv).rgb*.72;
    frag=vec4(paper*exp(-max(depth,vec3(0))),1);
  }`;
  root.EstuaryShaders={quad,kernels:Object.fromEntries(Object.entries(kernels).map(([k,v])=>[k,header+`void main(){${v}}`])),inkVertex,inkFragment,composite};
})(window);
