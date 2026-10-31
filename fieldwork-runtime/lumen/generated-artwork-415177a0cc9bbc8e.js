var en=Object.defineProperty;var qe=(e,t)=>{for(var n in t)en(e,n,{get:t[n],enumerable:!0})};function lt(e,t,n,i){if(!i)return e;let r=Math.max(0,Math.min(.1,n)),o=t?1:0,s=e.blend+(o-e.blend)*(1-Math.exp(-r/1.2));return Math.abs(o-s)<1e-4&&(s=o),{time:e.time+(t?r:0),blend:s}}var ht=`
float livingGrowth(vec4 life,float time,float blend){
 if(life.x<.5)return 1.;
 float reach=1.5+1.7*sin(time*${(Math.PI*2/32).toFixed(12)}+life.w);
 float amount=clamp(reach-life.y,0.,1.);
 return smoothstep(0.,.12,amount)*(1.-smoothstep(amount,amount+.09,life.z))*blend;
}`;var ut=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`,dt=`#version 300 es
precision highp float;
layout(location=0)in vec3 position;
layout(location=1)in float radius;
layout(location=2)in float facet;
layout(location=3)in vec3 surfaceNormal;
layout(location=4)in vec4 development;
uniform vec2 resolution;
uniform float angle,tilt,distanceToEye,focus,aperture,phase,roll,focusBand,growthTime,growthBlend,lens,handSampling;
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
${ht}
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
 energy=projected*projected/min(size*size,8100.);
 // Keep every sharp grain. Stable weighted sampling limits overlapping bokeh
 // during the extended hand aperture without dimming its transmitted light.
 float sampling=smoothstep(8.,12.,coc)*handSampling;
 if(sampling>0.){
  uint h=uint(gl_VertexID)+1u;
  h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;h^=h>>16u;
  float chance=clamp(64./max(coc*coc,64.),.004,1.);
  float retained=clamp((chance-float(h)/4294967296.)/(chance*.2),0.,1.);
  float weight=mix(1.,retained,sampling);
  if(weight<.0001){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
  energy*=weight/mix(1.,chance*.9,sampling);
 }
 softness=clamp(coc/max(projected,.01),0.,1.);
 tint=spectrum(.5+p.x*.72+p.y*.08+.2*sin(phase));
 sparkle=facet;
}`,pt=`#version 300 es
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
}`,ft=`#version 300 es
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
}`;function mt(e=1){let t=(e+1)*16807,n=()=>(t=t*16807%2147483647,(t-1)/2147483646),i=[],r=[],o=[],s=[],h=[],p=[],u=(f,M)=>f.map((T,L)=>T+M[L]),l=(f,M)=>f.map(T=>T*M),m=(f,M)=>[f[1]*M[2]-f[2]*M[1],f[2]*M[0]-f[0]*M[2],f[0]*M[1]-f[1]*M[0]],d=f=>l(f,1/Math.max(1e-5,Math.hypot(...f))),b=(f,M,T,L)=>{i.push(...f),r.push(M),o.push(n()),s.push(...T),L?h.push(...L):h.push(0,0,0,0)};function v(f,M,T,L,R,I,x){M=d(M);let S=d(m(M,Math.abs(M[1])>.9?[1,0,0]:[0,1,0])),k=m(M,S),U=(n()-.5)*1.15,D=(n()-.5)*1.15,K=O=>u(u(u(f,l(M,T*O)),l(S,T*U*O*O)),l(k,T*D*O*O)),ce={point:K,u:S,v:k,length:T,width:L,phase:I,depth:R,family:x,tangent:d(u(u(M,l(S,2*U)),l(k,2*D)))};if(p.push(ce),R<=0)return;let _=n()<.38?3:2,le=n()*6.283;for(let O=0;O<_;O++){let Re=le+O*6.283/_+(n()-.5)*.9,he=.52+n()*.95,He=d(u(u(l(M,.55+n()*.3),l(S,Math.cos(Re)*he)),l(k,Math.sin(Re)*he)));v(K(.8+n()*.2),He,T*(.7+n()*.13),L*(.77+n()*.12),R-1,I+O*2.4,x)}}let E=[[-.85,-.35,.26],[.65,.18,.52],[.17,.91,-.26],[-.18,-.85,-.38],[.43,.4,-.65],[-.42,.55,.1],[.04,-.1,.85]];for(let f=0;f<E.length;f++){let M=d(u(E[f],[(n()-.5)*.22,(n()-.5)*.22,(n()-.5)*.22]));v(l(M,.025),M,.2+n()*.13,.035+n()*.016,5,f*1.9,f*.83)}let F=0;for(let f of p)f.weight=f.length*Math.sqrt(f.width),F+=f.weight;for(let f of p){let M=Math.max(6,Math.round(28e4*f.weight/F));for(let T=0;T<M;T++){let L=n(),R=n()*Math.PI*2,I=f.point(L),x=1+.24*Math.sin(L*21+f.phase)+.18*Math.cos(L*37-f.phase),S=f.width*(1-L*.3)*x,k=S*(.91+n()*.18),U=u(u(I,l(f.u,Math.cos(R)*k)),l(f.v,Math.sin(R)*k)),D=Math.max(7e-4,f.width*(.065+n()*.115));if(b(U,D,d(u(l(f.u,Math.cos(R)),l(f.v,Math.sin(R))))),T%7===0){let K=u(I,u(l(f.u,Math.cos(R)*S*1.13),l(f.v,Math.sin(R)*S*1.13)));b(K,D*(.7+n()*.5),d(u(l(f.u,Math.cos(R)),l(f.v,Math.sin(R)))))}}}let B=r.length,P=0;for(let f=0;f<i.length;f+=3)P=Math.max(P,Math.hypot(i[f],i[f+1],i[f+2]));let W=1.25/P,te=[];function ne(f,M,T,L,R,I){M=d(M);let x=d(m(M,Math.abs(M[1])>.9?[1,0,0]:[0,1,0])),S=m(M,x),k=(n()-.5)*.7,U=(n()-.5)*.7,D=_=>u(u(u(f,l(M,T*_)),l(x,T*k*_*_)),l(S,T*U*_*_)),K=d(u(u(M,l(x,2*k)),l(S,2*U)));if(te.push({point:D,u:x,v:S,length:T,width:L,generation:R,family:I}),R>=2)return;let ce=n()*Math.PI*2;for(let _=0;_<2;_++){let le=ce+_*Math.PI,O=d(u(u(l(K,.8),l(x,Math.cos(le)*.65)),l(S,Math.sin(le)*.65)));ne(D(1),O,T*.65,L*.62,R+1,I)}}for(let f of p){if(f.depth!==0)continue;let M=n()*Math.PI*2;for(let T=0;T<2;T++){let L=M+T*Math.PI,R=d(u(u(l(f.tangent,.85),l(f.u,Math.cos(L)*.7)),l(f.v,Math.sin(L)*.7)));ne(f.point(1),R,f.length*.82,f.width*.5,0,f.family+.16*Math.sin(f.phase))}}let ae=0;for(let f of te)f.weight=f.length*Math.sqrt(f.width),ae+=f.weight;for(let f of te){let M=Math.max(5,Math.round(115e3*f.weight/ae));for(let T=0;T<M;T++){let L=n(),R=n()*Math.PI*2,I=f.point(L),x=d(u(l(f.u,Math.cos(R)),l(f.v,Math.sin(R)))),S=f.width*(1-L*.42)*(.92+n()*.16)*(1+.17*Math.sin(L*21+f.family)),k=u(I,l(x,S));b(k,Math.max(7e-4,f.width*(.12+n()*.14)),x,[1,f.generation,L,f.family])}}for(let f=0;f<i.length;f++)i[f]*=W;for(let f=0;f<r.length;f++)r[f]*=W;return{positions:new Float32Array(i),radii:new Float32Array(r),facets:new Float32Array(o),normals:new Float32Array(s),development:new Float32Array(h),baseCount:B,count:r.length}}var X=[{id:"oil",name:"Fractal oil",group:"Sculpted fractals",engine:"field",description:"Folded matter, catching light like wet paint.",angle:.48,tilt:.2},{id:"coral",name:"Living coral",group:"Branching forms",engine:"grains",growth:!0,description:"A crystalline colony, unfolding into finer branches."},{id:"lorenz",name:"Lorenz wings",group:"Strange attractors",engine:"grains",description:"Two intertwined wings, woven from a chaotic flow."},{id:"rossler",name:"R\xF6ssler ribbon",group:"Strange attractors",engine:"grains",description:"A spiralling ribbon that folds back through itself."},{id:"aizawa",name:"Aizawa vessel",group:"Strange attractors",engine:"grains",description:"A tangled vessel, with a narrow passage through its heart."},{id:"thomas",name:"Thomas labyrinth",group:"Strange attractors",engine:"grains",description:"A soft, threefold maze of continuous wandering."},{id:"antler",name:"Antler grove",group:"Branching forms",engine:"grains",growth:!0,description:"Open limbs divide into a delicate, breathing crown."},{id:"fern",name:"Glass fern",group:"Recursive geometry",engine:"grains",description:"A fern-like recursion, lifted into a thin, curling volume."},{id:"sierpinski",name:"Sierpi\u0144ski crystal",group:"Recursive geometry",engine:"grains",description:"Triangular chambers nested inside a suspended crystal."},{id:"julia",name:"Julia lace",group:"Sculpted fractals",engine:"field",description:"A porous, folded lattice at the edge of coming apart.",angle:.48,tilt:.2},{id:"bulb",name:"Mandelbulb",group:"Sculpted fractals",engine:"field",description:"A dense world of endlessly repeated buds and ridges.",angle:.48,tilt:.2}];function Ge(e){return X.find(t=>t.id===e)||X.find(t=>t.id==="coral")}var q=(e,t)=>e.map((n,i)=>n+t[i]),z=(e,t)=>e.map(n=>n*t),Le=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],ue=e=>z(e,1/Math.max(1e-8,Math.hypot(...e)));function ke(e){let t=(e+7)*16807%2147483647;return()=>(t=t*16807%2147483647,(t-1)/2147483646)}function Pe(e,t,n,i,r,o){let s=t.length,h=[1/0,1/0,1/0],p=[-1/0,-1/0,-1/0];for(let d=0;d<e.length;d++){let b=d%3;h[b]=Math.min(h[b],e[d]),p[b]=Math.max(p[b],e[d])}let u=h.map((d,b)=>(d+p[b])*.5),l=0;for(let d=0;d<s;d++){let b=d*3;for(let v=0;v<3;v++)e[b+v]-=u[v];l=Math.max(l,Math.hypot(e[b],e[b+1],e[b+2]))}let m=1.2/Math.max(1e-5,l);for(let d=0;d<e.length;d++)e[d]*=m;for(let d=0;d<t.length;d++)t[d]*=m;return{positions:new Float32Array(e),radii:new Float32Array(t),normals:new Float32Array(n),facets:new Float32Array(i),development:new Float32Array(r||s*4),count:s,baseCount:o??s}}var vt={lorenz:{dt:.007,initial:[.1,.2,.1],flow:([e,t,n])=>[10*(t-e),e*(28-n)-t,e*t-8*n/3],view:([e,t,n])=>[e,n,t],thickness:.055},rossler:{dt:.025,initial:[.1,.1,.1],flow:([e,t,n])=>[-t-n,e+.2*t,.2+n*(e-5.7)],view:([e,t,n])=>[e,t,n],thickness:.025},aizawa:{dt:.012,initial:[.1,0,0],flow:([e,t,n])=>[(n-.7)*e-3.5*t,3.5*e+(n-.7)*t,.6+.95*n-n*n*n/3-(e*e+t*t)*(1+.25*n)+.1*n*e*e*e],view:([e,t,n])=>[e,.75*n-.66*t,.66*n+.75*t],thickness:.0055},thomas:{dt:.045,initial:[.1,.2,.3],flow:([e,t,n])=>[Math.sin(t)-.208186*e,Math.sin(n)-.208186*t,Math.sin(e)-.208186*n],view:e=>e,thickness:.015}};function gt(e,t,n){let i=n(e),r=n(q(e,z(i,t*.5))),o=n(q(e,z(r,t*.5))),s=n(q(e,z(o,t)));return e.map((h,p)=>h+t*(i[p]+2*r[p]+2*o[p]+s[p])/6)}function tn(e,t){let n=vt[e],i=ke(t),r=[],o=[],s=[],h=[],p=n.initial.map(u=>u+(i()-.5)*.02);for(let u=0;u<3500;u++)p=gt(p,n.dt,n.flow);for(let u=0;u<78e3;u++){let l=gt(p,n.dt,n.flow),m=n.view(p),d=ue(n.view(l).map((E,F)=>E-m[F])),b=ue(Le(d,Math.abs(d[1])>.9?[1,0,0]:[0,1,0])),v=Le(d,b);for(let E=0;E<3;E++){let F=i()*Math.PI*2,B=q(z(b,Math.cos(F)),z(v,Math.sin(F))),P=n.thickness*(.75+i()*.5),W=q(m,z(B,P));r.push(...W),s.push(...B),o.push(n.thickness*(.72+i()*.96)),h.push(i())}if(p=l,!p.every(Number.isFinite)||Math.hypot(...p)>1e3)throw Error("The flow escaped its bounded study.")}return Pe(r,o,s,h)}function nn(e){let t=ke(e),n=[],i=[],r=[],o=[],s=0,h=0,p=0;for(let u=0;u<245e3;u++){let l=t(),m=s,d=h;if(l<.01?(s=0,h=.16*d,p*=.2):l<.86?(s=.85*m+.04*d,h=-.04*m+.85*d+1.6,p=.85*p+.026*Math.sin(m*2.4)):l<.93?(s=.2*m-.26*d,h=.23*m+.22*d+1.6,p=.2*p+.11*m+.08):(s=-.15*m+.28*d,h=.26*m+.24*d+.44,p=.2*p-.11*m-.08),u<30)continue;let b=ue([t()-.5,t()-.5,(t()>.5?1:-1)*(.5+t())]);n.push(s+b[0]*.008,h+b[1]*.008,p+b[2]*.014+.15*Math.sin(h*.8)),r.push(...b),i.push(.006+t()*.007),o.push(t())}return Pe(n,i,r,o)}function an(e){let t=ke(e),n=[],i=[],r=[],o=[],s=[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],h=[0,0,0];for(let p=0;p<240020;p++){let u=s[Math.floor(t()*4)];if(h=h.map((m,d)=>(m+u[d])*.5),p<20)continue;let l=ue(h.map((m,d)=>m+(t()-.5)*.2));n.push(...h),r.push(...l),i.push(.0019+t()*.0021),o.push(t())}return Pe(n,i,r,o)}function sn(e){let t=ke(e),n=[];function i(d,b,v,E,F,B){b=ue(b);let P=ue(Le(b,Math.abs(b[1])>.9?[1,0,0]:[0,1,0])),W=Le(b,P),te=(t()-.5)*.8,ne=(t()-.5)*.8,ae=T=>q(q(q(d,z(b,v*T)),z(P,v*te*T*T)),z(W,v*ne*T*T));if(n.push({point:ae,u:P,v:W,length:v,width:E,level:F,family:B}),F===6)return;let f=t()<.2?3:2,M=t()*6.283;for(let T=0;T<f;T++){let L=M+T*6.283/f,R=.5+t()*.5,I=q(q(z(b,.7),z(P,Math.cos(L)*R)),z(W,Math.sin(L)*R));i(ae(.93),I,v*(.65+t()*.1),E*.65,F+1,B)}}for(let d=0;d<5;d++){let b=d*Math.PI*2/5;i([0,-.5,0],[Math.cos(b)*.65,.8,Math.sin(b)*.65],.6,.028,0,d*.9)}let r=0;for(let d of n)d.weight=d.length*Math.sqrt(d.width),r+=d.weight;let o=[],s=[],h=[],p=[],u=[],l=[...n.filter(d=>d.level<4),...n.filter(d=>d.level>=4)],m=0;for(let d of l){let b=Math.max(6,Math.round(27e4*d.weight/r));for(let v=0;v<b;v++){let E=t(),F=t()*6.283,B=q(z(d.u,Math.cos(F)),z(d.v,Math.sin(F))),P=d.width*(1-E*.55)*(1+.12*Math.sin(E*30));o.push(...q(d.point(E),z(B,P))),h.push(...B),s.push(Math.max(.0014,d.width*(.2+t()*.32))),p.push(t()),u.push(...d.level>=4?[1,d.level-4,E,d.family]:[0,0,0,0]),d.level<4&&m++}}return Pe(o,s,h,p,u,m)}function yt(e,t=1){if(e==="coral")return mt(t);if(vt[e])return tn(e,t);if(e==="fern")return nn(t);if(e==="sierpinski")return an(t);if(e==="antler")return sn(t);throw Error("This study uses the sculpted fractal renderer.")}var Ve={};qe(Ve,{display:()=>Q,specimen:()=>rn,vertex:()=>Xe});var de=`
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
`,pe=`
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
`,Q=`#version 300 es
precision highp float;
in vec2 uv;out vec4 frag;
uniform sampler2D image;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 c=texture(image,uv).rgb;c=pow(aces(c*1.5),vec3(.454545));frag=vec4(c,1.);}
`;var fe=`
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
`;var Xe=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`,rn=`#version 300 es
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
${fe}
${de}
${pe}
`;var je={};qe(je,{display:()=>Q,specimen:()=>cn,vertex:()=>on});var on=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`,cn=`#version 300 es
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
 vec3 z=p;
 vec3 c=vec3(-.18,.89,.14+seed*.005);
 float dr=1.,r=0.;float power=3.;
 for(int i=0;i<10;i++){
  r=length(z);if(r>3.)break;
  float sr=max(r,.00001);
  float theta=acos(clamp(z.z/sr,-1.,1.)),phi=atan(z.y,z.x);
  dr=pow(sr,power-1.)*power*dr;
  float zr=pow(sr,power);theta*=power;phi*=power;
  z=zr*vec3(sin(theta)*cos(phi),sin(phi)*sin(theta),cos(theta))+c;
 }
 return .5*log(max(r,.00001))*r/max(dr,.00001)*.7;
}
${fe}
${de}
${pe}
`;var We={};qe(We,{display:()=>Q,specimen:()=>hn,vertex:()=>ln});var ln=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`,hn=`#version 300 es
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
${fe}
${de}
${pe}
`;var V=(e,t,n)=>Math.max(t,Math.min(n,e)),ie=e=>{let t=[...e].sort((n,i)=>n-i);return t[t.length>>1]},un=(e,t)=>Math.hypot(e.x-t.x,e.y-t.y,(e.z??0)-(t.z??0)),dn=e=>e[0].map((t,n)=>ie(e.map(i=>i[n])));function bt(e,t,n=4/3){if(!e||e.length!==21||!e.every(v=>[v.x,v.y].every(Number.isFinite)))return null;let i=(v,E)=>Math.hypot((e[v].x-e[E].x)*n,e[v].y-e[E].y),r=[[0,9],[0,13],[0,17],[9,17]],o=ie(r.map(([v,E])=>i(v,E)));if(o<.025||o>1.2)return{valid:!1,palm:o};let s=i(4,8)/Math.max(o,.025),h={valid:!0,focusValid:!1,palm:o,depthSamples:r.map(([v,E])=>i(v,E)),facing:0,separation:s};if(!t||t.length!==21||!t.every(v=>[v.x,v.y,v.z].every(Number.isFinite)))return h;let p={x:t[5].x-t[0].x,y:t[5].y-t[0].y,z:t[5].z-t[0].z},u={x:t[17].x-t[0].x,y:t[17].y-t[0].y,z:t[17].z-t[0].z},l=[p.y*u.z-p.z*u.y,p.z*u.x-p.x*u.z,p.x*u.y-p.y*u.x],m=Math.abs(l[2])/Math.max(1e-6,Math.hypot(...l)),d=[];for(let[v,E]of r){let F=Math.hypot(t[v].x-t[E].x,t[v].y-t[E].y);if(F<.008)return{...h,facing:m};d.push(i(v,E)*un(t[v],t[E])/F)}let b=ie(d);return{valid:!0,focusValid:m>=.5&&b>=.04&&b<=.85,palm:b,depthSamples:d,facing:m,separation:s}}function xt(e,t,n,i,r,o){let s=2/r,h=e-n,p=(t+s*h)*i,u=Math.exp(-s*i),l=n+(h+p)*u,m=e+V(l-e,-o*i,o*i);return[m,m===l?(t-s*p)*u:(m-e)/Math.max(i,1e-5)]}var Ce=class{constructor(){this.enabled=!1,this.status="off",this.focusOffset=-.4,this.aperture=.64,this.detail=0,this.vFocus=0,this.vAperture=0,this.lastValid=-1/0}start({focusOffset:t=-.4,aperture:n=.64}={}){this.enabled=!0,this.focusOffset=V(t,-1.1,1.1),this.aperture=V(n,0,4.5),this.detail=Math.pow(this.aperture/4.5,1/1.6),this.targetFocus=this.focusOffset,this.targetAperture=this.aperture,this.calibrate()}begin(t){this.phase=t,this.status="calibrating-"+t,this.calibration=[],this.anchor=this.focusOffset,this.targetFocus=this.focusOffset,this.targetAperture=this.aperture,this.vFocus=this.vAperture=0,this.lastInput=null,this.lastValid=-1/0,this.lastResult=null,this.resultInterval=.1,this.missingSince=null}calibrate(){this.pinchOpen=null,this.pinchClosed=null,this.neutral=null,this.poseCorrection=[1,1,1,1],this.begin("open")}recentre(){if(this.pinchOpen===null||this.pinchClosed===null){this.calibrate();return}this.begin("centre")}stop(){this.enabled=!1,this.status="off",this.vFocus=this.vAperture=0}hold(t){this.status=t,this.targetFocus=this.focusOffset,this.targetAperture=this.aperture,this.vFocus=this.vAperture=0}closure(t){let n=V((this.pinchOpen-t)/Math.max(.15,this.pinchOpen-this.pinchClosed),0,1);return n<.025?0:n>.975?1:n}calibrateSample(t,n){if(this.status="calibrating-"+this.phase,this.phase!=="pinch"&&!t.focusValid||this.phase==="open"&&t.separation<.5||this.phase==="pinch"&&t.separation>Math.min(.18,this.pinchOpen-.28))return!1;let i=this.calibration;for(;i.length&&n-i[0].time>Math.max(1.4,this.resultInterval*10);)i.shift();for(i.length&&(Math.abs(Math.log(t.palm/ie(i.map(s=>s.palm))))>.14||Math.abs(t.separation-ie(i.map(s=>s.separation)))>.22)&&(i.length=0),i.push({...t,depthSamples:this.phase==="pinch"&&!t.focusValid?this.openDepth:t.depthSamples,time:n});i.length>24;)i.shift();if(i.length<Math.max(4,Math.min(8,Math.ceil(.65/this.resultInterval)))||n-i[0].time<.65)return!1;let r=ie(i.map(s=>s.separation)),o=dn(i.map(s=>s.depthSamples));if(this.phase==="open")return this.pinchOpen=r,this.openDepth=o,this.phase="pinch",this.status="calibrating-pinch",this.calibration=[],!1;if(this.phase==="pinch")this.pinchClosed=r,this.poseCorrection=o.map((s,h)=>V(s/this.openDepth[h],.8,1.25)),this.neutral=this.openDepth;else{let s=this.closure(r);this.neutral=o.map((h,p)=>h/Math.pow(this.poseCorrection[p],s))}return this.phase=null,this.calibration=[],this.filteredSeparation=r,this.filteredTravel=0,this.lastInput=n,this.status="tracking",this.vFocus=this.vAperture=0,!0}ingest(t,n){if(!this.enabled)return;if(this.lastResult!==null&&(this.resultInterval=V(this.resultInterval*.7+(n-this.lastResult)*.3,.05,2)),this.lastResult=n,!t?.valid){if(this.phase){this.status="calibrating-"+this.phase;return}this.missingSince??=n,n-this.missingSince>.3&&this.hold(t?"turn-palm":"holding");return}if(this.lastValid=n,this.missingSince=null,this.phase&&!this.calibrateSample(t,n))return;let i=V(n-(this.lastInput??n-.06),.001,1);this.lastInput=n,this.filteredSeparation+=(t.separation-this.filteredSeparation)*(1-Math.exp(-i/.09));let r=this.closure(this.filteredSeparation);if(this.detail=r,this.targetAperture=4.5*Math.pow(r,1.6),this.status=t.focusValid?"tracking":"focus-held",t.focusValid){let o=t.depthSamples.map((u,l)=>Math.log(u/(this.neutral[l]*Math.pow(this.poseCorrection[l],r)))),s=ie(o);this.filteredTravel+=(s-this.filteredTravel)*(1-Math.exp(-i/.2));let h=Math.sign(this.filteredTravel)*Math.max(0,Math.abs(this.filteredTravel)-.012),p=V(this.anchor+h/Math.log(1.35),-1.05,1.05);Math.abs(p-this.targetFocus)>.012&&(this.targetFocus=p)}else this.targetFocus=this.focusOffset,this.vFocus=0}step(t,n){if(!this.enabled)return!1;let i=Math.max(1.5,this.resultInterval*4);n-this.lastResult>i&&["tracking","focus-held"].includes(this.status)&&this.hold("holding");let r=V(t,0,.05),o=this.focusOffset,s=this.aperture;["tracking","focus-held"].includes(this.status)&&(this.status==="tracking"&&([this.focusOffset,this.vFocus]=xt(this.focusOffset,this.vFocus,this.targetFocus,r,.24,1.2)),[this.aperture,this.vAperture]=xt(this.aperture,this.vAperture,this.targetAperture,r,.19,8));let h=V(this.focusOffset,-1.1,1.1),p=V(this.aperture,0,4.5);return h!==this.focusOffset&&(this.vFocus=0),p!==this.aperture&&(this.vAperture=0),this.focusOffset=h,this.aperture=p,Math.abs(h-o)>1e-7||Math.abs(p-s)>1e-7}};var De=class{constructor({onResult:t,onEnded:n=()=>{}}){this.onResult=t,this.onEnded=n,this.generation=0,this.stream=null,this.worker=null,this.enabled=!1}async start(t){let n=++this.generation;this.enabled=!0;let i="./generated-hands-120d366ea41352d1.js",r=new Worker(new URL(i,import.meta.url));this.worker=r;let o,s=new Promise((h,p)=>{let u;o=()=>{u=setTimeout(()=>p(Error("The local hand tracker took too long to load.")),25e3)},this.cancelLoading=()=>{clearTimeout(u),p(new DOMException("Camera loading cancelled.","AbortError"))},r.onmessage=({data:l})=>{l.type==="ready"?(clearTimeout(u),this.cancelLoading=null,h()):l.type==="result"?(this.busy=!1,this.onResult(l)):l.type==="error"&&(clearTimeout(u),p(Error(l.message)),this.busy=!1,this.ready&&this.onEnded(Error(l.message)))},r.onerror=l=>{clearTimeout(u);let m=Error(l.message||"This browser could not start the local hand tracker.");p(m),this.ready&&this.onEnded(m)}});s.catch(()=>{});try{if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error("Camera access needs localhost or an HTTPS page.");let h=await navigator.mediaDevices.getUserMedia({audio:!1,video:{facingMode:"user",width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:24}}});if(n!==this.generation)throw h.getTracks().forEach(u=>u.stop()),new DOMException("Camera loading cancelled.","AbortError");this.stream=h,this.video=t,t.srcObject=h;for(let u of h.getVideoTracks())u.addEventListener("ended",()=>{this.enabled&&this.onEnded(Error("The camera was disconnected."))},{once:!0});if(o(),r.postMessage({type:"init"}),await Promise.all([s,t.play()]),n!==this.generation)throw new DOMException("Camera loading cancelled.","AbortError");this.ready=!0,this.busy=!1,this.lastFrame=-1,this.lastVideoTime=-1;let p=async u=>{if(this.frame=requestAnimationFrame(p),!(!this.enabled||document.hidden||this.busy||u-this.lastFrame<65||t.readyState<2)){this.busy=!0,this.lastFrame=u,this.lastVideoTime=t.currentTime;try{let l=await createImageBitmap(t,{resizeWidth:640,resizeHeight:Math.round(640*t.videoHeight/t.videoWidth)});if(n!==this.generation){l.close();return}r.postMessage({type:"frame",bitmap:l,timestamp:performance.now()},[l])}catch(l){this.busy=!1,n===this.generation&&this.onEnded(l)}}};this.frame=requestAnimationFrame(p)}catch(h){throw n===this.generation&&this.stop(),h}}stop(){this.enabled=!1,this.ready=!1,++this.generation,cancelAnimationFrame(this.frame),this.cancelLoading?.(),this.cancelLoading=null,this.worker?.terminate(),this.worker=null,this.stream?.getTracks().forEach(t=>t.stop()),this.stream=null,this.video&&(this.video.pause(),this.video.srcObject=null),this.busy=!1}};var wt={loading:{step:0,title:"A little closer to the light.",text:"Allow camera access to begin. Your hand stays on this device.",hint:"Preparing your hand lens"},open:{step:1,title:"Open your hand to the camera.",text:"Spread your thumb and index finger. An open hand brings the whole sculpture into focus.",hint:"Palm towards the camera. Hold for a moment."},pinch:{step:2,title:"Now, touch your fingertips.",text:"Bring thumb and index together. A tiny slice stays sharp as the rest falls softly out of focus.",hint:"Keep your hand at the same distance. Hold briefly."},push:{step:3,title:"Push gently towards the camera.",text:"Keep a little pinch. Reach forward to move that sharp slice deeper into the sculpture.",hint:"Move from your elbow, with your palm facing the camera."},pull:{step:4,title:"And slowly, draw your hand back.",text:"Bring the focus towards you. Open and close your fingers to choose how much you see.",hint:"A small movement is enough."},ready:{step:4,title:"The light is in your hands.",text:"Open to see the whole. Pinch for a sliver of detail. Push and pull to wander through it.",hint:"Explore at your own pace."},centre:{step:0,title:"Find a comfortable distance.",text:"Hold your hand still for a moment. We\u2019ll bring the focus back to you.",hint:"Your finger range stays calibrated."}},_e=class{constructor(){this.reset()}reset(){this.stage=null,this.elapsed=0,this.held=0,this.anchor=null,this.finished=!1}start(){this.reset(),this.stage="loading"}dismiss(){this.stage=null,this.finished=!0}update(t,n,i=0){if(t==="off"||t==="error")return this.reset(),null;if(this.finished)return null;let r={"calibrating-open":"open","calibrating-pinch":"pinch","calibrating-centre":"centre"}[t];if(r)this.stage=r,this.anchor=null,this.elapsed=this.held=0;else if(t==="loading")this.stage="loading";else if(t==="tracking"){let s=Math.max(0,Math.min(.1,i));if(["open","pinch"].includes(this.stage))this.stage="push",this.anchor=n.focusOffset,this.elapsed=this.held=0;else{if(this.stage==="centre")return this.dismiss(),null;if(this.stage==="push"||this.stage==="pull"){this.elapsed+=s;let h=n.focusOffset-this.anchor,p=this.stage==="push"?h>.13:h<-.13;this.held=p?this.held+s:0,this.held>.18&&(this.stage=this.stage==="push"?"pull":"ready",this.anchor=n.focusOffset,this.elapsed=this.held=0)}else if(this.stage==="ready"&&(this.elapsed+=s,this.elapsed>4))return this.dismiss(),null}}if(!this.stage)return null;let o=t==="holding"||t==="reacquiring"?"Bring your hand back into view. Your lens is held steady.":t==="focus-held"||t==="turn-palm"?"Turn your palm towards the camera to explore depth.":wt[this.stage].hint;return{...wt[this.stage],stage:this.stage,hint:o,leaving:this.stage==="ready"&&this.elapsed>3.1,canDismiss:["push","pull","ready"].includes(this.stage)}}};var y=e=>document.getElementById(e),Et={"calibrating-open":"Spread your thumb and index finger comfortably. Keep your palm facing the camera and hold still for a moment.","calibrating-pinch":"Now touch thumb and index finger together and hold. Keep your hand at the same distance.","calibrating-centre":"Hold your hand at a comfortable distance for a moment. Your finger range stays calibrated.","focus-held":"Pinch control is active. Turn your palm towards the camera to resume push and pull focus.",tracking:"Open to see the whole. Pinch for detail. Push and pull to explore depth.",holding:"Lens held. Bring the same hand back into view to continue.","turn-palm":"Lens held. Turn your palm towards the camera.",reacquiring:"Finding your hand again. The lens is held steady."},ze=class{constructor({readLens:t,onChange:n,closeStudio:i,onReturnToCinema:r=()=>{}}){this.errorMessage=null,this.readLens=t,this.onChange=n,this.onReturnToCinema=r,this.controls=new Ce,this.guide=new _e,this.guideStage=null,this.pending=!1,this.request=0,this.status="off",this.camera=new De({onResult:o=>{let s=y("hand-video"),h=bt(o.landmarks,o.world,s.videoWidth/Math.max(1,s.videoHeight));document.body.dataset.handDetection=o.landmarks?"visible":"not-found",document.body.dataset.handInferenceMs=String(Math.round(o.inferenceMs??0)),document.body.dataset.handBackend=o.backend??"CPU",this.controls.ingest(h,performance.now()/1e3),this.sync()},onEnded:o=>this.fail(o)}),y("hands").onclick=()=>{i(),this.panel(y("hand-panel").hidden)},y("hand-close").onclick=()=>this.panel(!1),y("hand-enable").onclick=()=>this.start(),y("hand-stop").onclick=y("hand-quick-stop").onclick=()=>this.returnToCinema(),y("hand-recentre").onclick=()=>{this.guide.start(),this.controls.recentre(),this.panel(!1),this.sync()},y("hand-recalibrate").onclick=()=>{this.guide.start(),this.controls.calibrate(),this.panel(!1),this.sync()},y("hand-guide-skip").onclick=()=>{this.guide.dismiss(),this.syncGuide()},y("hand-guide-stop").onclick=()=>this.returnToCinema(),y("hand-preview-toggle").onclick=()=>{let o=!document.body.classList.contains("hand-preview-visible");document.body.classList.toggle("hand-preview-visible",o),y("hand-video").setAttribute("aria-hidden",String(!o)),y("hand-preview-toggle").setAttribute("aria-pressed",o),y("hand-preview-toggle").textContent=o?"Hide camera preview":"Show camera preview"},addEventListener("pagehide",()=>this.stop()),this.sync()}get active(){return this.controls.enabled}get busy(){return this.pending||this.active}panel(t){y("hand-panel").hidden=!t,y("hands").setAttribute("aria-expanded",String(t))}async start(){if(this.busy)return;this.errorMessage=null;let t=++this.request;this.pending=!0,this.status="loading",this.guide.start(),this.panel(!1),this.sync();try{if(await this.camera.start(y("hand-video")),t!==this.request)return;this.controls.start(this.readLens()),this.pending=!1,this.sync()}catch(n){t===this.request&&n.name!=="AbortError"&&this.fail(n)}}fail(t){this.stop(),this.status="error";let n=t.name==="NotAllowedError"||t.name==="PermissionDeniedError",i=t.name==="NotFoundError"||t.name==="DevicesNotFoundError";this.errorMessage=n?"Camera access was not allowed. You can enable it in your browser and try again.":i?"No webcam was found. Connect one and try again.":t.name==="NotReadableError"?"The camera is busy. Close the other camera app and try again.":t.message,this.panel(!0),this.sync()}stop(){this.errorMessage=null,++this.request,this.camera.stop(),this.controls.stop(),this.guide.reset(),this.pending=!1,this.status="off",y("hand-preview-wrap").hidden=!0,document.body.classList.remove("hand-preview-visible"),y("hand-video").setAttribute("aria-hidden","true"),y("hand-preview-toggle").setAttribute("aria-pressed","false"),y("hand-preview-toggle").textContent="Show camera preview",this.sync()}returnToCinema(){this.stop(),this.panel(!1),this.onReturnToCinema()}tick(t){let n=this.controls.step(t,performance.now()/1e3);return this.sync(!1),this.syncGuide(t),n}syncGuide(t=0){let n=this.guide.update(this.status,this.controls,t),i=y("hand-guide");if(i.hidden=!n,document.body.classList.toggle("hand-guiding",!!n),!n){this.guideStage=null;return}if(i.dataset.leaving=String(n.leaving),this.guideStage!==n.stage){this.guideStage=n.stage,i.dataset.step=n.stage,y("hand-guide-title").textContent=n.title,y("hand-guide-copy").textContent=n.text,matchMedia("(prefers-reduced-motion: reduce)").matches||i.querySelector(".hand-guide-words").animate([{opacity:0,transform:"translateY(5px)"},{opacity:1,transform:"translateY(0)"}],{duration:650,easing:"cubic-bezier(.2,.7,.2,1)"}),y("hand-guide-count").textContent=n.step?"Hand lens \xB7 "+String(n.step).padStart(2,"0")+" / 04":"Hand lens";for(let[o,s]of[...y("hand-guide-steps").children].entries())s.dataset.complete=String(o<n.step);y("hand-guide-skip").hidden=!n.canDismiss}let r=this.active&&document.body.dataset.handDetection==="not-found"?"Bring your whole hand into view, with your palm towards the camera.":n.hint;y("hand-guide-hint").textContent!==r&&(y("hand-guide-hint").textContent=r)}sync(t=!0){let n=this.errorMessage?"error":this.pending?"loading":this.active?this.controls.status:"off",i=n!==this.status;if(this.status=n,this.syncGuide(),!t&&!i){this.active&&!y("hand-panel").hidden&&(y("hand-detail").value=this.controls.detail,y("hand-depth").value=(this.controls.focusOffset+1.05)/2.1,y("hand-detail-value").textContent=Math.round(this.controls.detail*100)+"%");return}let r=this.busy;y("hand-preview-wrap").hidden=!r,y("hand-enable").hidden=r,y("hand-active-controls").hidden=!r,y("hand-recentre").disabled=this.pending||this.controls.pinchClosed==null,y("hand-recalibrate").disabled=this.pending,y("hand-preview-toggle").hidden=!this.active,y("hand-readouts").hidden=!this.active,y("hand-indicator").hidden=!r,y("hands").setAttribute("aria-pressed",String(r)),(t||i)&&(n==="error"?y("hand-message").textContent=this.errorMessage:n==="loading"?y("hand-message").textContent="Allow camera access when prompted. Loading the local hand tracker\u2026":this.active?y("hand-message").textContent=Et[n]??Et["calibrating-open"]:y("hand-message").textContent="Enable the camera, then spread your thumb and index finger. Touch them together when prompted, keeping your hand at the same distance.");let o=n==="tracking"?"Hand lens \xB7 Tracking":n==="focus-held"?"Hand lens \xB7 Focus held":n==="loading"?"Hand lens \xB7 Starting camera":n==="calibrating-open"?"Hand lens \xB7 Open fingers":n==="calibrating-pinch"?"Hand lens \xB7 Touch fingertips":n==="calibrating-centre"?"Hand lens \xB7 Re-centring":"Hand lens \xB7 Held";y("hand-indicator-text").textContent!==o&&(y("hand-indicator-text").textContent=o),y("hand-detail").value=this.controls.detail,y("hand-depth").value=(this.controls.focusOffset+1.05)/2.1,y("hand-detail-value").textContent=Math.round(this.controls.detail*100)+"%",document.body.dataset.handLens=n,(t||i)&&this.onChange()}};var Mt=(e,t,n)=>Math.max(t,Math.min(n,e));function Tt(e,t,n,i){if(!i)return e;let r=Mt(n,0,.1),o=t?1:0,s=e.blend+(o-e.blend)*(1-Math.exp(-r/2));return Math.abs(s-o)<1e-4&&(s=o),{time:e.time+r,blend:s}}function $e(e,t=.5,n={time:0,blend:0},i="grains"){let r=n.blend*(.19*Math.sin(n.time*.105)+.07*Math.sin(n.time*.173)),o=Mt(t+r,0,1),s=o<.5?Math.exp((1-o*2)*Math.log(.6)):Math.exp((o*2-1)*Math.log(2.4)),h=i==="field",p=h?4.6+(e.distanceToEye-11.5)*.4:e.distanceToEye,u=h?4.05+(e.focus-11.1)*.4:e.focus;return{...e,distanceToEye:p*s,focus:u+p*(s-1),aperture:e.aperture*(h?.078125:1)*s,lens:(h?.69:.255)/s,lensScale:s,compression:o}}function At(e,t){return{focus:t==="field"?1.35:1,aperture:(e.lensScale??1)*(t==="field"?.078125:1)}}function St(e,t){let n=At(e,t);return{focusOffset:(e.focus-e.distanceToEye)/n.focus,aperture:e.aperture/n.aperture}}function Ft(e,t,n,i){let r=Math.max(0,Math.min(1,n)),o=At(e,i);return{...e,focus:e.focus+(e.distanceToEye+t.focusOffset*o.focus-e.focus)*r,aperture:e.aperture+(t.aperture*o.aperture-e.aperture)*r,focusBand:(e.focusBand??0)*(1-r)}}var J=(e,t,n,i)=>{let r=Math.cos(t),o=Math.sin(t),s=e[n],h=e[i];e[n]=r*s+o*h,e[i]=-o*s+r*h};function fn(e,t){let n=[...e];return J(n,t.angle,0,2),J(n,t.tilt,1,2),J(n,-.38,0,1),n}function mn(e,t){let n=[...e];return J(n,.38,0,1),J(n,-t.tilt,1,2),J(n,-t.angle,0,2),n}function Rt(e,t,n,i){let r=i.width/i.height,o=Math.min(1,r/.9),s=[];for(let h=0;h<t;h++)for(let p=0;p<t;p++){let u=(h*t+p)*4,l=e[u+3];if(l<=0||!Number.isFinite(l)||Math.max(e[u],e[u+1],e[u+2])<.008)continue;let m=[((p+.5)/t-.5)*r*l*n.lens/o,((h+.5)/t-.5)*l*n.lens/o,n.distanceToEye-l];s.push({position:fn(m,n),radius:.01})}return s}function Lt(e,t,n,i="grains"){let r=n.width/n.height,o=Math.min(1,r/.9),s=[];for(let v of e){let E;i==="field"?E=mn(v.position,t):(E=[...v.position],J(E,.32+(t.roll??0),0,1),J(E,t.angle,0,2),J(E,t.tilt,1,2));let F=t.distanceToEye-E[2];if(F<=0)continue;let B=E[0]/(F*t.lens)*o/r,P=E[1]/(F*t.lens)*o;Math.abs(B)>.46||Math.abs(P)>.46||i==="grains"&&v.radius*n.height/(F*t.lens)*o<.18||s.push(F)}if(!s.length)return{focus:t.focus,focusBand:i==="field"?0:.012,sharpSamples:0,visible:0};s.sort((v,E)=>v-E);let h=s[0],p=1/0,u=s[0],l=1/0,m=0,d=0,b=i==="field"?.008:.012;for(let v=0;v<s.length;v++){let E=s[v];for(;s[m]<E-b;)m++;for(;d<s.length&&s[d]<=E+b;)d++;let F=Math.abs(E-t.focus)+.002/Math.sqrt(d-m);F<l&&(u=E,l=F),d-m>=4&&F<p&&(h=E,p=F)}return Number.isFinite(p)||(h=u),{focus:h,focusBand:i==="field"?0:.012,sharpSamples:s.filter(v=>Math.abs(v-h)<=b).length,visible:s.length}}var kt=`#version 300 es
precision highp float;
in vec2 uv;out vec4 frag;
uniform sampler2D image;
void main(){ivec2 size=textureSize(image,0);frag=texelFetch(image,clamp(ivec2(uv*vec2(size)),ivec2(0),size-1),0);}
`;var Pt=(e,t,n)=>Math.max(t,Math.min(n,e));function Ct(e,t,n){let i=Pt(n,0,1),r=e.distanceToEye+i*.12*Math.sin(t*.065);return{...e,roll:0,lightTurn:0,distanceToEye:r,focus:e.focus+(r-e.distanceToEye)+i*.035*Math.sin(t*.055),aperture:e.aperture*(1+i*.12*Math.sin(t*.08)),tilt:e.tilt+i*.045*Math.sin(t*.06),transmission:Pt(e.transmission*(1+i*.04*Math.sin(t*.05)),0,1)}}var Ie=(e,t,n)=>Math.max(t,Math.min(n,e));function Dt(e,t,n){let i=Ie(n,0,1),r=e.distanceToEye+i*(.27*Math.sin(t*.15)+.16*Math.sin(t*.37)),o=Ie(e.aperture/1.3,.001,.999),s=1.35*Math.sin(t*.23)+.65*Math.sin(t*.51),h=Math.log(o/(1-o)),p=1.3/(1+Math.exp(-h-s));return{angle:e.angle,tilt:e.tilt+i*(.13*Math.sin(t*.17)+.065*Math.sin(t*.39)),roll:i*.045*Math.sin(t*.19),phase:e.phase+i*e.drift*.6*Math.sin(t*.13),distanceToEye:r,focus:r+(e.focus-e.distanceToEye)+i*(.56*Math.sin(t*.24)+.25*Math.sin(t*.57)),aperture:e.aperture+i*(p-e.aperture),transmission:Ie(e.transmission*(1+i*.1*Math.sin(t*.13)),0,1),lightTurn:i*.22*Math.sin(t*.16)}}function _t(e,t,n,i){if(!i)return{rig:e,angle:t.angle,phase:t.phase,pose:Dt(t,e.time,e.blend)};let r=Ie(n,0,.1),o=e.time+r,s=t.cinema?1:0,h=e.blend+(s-e.blend)*(1-Math.exp(-r/1.4));Math.abs(h-s)<1e-4&&(h=s);let p=1+h*(.28*Math.sin(o*.33)+.16*Math.sin(o*.71)),u=t.angle+r*t.speed*.24*p,l=t.phase+r*t.drift*.065;return{rig:{time:o,blend:h},angle:u,phase:l,pose:Dt({...t,angle:u,phase:l},o,h)}}function It(e,t=6500){let n=e.baseCount??e.count,i=Math.max(1,Math.ceil(n/t)),r=[];for(let o=0;o<n;o+=i){let s=o*3;r.push({position:e.positions.slice(s,s+3),normal:e.normals.slice(s,s+3),radius:e.radii[o]})}return r}function zt(e,t){let[n,i,r,o,s,h]=t,p=n*e[0]+i*e[1],u=-i*e[0]+n*e[1],l=r*p+o*e[2],m=-o*p+r*e[2];return[l,s*u+h*m,-h*u+s*m]}function Ut(e,t,n,i,r,o=!0){let s=i.width/i.height,h=Math.min(1,s/.9),p=[Math.cos(.32+n.roll),Math.sin(.32+n.roll),Math.cos(n.angle),Math.sin(n.angle),Math.cos(n.tilt),Math.sin(n.tilt)],u=new Uint16Array(1280*8),l=new Uint16Array(160),m=[],d=null;for(let x=0;x<t.length;x++){let S=t[x],k=zt(S.position,p),U=zt(S.normal,p),D=n.distanceToEye-k[2],K=k[0]/(D*(n.lens??.255))*h/s,ce=k[1]/(D*(n.lens??.255))*h,_=S.radius*i.height/(D*(n.lens??.255))*h;if(Math.abs(K)>.44||Math.abs(ce)>.44||_<.18)continue;let le=Math.max(0,(-.8*U[0]+1.5*U[1]+1.3*U[2])/2.14),O=Math.pow(1-Math.abs(U[2]),1.6),Re=(.2+le*.6+O*.4)*Math.min(3,_*_+.2),he=Math.max(0,Math.min(159,Math.floor((k[2]+2.6/2)/2.6*160))),He=Math.min(7,Math.floor((K+.44)/.88*8)),ot=Math.min(7,Math.floor((ce+.44)/.88*8))*8+He;u[ot*160+he]++,l[he]++;let ct={index:x,depth:D,bin:he,cell:ot,weight:Re};m.push(ct),x===e.index&&(d=ct)}if(!m.length)return{focus:n.focus,index:-1,visible:0,sharpSamples:0};let b=0,v=0,E=159;for(let x=0;x<160;x++)b+=l[x],b<m.length*.18&&(v=x),b<m.length*.82&&(E=x);let F=n.distanceToEye-((E+.5)/160*2.6-2.6/2),B=n.distanceToEye-((v+.5)/160*2.6-2.6/2),P=Math.max(F,Math.min(B,n.focus)),W=x=>{let S=x.cell*160;return u[S+x.bin]+(x.bin>0?u[S+x.bin-1]:0)+(x.bin<159?u[S+x.bin+1]:0)},te=d?.depth??e.depth??n.focus,ne=d&&m.reduce((x,S)=>x+(Math.abs(S.depth-d.depth)<=.03?1:0),0)>=8,ae=Math.max(0,Math.min(.1,r))*.22+.0025,f=null,M=1/0,T=null,L=1/0;for(let x of m){let S=W(x),k=Math.abs(x.depth-P)+.012/(Math.sqrt(S)*x.weight+.1),U=Math.abs(x.depth-te);l[x.bin]>=12&&S>=4&&(!d||U<=ae)&&(o||x.index===e.index)&&k<M&&(f=x,M=k);let D=(d?U:Math.abs(x.depth-P))+.012/(Math.sqrt(S)*x.weight+.1);l[x.bin]>=12&&D<L&&(T=x,L=D)}T||(T=m.reduce((x,S)=>l[S.bin]>l[x.bin]?S:x));let R=!o&&ne?d:f??(ne?d:null)??T;e.index=R.index,e.depth=R.depth;let I=0;for(let x of m)Math.abs(x.depth-R.depth)<=.03&&I++;return{focus:R.depth,index:R.index,visible:m.length,sharpSamples:I}}var g=e=>document.getElementById(e),w=g("art"),a=w.getContext("webgl2",{alpha:!1,antialias:!1,preserveDrawingBuffer:!0,powerPreference:"high-performance"}),Nt=matchMedia("(prefers-reduced-motion: reduce)").matches,ve=new URLSearchParams(location.search),Bt=Number.parseInt(ve.get("seed")||"1",10),c={angle:.12,tilt:-.1,phase:0,focus:11.1,aperture:.64,transmission:.72,distanceToEye:11.5,seed:Number.isFinite(Bt)?Math.max(0,Math.min(999,Bt-1)):0,speed:.15,compression:.5,lensDrift:!1,drift:.28,cinema:ve.get("cinema")!=="0"&&!Nt,growth:ve.get("growth")!=="0",quality:1,playing:!Nt&&ve.get("paused")!=="1",frame:0,samples:0,dirty:!0},C,N=0,tt=null,Ot=!1,$={time:0,blend:c.cinema?1:0},ge={time:0,blend:0},se={time:0,blend:c.growth?1:0},Ue=[],Xt={index:-1},we=null,nt=[],Ye=null,Je=-1/0,A=Ge(ve.get("shape")),xe=!0,ye=0,Y,me=0,Ht={oil:Ve,julia:je,bulb:We},Qe=new Map,Z,ee,H,Be=!1,Ze=0,et=0,Ke=0,qt,Vt,Ee;function Me(e){g("loading").hidden=!0,g("error").textContent=e,g("error").hidden=!1,document.body.dataset.renderer="failed"}function Gt(e,t){let n=a.createShader(e);if(a.shaderSource(n,t),a.compileShader(n),!a.getShaderParameter(n,a.COMPILE_STATUS)){let i=a.getShaderInfoLog(n);throw a.deleteShader(n),Error(i)}return n}function be(e,t=ut){let n=a.createProgram(),i=Gt(a.VERTEX_SHADER,t),r=Gt(a.FRAGMENT_SHADER,e);if(a.attachShader(n,i),a.attachShader(n,r),a.linkProgram(n),a.deleteShader(i),a.deleteShader(r),!a.getProgramParameter(n,a.LINK_STATUS))throw Error(a.getProgramInfoLog(n));return{p:n,uniforms:new Map}}function j(e,t,n){e.uniforms.has(t)||e.uniforms.set(t,a.getUniformLocation(e.p,t));let i=e.uniforms.get(t);Array.isArray(n)?a.uniform2fv(i,n):a.uniform1f(i,n)}function Te(e,t,n){a.uniform1i(a.getUniformLocation(e.p,t),n)}function G(){c.samples=0,c.dirty=!0}function Se(){if(!a||!Z)return;let e=A.engine==="field",t=(C?.active||N>0)&&!e?a.RGBA32F:a.RGBA16F,n=e?c.quality===1.5?1600:c.quality===1?1200:900:c.quality===1.5?2e3:c.quality===1?1450:900,i=Math.min(devicePixelRatio*c.quality,n/Math.max(innerWidth,innerHeight)),r=Math.max(1,Math.round(innerWidth*i)),o=Math.max(1,Math.round(innerHeight*i));if(!(w.width===r&&w.height===o&&H&&H.length===2&&H[0].precision===t)){if(w.width=r,w.height=o,H)for(let s of H)a.deleteFramebuffer(s.fbo),a.deleteTexture(s.texture);H=Array.from({length:2},()=>{let s=a.createTexture();a.bindTexture(a.TEXTURE_2D,s),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,e?a.LINEAR:a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,e?a.LINEAR:a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),a.texImage2D(a.TEXTURE_2D,0,t,r,o,0,a.RGBA,t===a.RGBA32F?a.FLOAT:a.HALF_FLOAT,null);let h=a.createFramebuffer();if(a.bindFramebuffer(a.FRAMEBUFFER,h),a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0,a.TEXTURE_2D,s,0),a.checkFramebufferStatus(a.FRAMEBUFFER)!==a.FRAMEBUFFER_COMPLETE)throw Error("The graphics device cannot create the light buffer.");return a.clearColor(0,0,0,1),a.clear(a.COLOR_BUFFER_BIT),{texture:s,fbo:h,precision:t}}),a.bindFramebuffer(a.FRAMEBUFFER,null),G()}}function jt(){if(ee){for(let e of ee.buffers)a.deleteBuffer(e);a.deleteVertexArray(ee.vao),ee=null}}function Wt(e){clearTimeout(Ee),Ue=It(e),Xt={index:-1},jt();let t=a.createVertexArray();a.bindVertexArray(t);let n=[e.positions,e.radii,e.facets,e.normals,e.development].map((i,r)=>{let o=a.createBuffer();return a.bindBuffer(a.ARRAY_BUFFER,o),a.bufferData(a.ARRAY_BUFFER,i,a.STATIC_DRAW),a.enableVertexAttribArray(r),a.vertexAttribPointer(r,r===4?4:r===0||r===3?3:1,a.FLOAT,!1,0,0),o});a.bindVertexArray(null),ee={vao:t,buffers:n,count:e.count},w.dataset.grains=e.count,xe=!1,G()}function $t(e=!1){let t=new URL(location.href);t.searchParams.set("shape",A.id),t.searchParams.set("seed",c.seed+1),history[e?"pushState":"replaceState"](null,"",t)}function re(e,t=!0){clearTimeout(Ee),A=Ge(e),tt=null;let n=++ye;xe=!0,document.body.dataset.renderer="loading",g("loading").hidden=!1,g("loading").style.opacity="1",g("error").hidden=!0,g("shape").value=A.id,g("form-name").textContent=A.name,g("form-description").textContent=A.description,g("form-number").textContent=String(X.indexOf(A)+1).padStart(2,"0")+" / "+X.length,document.title="Lumen / "+A.name,w.dataset.shape=A.id,delete w.dataset.sharpSamples,we=null,nt=[],Je=-1/0,c.angle=A.angle??.12,c.tilt=A.tilt??-.1,c.distanceToEye=11.5,c.focus=11.1,g("focus").value=c.focus,g("focus-value").value="Centre",Jt(),Oe(),Se(),G(),t&&$t(!0);try{A.engine==="field"?(Qe.has(A.id)||Qe.set(A.id,be(Ht[A.id].specimen,Ht[A.id].vertex)),jt(),Ue=[],w.dataset.grains="0",xe=!1):Y?(document.body.dataset.bootStage="geometry",Y.postMessage({id:A.id,seed:c.seed+1,request:n}),Ee=setTimeout(()=>{n!==ye||!xe||(Y.terminate(),Y=null,document.body.dataset.geometryRecovery="main-thread",re(A.id,!1))},6e3)):setTimeout(()=>{if(n===ye)try{Wt(yt(A.id,c.seed+1))}catch(i){Me(i.message)}},20)}catch(i){Me(i.message)}}function Ne(e){re(X[(X.indexOf(A)+e+X.length)%X.length].id)}function vn(e){if(!we||e-Je<220)return;if(!Ye){let n=a.createTexture();a.bindTexture(a.TEXTURE_2D,n),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.NEAREST),a.texImage2D(a.TEXTURE_2D,0,a.RGBA32F,32,32,0,a.RGBA,a.FLOAT,null);let i=a.createFramebuffer();if(a.bindFramebuffer(a.FRAMEBUFFER,i),a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0,a.TEXTURE_2D,n,0),a.checkFramebufferStatus(a.FRAMEBUFFER)!==a.FRAMEBUFFER_COMPLETE)throw Error("The graphics device cannot sample surface depth.");Ye={texture:n,fbo:i,pixels:new Float32Array(1024*4),program:be(kt)}}let t=Ye;a.bindVertexArray(null),a.disable(a.BLEND),a.bindFramebuffer(a.FRAMEBUFFER,t.fbo),a.viewport(0,0,32,32),a.useProgram(t.program.p),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,H[1-me].texture),Te(t.program,"image",0),a.drawArrays(a.TRIANGLES,0,3),a.readPixels(0,0,32,32,a.RGBA,a.FLOAT,t.pixels),nt=Rt(t.pixels,32,we,{width:w.width,height:w.height}),Je=e}function yn(e,t){t&&(c.samples=Math.min(c.samples,32));let n=Qe.get(A.id);a.bindVertexArray(null),a.disable(a.BLEND),a.useProgram(n.p),a.bindFramebuffer(a.FRAMEBUFFER,H[me].fbo),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,H[1-me].texture),Te(n,"previous",0);let i={...e,seed:c.seed%12,frame:c.frame};for(let s of["angle","tilt","phase","focus","aperture","transmission","distanceToEye","seed","frame","lens"])j(n,s,i[s]);let r=we??e;for(let s of["angle","tilt","distanceToEye","lens","focus","aperture"])j(n,"previous"+s[0].toUpperCase()+s.slice(1),r[s]);j(n,"rayCount",c.quality===1.5?4:c.quality===1?2:1),j(n,"resolution",[w.width,w.height]),j(n,"blend",c.samples/(c.samples+1)),a.drawArrays(a.TRIANGLES,0,3);let o=Z.oilDisplay;a.useProgram(o.p),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,H[me].texture),Te(o,"image",0),a.bindFramebuffer(a.FRAMEBUFFER,null),a.drawArrays(a.TRIANGLES,0,3),me=1-me,we={...e}}function Yt(e){if(Vt=requestAnimationFrame(Yt),document.hidden||xe){Ke=e;return}let t=Math.min((e-(Ke||e))/1e3,.1);Ke=e;let n=c.playing&&!Be&&(c.cinema||$.blend>0||A.growth&&(c.growth||se.blend>0)||c.lensDrift||ge.blend>0||c.speed>0||c.drift>0),i=A.engine==="field",r=_t($,i?{...c,speed:c.speed*.4}:c,t,n);$=r.rig,c.angle=r.angle,c.phase=r.phase,ge=Tt(ge,c.lensDrift,t,n&&!C?.active);let o=i?Ct({...c,angle:r.angle,phase:r.phase},$.time,$.blend):r.pose,s=$e(o,c.compression,ge,A.engine);se=lt(se,!!A.growth&&c.growth,t,n),s.growthTime=se.time,s.growthBlend=se.blend;let h=C?.tick(t),p=N,u=C?.active?1:0;if(N+=(u-N)*(1-Math.exp(-t/.4)),Math.abs(N-u)<1e-4&&(N=u),(h||N!==p)&&(c.dirty=!0),p>0&&N===0&&Se(),!(!n&&!c.dirty&&(A.engine!=="field"||c.samples>=256))){if(s.focusBand=0,$.blend>0&&A.engine==="grains"&&N<.999){let l=Ut(Xt,Ue,s,{width:w.width,height:w.height},t,n);s.focus+=(l.focus-s.focus)*$.blend,s.focusBand=.03*$.blend,w.dataset.sharpSamples=l.sharpSamples}if(N>0){s=Ft(s,C.controls,N,A.engine),i&&vn(e);let l=Lt(i?nt:Ue,s,{width:w.width,height:w.height},A.engine);s.focus+=(l.focus-s.focus)*N,s.focusBand+=l.focusBand*N,w.dataset.sharpSamples=l.sharpSamples,w.dataset.focusSurfaces=l.visible}if(tt={...s},a.viewport(0,0,w.width,w.height),A.engine==="field")yn(s,n||h||N!==p);else{let l=Z.specimen;a.useProgram(l.p),a.bindFramebuffer(a.FRAMEBUFFER,H[0].fbo),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),j(l,"handSampling",N);for(let m of["angle","tilt","phase","focus","aperture","transmission","distanceToEye","roll","lightTurn","focusBand","growthTime","growthBlend","lens","lensScale"])j(l,m,s[m]);j(l,"resolution",[w.width,w.height]),a.enable(a.BLEND),a.blendFunc(a.ONE,a.ONE),a.bindVertexArray(ee.vao),j(l,"lightPass",0),a.drawArrays(a.POINTS,0,ee.count),a.bindFramebuffer(a.FRAMEBUFFER,H[1].fbo),a.clear(a.COLOR_BUFFER_BIT),j(l,"lightPass",1),a.drawArrays(a.POINTS,0,ee.count),a.bindVertexArray(null),a.disable(a.BLEND),a.bindFramebuffer(a.FRAMEBUFFER,null),a.useProgram(Z.display.p),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,H[0].texture),Te(Z.display,"image",0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,H[1].texture),Te(Z.display,"highlights",1),j(Z.display,"frame",c.frame),a.drawArrays(a.TRIANGLES,0,3)}if(c.frame++,c.samples++,c.dirty=!1,document.body.dataset.renderer!=="ready"){document.body.dataset.renderer="ready",g("loading").style.opacity="0";let l=ye;setTimeout(()=>{l===ye&&(g("loading").hidden=!0)},600)}w.dataset.frames=c.frame,w.dataset.samples=c.samples,w.dataset.focus=s.focus.toFixed(4),w.dataset.aperture=s.aperture.toFixed(4),w.dataset.lensScale=s.lensScale.toFixed(3),w.dataset.lens=s.lens.toFixed(4),w.dataset.eye=s.distanceToEye.toFixed(3),c.frame%15===1&&(w.dataset.cameraTime=$.time.toFixed(3),w.dataset.angle=s.angle.toFixed(3),w.dataset.cinema=String(c.cinema),w.dataset.growthTime=se.time.toFixed(3)),w.dataset.resolution=`${w.width} \xD7 ${w.height}`}}function oe(e){g("toast").textContent=e,g("toast").classList.add("visible"),clearTimeout(qt),qt=setTimeout(()=>g("toast").classList.remove("visible"),2400)}function Kt(){c.playing=!c.playing,at(),G()}function at(){g("play").setAttribute("aria-label",c.playing?"Pause motion":"Resume motion"),g("play").title=c.playing?"Pause motion (Space)":"Resume motion (Space)",g("play").innerHTML=c.playing?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6z"/></svg>',g("state-label").textContent=C?.active?"Hand lens \xB7 Open, pinch, push and pull":c.playing?c.cinema?c.growth&&A.growth?"Cinematographer \xB7 Living growth":"Cinematographer":c.growth&&A.growth?"Living growth":"A living study of light":"A moment held in light"}function Oe(){for(let e of["cinema","cinema-studio"])g(e).setAttribute("aria-pressed",String(c.cinema));g("cinema-status").textContent=c.cinema?"On":"Off",g("cinema").title=C?.busy?"Return to cinema (C)":`Cinematographer ${c.cinema?"on":"off"} (C)`,g("cinema").setAttribute("aria-label",C?.busy?"Return to cinema":"Cinematographer mode"),g("cinema-helper").textContent=C?.active?"Your hand controls focus and aperture. The orbit and light can continue.":c.cinema?A.engine==="field"?"A steady macro focus plane, gentle iris breathing, and a slow orbit.":"Focus, aperture, spectral light, and orbit drift around your settings.":"Your slider settings hold steady as the specimen turns.",at()}function it(){if(C?.busy){C.returnToCinema();return}c.cinema=!c.cinema,c.playing||($.blend=c.cinema?1:0),Oe(),G();let e=new URL(location.href);e.searchParams.set("cinema",c.cinema?"1":"0"),history.replaceState(null,"",e),oe(c.cinema?"Cinematographer on":"Manual camera")}function xn(){c.cinema=!0,c.playing=!0,Oe(),G();let e=new URL(location.href);e.searchParams.set("cinema","1"),e.searchParams.delete("paused"),history.replaceState(null,"",e),oe("Camera off \xB7 Cinematographer on")}function Jt(){g("growth").hidden=!A.growth,document.querySelector(".growth-card").hidden=!A.growth;for(let e of["growth","growth-studio"])g(e).setAttribute("aria-pressed",String(c.growth));g("growth-status").textContent=c.growth?"On":"Off",g("growth").title=`Living growth ${c.growth?"on":"off"} (G)`,at()}function st(){if(!A.growth)return;c.growth=!c.growth,c.playing||(se.blend=c.growth?1:0),Jt(),G();let e=new URL(location.href);e.searchParams.set("growth",c.growth?"1":"0"),history.replaceState(null,"",e),oe(c.growth?"Living growth on":"Growth resting")}function Fe(e){e&&C?.panel(!1),g("studio").hidden=!e,g("settings").setAttribute("aria-expanded",String(e))}function Ae(e,t=!0){document.body.classList.toggle("immersive",e),g("restore").hidden=!e;for(let n of document.querySelectorAll(".chrome"))n.inert=e;e&&(Fe(!1),C?.panel(!1)),t&&w.focus({preventScroll:!0})}async function Qt(){try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen()}catch{oe("Use your browser\u2019s fullscreen command.")}}function Zt(){let e=`lumen-${A.id}-${c.seed+1}-${new Date().toISOString().replace(/[:.]/g,"-")}.png`;w.toBlob(t=>{if(!t){oe("The image could not be saved.");return}let n=URL.createObjectURL(t),i=document.createElement("a");i.href=n,i.download=e,i.click(),setTimeout(()=>URL.revokeObjectURL(n),1e4),oe("Photograph saved")},"image/png")}for(let e of["focus","aperture","transmission","speed","drift","compression"])g(e).addEventListener("input",t=>{c[e]=Number(t.target.value);let n=g(e+"-value");n.value=e==="compression"?c.compression<.35?"Wide":c.compression>.65?"Compressed":"Balanced":e==="focus"?c.focus.toFixed(2):e==="transmission"?`${Math.round(c[e]*100)}%`:e==="aperture"?c[e]<.07?"Deep":c[e]>.8?"Dreamlike":"Shallow":c[e]===0?"Still":c[e]<.4?"Slow":"Flowing",G()});g("lens-drift").onclick=()=>{c.lensDrift=!c.lensDrift,c.playing||(ge.blend=c.lensDrift?1:0),g("lens-drift").setAttribute("aria-pressed",c.lensDrift),g("lens-status").textContent=c.lensDrift?"On":"Off",G()};g("growth").onclick=st;g("growth-studio").onclick=st;g("cinema").onclick=it;g("cinema-studio").onclick=it;g("quality").addEventListener("change",e=>{c.quality=Number(e.target.value),Se()});g("play").onclick=Kt;g("settings").onclick=()=>Fe(g("studio").hidden);g("close").onclick=()=>Fe(!1);g("hide").onclick=()=>Ae(!0);g("restore").onclick=()=>Ae(!1);g("fullscreen").onclick=Qt;g("capture").onclick=Zt;g("new").onclick=()=>{c.seed=(c.seed+1)%1e3,re(A.id,!1),$t(),oe(`Specimen ${String(c.seed+1).padStart(3,"0")}`)};g("shape").onchange=e=>re(e.target.value);g("previous").onclick=()=>Ne(-1);g("next").onclick=()=>Ne(1);addEventListener("popstate",()=>{let e=new URLSearchParams(location.search);c.seed=Math.max(0,Math.min(999,(parseInt(e.get("seed"),10)||1)-1)),re(e.get("shape"),!1)});w.addEventListener("pointerdown",e=>{Be=!0,Ze=e.clientX,et=e.clientY,w.setPointerCapture(e.pointerId)});w.addEventListener("pointermove",e=>{Be&&(c.angle+=(e.clientX-Ze)*.006,c.tilt+=(e.clientY-et)*.006,Ze=e.clientX,et=e.clientY,G())});function rt(){Be=!1}w.addEventListener("pointerup",rt);w.addEventListener("pointercancel",rt);w.addEventListener("lostpointercapture",rt);w.addEventListener("wheel",e=>{e.preventDefault();let t=c.distanceToEye;c.distanceToEye=Math.max(9.4,Math.min(15.5,t+e.deltaY*.005)),c.focus+=c.distanceToEye-t,c.focus=Math.min(16,Math.max(8.5,c.focus)),g("focus").value=c.focus,G()},{passive:!1});addEventListener("keydown",e=>{if(!e.repeat){if(e.key==="Escape"){Ae(!1),Fe(!1),C?.panel(!1);return}e.target.matches("input,select,textarea")||(e.code==="Space"&&!e.target.closest("button,a")&&(e.preventDefault(),Kt()),e.key.toLowerCase()==="h"&&Ae(!document.body.classList.contains("immersive")),e.key.toLowerCase()==="f"&&Qt(),e.key.toLowerCase()==="s"&&Zt(),e.key.toLowerCase()==="c"&&it(),e.key.toLowerCase()==="g"&&st(),(e.key==="ArrowRight"||e.key==="]")&&(e.preventDefault(),Ne(1)),(e.key==="ArrowLeft"||e.key==="[")&&(e.preventDefault(),Ne(-1)))}});w.addEventListener("webglcontextlost",e=>{e.preventDefault(),cancelAnimationFrame(Vt),C?.stop(),Me("The graphics session was interrupted. Reload this page to gather light again.")});addEventListener("resize",Se);document.addEventListener("fullscreenchange",()=>{let e=!!document.fullscreenElement;g("fullscreen").setAttribute("aria-label",e?"Exit fullscreen":"Enter fullscreen")});C=new ze({readLens:()=>St(tt??$e(c,c.compression,ge,A.engine),A.engine),closeStudio:()=>Fe(!1),onReturnToCinema:xn,onChange:()=>{let e=!!C?.active;if(e!==Ot){Ot=e;for(let t of["focus","aperture","lens-drift"])g(t).disabled=e;Se(),G(),Oe()}}});ve.get("embed")==="1"&&Ae(!0,!1);try{if(document.body.dataset.bootStage="graphics",!a)throw Error("This artwork needs a browser with WebGL 2 enabled.");if(!a.getExtension("EXT_color_buffer_float"))throw Error("This artwork needs floating point graphics buffers. Try a recent desktop browser.");Z={specimen:be(pt,dt),display:be(ft),oilDisplay:be(Q,Xe)};for(let e of[...new Set(X.map(t=>t.group))]){let t=document.createElement("optgroup");t.label=e;for(let n of X.filter(i=>i.group===e)){let i=document.createElement("option");i.value=n.id,i.textContent=n.name,t.append(i)}g("shape").append(t)}try{let e="./generated-shape-b5aad2969e448849.js";Y=new Worker(new URL(e,import.meta.url),{type:"module"}),Y.onmessage=({data:t})=>{t.request===ye&&(clearTimeout(Ee),t.error?Me(t.error):Wt(t.model))},Y.onerror=()=>{clearTimeout(Ee),Y.terminate(),Y=null,re(A.id,!1)}}catch{Y=null}re(A.id,!1),requestAnimationFrame(Yt)}catch(e){console.error(e),Me(e.message)}
