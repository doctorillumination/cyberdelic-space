(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const n = v => Number(v.toFixed(6));
  const point = (x, y) => `${n(x)} ${n(y)}`;
  function polygon(points) { return `M${points.map(p => point(...p)).join('L')}Z`; }
  function circle(x, y, r, reverse = false) {
    const sweep = reverse ? 0 : 1;
    return `M${point(x + r, y)}A${r} ${r} 0 1 ${sweep} ${point(x - r, y)}A${r} ${r} 0 1 ${sweep} ${point(x + r, y)}Z`;
  }
  const ring = (x, y, r, width) => circle(x, y, r) + circle(x, y, r - width, true);
  const rect = (x, y, w, h) => polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
  function regular(count, radius, angle = -Math.PI / 2) {
    return Array.from({length:count}, (_, i) => [Math.cos(angle + i * TAU/count)*radius, Math.sin(angle + i * TAU/count)*radius]);
  }
  const rotate = (points, angle) => points.map(([x,y]) => [x*Math.cos(angle)-y*Math.sin(angle), x*Math.sin(angle)+y*Math.cos(angle)]);
  function cross(arm = .44, halfWidth = .12, angle = 0) {
    const a = arm, t = halfWidth;
    return polygon(rotate([[-t,-a],[t,-a],[t,-t],[a,-t],[a,t],[t,t],[t,a],[-t,a],[-t,t],[-a,t],[-a,-t],[-t,-t]], angle));
  }
  function radial(count, distance, radius, angle = -Math.PI/2) {
    return Array.from({length:count}, (_,i) => circle(Math.cos(angle+i*TAU/count)*distance, Math.sin(angle+i*TAU/count)*distance,radius)).join('');
  }
  function checks(count, step, test, angle = 0) {
    let d = '';
    for(let y=0;y<count;y++) for(let x=0;x<count;x++) if(test(x,y)) {
      const px=(x-(count-1)/2)*step, py=(y-(count-1)/2)*step;
      d += polygon(rotate([[px-step/2,py-step/2],[px+step/2,py-step/2],[px+step/2,py+step/2],[px-step/2,py+step/2]],angle));
    }
    return d;
  }
  function star(tips, outer, inner, phase=-Math.PI/2) {
    return polygon(Array.from({length:tips*2},(_,i)=>{const a=phase+i*Math.PI/tips,r=i%2?inner:outer;return [Math.cos(a)*r,Math.sin(a)*r];}));
  }
  function arc(start, end, outer=.44, inner=.30) {
    const p=(a,r)=>point(Math.cos(a)*r,Math.sin(a)*r);
    const large=end-start>Math.PI?1:0;
    return `M${p(start,outer)}A${outer} ${outer} 0 ${large} 1 ${p(end,outer)}L${p(end,inner)}A${inner} ${inner} 0 ${large} 0 ${p(start,inner)}Z`;
  }
  const forms = [
    ['circle','Circle','simple',circle(0,0,.43)],
    ['ring','Ring','simple',ring(0,0,.44,.095)],
    ['double-ring','Double ring','radial',ring(0,0,.44,.07)+ring(0,0,.27,.07)],
    ['target','Target','radial',ring(0,0,.44,.065)+ring(0,0,.28,.065)+circle(0,0,.10)],
    ['dot-ring','Dot ring','radial',radial(10,.34,.065)],
    ['satellite','Satellite','radial',radial(8,.34,.055)+circle(0,0,.14)],
    ['cross','Cross','simple',cross()],
    ['x','X','simple',cross(.44,.115,Math.PI/4)],
    ['fine-cross','Fine cross','simple',cross(.44,.065)],
    ['asterisk','Asterisk','radial',Array.from({length:4},(_,i)=>polygon(rotate([[-.065,-.44],[.065,-.44],[.065,.44],[-.065,.44]],i*Math.PI/4))).join('')],
    ['diamond','Diamond','simple',polygon(regular(4,.45))],
    ['square','Square','simple',rect(-.34,-.34,.68,.68)],
    ['soft-square','Soft square','simple','M-.22 -.37H.22Q.37 -.37 .37 -.22V.22Q.37 .37 .22 .37H-.22Q-.37 .37 -.37 .22V-.22Q-.37 -.37 -.22 -.37Z'],
    ['triangle','Triangle','simple',polygon(regular(3,.47))],
    ['hexagon','Hexagon','simple',polygon(regular(6,.44,0))],
    ['octagon','Octagon','simple',polygon(regular(8,.44,Math.PI/8))],
    ['four-petals','Four petals','radial',radial(4,.215,.205,0)],
    ['six-petals','Six petals','radial',radial(6,.245,.175)],
    ['rosette','Rosette','radial',radial(12,.30,.135)+circle(0,0,.25)],
    ['checker','Checker','pattern',checks(5,.15,(x,y)=>(x+y)%2===0)],
    ['diamond-checks','Diamond checks','pattern',checks(3,.205,(x,y)=>(x+y)%2===0,Math.PI/4)],
    ['checker-ring','Checker ring','pattern',checks(5,.145,(x,y)=>(x===0||y===0||x===4||y===4)&&(x+y)%2===0)],
    ['checker-cross','Checker cross','pattern',checks(5,.15,(x,y)=>(x===2||y===2)&&(x+y)%2===0)],
    ['bars','Bars','pattern',rect(-.35,-.36,.16,.72)+rect(-.08,-.36,.16,.72)+rect(.19,-.36,.16,.72)],
    ['ladder','Ladder','pattern',rect(-.35,-.4,.12,.8)+rect(.23,-.4,.12,.8)+Array.from({length:4},(_,i)=>rect(-.23,-.32+i*.18,.46,.10)).join('')],
    ['stripes','Stripes','pattern',Array.from({length:5},(_,i)=>rect(-.37,-.36+i*.155,.74,.08)).join('')],
    ['half-disc','Half disc','simple',`M-.44 0A.44 .44 0 0 1 .44 0Z`],
    ['quarter-disc','Quarter disc','simple',`M-.36 .36V-.44A.8 .8 0 0 1 .44 .36Z`],
    ['arc','Arc','simple',arc(-Math.PI*.95,Math.PI*.45)],
    ['wave','Wave','pattern','M-.43 -.12C-.15 -.47 .15 .23 .43 -.12V.10C.15 .45 -.15 -.25 -.43 .10Z'],
    ['pinwheel','Pinwheel','radial',Array.from({length:4},(_,i)=>polygon(rotate([[0,0],[0,-.43],[.31,-.30],[.16,0]],i*Math.PI/2))).join('')],
    ['star','Star','radial',star(8,.45,.26)]
  ].map(([id,name,family,d],index)=>Object.freeze({id,name,family,d,index}));
  const byId = Object.fromEntries(forms.map(form=>[form.id,form]));
  const api = {forms:Object.freeze(forms), byId:Object.freeze(byId), TAU};
  root.InkGeometry = Object.freeze(api);
  if(typeof module!=='undefined') module.exports=api;
})(globalThis);
