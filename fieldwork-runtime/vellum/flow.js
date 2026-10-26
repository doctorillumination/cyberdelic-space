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
    const u = f - i, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return {x: a.x + dx * u, y: a.y + dy * u, nx: -dy / l, ny: dx / l};
  }
  function build(seed, w = 1600, h = 1000) {
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
  const api={randomSource,noise,sample,build,TAU};
  root.InkFlow=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
