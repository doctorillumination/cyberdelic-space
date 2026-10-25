// Deterministic three-dimensional branching growth, seeded independently from
// animation. Smaller branches repeat the same rules with varied pitch and curl.
export function growSpecimen(seed=1){
 let n=(seed+1)*16807;
 const rand=()=>{n=(n*16807)%2147483647;return(n-1)/2147483646;};
 const positions=[],radii=[],facets=[],normals=[],development=[],strokes=[];
 const plus=(a,b)=>a.map((v,i)=>v+b[i]);const mul=(a,s)=>a.map(v=>v*s);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const norm=a=>mul(a,1/Math.max(.00001,Math.hypot(...a)));
 const add=(p,r,normal,life)=>{positions.push(...p);radii.push(r);facets.push(rand());normals.push(...normal);if(life)development.push(...life);else development.push(0,0,0,0);};
 function branch(start,dir,length,width,depth,phase,family){
  dir=norm(dir);const u=norm(cross(dir,Math.abs(dir[1])>.9?[1,0,0]:[0,1,0])),v=cross(dir,u);
  const curl=(rand()-.5)*1.15,bend=(rand()-.5)*1.15;
  const point=t=>plus(plus(plus(start,mul(dir,length*t)),mul(u,length*curl*t*t)),mul(v,length*bend*t*t));
  const stroke={point,u,v,length,width,phase,depth,family,tangent:norm(plus(plus(dir,mul(u,2*curl)),mul(v,2*bend)))};strokes.push(stroke);
  if(depth<=0)return;
  const children=rand()<.38?3:2,twist=rand()*6.283;
  for(let j=0;j<children;j++){
   const phi=twist+j*6.283/children+(rand()-.5)*.9,spread=.52+rand()*.95;
   const next=norm(plus(plus(mul(dir,.55+rand()*.3),mul(u,Math.cos(phi)*spread)),mul(v,Math.sin(phi)*spread)));
   branch(point(.8+rand()*.2),next,length*(.7+rand()*.13),width*(.77+rand()*.12),depth-1,phase+j*2.4,family);
  }
 }
 const arms=[[-.85,-.35,.26],[.65,.18,.52],[.17,.91,-.26],[-.18,-.85,-.38],[.43,.4,-.65],[-.42,.55,.1],[.04,-.1,.85]];
 for(let i=0;i<arms.length;i++){
  const dir=norm(plus(arms[i],[(rand()-.5)*.22,(rand()-.5)*.22,(rand()-.5)*.22]));
  branch(mul(dir,.025),dir,.2+rand()*.13,.035+rand()*.016,5,i*1.9,i*.83);
 }
 // Allocate grains over the entire colony before drawing any arm, so detail
 // remains evenly distributed through all depths and directions.
 let total=0;for(const s of strokes){s.weight=s.length*Math.sqrt(s.width);total+=s.weight;}
 for(const s of strokes){
  const count=Math.max(6,Math.round(280000*s.weight/total));
  for(let j=0;j<count;j++){
   const t=rand(),phi=rand()*Math.PI*2,center=s.point(t);
   const rough=1.+.24*Math.sin(t*21.+s.phase)+.18*Math.cos(t*37.-s.phase);
   const radius=s.width*(1.-t*.3)*rough;
   const rr=radius*(.91+rand()*.18);
   const pos=plus(plus(center,mul(s.u,Math.cos(phi)*rr)),mul(s.v,Math.sin(phi)*rr));
   const bead=Math.max(.0007,s.width*(.065+rand()*.115));
   add(pos,bead,norm(plus(mul(s.u,Math.cos(phi)),mul(s.v,Math.sin(phi)))));
   if(j%7===0){
    // Small crystalline buds make branch edges irregular at macro scale.
    const bud=plus(center,plus(mul(s.u,Math.cos(phi)*radius*1.13),mul(s.v,Math.sin(phi)*radius*1.13)));
    add(bud,bead*(.7+rand()*.5),norm(plus(mul(s.u,Math.cos(phi)),mul(s.v,Math.sin(phi)))));
   }
  }
 }
 // The existing colony is an exact, stable core. New recursive shoots use
 // the random stream only after every core grain has already been generated.
 const baseCount=radii.length;
 let extent=0;for(let i=0;i<positions.length;i+=3)extent=Math.max(extent,Math.hypot(positions[i],positions[i+1],positions[i+2]));
 const scale=1.25/extent,sprouts=[];
 function shoot(start,dir,length,width,generation,family){
  dir=norm(dir);
  const u=norm(cross(dir,Math.abs(dir[1])>.9?[1,0,0]:[0,1,0])),v=cross(dir,u);
  const curl=(rand()-.5)*.7,bend=(rand()-.5)*.7;
  const point=t=>plus(plus(plus(start,mul(dir,length*t)),mul(u,length*curl*t*t)),mul(v,length*bend*t*t));
  const tangent=norm(plus(plus(dir,mul(u,2*curl)),mul(v,2*bend)));
  sprouts.push({point,u,v,length,width,generation,family});
  if(generation>=2)return;
  const twist=rand()*Math.PI*2;
  for(let j=0;j<2;j++){
   const phi=twist+j*Math.PI;
   const child=norm(plus(plus(mul(tangent,.8),mul(u,Math.cos(phi)*.65)),mul(v,Math.sin(phi)*.65)));
   shoot(point(1),child,length*.65,width*.62,generation+1,family);
  }
 }
 for(const leaf of strokes){
  if(leaf.depth!==0)continue;
  const twist=rand()*Math.PI*2;
  for(let j=0;j<2;j++){
   const phi=twist+j*Math.PI;
   const child=norm(plus(plus(mul(leaf.tangent,.85),mul(leaf.u,Math.cos(phi)*.7)),mul(leaf.v,Math.sin(phi)*.7)));
   shoot(leaf.point(1),child,leaf.length*.82,leaf.width*.5,0,leaf.family+.16*Math.sin(leaf.phase));
  }
 }
 let sproutWeight=0;
 for(const s of sprouts){s.weight=s.length*Math.sqrt(s.width);sproutWeight+=s.weight;}
 for(const s of sprouts){
  const count=Math.max(5,Math.round(115000*s.weight/sproutWeight));
  for(let i=0;i<count;i++){
   const t=rand(),phi=rand()*Math.PI*2,center=s.point(t);
   const surface=norm(plus(mul(s.u,Math.cos(phi)),mul(s.v,Math.sin(phi))));
   const rr=s.width*(1.-t*.42)*(.92+rand()*.16)*(1.+.17*Math.sin(t*21.+s.family));
   const pos=plus(center,mul(surface,rr));
   add(pos,Math.max(.0007,s.width*(.12+rand()*.14)),surface,[1,s.generation,t,s.family]);
  }
 }
 for(let i=0;i<positions.length;i++)positions[i]*=scale;
 for(let i=0;i<radii.length;i++)radii[i]*=scale;
 return {positions:new Float32Array(positions),radii:new Float32Array(radii),facets:new Float32Array(facets),normals:new Float32Array(normals),development:new Float32Array(development),baseCount,count:radii.length};
}
