/* Distinct reference pigments and optional continuous colour studies. */
(function(root){
  'use strict';
  const palettes=[
    [[0,63,174],[230,101,0],[6,78,46]],
    [[112,91,126],[67,111,151],[66,127,130],[117,139,97],[186,155,82],[177,108,78],[160,103,119]],
    [[85,87,126],[98,118,155],[117,148,154],[163,155,128],[184,133,112],[150,103,132]],
    [[63,97,103],[89,127,123],[131,149,111],[177,157,102],[163,127,101],[112,113,113]],
    [[63,66,69],[99,98,96],[140,132,119],[112,108,108],[79,83,85]]
  ];
  const swatchPhases=[.18,.75,.43];
  function sample(palette,phase){
    const stops=palettes[palette],f=((phase%1+1)%1)*stops.length,i=Math.floor(f);
    let t=f-i;t=t*t*(3-2*t);
    return stops[i].map((a,c)=>Math.round(a+(stops[(i+1)%stops.length][c]-a)*t));
  }
  function phaseAt(x,y,tick=0){
    const phase=.03+x*.70+y*.25+.07*Math.sin(x*3.2-y*2.1)+tick*.00008;
    return ((phase%1)+1)%1;
  }
  const phaseForInk=(palette,index)=>palette===0?index/3:swatchPhases[index];
  const api={palettes,swatchPhases,sample,phaseAt,phaseForInk,swatch:(palette,index)=>sample(palette,phaseForInk(palette,index))};
  root.InkPigments=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
