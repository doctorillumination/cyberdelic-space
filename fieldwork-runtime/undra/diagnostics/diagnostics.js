const $=id=>document.getElementById(id);
const report={version:'2.24.2',time:new Date().toISOString(),browser:navigator.userAgent,viewport:[innerWidth,innerHeight],displayScale:devicePixelRatio,checks:[]};
let gl;
function show(){ $('report').textContent=JSON.stringify(report,null,2); }
try{
  report.lastError=JSON.parse(localStorage.getItem('glop-last-graphics-error') || 'null');
}catch{}
try{
  gl=$('probe').getContext('webgl2',{antialias:false,preserveDrawingBuffer:false});
  report.webgl2=Boolean(gl);
  if(!gl)throw new Error('WebGL 2 is unavailable or disabled in this browser.');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  report.device=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  report.vendor=debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR);
  report.shadingLanguage=gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
  report.limits=Object.fromEntries(['MAX_TEXTURE_SIZE','MAX_RENDERBUFFER_SIZE','MAX_3D_TEXTURE_SIZE','MAX_TEXTURE_IMAGE_UNITS','MAX_FRAGMENT_UNIFORM_VECTORS','MAX_VIEWPORT_DIMS'].map(name=>[name,ArrayBuffer.isView(gl.getParameter(gl[name]))?[...gl.getParameter(gl[name])]:gl.getParameter(gl[name])]));
  report.extensions=Object.fromEntries(['EXT_color_buffer_float','OES_texture_float_linear','KHR_parallel_shader_compile','EXT_disjoint_timer_query_webgl2'].map(name=>[name,Boolean(gl.getExtension(name))]));
  $('status').textContent='Capabilities ready. The checks use only a 64 × 64 buffer.';
}catch(error){report.error=error.message;$('status').textContent=error.message;$('run').disabled=true;}
show();
$('probe').addEventListener('webglcontextlost',event=>{event.preventDefault();report.error='WebGL context lost during the small graphics check';show();$('status').textContent=report.error;});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));$('status').textContent='Report copied.';}catch{$('status').textContent='Copy was unavailable. Select the report text below to copy it.';}};
$('run').onclick=()=>{
  $('run').disabled=true;report.checks=[];
  const check=(name,passed,details)=>{report.checks.push({name,passed,...details});show();};
  let program,framebuffer,texture,vao;const shaders=[];
  try{
    const started=performance.now();
    const shader=(type,source)=>{const value=gl.createShader(type);shaders.push(value);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(value));return value;};
    const vertex=shader(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}');
    const fragment=shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;precision highp int;out vec4 colour;void main(){vec4 a=vec4(.125,.25,.375,.5),b=vec4(.625,.75,.875,1);float sum=0.0;for(int i=0;i<8;i++){int slot=i%4;sum+=i<4?a[slot]:b[slot];}colour=vec4(.25,.5,.75,sum/4.5);}');
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    check('Small shader compilation',true,{milliseconds:Math.round((performance.now()-started)*10)/10});
    vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.useProgram(program);framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,64,64);
    for(const [name,format,filter,levels] of [['RGBA32F simulation',gl.RGBA32F,gl.NEAREST,1],['RGBA16F optical mipmaps',gl.RGBA16F,gl.LINEAR_MIPMAP_LINEAR,7]]){
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,levels,format,64,64);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,levels>1?gl.LINEAR:gl.NEAREST);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      if(!complete){check(name,false,{reason:'Framebuffer incomplete'});gl.deleteTexture(texture);texture=null;continue;}
      gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Float32Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.FLOAT,pixels);
      if(levels>1)gl.generateMipmap(gl.TEXTURE_2D);
      const error=gl.getError();check(name,error===gl.NO_ERROR && Math.max(...pixels.map((v,i)=>Math.abs(v-[.25,.5,.75,1][i])))<.001,{pixel:[...pixels],glError:error});gl.deleteTexture(texture);texture=null;
    }
    $('status').textContent=report.checks.every(c=>c.passed)?'Small checks passed. This does not certify the full artwork or the GPU driver.':'A graphics check failed. Copy the report for diagnosis.';
  }catch(error){report.error=error.message;$('status').textContent='Check failed: '+error.message;}
  finally{if(texture)gl.deleteTexture(texture);if(framebuffer)gl.deleteFramebuffer(framebuffer);if(program)gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);if(vao)gl.deleteVertexArray(vao);gl.bindFramebuffer(gl.FRAMEBUFFER,null);show();$('run').disabled=false;}
};
