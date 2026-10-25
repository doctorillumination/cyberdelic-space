export const palettes = {
  red: { name:'Red', hex:'#d87875', floor:[.105,.020,.025], absorption:[.018,.16,.13], tint:[.72,.11,.14] },
  amber: { name:'Orange', hex:'#c99549', floor:[.074,.038,.008], absorption:[.018,.09,.19], tint:[.68,.30,.035] },
  yellow: { name:'Yellow', hex:'#d7c565', floor:[.108,.088,.014], absorption:[.023,.035,.23], tint:[.76,.64,.075] },
  green: { name:'Green', hex:'#92ad45', floor:[.040,.070,.012], absorption:[.075,.018,.15], tint:[.30,.62,.06] },
  cyan: { name:'Cyan', hex:'#78bfc0', floor:[.016,.075,.075], absorption:[.19,.032,.03], tint:[.07,.56,.59] },
  blue: { name:'Blue', hex:'#609cb1', floor:[.014,.047,.064], absorption:[.18,.045,.024], tint:[.045,.36,.62] },
  indigo: { name:'Indigo', hex:'#8780bd', floor:[.036,.030,.092], absorption:[.10,.12,.02], tint:[.27,.22,.73] },
  purple: { name:'Purple', hex:'#b38bc8', floor:[.076,.030,.108], absorption:[.055,.16,.018], tint:[.58,.22,.78] },
  pink: { name:'Pink', hex:'#d594b0', floor:[.105,.040,.069], absorption:[.028,.14,.075], tint:[.78,.30,.48] },
  pearl: { name:'Pearl', hex:'#b8b4a8', floor:[.065,.067,.058], absorption:[.03,.03,.048], tint:[.60,.61,.51] }
};

export const blends = {
  aurora: { name:'Aurora', colors:['#a8dfe6','#b9a9df','#edb6d0'] },
  sunrise: { name:'Sunrise', colors:['#f0db9b','#e6a393','#dba2c1'] },
  lagoon: { name:'Lagoon', colors:['#88b6dc','#9dd5d1','#bedfba'] },
  meadow: { name:'Meadow', colors:['#b6cc8a','#8cc6b1','#ead59c'] },
  twilight: { name:'Twilight', colors:['#919ecf','#b498ce','#d9a8c2'] },
  opal: { name:'Opal', colors:['#e5c7ac','#e4dbe4','#b6d4df'] }
};

export const defaultColour = () => ({palette:'green',mixed:false,blend:'aurora',colors:[...blends.aurora.colors],softness:.7,direction:0});
export function normalizeColour(value) {
  const fallback=defaultColour();
  if(!value || typeof value!=='object')return fallback;
  const bounded=(key,min,max) => typeof value[key]==='number' && Number.isFinite(value[key])?Math.min(max,Math.max(min,value[key])):fallback[key];
  return {
    palette:Object.hasOwn(palettes,value.palette)?value.palette:fallback.palette,
    mixed:value.mixed===true,
    blend:Object.hasOwn(blends,value.blend) || value.blend==='custom'?value.blend:fallback.blend,
    colors:Array.isArray(value.colors) && value.colors.length===3 && value.colors.every(color => typeof color==='string' && /^#[0-9a-f]{6}$/i.test(color))?value.colors.map(color => color.toLowerCase()):fallback.colors,
    softness:bounded('softness',0,1),direction:bounded('direction',0,360)
  };
}
export function linearFromHex(hex) {
  return [1,3,5].map(offset => {
    const value=parseInt(hex.slice(offset,offset+2),16)/255;
    return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  });
}
export function labFromLinear([r,g,b]) {
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}
export function linearFromLab([L,a,b]) {
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.2914855480*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s];
}
export function materialFromHex(hex) {
  const rgb=linearFromHex(hex),peak=Math.max(...rgb);
  const floor=rgb.map(value => Math.max(.001,value*.14));
  return {floor,lab:labFromLinear(floor),tint:rgb.map(value => .12+value*.56),absorption:rgb.map(value => .018+(peak-value)*.18)};
}
function hexFromLab(lab) {
  return '#'+linearFromLab(lab).map(value => {
    const linear=Math.max(0,Math.min(1,value)),srgb=linear<=.0031308?linear*12.92:1.055*linear**(1/2.4)-.055;
    return Math.round(srgb*255).toString(16).padStart(2,'0');
  }).join('');
}
export function colourTheme(state) {
  if(!state.mixed && state.palette==='green')return {ink:'#1d2c14',paper:'#edf1df',accent:'#40532d',muted:'#405132'};
  const colors=state.mixed?state.colors:[palettes[state.palette].hex];
  const labs=colors.map(hex => labFromLinear(linearFromHex(hex)));
  const a=labs.reduce((sum,lab) => sum+lab[1],0)/labs.length,b=labs.reduce((sum,lab) => sum+lab[2],0)/labs.length;
  return {ink:hexFromLab([.25,a*.22,b*.22]),paper:hexFromLab([.96,a*.12,b*.12]),accent:hexFromLab([.43,a*.65,b*.65]),muted:hexFromLab([.4,a*.22,b*.22])};
}
