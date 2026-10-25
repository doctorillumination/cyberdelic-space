export const COUNT = 252;
export const MIN_COUNT = 63;
export const MAX_COUNT = 504;
export const COUNT_STEP = 63;
export const MAX_PARTICLES = 768;
export const FIELD = 12;
export const GRID = 42;
export const SLOTS = 8;
export const MAX_DROP_RADIUS = .44;
const wrap = v => v - FIELD * Math.round(v / FIELD);
function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function validateCount(count) {
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT || count % COUNT_STEP !== 0) {
    throw new RangeError(`Droplet amount must be a multiple of ${COUNT_STEP} from ${MIN_COUNT} to ${MAX_COUNT}.`);
  }
  return count;
}
export class Fluid {
  constructor(seed = 7351, count = COUNT) { this.count = validateCount(count); this.data = new Float32Array(this.count * 8); this.cells = new Float32Array(GRID * GRID * SLOTS).fill(-1); this.particles = []; this.seed = seed; this.reset(seed); }
  reset(seed = this.seed) {
    this.seed = seed; const rand = random(seed); this.time = 0; this.particles = [];
    for (let i = 0; i < this.count; i++) {
      const r = .15 + Math.pow(rand(), 1.3) * .29;
      let x, y;
      for (let attempt = 0; attempt < 160; attempt++) { x = (rand() - .5) * FIELD; y = (rand() - .5) * FIELD; if (this.particles.every(p => Math.hypot(wrap(x-p.x),wrap(y-p.y)) > (r+p.r)*1.03)) break; }
      this.particles.push({x,y,x0:x,y0:y,r,vx:0,vy:0,ax:0,ay:0,density:1,stretch:1,angle:rand()*Math.PI,spin:rand()*6.28,capillary:0,capillaryV:0,phase:rand()*6.28});
    }
    this.upload();
  }
  step(dt, settings, pointer) {
    this.time += dt; const ps=this.particles, t=this.time, flow=settings.flow;
    for (const p of ps) {
      p.ax=.12*flow*(Math.sin(p.y*1.2+t*.42+p.phase*.15)+.4*Math.cos(p.x*1.6-t*.3));
      p.ay=.12*flow*(Math.cos(p.x*1.1+t*.31+p.phase*.15)-.4*Math.sin(p.y*1.4-t*.38));
      p.ax+=wrap(p.x0-p.x)*.08;p.ay+=wrap(p.y0-p.y)*.08;p.density=1;
      if(pointer.active) { const dx=wrap(p.x-pointer.x),dy=wrap(p.y-pointer.y),d2=dx*dx+dy*dy; const influence=Math.exp(-d2/1.3); p.ax+=pointer.vx*influence*6; p.ay+=pointer.vy*influence*6; }
    }
    for(let i=0;i<this.count;i++) for(let j=i+1;j<this.count;j++) {
      const a=ps[i],b=ps[j],dx=wrap(b.x-a.x),dy=wrap(b.y-a.y),d=Math.hypot(dx,dy),rest=a.r+b.r, h=rest*1.8;
      if(d>=h || d<.00001)continue;
      const nx=dx/d,ny=dy/d,q=1-d/h;
      a.density+=q*q;b.density+=q*q;
      // Short-range pressure and longer-range cohesion approximate a surface-fluid pair force.
      const pressure=Math.max(0,rest*.97-d)*18;
      const cohesion=settings.tension*.09*Math.max(0,1-Math.abs(d/rest-1.1)/.65);
      const force=cohesion-pressure;
      a.ax+=nx*force;b.ax-=nx*force;a.ay+=ny*force;b.ay-=ny*force;
      const visc=settings.viscosity*2.2*q,fx=(b.vx-a.vx)*visc,fy=(b.vy-a.vy)*visc;
      a.ax+=fx;b.ax-=fx;a.ay+=fy;b.ay-=fy;
    }
    for(const p of ps) {
      const damping=Math.exp(-dt*(.8+settings.viscosity*1.8));
      p.vx=(p.vx+p.ax*dt)*damping;p.vy=(p.vy+p.ay*dt)*damping;
      const speed=Math.hypot(p.vx,p.vy);if(speed>1.4){p.vx*=1.4/speed;p.vy*=1.4/speed;}
      p.x=wrap(p.x+p.vx*dt);p.y=wrap(p.y+p.vy*dt);
      const target=.22*Math.sin(t*1.5+p.phase)*flow + Math.min(.16,speed*.3);
      p.capillaryV+=(target-p.capillary)*(8+settings.tension*30)*dt;
      p.capillaryV*=Math.exp(-dt*(2+settings.viscosity*5));p.capillary+=p.capillaryV*dt;
      p.stretch=1+Math.max(-.15,Math.min(.24,p.capillary));
      if(speed>.008){const desired=Math.atan2(p.vy,p.vx);let da=Math.atan2(Math.sin(desired-p.angle),Math.cos(desired-p.angle));p.angle+=da*dt*2;}
    }
  }
  upload() {
    const ps=this.particles;
    for(let i=0;i<this.count;i++){const p=ps[i];this.data.set([p.x,p.y,p.r,p.stretch],i*4);this.data.set([Math.cos(p.angle),Math.sin(p.angle),Math.max(.64,Math.min(.92,.78-p.capillary*.2)),p.density],this.count*4+i*4);}
    // Rasterize supports into a spatial grid before selecting the closest eight.
    const bins=Array.from({length:GRID*GRID},()=>[]),cellSize=FIELD/GRID;
    for(let i=0;i<this.count;i++){
      const p=ps[i],cx=Math.floor((p.x+FIELD/2)/cellSize),cy=Math.floor((p.y+FIELD/2)/cellSize),reach=Math.ceil((p.r*1.3+.75)/cellSize);
      for(let oy=-reach;oy<=reach;oy++)for(let ox=-reach;ox<=reach;ox++){
        const x=(cx+ox+GRID)%GRID,y=(cy+oy+GRID)%GRID;
        const wx=(x+.5)*cellSize-FIELD/2,wy=(y+.5)*cellSize-FIELD/2;
        const d=Math.hypot(wrap(wx-p.x),wrap(wy-p.y))-p.r*1.3;
        if(d<.75)bins[y*GRID+x].push([i,d]);
      }
    }
    for(let cell=0;cell<bins.length;cell++){
      const ids=bins[cell];ids.sort((a,b)=>a[1]-b[1]);
      for(let k=0;k<SLOTS;k++)this.cells[cell*SLOTS+k]=k<ids.length?ids[k][0]:-1;
    }
  }
  stats(){let energy=0;for(const p of this.particles)energy+=p.vx*p.vx+p.vy*p.vy;return {seed:this.seed,count:this.count,time:this.time,energy,finite:this.particles.every(p=>[p.x,p.y,p.vx,p.vy,p.stretch].every(Number.isFinite))};}
}
