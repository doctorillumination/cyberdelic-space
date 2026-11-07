/* Three-pigment presets and optional continuous colour studies. */
(function(root){
  'use strict';
  const presets=[
    {id:'original',name:'Original · blue / orange / green',inkNames:['Blue ink','Orange ink','Green ink'],colours:[[0,63,174],[230,101,0],[6,78,46]]},
    {id:'earth-spectrum',name:'Earth spectrum',colours:[[112,91,126],[67,111,151],[66,127,130],[117,139,97],[186,155,82],[177,108,78],[160,103,119]]},
    {id:'dusk-spectrum',name:'Dusk spectrum',colours:[[85,87,126],[98,118,155],[117,148,154],[163,155,128],[184,133,112],[150,103,132]]},
    {id:'moss-mineral',name:'Moss & mineral',colours:[[63,97,103],[89,127,123],[131,149,111],[177,157,102],[163,127,101],[112,113,113]]},
    {id:'graphite-stone',name:'Graphite & stone',colours:[[63,66,69],[99,98,96],[140,132,119],[112,108,108],[79,83,85]]},
    {id:'tidal',name:'Tidal · blue / teal / copper',inkNames:['Prussian blue ink','Sea glass ink','Copper ink'],colours:[[12,61,91],[43,122,118],[183,86,46]]},
    {id:'wildflower',name:'Wildflower · plum / rose / gold',inkNames:['Aubergine ink','Rose madder ink','Golden ochre ink'],colours:[[100,49,103],[184,72,92],[191,139,43]]},
    {id:'mineral',name:'Mineral · blue / oxide / ochre',inkNames:['Ultramarine ink','Red oxide ink','Ochre ink'],colours:[[34,59,151],[157,61,46],[191,151,55]]},
    {id:'forest',name:'Forest · teal / moss / umber',inkNames:['Deep teal ink','Moss ink','Warm umber ink'],colours:[[16,86,87],[105,128,58],[140,76,41]]},
    {id:'twilight',name:'Twilight · indigo / coral / violet',inkNames:['Indigo ink','Muted coral ink','Violet ink'],colours:[[48,50,112],[202,103,81],[139,94,157]]}
  ];
  const palettes=presets.map(preset=>preset.colours);
  const isTriad=palette=>palettes[palette].length===3;
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
  const phaseForInk=(palette,index)=>isTriad(palette)?index/3:swatchPhases[index];
  const filamentInks=palette=>new Float32Array(palette===0?[.003,.24,.70,.91,.40,.008,.016,.28,.15]:palettes[palette].flat().map(value=>value/255));
  const api={presets,palettes,isTriad,swatchPhases,sample,phaseAt,phaseForInk,filamentInks,swatch:(palette,index)=>sample(palette,phaseForInk(palette,index))};
  root.InkPigments=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
