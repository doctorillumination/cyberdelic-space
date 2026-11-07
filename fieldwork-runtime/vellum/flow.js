/* Seeded geometry and pigment transport. All coordinates use the paper plane. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function randomSource(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function noise(x, y, s = 0) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    function h(a, b) {
      let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(s | 0, 1274126177);
      n = Math.imul(n ^ n >>> 13, 1274126177);
      return ((n ^ n >>> 16) >>> 0) / 4294967295;
    }
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function sample(path, t) {
    t = path.closed ? ((t % 1) + 1) % 1 : Math.max(0, Math.min(.999999, t));
    const f = t * (path.points.length - 1), i = Math.floor(f), a = path.points[i], b = path.points[i + 1];
    const u=f-i;let dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
    if(l<1e-8)for(let k=1;k<path.points.length;k++){
      const q=path.points[(i+k)%path.points.length];dx=q.x-a.x;dy=q.y-a.y;l=Math.hypot(dx,dy);if(l>1e-8)break;
    }
    l=l||1;
    const result={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,nx:-dy/l,ny:dx/l};
    if(path.profile){const p=path.profile[i],q=path.profile[i+1];for(const key of ['spread','density','definition'])result[key]=p[key]+(q[key]-p[key])*u;}
    return result;
  }
  function buildReference(seed, w = 1600, h = 1000) {
    const rand = randomSource(seed), paths = [], pools = [];
    const jitter = (v, scale) => v + (rand() - .5) * scale;
    const point = (x, y) => ({x: x * w, y: y * h});
    function add(coords, width, color, options = {}) {
      const control = coords.map(p => Array.isArray(p) ? point(...p) : p), points = [];
      for (let i = 0; i < control.length - 1; i++) {
        const a = control[Math.max(0, i - 1)], b = control[i], c = control[i + 1], d = control[Math.min(control.length - 1, i + 2)];
        const count = Math.max(8, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y) / 3));
        for (let k = 0; k < count; k++) {
          const t = k / count, t2 = t * t, t3 = t2 * t;
          points.push({x: .5 * ((2*b.x)+(-a.x+c.x)*t+(2*a.x-5*b.x+4*c.x-d.x)*t2+(-a.x+3*b.x-3*c.x+d.x)*t3), y: .5*((2*b.y)+(-a.y+c.y)*t+(2*a.y-5*b.y+4*c.y-d.y)*t2+(-a.y+3*b.y-3*c.y+d.y)*t3)});
        }
      }
      points.push(control.at(-1));
      let length = 0;
      for (let i=1;i<points.length;i++) length += Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      const path = {points, width, color, length, closed:false, phase:rand()*TAU, ...options};
      paths.push(path); return path;
    }
    function ring(x, y, r, width, color, rough = .015) {
      const points = [], phase = rand()*TAU;
      for (let k=0;k<=400;k++) {
      const a = k/400*TAU, rad = r*(1+rough*Math.sin(a*5+phase)+rough*.6*Math.cos(a*9-phase));
        points.push({x:x+Math.cos(a)*rad,y:y+Math.sin(a)*rad});
      }
      const p={points,width,color,length:TAU*r,closed:true,phase, ring:true}; paths.push(p);
      pools.push({x,y,r,color}); return p;
    }
    const cy=jitter(.46,.035)*h, cx=jitter(.505,.035)*w, radius=jitter(.225,.025)*h;
    ring(cx,cy,radius,15,0,.009);
    add([[.045,jitter(.37,.09)],[.13,.39],[.21,jitter(.31,.04)],[.29,.32],{x:cx-radius,y:cy}],17,0,{major:true});
    add([{x:cx+radius*.74,y:cy-radius*.67},[.73,.33],[.79,.24],[.85,.21],[.91,.16]],19,0,{major:true});
    add([{x:cx+radius*.67,y:cy+radius*.74},[.68,.65],[.77,.68],[.88,.76],[.955,.70]],11,2,{major:true});
    add([{x:cx-radius*.68,y:cy+radius*.73},[.35,.73],[.28,.80],[.21,.70],[.12,.70],[.075,.56]],11,1,{major:true});
    add([[.065,.43],[.14,.49],[.25,.50],{x:cx-radius,y:cy}],10,2,{major:true});
    const rootx=.79*w, rooty=.40*h;
    add([{x:cx+radius,y:cy},[.73,.45],[.79,.40],[.86,.45],[.94,.38]],9,2,{major:true});
    const nodes = [];
    for (let row=0;row<4;row++) {
      nodes[row]=[];
      for(let col=0;col<4;col++) nodes[row][col]=point(.755+col*.058+(rand()-.5)*.054,.32+row*.118+(rand()-.5)*.081);
    }
    for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
      const a=nodes[row][col];
      if(col<3) {const b=nodes[row][col+1]; add([a,{x:(a.x+b.x)/2,y:(a.y+b.y)/2+(rand()-.5)*73},b],2+rand()*4,row%2?2:1);}
      if(row<3 && (rand()>.25 || col===3)) {const b=nodes[row+1][col];add([a,{x:(a.x+b.x)/2+(rand()-.5)*68,y:(a.y+b.y)/2},b],2+rand()*4,col%2?1:2);}
    }
    add([{x:rootx,y:rooty},[.80,.28],[.86,.20],[.93,.23],[.95,.32]],6,1);
    // Material curves in a time-dependent local flow form the open left delta.
    for(let i=0;i<145;i++) {
      let x=(.07+rand()*.22)*w,y=(.45+rand()*.34)*h;
      const coords=[],phase=rand()*TAU;
      for(let k=0;k<220;k++) {
        const angle=(noise(x*.017,y*.017,seed+57)-.5)*TAU*2;
        let vx=Math.cos(angle)*1.0,vy=Math.sin(angle)*1.0;
        for(const v of [[.14*w,.58*h,45,1],[.22*w,.66*h,38,-1],[.12*w,.74*h,31,1]]) {
          const dx=x-v[0],dy=y-v[1],strength=(.7+.3*Math.sin(k*.024+phase))*v[3]*92/(dx*dx+dy*dy+v[2]*v[2]);
          vx-=dy*strength;vy+=dx*strength;
        }
        vx+=(.17*w-x)*.002;vy+=(.62*h-y)*.002;
        if(x<.04*w)vx+=(.04*w-x)*.04;if(x>.32*w)vx-=(x-.32*w)*.04;
        if(y<.43*h)vy+=(.43*h-y)*.04;if(y>.83*h)vy-=(y-.83*h)*.04;
        x+=vx*1.35;y+=vy*1.35;
        if(k%5===0)coords.push({x,y});
      }
      add(coords,1.2+rand()*2.8,i%11===0?0:i%5===0?2:1,{wild:true});
    }
    for(let i=0;i<13;i++) {
      const p=paths[Math.floor(rand()*7)], loc=sample(p,.1+rand()*.8), r=5+rand()*17;
      ring(loc.x,loc.y,r,2.2+rand()*3,p.color,.035);
    }
    ring(.325*w,.68*h,20,3,0,.02);
    ring(.365*w,.745*h,12,3,0,.02);
    ring(.29*w,.32*h,19,7,0,.03);
    ring(.72*w,.33*h,13,3,0,.05);
    return {paths,pools,seed,w,h,circle:{x:cx,y:cy,r:radius}};
  }
  const designs=[
    {id:'river',name:'River drawing'},
    {id:'orbits',name:'Large circles'},
    {id:'whirlpools',name:'Whirlpools'},
    {id:'threads',name:'Long threads'},
    {id:'meanders',name:'Meanders'},
    {id:'islands',name:'Ink islands'},
    {id:'attractor',name:'Strange attractor'}
  ];
  const arrangements=[
    {id:'estuary',name:'Estuary',cells:[[.47,.43,.15,.22],[.78,.59,.085,.13]],hubs:[[.19,.64],[.66,.45],[.30,.48],[.83,.77]],regions:[0,1],frame:[.50,.52,.91,.70],angle:[-.17,.17],
      edges:[['c0','h1',[],12,0],['h1','c1',[],8,2],['h0','h2',[[.12,.55]],9,1],['h2','c0',[],9,2],['h0','c0',[[.33,.76]],6,1],['c0','h3',[[.66,.78]],7,2],['h3','c1',[],5,1],['p0','c0',[[.20,.29]],13,0],['p1','h0',[],8,1],['c1','p2',[[.88,.32]],7,0],['h3','p3',[],5,2]],tips:[[.055,.32],[.08,.81],[.94,.22],[.95,.73]]},
    {id:'diagonal',name:'Rising current',cells:[[.23,.67,.075,.11],[.51,.46,.13,.19],[.77,.27,.10,.12]],hubs:[[.36,.56],[.65,.36],[.63,.73]],regions:[0,1],frame:[.49,.51,.88,.70],angle:[-.08,.14],
      edges:[['c0','h0',[],8,1],['h0','c1',[],11,0],['c1','h1',[],10,0],['h1','c2',[],7,2],['c0','c1',[[.26,.37],[.37,.30]],5,2],['c1','h2',[],5,1],['h2','c2',[[.88,.66]],4,2],['p0','c0',[],10,1],['p1','h0',[[.23,.37]],7,2],['c2','p2',[],9,0],['h2','p3',[],5,1]],tips:[[.065,.82],[.07,.30],[.94,.14],[.91,.82]]},
    {id:'braid',name:'Braided passage',cells:[[.33,.38,.16,.085],[.67,.63,.17,.10]],hubs:[[.17,.63],[.50,.50],[.81,.33],[.45,.76]],regions:[1,0],frame:[.52,.52,.91,.68],angle:[-.24,.22],
      edges:[['c0','h1',[],12,0],['h1','c1',[],11,2],['c0','h0',[],7,1],['h0','c1',[[.34,.69]],6,1],['c0','h2',[[.52,.21]],7,0],['h2','c1',[[.89,.49]],6,2],['h1','h3',[],4,2],['h3','c1',[],4,1],['p0','c0',[],11,0],['p1','h0',[],8,1],['h2','p2',[],7,2],['c1','p3',[],5,1]],tips:[[.055,.30],[.07,.79],[.95,.23],[.95,.80]]},
    {id:'loop',name:'Open circuit',cells:[[.24,.48,.075,.17],[.59,.25,.12,.09],[.77,.65,.075,.13]],hubs:[[.36,.29],[.79,.41],[.47,.77]],regions:[0,2],frame:[.50,.52,.86,.70],angle:[-.19,.20],
      edges:[['c0','h0',[],9,0],['h0','c1',[],8,0],['c1','h1',[],10,2],['h1','c2',[],8,2],['c2','h2',[],7,1],['h2','c0',[],9,1],['c0','c1',[[.20,.19],[.40,.13]],4,2],['p0','c0',[],8,1],['p1','h0',[],6,0],['c1','p2',[],7,0],['c2','p3',[],7,2]],tips:[[.06,.72],[.07,.25],[.94,.17],[.94,.82]]},
    {id:'canopy',name:'Branching field',cells:[[.30,.28,.10,.12],[.70,.26,.12,.095],[.78,.64,.075,.10]],hubs:[[.44,.75],[.46,.51],[.63,.47],[.49,.24]],regions:[0,2],frame:[.47,.52,.82,.71],angle:[-.12,.13],
      edges:[['h0','h1',[],13,0],['h1','c0',[],9,0],['h1','h2',[],8,2],['h2','c1',[],8,2],['h2','c2',[],6,1],['c0','h3',[],6,1],['h3','c1',[],5,2],['p0','h0',[],10,1],['p1','h1',[[.23,.55]],7,2],['c0','p2',[],6,0],['c1','p3',[],6,0],['c2','h0',[[.66,.82]],5,1]],tips:[[.22,.87],[.065,.42],[.10,.13],[.94,.16]]},
    {id:'confluence',name:'Offset confluence',cells:[[.30,.43,.16,.22],[.77,.65,.075,.10],[.80,.27,.065,.09]],hubs:[[.60,.48],[.70,.49],[.54,.73]],regions:[0,2],frame:[.46,.51,.81,.67],angle:[-.12,.12],
      edges:[['c0','h0',[],13,0],['h0','h1',[],10,2],['h1','c1',[],7,2],['h1','c2',[],6,1],['h0','h2',[],6,1],['h2','c1',[],5,1],['c1','c2',[[.93,.46]],4,2],['p0','c0',[[.12,.23]],11,0],['p1','c0',[[.15,.77]],9,1],['c2','p2',[],5,0],['c1','p3',[],5,2]],tips:[[.055,.32],[.07,.81],[.96,.18],[.95,.81]]}
  ];
  const arrangementFor=seed=>arrangements[(seed+Math.floor(seed/7)+5)%arrangements.length];
  function build(seed,w=1600,h=1000,design='auto'){
    const choice=designs.find(item=>item.id===design)??designs[seed%designs.length];
    if(choice.id==='river'){
      const model=buildReference(seed,w,h);
      return {...model,design:choice,guides:[{...model.circle}]};
    }
    return compose(seed,w,h,choice);
  }
  function compose(seed,w,h,choice){
    const rand=randomSource(seed+3917),paths=[],pools=[],guides=[],cells=[],junctions=[],carriers=[];
    const pick=(a,b)=>a+(b-a)*rand(),point=(x,y)=>({x:x*w,y:y*h});
    const kind=choice.id,elongated=kind==='threads'||kind==='meanders';
    const layout=arrangementFor(seed),hubs=layout.hubs.map(([x,y])=>point(x+pick(-.016,.016),y+pick(-.018,.018))),tips=layout.tips.map(([x,y])=>point(x+pick(-.008,.008),y+pick(-.008,.008)));
    for(const [x,y,rx,ry] of layout.cells){
      let sx=rx*w*pick(.88,1.08),sy=ry*h*pick(.9,1.10);
      if(elongated){sx*=1.12;sy*=kind==='threads'?.76:.9;}
      if(kind==='orbits')sx=sx*.45+sy*.55;
      cells.push({...point(x+pick(-.016,.016),y+pick(-.018,.018)),rx:sx,ry:sy,phase:rand()*TAU,rough:kind==='islands'?.12:kind==='whirlpools'?.065:.022,skew:pick(-.14,.14),angle:pick(elongated?-.28:-.14,elongated?.28:.14),ports:[]});
    }
    const primary=cells.reduce((a,b)=>a.rx*a.ry>b.rx*b.ry?a:b);
    function angleTo(cell,p){const x=p.x-cell.x,y=p.y-cell.y,c=Math.cos(cell.angle),s=Math.sin(cell.angle);return Math.atan2((-x*s+y*c)/cell.ry,(x*c+y*s)/cell.rx);}
    const port=(cell,angle)=>{
      const r=1+cell.rough*Math.sin(angle*3+cell.phase)+cell.rough*.45*Math.sin(angle*5-cell.phase),c=Math.cos(cell.angle),s=Math.sin(cell.angle);
      const x=Math.cos(angle)*cell.rx*r+Math.sin(angle)*cell.rx*cell.skew,y=Math.sin(angle)*cell.ry*r;
      return {x:cell.x+x*c-y*s,y:cell.y+x*s+y*c};
    };
    for(let pass=0;pass<3;pass++)for(const hub of hubs)for(const cell of cells){
      const x=hub.x-cell.x,y=hub.y-cell.y,c=Math.cos(cell.angle),s=Math.sin(cell.angle);
      if(Math.hypot((x*c+y*s)/cell.rx,(-x*s+y*c)/cell.ry)<1.05){const p=port(cell,angleTo(cell,hub));hub.x=cell.x+(p.x-cell.x)*1.10;hub.y=cell.y+(p.y-cell.y)*1.10;}
    }
    const regions=layout.regions.map((index,i)=>({...hubs[index],rx:pick(i?.06:.10,i?.085:.145)*w,ry:pick(i?.10:.13,i?.14:.19)*h,power:i?pick(.55,.8):1}));
    if(kind==='whirlpools'){const hub=hubs.find((_,index)=>!layout.regions.includes(index));if(hub)regions.push({...hub,rx:.065*w,ry:.105*h,power:.55});}
    const diffuse=(x,y)=>Math.min(1,regions.reduce((sum,r)=>sum+r.power*Math.exp(-(((x-r.x)/r.rx)**2+((y-r.y)/r.ry)**2)*1.7),0));
    function add(points,width,color,options={}){
      points=points.map(p=>({x:p.x,y:p.y}));let length=0;
      for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      if(length<3)return null;
      const path={points,width,color,length,closed:false,phase:rand()*TAU,...options};paths.push(path);return path;
    }
    function spline(control,width,color,options={}){
      const points=[];
      for(let i=0;i<control.length-1;i++){
        const a=control[Math.max(0,i-1)],b=control[i],c=control[i+1],d=control[Math.min(control.length-1,i+2)],n=Math.max(12,Math.ceil(Math.hypot(c.x-b.x,c.y-b.y)/2.5));
        for(let j=0;j<n;j++){
          const t=j/n,t2=t*t,t3=t2*t;
          points.push({x:.5*(2*b.x+(-a.x+c.x)*t+(2*a.x-5*b.x+4*c.x-d.x)*t2+(-a.x+3*b.x-3*c.x+d.x)*t3),y:.5*(2*b.y+(-a.y+c.y)*t+(2*a.y-5*b.y+4*c.y-d.y)*t2+(-a.y+3*b.y-3*c.y+d.y)*t3)});
        }
      }
      points.push(control.at(-1));return add(points,width,color,{joined:true,...options});
    }
    function channel(control,width,color,options={}){
      const path=spline(control,width,color,{role:'channel',major:true,fibres:112,...options});if(path)carriers.push(path);return path;
    }
    function boundary(cell,colour){
      const angles=[0,Math.PI*.5,Math.PI,Math.PI*1.5,...cell.ports.map(angle=>(angle%TAU+TAU)%TAU).filter(angle=>angle>.006&&angle<TAU-.006)].sort((a,b)=>a-b);
      const cuts=angles.filter((angle,index)=>index===0||angle-angles[index-1]>.006);cuts.push(TAU);
      for(let i=0;i<cuts.length-1;i++){
        const points=[],from=cuts[i],to=cuts[i+1],n=Math.max(45,Math.ceil((to-from)*Math.max(cell.rx,cell.ry)/2.5));
        for(let j=0;j<=n;j++)points.push(port(cell,from+(to-from)*j/n));
        const path=add(points,pick(7,13),colour,{joined:true,role:'structure',major:true,fibres:152});if(path)carriers.push(path);
      }
      guides.push({x:cell.x,y:cell.y,r:Math.min(cell.rx,cell.ry)+10});
    }
    const pending=[];
    const resolve=id=>id[0]==='c'?cells[Number(id.slice(1))]:id[0]==='h'?hubs[Number(id.slice(1))]:tips[Number(id.slice(1))];
    function remember(p){if(!junctions.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<3))junctions.push(p);}
    for(const [from,to,bends,width,colour] of layout.edges){
      const a=resolve(from),b=resolve(to),via=bends.map(([x,y])=>point(x+pick(-.012,.012),y+pick(-.012,.012))),control=[a,...via,b];
      if(from[0]==='c'){
        const angle=angleTo(a,control[1]),p=port(a,angle),dx=p.x-a.x,dy=p.y-a.y,length=Math.hypot(dx,dy)||1;
        a.ports.push(angle);control[0]=p;control.splice(1,0,{x:p.x+dx/length*32,y:p.y+dy/length*32});remember(p);
      }else if(from[0]==='h')remember(a);
      if(to[0]==='c'){
        const angle=angleTo(b,control[control.length-2]),p=port(b,angle),dx=p.x-b.x,dy=p.y-b.y,length=Math.hypot(dx,dy)||1;
        b.ports.push(angle);control[control.length-1]=p;control.splice(control.length-1,0,{x:p.x+dx/length*32,y:p.y+dy/length*32});remember(p);
      }else if(to[0]==='h')remember(b);
      pending.push({control,width:width*pick(.82,1.12),colour});
    }
    boundary(primary,0);
    for(const cell of cells)if(cell!==primary)boundary(cell,kind==='orbits'?0:2);
    for(const edge of pending)channel(edge.control,edge.width,edge.colour,{fibres:edge.width<7?76:112});
    for(let i=0;i<junctions.length;i++)pools.push({...junctions[i],r:pick(8,18),color:i%3});
    const scaffold=transportField({paths,w,h},192,120);
    function clearVoid(p){
      for(const cell of cells){
        const x=p.x-cell.x,y=p.y-cell.y,c=Math.cos(cell.angle),s=Math.sin(cell.angle),r=Math.hypot((x*c+y*s)/cell.rx,(-x*s+y*c)/cell.ry);
        if(r<.94)p=port(cell,angleTo(cell,p));
      }
      return p;
    }
    const curls=regions.flatMap((r,index)=>Array.from({length:3},(_,i)=>({x:r.x+pick(-.3,.3)*r.rx,y:r.y+pick(-.35,.35)*r.ry,r:pick(25,58),spin:(i%2?-1:1)*(index?-.9:1)})));
    function trace(start,steps,width,color,role='plume'){
      let x=start.x,y=start.y;const points=[],phase=rand()*TAU;
      for(let k=0;k<steps;k++){
        const q=guideAt(scaffold,x,y),loosen=diffuse(x,y);
        let vx=q.vx*.85+Math.max(-1.1,Math.min(1.1,q.dx*.018)),vy=q.vy*.85+Math.max(-1.1,Math.min(1.1,q.dy*.018));
        for(const v of curls){const dx=x-v.x,dy=y-v.y,m=v.spin*110/(dx*dx+dy*dy+v.r*v.r);vx-=dy*m;vy+=dx*m;}
        const n=(noise(x*.017+phase,y*.017,seed+57)-.5)*TAU*2;
        vx+=Math.cos(n)*(.18+loosen*.72);vy+=Math.sin(n)*(.18+loosen*.72);
        const speed=Math.max(1,Math.hypot(vx,vy)/2.4),p=clearVoid({x:x+vx/speed*1.25,y:y+vy/speed*1.25});x=p.x;y=p.y;
        if(x<.045*w||x>.96*w||y<.13*h||y>.88*h)break;
        if(k%3===0)points.push({x,y});
      }
      return add(points,width,color,{role,wild:true,fibres:role==='thread'?18:22});
    }
    for(let regionIndex=0;regionIndex<regions.length;regionIndex++){
      const region=regions[regionIndex],near=carriers.filter(path=>path.points.some((p,i)=>i%12===0&&Math.hypot((p.x-region.x)/region.rx,(p.y-region.y)/region.ry)<1.15));
      const count=regionIndex===0?100:58;
      for(let i=0;i<count;i++){
        let start,colour;
        if(i%3!==0&&near.length){const path=near[Math.floor(rand()*near.length)];let candidates=path.points.filter((p,j)=>j%5===0&&Math.hypot((p.x-region.x)/region.rx,(p.y-region.y)/region.ry)<1.2);const q=candidates[Math.floor(rand()*candidates.length)]??path.points[0];start={x:q.x+pick(-22,22),y:q.y+pick(-22,22)};colour=path.color;}
        else{const a=rand()*TAU,r=Math.sqrt(rand())*.85;start={x:region.x+Math.cos(a)*region.rx*r,y:region.y+Math.sin(a)*region.ry*r};}
        colour??=guideAt(scaffold,start.x,start.y).lineage;
        trace(clearVoid(start),230+Math.floor(rand()*200),pick(1.0,3.2),colour);
      }
    }
    // A few long threads split from routes and fold back into the same field.
    for(let i=0;i<(elongated?44:24);i++){
      const carrier=carriers[Math.floor(rand()*carriers.length)],q=sample(carrier,pick(.12,.88));
      trace({x:q.x+q.nx*pick(-10,10),y:q.y+q.ny*pick(-10,10)},pick(180,420),pick(.7,1.8),carrier.color,'thread');
    }
    if(kind==='attractor'){
      const region=regions[0],sigma=pick(9.5,12),rho=pick(26,30),beta=pick(2.4,2.8),points=[];let x=.1,y=1,z=18;
      for(let i=0;i<6800;i++){const dx=sigma*(y-x),dy=x*(rho-z)-y,dz=x*y-beta*z;x+=dx*.006;y+=dy*.006;z+=dz*.006;if(i>900&&i%5===0)points.push(clearVoid({x:region.x+x*region.rx/18,y:region.y+(z-25)*region.ry/23}));}
      for(let i=0;i<points.length-140;i+=110)add(points.slice(i,i+160),pick(1.0,2.3),i%3,{role:'plume',wild:true,fibres:14});
    }
    for(const path of paths){
      path.profile=path.points.map((p,i)=>{
        const d=diffuse(p.x,p.y),t=i/(path.points.length-1),plume=path.role==='plume';
        const fine=path.role==='thread';
        return {spread:1+d*(plume?.4:fine?.3:2.4),density:plume?(.8+d*.35)*Math.sin(Math.PI*t)**.25:fine?.85+d*.35:1.12-d*.82,definition:path.role==='structure'?Math.max(0,1-d*1.5):0};
      });
    }
    // Rotate the connected drawing as one composition, then preserve paper margins.
    const angle=pick(...layout.angle),flip=rand()<.5?-1:1,c=Math.cos(angle),s=Math.sin(angle);
    const rotate=p=>{const x=(p.x-w*.5)*flip,y=p.y-h*.5;return {x:w*.5+x*c-y*s,y:h*.5+x*s+y*c};};
    const bounds={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity};
    for(const path of paths)for(const p of path.points){const q=rotate(p);bounds.x0=Math.min(bounds.x0,q.x);bounds.x1=Math.max(bounds.x1,q.x);bounds.y0=Math.min(bounds.y0,q.y);bounds.y1=Math.max(bounds.y1,q.y);}
    const occupancy=pick(.93,1.03),scale=Math.min(1,w*layout.frame[2]*occupancy/(bounds.x1-bounds.x0),h*layout.frame[3]*occupancy/(bounds.y1-bounds.y0)),cx=(bounds.x0+bounds.x1)/2,cy=(bounds.y0+bounds.y1)/2;
    const halfX=(bounds.x1-bounds.x0)*scale/(2*w),halfY=(bounds.y1-bounds.y0)*scale/(2*h);
    const centreX=Math.max(.045+halfX,Math.min(.955-halfX,(flip<0?1-layout.frame[0]:layout.frame[0])+pick(-.015,.015)));
    const centreY=Math.max(.14+halfY,Math.min(.88-halfY,layout.frame[1]+pick(-.012,.012)));
    const transform=p=>{const q=rotate(p);return {x:w*centreX+(q.x-cx)*scale,y:h*centreY+(q.y-cy)*scale};};
    for(const path of paths){path.points=path.points.map(transform);path.width*=scale;path.length*=scale;}
    for(const p of pools){const q=transform(p);p.x=q.x;p.y=q.y;p.r*=scale;}
    for(const p of guides){const q=transform(p);p.x=q.x;p.y=q.y;p.r*=scale;}
    return {paths,pools,seed,w,h,design:choice,guides,composition:{layout:{id:layout.id,name:layout.name},cells:cells.map(cell=>({...transform(cell),rx:cell.rx*scale,ry:cell.ry*scale})),junctions:junctions.map(transform),regions:regions.map(r=>({...transform(r),rx:r.rx*scale,ry:r.ry*scale})),connected:true}};
  }

  function transportField(model,w=256,h=160){
    const count=w*h,owners=new Int32Array(count).fill(-1),samples=[];
    for(const path of model.paths)for(let k=1;k<path.points.length;k+=3){
      const a=path.points[k-1],p=path.points[k],dx=p.x-a.x,dy=p.y-a.y,length=Math.hypot(dx,dy);
      if(length<.001)continue;
      const index=samples.length;samples.push({x:p.x,y:p.y,vx:dx/length,vy:dy/length,width:path.width,colour:path.color});
      const x=Math.max(0,Math.min(w-1,Math.floor(p.x/model.w*w))),y=Math.max(0,Math.min(h-1,Math.floor(p.y/model.h*h)));
      owners[y*w+x]=index;
    }
    function relax(index,other,x,y){
      const candidate=owners[other];if(candidate<0)return;
      const p=samples[candidate],current=owners[index],q=samples[current];
      if(current<0||(p.x-x)**2+(p.y-y)**2<(q.x-x)**2+(q.y-y)**2)owners[index]=candidate;
    }
    if(!samples.length){const data=new Uint8Array(count*4),guide=new Uint8Array(count*4),lineages=new Uint8Array(count);for(let i=0;i<data.length;i+=4){data.set([128,128,0,255],i);guide.set([128,128,0,255],i);}return {w,h,data,guide,lineages,paperWidth:model.w,paperHeight:model.h};}
    for(let pass=0;pass<2;pass++){
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x,px=(x+.5)*model.w/w,py=(y+.5)*model.h/h;
        if(x)relax(i,i-1,px,py);if(y)relax(i,i-w,px,py);if(x&&y)relax(i,i-w-1,px,py);if(x<w-1&&y)relax(i,i-w+1,px,py);
      }
      for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
        const i=y*w+x,px=(x+.5)*model.w/w,py=(y+.5)*model.h/h;
        if(x<w-1)relax(i,i+1,px,py);if(y<h-1)relax(i,i+w,px,py);if(x<w-1&&y<h-1)relax(i,i+w+1,px,py);if(x&&y<h-1)relax(i,i+w-1,px,py);
      }
    }
    const data=new Uint8Array(count*4),guide=new Uint8Array(count*4),lineages=new Uint8Array(count);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,p=samples[owners[y*w+x]],dx=p.x-(x+.5)*model.w/w,dy=p.y-(y+.5)*model.h/h;
      const density=Math.exp(-(dx*dx+dy*dy)/((p.width*2.5+16)**2));
      data.set([128+p.vx*1.4/12*255,128-p.vy*1.4/12*255,(.035+density*.965)*255,255],i);
      guide.set([Math.max(0,Math.min(255,127.5+dx/500*255)),Math.max(0,Math.min(255,127.5-dy/500*255)),density*255,255],i);
      lineages[y*w+x]=p.colour;
    }
    return {w,h,data,guide,lineages,paperWidth:model.w,paperHeight:model.h};
  }
  function guideAt(field,x,y){
    const ix=Math.max(0,Math.min(field.w-1,Math.floor(x/field.paperWidth*field.w))),iy=Math.max(0,Math.min(field.h-1,Math.floor(y/field.paperHeight*field.h))),i=(iy*field.w+ix)*4;
    return {dx:(field.guide[i]/255-.5)*500,dy:-(field.guide[i+1]/255-.5)*500,vx:(field.data[i]/255-.5)*12,vy:-(field.data[i+1]/255-.5)*12,density:field.guide[i+2]/255,lineage:field.lineages[i/4]};
  }
  const api={randomSource,noise,sample,build,designs,arrangements,arrangementFor,transportField,guideAt,TAU};
  root.InkFlow=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
