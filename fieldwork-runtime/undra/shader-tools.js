// Only our feature directives are resolved here. Standard GLSL directives remain intact.
export function selectObjectFeatures(source,mode){
  const values={GLOP_OBJECTS:mode==='none'?0:1,GLOP_SOFT:mode==='soft'?1:0},stack=[],lines=[];let active=true;
  for(const line of source.split('\n')){
    const match=line.trim().match(/^#(if|ifdef|ifndef|else|endif)\b(.*)/);
    if(!match){if(active)lines.push(line);continue;}
    const [,directive,raw]=match,expression=raw.trim();
    if(['if','ifdef','ifndef'].includes(directive)){
      const known=/^GLOP_(OBJECTS|SOFT)(\s*&&\s*GLOP_(OBJECTS|SOFT))?$/.test(expression);
      const condition=known?(directive==='ifndef'?false:expression.split(/\s*&&\s*/).every(name=>values[name]!==0)):true;
      stack.push({parent:active,known,condition});if(!known && active)lines.push(line);active=active && condition;
    }else if(directive==='else'){
      const frame=stack.at(-1);if(!frame)throw new Error('Unbalanced shader feature');
      if(!frame.known && frame.parent)lines.push(line);active=frame.parent && (!frame.known || !frame.condition);
    }else{
      const frame=stack.pop();if(!frame)throw new Error('Unbalanced shader feature');
      if(!frame.known && frame.parent)lines.push(line);active=frame.parent;
    }
  }
  if(stack.length)throw new Error('Unclosed shader feature');
  return lines.join('\n');
}

function closingBrace(source,open){
  let depth=1;for(let i=open+1;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}' && --depth===0)return i;}
  throw new Error('Unbalanced shader function');
}

export function selectMainPath(source,live){
  const main=source.indexOf('void main()'),branch=source.indexOf('if(uLive){',main);
  if(main<0 || branch<0)return source;
  const open=source.indexOf('{',branch),end=closingBrace(source,open),otherwise=source.indexOf('{',end+1),finish=closingBrace(source,otherwise);
  if(!/^\s*else\s*\{/.test(source.slice(end+1,otherwise+1)))throw new Error('Unknown tracing branch');
  return source.slice(0,branch)+(live?source.slice(open+1,end):source.slice(otherwise+1,finish))+source.slice(finish+1);
}

// ANGLE sees only functions reachable from main, including calls inside retained GLSL branches.
export function pruneShader(source){
  const masked=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,match=>match.replace(/[^\n]/g,' '));
  const pattern=/\b(?:void|float|int|uint|bool|vec[234]|ivec[234]|mat[234])\s+(\w+)\s*\([^;{}]*\)\s*\{/g;
  const functions=[];let match;
  while((match=pattern.exec(masked))){
    const open=masked.indexOf('{',match.index),end=closingBrace(masked,open)+1;
    functions.push({name:match[1],start:match.index,end,body:masked.slice(open,end)});pattern.lastIndex=end;
  }
  const reachable=new Set(['main']),queue=['main'];
  while(queue.length){
    const name=queue.pop();for(const fn of functions.filter(fn=>fn.name===name)){
      for(const call of fn.body.matchAll(/\b(\w+)\s*\(/g))if(!reachable.has(call[1])){reachable.add(call[1]);queue.push(call[1]);}
    }
  }
  for(const fn of functions.reverse())if(!reachable.has(fn.name))source=source.slice(0,fn.start)+source.slice(fn.end);
  return source;
}
