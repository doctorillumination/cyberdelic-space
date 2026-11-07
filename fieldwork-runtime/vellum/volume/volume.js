/* Three-dimensional nearest-channel transport, extending Vellum's field builder. */
(function(root){
  'use strict';
  const N=48,TILES=8,DOMAIN=5.8,W=N*TILES,H=N*Math.ceil(N/TILES);
  function build(model){
    const count=N*N*N,owners=new Int32Array(count).fill(-1),samples=model.samples;
    const index=(x,y,z)=>x+N*(y+N*z),address=(x,y,z)=>(x+(z%TILES)*N+W*(y+Math.floor(z/TILES)*N))*4;
    const world=i=>((i+.5)/N-.5)*DOMAIN;
    for(let i=0;i<samples.length;i++){
      const p=samples[i].point,c=p.map(v=>Math.max(1,Math.min(N-2,Math.floor((v/DOMAIN+.5)*N))));owners[index(...c)]=i;
    }
    function relax(i,j,x,y,z){
      const candidate=owners[j];if(candidate<0)return;const c=samples[candidate].point,current=owners[i];
      if(current<0){owners[i]=candidate;return;}
      const p=samples[current].point;
      if((c[0]-x)**2+(c[1]-y)**2+(c[2]-z)**2<(p[0]-x)**2+(p[1]-y)**2+(p[2]-z)**2)owners[i]=candidate;
    }
    for(let pass=0;pass<2;pass++){
      for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
        const i=index(x,y,z),px=world(x),py=world(y),pz=world(z);
        if(x)relax(i,i-1,px,py,pz);if(y)relax(i,i-N,px,py,pz);if(z)relax(i,i-N*N,px,py,pz);
        if(x&&y)relax(i,i-1-N,px,py,pz);if(x&&z)relax(i,i-1-N*N,px,py,pz);if(y&&z)relax(i,i-N-N*N,px,py,pz);
      }
      for(let z=N-1;z>=0;z--)for(let y=N-1;y>=0;y--)for(let x=N-1;x>=0;x--){
        const i=index(x,y,z),px=world(x),py=world(y),pz=world(z);
        if(x<N-1)relax(i,i+1,px,py,pz);if(y<N-1)relax(i,i+N,px,py,pz);if(z<N-1)relax(i,i+N*N,px,py,pz);
        if(x<N-1&&y<N-1)relax(i,i+1+N,px,py,pz);if(x<N-1&&z<N-1)relax(i,i+1+N*N,px,py,pz);if(y<N-1&&z<N-1)relax(i,i+N+N*N,px,py,pz);
      }
    }
    const flow=new Float32Array(W*H*4),guide=new Float32Array(W*H*4),deposit=new Float32Array(W*H*4);
    for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const s=samples[owners[index(x,y,z)]],p=[world(x),world(y),world(z)],q=s.point;
      const d=p.map((v,i)=>v-q[i]),d2=d.reduce((sum,v)=>sum+v*v,0),width=s.width*2.8+.075;
      const wet=Math.exp(-d2/(width*width)),v=s.tangent.map(a=>a*.21*wet);
      let reservoir=0;
      for(const pool of model.pools){
        const r=p.map((a,i)=>a-pool.center[i]),r2=r.reduce((sum,a)=>sum+a*a,0),weight=Math.exp(-r2/(pool.radius*pool.radius*2.8));
        const a=pool.axis,k=pool.strength*weight*1.8;
        v[0]+=(a[1]*r[2]-a[2]*r[1])*k;v[1]+=(a[2]*r[0]-a[0]*r[2])*k;v[2]+=(a[0]*r[1]-a[1]*r[0])*k;reservoir=Math.max(reservoir,weight);
      }
      const j=address(x,y,z);flow.set([...v,wet],j);guide.set([...q,reservoir],j);
      const supply=(.12+.18*reservoir)*wet*(.4+.6*Math.sin(s.t*17+s.phase)**2);
      deposit[j+s.color]=supply;deposit[j+3]=reservoir;
    }
    return {N,TILES,DOMAIN,w:W,h:H,flow,guide,deposit};
  }
  root.EstuaryVolume={build,N,TILES,DOMAIN,W,H};
})(typeof window==='undefined'?globalThis:window);
