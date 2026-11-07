/* Vellum material ribbons lifted into volume. The paths guide water, not a skin. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  function randomSource(seed){let n=seed>>>0;return()=>{n+=0x6d2b79f5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
  const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>mul(a,1/(Math.hypot(...a)||1));
  function noise(x,y,z,seed){
    const h=(a,b,c)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,2147483647)^seed;n=Math.imul(n^n>>>13,1274126177);return((n^n>>>16)>>>0)/4294967295;};
    const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z);let u=x-a,v=y-b,w=z-c;u=u*u*(3-2*u);v=v*v*(3-2*v);w=w*w*(3-2*w);
    const mix=(x,y,t)=>x+(y-x)*t;
    return mix(mix(mix(h(a,b,c),h(a+1,b,c),u),mix(h(a,b+1,c),h(a+1,b+1,c),u),v),mix(mix(h(a,b,c+1),h(a+1,b,c+1),u),mix(h(a,b+1,c+1),h(a+1,b+1,c+1),u),v),w);
  }
  const formNames=['Branches','Gyre','Plume','Braid'];
  function grow(seed=21,form=0){
    form=Math.max(0,Math.min(formNames.length-1,Math.trunc(Number(form)||0)));
    const rand=randomSource(seed),paths=[],pools=[],familyPools=new Uint8Array(7),roots=[];
    function branch(start,direction,length,width,depth,color,phase,family){
      const d=norm(direction),u=norm(cross(d,Math.abs(d[1])>.9?[0,0,1]:[0,1,0])),v=cross(d,u);
      const bend=(rand()-.5)*.60,curl=(rand()-.5)*.65,twist=(rand()-.5)*2.1;
      const point=t=>add(add(add(start,mul(d,length*t)),mul(u,length*bend*t*t)),mul(v,length*curl*t*t*t));
      const tangent=t=>norm(add(add(d,mul(u,2*bend*t)),mul(v,3*curl*t*t)));
      const path={point,tangent,u,v,length,width,depth,color,phase,twist,pool:false,role:'stream',family};paths.push(path);
      if(depth===4)roots.push(path);
      if(depth===0)return;
      const endpoint=point(1),axis=tangent(1);
      if(depth>1&&familyPools[family]<2&&rand()<.70){pools.push({center:point(.78),axis:norm(add(v,mul(u,.4))),radius:.11+width*.45,strength:(rand()<.5?-1:1)*(.65+rand()*.45),color});familyPools[family]++;}
      const spin=rand()*TAU;
      for(let j=0;j<2;j++){
        const phi=spin+j*Math.PI,spread=.40+rand()*.40;
        const next=norm(add(mul(axis,.92),add(mul(u,Math.cos(phi)*spread),mul(v,Math.sin(phi)*spread))));
        branch(endpoint,next,length*(.65+rand()*.12),width*(.56+rand()*.14),depth-1,(color+(rand()<.16?1:0))%3,phase+rand()*2,family);
      }
    }
    if(form===0){
      const arms=[[-.89,.18,.27],[.64,.65,.29],[.03,.96,-.32],[-.29,-.78,-.48],[.61,-.60,.49],[-.40,.35,-.87],[.06,-.10,.97]];
      for(let i=0;i<arms.length;i++)branch([0,-.08,0],norm(add(arms[i],[(rand()-.5)*.12,(rand()-.5)*.12,(rand()-.5)*.12])),.58+rand()*.14,.22+rand()*.07,4,i%3,rand()*TAU,i);
    }else{
      // Each family changes the water's topology before material is distributed.
      const count=form===1?7:form===2?6:5,phase=rand()*TAU,hand=rand()<.5?-1:1;
      const turns=form===1?.84+rand()*.32:form===2?.26+rand()*.22:.85+rand()*.45;
      const lean=[(rand()-.5)*.32,(rand()-.5)*.30];
      for(let i=0;i<count;i++){
        const phi=phase+i/count*TAU,jitter=(rand()-.5)*.14;
        let point;
        if(form===1){
          const radius=.70+rand()*.22,tilt=(rand()-.5)*.5;
          point=t=>{const a=phi+hand*TAU*turns*t,r=radius+.11*Math.sin(a*3+phi);return [Math.cos(a)*r,(t-.5)*.38+Math.sin(a*2+phi)*.19+tilt*Math.cos(a),Math.sin(a)*r*.83];};
        }else if(form===2){
          point=t=>{const a=phi+hand*TAU*turns*t,r=.09+.17*t+.52*t*t;return [Math.cos(a)*r+lean[0]*t,-1.1+2.05*t-.22*t**3,Math.sin(a)*r+lean[1]*t];};
        }else{
          point=t=>{const a=phi+hand*TAU*turns*t,r=.22+.26*Math.sin(Math.PI*t)**2+jitter;return [Math.cos(a)*r+lean[0]*(t-.5),(t-.5)*2.2,Math.sin(a)*r+lean[1]*(t-.5)];};
        }
        const tangent=t=>norm(add(point(t+.0001),mul(point(t-.0001),-1))),d=tangent(.5);
        const u=norm(cross(d,Math.abs(d[1])>.85?[0,0,1]:[0,1,0])),v=cross(d,u);
        let length=0,previous=point(0);for(let k=1;k<=80;k++){const q=point(k/80);length+=Math.hypot(...q.map((x,j)=>x-previous[j]));previous=q;}
        const path={point,tangent,u,v,length,width:.075+rand()*.045,depth:4,color:i%3,phase:phi,twist:1+rand()*2,pool:form===1,role:'stream',family:i};
        paths.push(path);roots.push(path);
        for(let j=0;j<3;j++){
          const t=.35+j*.23,q=point(t),a=phi+j*2.2;
          const outward=norm([Math.cos(a),form===2?.6:(rand()-.5)*1.2,Math.sin(a)]);
          branch(q,norm(add(mul(tangent(t),.5),outward)),.22+rand()*.22,.035+rand()*.03,2,i%3,rand()*TAU,i);
        }
        const center=point(.35+rand()*.4),axis=norm(add(u,mul(v,.5)));
        pools.push({center,axis,radius:.13+rand()*.07,strength:(i%2?-1:1)*(.7+rand()*.4),color:i%3});
      }
    }
    // Larger returning currents cross the branch families in tilted planes.
    for(let i=0;i<4;i++){
      const root=roots[(i*2+1)%roots.length],center=root.point(.86),axis=norm(add(root.v,mul(root.tangent(.7),.55))),u=norm(cross(axis,Math.abs(axis[1])>.8?[0,0,1]:[0,1,0])),v=cross(axis,u);
      const radius=(form===0?.30:.18)+rand()*.13,phase=rand()*TAU,stretch=.75+rand()*.40;
      const point=t=>{const a=t*TAU;return add(center,add(add(mul(u,Math.cos(a)*radius*(1+.13*Math.sin(a*3+phase))),mul(v,Math.sin(a)*radius*stretch)),mul(axis,Math.sin(a*2+phase)*radius*.37)));};
      const tangent=t=>norm(mul(add(point(t+.0001),mul(point(t-.0001),-1)),5000));
      paths.push({point,tangent,u:axis,v:u,length:TAU*radius,width:.055+rand()*.025,depth:2,color:i%3,phase,twist:1.0,pool:true,role:'circulation'});
      pools.push({center,axis,radius,strength:(i%2?-1:1)*(1.1+rand()*.35),color:i%3});
    }
    for(let i=0;i<5;i++){
      const a=roots[i%roots.length].point(form===0?.95:.7),b=roots[(i+2)%roots.length].point(form===0?.9:.38),d=add(b,mul(a,-1)),axis=norm(d),u=norm(cross(axis,Math.abs(axis[1])>.85?[0,0,1]:[0,1,0])),v=cross(axis,u),phase=rand()*TAU;
      const point=t=>add(add(add(a,mul(d,t)),mul(u,Math.sin(t*Math.PI)*(.18+.12*Math.sin(t*TAU+phase)))),mul(v,Math.sin(t*TAU)*.17));
      const tangent=t=>norm(add(point(t+.0001),mul(point(t-.0001),-1)));
      paths.push({point,tangent,u,v,length:Math.hypot(...d)*1.45,width:.055+rand()*.045,depth:2,color:i%3,phase,twist:1.8,pool:false,role:'return'});
    }
    // Small recirculating ink basins use the same ribbon construction as streams.
    for(const pool of pools.slice(0,-4)){
      const u=norm(cross(pool.axis,Math.abs(pool.axis[1])>.85?[0,0,1]:[0,1,0])),v=cross(pool.axis,u),phase=rand()*TAU,r=pool.radius*.68;
      const point=t=>{const a=t*TAU*1.35+phase,rad=r*(.23+.77*t);return add(pool.center,add(add(mul(u,Math.cos(a)*rad),mul(v,Math.sin(a)*rad)),mul(pool.axis,Math.sin(a*2)*r*.22)));};
      const tangent=t=>norm(add(mul(u,-Math.sin(t*TAU*1.35+phase)),mul(v,Math.cos(t*TAU*1.35+phase))));
      paths.push({point,tangent,u:pool.axis,v:u,length:TAU*r,width:pool.radius*.20,depth:1,color:pool.color,phase,twist:.7,pool:true,role:'eddy'});
    }
    let extent=0;
    for(const path of paths)for(let i=0;i<=50;i++)extent=Math.max(extent,Math.hypot(...path.point(i/50))+path.width*2);
    const scale=1.75/extent;
    for(const path of paths){const old=path.point;path.point=t=>mul(old(t),scale);path.length*=scale;path.width*=scale;}
    for(const pool of pools){pool.center=mul(pool.center,scale);pool.radius*=scale;}
    const plan=paths.map(path=>({path,steps:Math.max(28,Math.ceil(path.length*220)),fibres:Math.round(path.role==='eddy'?260:path.role==='circulation'?480:20+path.width*6000)}));
    const budget=235000,demand=plan.reduce((s,p)=>s+p.steps*p.fibres,0),factor=Math.min(1,budget/demand);
    for(const p of plan)p.fibres=Math.max(10,Math.floor(p.fibres*factor));
    const plannedNodes=plan.reduce((sum,p)=>sum+p.fibres*(p.steps+1),0);
    if(plannedNodes>250000)for(const p of plan)p.fibres=Math.max(4,Math.floor(p.fibres*250000/plannedNodes));
    const nodes=[],links=[],shapes=[],samples=[];let strands=0,diffuseStrands=0;
    for(const {path,steps,fibres} of plan){
      path.nodeStart=nodes.length/4;
      for(let k=0;k<=steps;k+=3){const t=k/steps;samples.push({point:path.point(t),tangent:path.tangent(t),width:path.width,color:path.color,pool:path.pool,phase:path.phase,t});}
      for(let j=0;j<fibres;j++){
        strands++;const base=nodes.length/4,phase=.001+rand()*.998,kind=rand();
        // Dilute curves have their own width and optical load, with visible edges.
        const material=kind<.42?0:kind<.94?1:2;
        if(material===1)diffuseStrands++;
        const lane=(rand()*2-1)*(material===0?.70:material===1?2.2:3.2),depthLane=(rand()-.5)*(material===1?.85:.45);
        const load=material===0?.55+rand()*1.45:material===1?.12+rand()*.23:.025+rand()*.055;
        const breadth=material===0?.0018+rand()*.0015:.003+rand()*.0045;
        const color=rand()<.045?(path.color+1)%3:path.color;
        let previous;
        for(let k=0;k<=steps;k++){
          const t=k/steps,q=path.point(t),twist=path.twist*t+.35*Math.sin(t*5+path.phase);
          const a=add(mul(path.u,Math.cos(twist)),mul(path.v,Math.sin(twist))),b=cross(path.tangent(t),a);
          const loosen=.5+.5*Math.sin(t*8+path.phase),spread=path.width*(.16+.84*(.5+.5*Math.sin(t*17+path.phase))**2);
          const fold=(noise(q[0]*22,q[1]*22+lane*2,q[2]*22,seed+17)-.5)*path.width*.55;
          const off=lane*spread*(1+loosen*.65)+fold+Math.sin(t*97+phase*TAU)*.00065;
          const thickness=depthLane*spread+.28*path.width*Math.sin(t*13+lane*2+path.phase);
          const p=add(q,add(mul(a,off),mul(b,thickness)));
          nodes.push(...p,(path.pool?5:0)+phase);
          if(k>0){
            const mid=(k-.5)/steps,poolLoad=path.pool?2.4:1+2.7*Math.exp(-(((mid-(.20+.55*(path.phase/TAU%1)))/.065)**2));
            const density=load*poolLoad*(.45+.55*(1-loosen));
            const length=Math.hypot(...p.map((v,i)=>v-previous[i]));
            links.push(base+k-1,base+k,length,material+breadth);shapes.push(mid,phase,color,density);
          }
          previous=p;
        }
      }
      path.nodeEnd=nodes.length/4;
    }
    const size=2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(nodes.length/4)))),segmentSize=2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(links.length/4))));
    const pack=(a,s)=>{const out=new Float32Array(s*s*4);out.set(a);return out;};
    const forms=Object.fromEntries(['stream','return','circulation','eddy'].map(role=>[role,paths.filter(p=>p.role===role).length]));
    return {seed,form,formName:formNames[form],paths,pools,samples,strands,diffuseStrands,forms,branches:forms.stream,nodeCount:nodes.length/4,segmentCount:links.length/4,freeSegmentCount:0,size,segmentSize,nodes:pack(nodes,size),links:pack(links,segmentSize),shapes:pack(shapes,segmentSize)};
  }
  root.EstuaryGrowth={grow,formNames,randomSource,noise};
})(typeof window==='undefined'?globalThis:window);
