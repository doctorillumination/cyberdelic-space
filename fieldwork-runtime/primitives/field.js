(function(root){
  'use strict';
  const WORLD=512,MIN_ZOOM=.12,MIN_CELL=8,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mod=(v,n=WORLD)=>((v%n)+n)%n;
  function hash(seed,x,y){let h=(seed^Math.imul(x,374761393)^Math.imul(y,668265263))>>>0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
  const fade=t=>t*t*t*(10+t*(-15+6*t)),mix=(a,b,t)=>a+(b-a)*t;
  function noise(seed,x,y){
    const i=Math.floor(x),j=Math.floor(y),dx=x-i,dy=y-j,u=fade(dx),v=fade(dy);
    const dot=(a,b)=>{const g=Math.floor(hash(seed,a,b)*8),dx=x-a,dy=y-b;return g<4?(g===0?dx:g===1?-dx:g===2?dy:-dy):((g&1?-dx:dx)+(g&2?-dy:dy))*.70710678;};
    return mix(mix(dot(i,j),dot(i+1,j),u),mix(dot(i,j+1),dot(i+1,j+1),u),v)*1.45;
  }
  function fbm(seed,x,y){return noise(seed,x,y)*.62+noise(seed^0x62ad,x*2,y*2)*.26+noise(seed^0x432b,x*4,y*4)*.12;}
  const patterns=Object.freeze([
    {id:'blocks',name:'Quiet blocks',description:'Offset rectangles, open seams.',family:'Ordered'},
    {id:'rooms',name:'Open rooms',description:'Uneven rooms and clear corridors.',family:'Ordered'},
    {id:'weave',name:'Woven bands',description:'Over and under, with loose ends.',family:'Ordered'},
    {id:'lanes',name:'Signal lanes',description:'Long tracks with dense crossings.',family:'Ordered'},
    {id:'steps',name:'Stepped islands',description:'Clusters built from right angles.',family:'Islands · Original'},
    {id:'rhythm',name:'Grid rhythm',description:'Repeating groups, small surprises.',family:'Ordered'},
    {id:'nested',name:'Nested squares',description:'Small structures inside larger ones.',family:'Ordered'},
    {id:'hybrid',name:'Soft geometry',description:'Firm blocks, gently frayed edges.',family:'Mixed'},
    {id:'scatter',name:'Constellation',description:'Fine marks and tiny gatherings.',family:'Stars · Original'},
    {id:'noise',name:'Organic drift',description:'The earlier flowing noise field.',family:'Organic'},
    {id:'steps-small',name:'Small islands',description:'Smaller gatherings, finer two-cell steps.',family:'Islands · Fine'},
    {id:'steps-broken',name:'Broken islands',description:'Openings and fragments within stepped clusters.',family:'Islands · Fragmented'},
    {id:'scatter-loose',name:'Loose constellation',description:'More space between individual marks.',family:'Stars · Airy'},
    {id:'scatter-gathered',name:'Gathered stars',description:'Tiny constellations gathering around quiet cores.',family:'Stars · Clustered'},
    {id:'dissolve',name:'Dissolving islands',description:'Stepped cores loosen into scattered cells.',family:'Islands + Stars · Hybrid'}
  ].map(Object.freeze));
  // Retired patterns remain readable in saved studies but are absent from the lab.
  const labPatterns=Object.freeze(['steps','scatter','steps-small','scatter-loose','steps-broken','scatter-gathered','dissolve'].map(id=>patterns.find(pattern=>pattern.id===id)));
  function island(seed,i,j,period=22,step=3,falloff=.16){
    const bx=Math.floor(i/period),by=Math.floor(j/period),margin=Math.floor(period*.28),range=Math.floor(period*.46);
    const cx=margin+Math.floor(hash(seed,bx,by)*range),cy=margin+Math.floor(hash(seed^0x241a,bx,by)*range);
    const dx=Math.abs(Math.floor((mod(i,period)-cx)/step)),dy=Math.abs(Math.floor((mod(j,period)-cy)/step));
    return clamp(1.02-(dx+dy)*falloff+hash(seed^0x481a,Math.floor(i/step),Math.floor(j/step))*.12);
  }
  function structure(seed,generation,i,j,pattern){
    const a=hash(seed^0x72ad,Math.floor(i/8),Math.floor(j/6)),grain=hash(seed^0x83ca,i,j);
    // Generation changes the accents; the underlying grid architecture stays registered.
    const accent=hash(seed^0x19ff,i+generation,j);
    let value,rich;
    if(pattern==='blocks'){
      const row=Math.floor(j/7),x=i+Math.floor(hash(seed,row,7)*6),bx=Math.floor(x/10),by=row;
      const block=hash(seed^0x31ab,bx,by),seam=mod(x,10)===0||mod(j,7)===0;
      value=seam?.06+grain*.17:block*.84+.12+grain*.04;
      rich=hash(seed^0x914c,bx,by);
    }else if(pattern==='rooms'){
      const bx=Math.floor(i/24),by=Math.floor(j/20),x=mod(i,24),y=mod(j,20);
      const cutX=7+Math.floor(hash(seed,bx,by)*10),cutY=6+Math.floor(hash(seed^0x431b,bx,by)*8);
      const rx=x>cutX?1:0,ry=y>cutY?1:0,seam=x===0||y===0||x===cutX||y===cutY;
      value=seam?.05+grain*.12:.12+hash(seed^0x319a,bx*2+rx,by*2+ry)*.85;
      rich=hash(seed^0x641c,bx*2+rx,by*2+ry);
    }else if(pattern==='weave'){
      const x=mod(i,12),y=mod(j,12),across=y<4,down=x<4;
      const strand=across?hash(seed,Math.floor(i/18),Math.floor(j/12)):hash(seed^0x59ad,Math.floor(i/12),Math.floor(j/18));
      value=across&&down?.70+strand*.27:across||down?.34+strand*.54:.06+grain*.25;
      if(accent<.035)value=1-value;
      rich=across&&down?.65+hash(seed^0x9bc,Math.floor(i/12),Math.floor(j/12))*.35:.25+strand*.45;
    }else if(pattern==='lanes'){
      const horizontal=mod(j+Math.floor(hash(seed,Math.floor(i/32),1)*3),11)<2;
      const vertical=mod(i+Math.floor(hash(seed,2,Math.floor(j/28))*3),17)<3;
      const segment=hash(seed^0x398a,Math.floor(i/7),Math.floor(j/5));
      value=horizontal&&vertical?.84+grain*.15:horizontal||vertical?.38+segment*.57:.08+grain*.30;
      rich=horizontal&&vertical?.98:.15+segment*.6;
    }else if(pattern==='steps'){
      const bx=Math.floor(i/22),by=Math.floor(j/22),cx=6+Math.floor(hash(seed,bx,by)*10),cy=6+Math.floor(hash(seed^0x241a,bx,by)*10);
      const dx=Math.abs(Math.floor((mod(i,22)-cx)/3)),dy=Math.abs(Math.floor((mod(j,22)-cy)/3));
      value=clamp(1.02-(dx+dy)*.16+hash(seed^0x481a,Math.floor(i/3),Math.floor(j/3))*.12);
      rich=clamp(.2+value*.7+accent*.1);
    }else if(pattern==='steps-small'){
      value=island(seed,i,j,14,2,.18);rich=.18+value*.63+accent*.16;
    }else if(pattern==='steps-broken'){
      const base=island(seed,i,j),edge=clamp((base-.20)/.65),fragment=hash(seed^0x4f1a,Math.floor(i/2),Math.floor(j/2));
      value=grain<.10+(1-edge)*.22||fragment<.10?.05+grain*.18:base;
      rich=.16+base*.62+hash(seed^0x5ab,Math.floor(i/3),Math.floor(j/3))*.20;
    }else if(pattern==='scatter-loose'){
      const group=hash(seed^0x94ab,Math.floor(i/2),Math.floor(j/2));
      value=grain*.82+group*.18-.18;rich=hash(seed^0x1fca,Math.floor(i/3),Math.floor(j/3));
    }else if(pattern==='scatter-gathered'){
      const bx=Math.floor(i/10),by=Math.floor(j/10),cx=2+Math.floor(hash(seed,bx,by)*6),cy=2+Math.floor(hash(seed^0x7bda,bx,by)*6);
      const distance=Math.max(Math.abs(mod(i,10)-cx),Math.abs(mod(j,10)-cy)),radius=3+hash(seed^0x42ad,bx,by)*2;
      const gathering=clamp(1-distance/radius);
      value=grain*.62+gathering*.48-.07;rich=.12+gathering*.40+hash(seed^0x1fca,Math.floor(i/2),Math.floor(j/2))*.56;
    }else if(pattern==='dissolve'){
      const base=island(seed,i,j),group=hash(seed^0x94ab,Math.floor(i/2),Math.floor(j/2)),scatter=grain*.72+group*.28;
      const cohesion=fade(clamp((base-.30)/.48));
      value=mix(scatter-.26,base,cohesion);rich=.14+base*.60+hash(seed^0x82c,Math.floor(i/3),Math.floor(j/3))*.23;
    }else if(pattern==='rhythm'){
      const bx=Math.floor(i/5),by=Math.floor(j/5),group=mod(bx+by,4),local=mod(i,5)>0&&mod(j,5)>0;
      value=local?[.88,.60,.32,.12][group]+(a-.5)*.14:.05+grain*.12;
      if(hash(seed^0xabc,bx,by)>.9)value=1-value;
      rich=group===0?.70+a*.30:.2+a*.45;
    }else if(pattern==='nested'){
      const bx=Math.floor(i/24),by=Math.floor(j/24),x=mod(i,24),y=mod(j,24),edge=Math.min(x,y,23-x,23-y),ring=Math.floor(edge/2);
      const small=hash(seed^0x31ce,Math.floor(i/4),Math.floor(j/4));
      value=edge===0?.05:clamp([.25,.85,.4,.68,.18,.92][ring%6]+(small-.5)*.26);
      rich=hash(seed^0x6bed,bx,by)*.5+(ring%3===1?.5:.05);
    }else if(pattern==='hybrid'){
      const bx=Math.floor(i/14),by=Math.floor(j/10),x=mod(i,14),y=mod(j,10),edge=Math.min(x,y,13-x,9-y);
      const block=hash(seed^0x91ad,bx,by),fray=noise(seed^0x46ac,i*.29+generation*.03,j*.29)*.35;
      value=clamp(.12+block*.84+(edge<2?fray-.15:fray*.12));
      rich=hash(seed^0x52bc,bx,by)*.8+noise(seed,i*.12,j*.12)*.2;
    }else if(pattern==='scatter'){
      const group=hash(seed^0x94ab,Math.floor(i/2),Math.floor(j/2));
      value=grain*.72+group*.28;rich=hash(seed^0x1fca,Math.floor(i/3),Math.floor(j/3));
    }else{
      const drift=generation*.12,warp=noise(seed^0x14ad,i*.023,j*.023)*3;
      value=clamp(.5+fbm(seed,i*.075+warp+drift,j*.075-warp-drift*.7)*1.12)+(grain-.5)*.12;
      rich=clamp(.5+fbm(seed^0x927b,i*.13+14,j*.13-9)*1.25);
    }
    return {value,rich:clamp(rich)};
  }
  function ecology(seed,generation,i,j,settings){
    const {value,rich}=structure(seed,generation,i,j,settings.pattern||'noise'),coverage=settings.coverage/100;
    if(!coverage||(coverage<1&&value<1-coverage))return 0;
    const roll=hash(seed^0x19ff,i+generation,j);
    let count=roll<.75?1:2;
    if(rich>.67&&roll>.70)count=3;
    if(rich>.78&&roll>.60)count=4+Math.floor(hash(seed^0xa14b,i,j+generation)*3);
    count=Math.min(settings.layers,count);
    return Math.max(1,Math.round(settings.layers+(count-settings.layers)*settings.variety/100));
  }
  class Field{
    constructor(seed){this.seed=seed;this.clock=0;this.owners=null;this.line=new Uint32Array(WORLD);this.window={left:-20,top:-11,columns:40,rows:22};this.turn=null;}
    ownerAt(x,y){const c=mod(x+WORLD/2),r=mod(y+WORLD/2);return this.owners?this.owners[r*WORLD+c]:r*WORLD+c;}
    setWindow(frame){
      const next={left:frame.left,top:frame.top,columns:frame.columns,rows:frame.rows};
      const changed=Object.keys(next).some(key=>next[key]!==this.window[key]);this.window=next;
      if(changed&&this.clock===Math.floor(this.clock))this.turn=null;
    }
    makeTurn(beat){
      const axis=beat%2,origin=Math.ceil(axis===0?this.window.top:this.window.left),count=Math.max(1,Math.floor(axis===0?this.window.rows:this.window.columns)-1);
      return {beat,axis,lane:origin+Math.floor(hash(this.seed^0x91ac,beat,axis)*count),direction:hash(this.seed^0x2a53,beat,axis)<.5?-1:1};
    }
    currentTurn(beat=Math.floor(this.clock)){if(!this.turn||this.turn.beat!==beat)this.turn=this.makeTurn(beat);return this.turn;}
    shift(lane,beat=Math.floor(this.clock)){
      const turn=this.currentTurn(beat);return mod(lane+WORLD/2)===mod(turn.lane+WORLD/2)?turn.direction:0;
    }
    phase(){const beat=Math.floor(this.clock),p=clamp((this.clock-beat)/.68),turn=this.currentTurn(beat);return {...turn,amount:p*p*(3-2*p),settled:p===0||p===1};}
    permute(beat){
      if(!this.owners){this.owners=new Uint32Array(WORLD*WORLD);for(let i=0;i<this.owners.length;i++)this.owners[i]=i;}
      const {axis,lane,direction}=this.currentTurn(beat),index=mod(lane+WORLD/2);
      for(let n=0;n<WORLD;n++)this.line[n]=this.owners[axis===0?index*WORLD+n:n*WORLD+index];
      for(let n=0;n<WORLD;n++)this.owners[axis===0?index*WORLD+n:n*WORLD+index]=this.line[mod(n-direction)];
    }
    step(dt,drive){
      const engaged=drive>.02,fraction=this.clock-Math.floor(this.clock);
      if(!engaged&&fraction<1e-9)return;
      const previous=Math.floor(this.clock),boundary=previous+1;
      let next=this.clock+dt*(.6+Math.min(1,drive)*1.1);
      if(!engaged)next=Math.min(next,boundary);
      for(let beat=previous;beat<Math.floor(next);beat++){this.permute(beat);this.turn=null;}
      this.clock=next;
    }
    snapshot(){return {clock:this.clock,owners:this.owners?Array.from(this.owners):null,window:{...this.window},turn:{...this.currentTurn()}};}
    static restore(seed,data){
      const field=new Field(seed);if(data===undefined)return field;
      if(!data||!Number.isFinite(data.clock)||data.clock<0||data.clock>1e8)throw new Error('Invalid woven field.');
      if(data.owners!==null){
        if(!Array.isArray(data.owners)||data.owners.length!==WORLD*WORLD)throw new Error('Invalid woven cells.');
        const seen=new Uint8Array(WORLD*WORLD);for(const id of data.owners){if(!Number.isInteger(id)||id<0||id>=seen.length||seen[id])throw new Error('Invalid woven cell identity.');seen[id]=1;}
        field.owners=Uint32Array.from(data.owners);
      }else if(data.clock>=1)throw new Error('The woven field is missing its cell identities.');
      if(data.window){
        const w=data.window;if(!['left','top','columns','rows'].every(k=>Number.isFinite(w[k]))||Math.abs(w.left)>16384||Math.abs(w.top)>16384||w.columns<=0||w.rows<=0||w.columns>16384||w.rows>16384)throw new Error('Invalid woven viewport.');
        field.window={left:w.left,top:w.top,columns:w.columns,rows:w.rows};
      }
      if(data.turn){
        const t=data.turn;if(t.beat!==Math.floor(data.clock)||t.axis!==t.beat%2||!Number.isInteger(t.lane)||Math.abs(t.lane)>16384||![-1,1].includes(t.direction))throw new Error('Invalid woven turn.');
        field.turn={beat:t.beat,axis:t.axis,lane:t.lane,direction:t.direction};
      }
      field.clock=data.clock;return field;
    }
  }
  const api=Object.freeze({Field,WORLD,MIN_ZOOM,MIN_CELL,patterns,labPatterns,structure,noise,fbm,ecology,hash,mod});root.PrimitivesField=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
