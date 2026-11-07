/* Local camera edges become transient channels for the ink field. */
(function(root){
  'use strict';
  const WIDTH=320,HEIGHT=240;
  const projection=(x,y,width,height)=>{const scale=Math.min(1600*.78/width,1000*.88/height);return {x:800+(x-width*.5)*scale,y:500+(y-height*.5)*scale};};
  function extract(image,width,height,options={}){
    const size=width*height,gray=new Float32Array(size),horizontal=new Float32Array(size),blur=new Float32Array(size),magnitude=new Float32Array(size),direction=new Uint8Array(size),thin=new Float32Array(size);
    for(let i=0;i<size;i++)gray[i]=image[i*4]*.2126+image[i*4+1]*.7152+image[i*4+2]*.0722;
    const kernel=[1,4,6,4,1];
    for(let y=0;y<height;y++)for(let x=2;x<width-2;x++){let value=0;for(let k=-2;k<=2;k++)value+=gray[y*width+x+k]*kernel[k+2];horizontal[y*width+x]=value/16;}
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){let value=0;for(let k=-2;k<=2;k++)value+=horizontal[(y+k)*width+x]*kernel[k+2];blur[y*width+x]=value/16;}
    const histogram=new Uint32Array(512);let samples=0;
    for(let y=4;y<height-4;y++)for(let x=4;x<width-4;x++){
      if(options.mask){const mx=Math.min(options.maskWidth-1,Math.floor(x/width*options.maskWidth)),my=Math.min(options.maskHeight-1,Math.floor(y/height*options.maskHeight));if(options.mask[my*options.maskWidth+mx]<.35)continue;}
      const i=y*width+x,gx=-blur[i-width-1]+blur[i-width+1]-2*blur[i-1]+2*blur[i+1]-blur[i+width-1]+blur[i+width+1],gy=-blur[i-width-1]-2*blur[i-width]-blur[i-width+1]+blur[i+width-1]+2*blur[i+width]+blur[i+width+1];
      const value=Math.hypot(gx,gy);magnitude[i]=value;
      let angle=Math.atan2(gy,gx)*180/Math.PI;if(angle<0)angle+=180;
      direction[i]=angle<22.5||angle>=157.5?0:angle<67.5?1:angle<112.5?2:3;
      if(value>3){histogram[Math.min(511,Math.floor(value))]++;samples++;}
    }
    let high=28,total=0;for(let i=511;i>=0;i--){total+=histogram[i];if(total>=samples*.24){high=Math.max(13,Math.min(85,i));break;}}
    const low=high*.43,edges=new Uint8Array(size),queue=new Int32Array(size);let head=0,tail=0;
    const shifts=[1,width+1,width,width-1];
    for(let y=4;y<height-4;y++)for(let x=4;x<width-4;x++){
      const i=y*width+x,value=magnitude[i],step=shifts[direction[i]];
      if(value>=low&&value>=magnitude[i-step]&&value>=magnitude[i+step]){thin[i]=value;if(value>=high){edges[i]=1;queue[tail++]=i;}}
    }
    const neighbours=[-width-1,-width,-width+1,1,width+1,width,width-1,-1];
    while(head<tail){const i=queue[head++];for(const offset of neighbours){const next=i+offset;if(next>=0&&next<size&&!edges[next]&&thin[next]>=low){edges[next]=1;queue[tail++]=next;}}}
    const visited=new Uint8Array(size),starts=[],raw=[];
    for(let i=0;i<size;i++)if(edges[i]){let degree=0;for(const offset of neighbours)degree+=edges[i+offset]??0;if(degree===1)starts.push(i);}
    for(let i=0;i<size;i++)if(edges[i])starts.push(i);
    for(const start of starts){
      if(visited[start])continue;
      const chain=[];let current=start,previous=-1;
      for(let k=0;k<1600;k++){
        visited[current]=1;chain.push({x:current%width,y:Math.floor(current/width),strength:thin[current]});
        let next=-1,best=-Infinity;const vx=previous<0?0:current%width-previous%width,vy=previous<0?0:Math.floor(current/width)-Math.floor(previous/width);
        for(const offset of neighbours){const candidate=current+offset;if(candidate<0||candidate>=size||!edges[candidate]||visited[candidate])continue;const dx=candidate%width-current%width,dy=Math.floor(candidate/width)-Math.floor(current/width);if(Math.abs(dx)>1||Math.abs(dy)>1)continue;const score=dx*vx+dy*vy+thin[candidate]*.001;if(score>best){best=score;next=candidate;}}
        if(next<0)break;previous=current;current=next;
      }
      if(chain.length>=8)raw.push(chain);
    }
    raw.sort((a,b)=>b.length-a.length);
    const scale=Math.min(1600*.78/width,1000*.88/height),paths=[],eddies=[];
    for(const chain of raw.slice(0,64)){
      const smooth=chain.map((p,i)=>{const a=chain[Math.max(0,i-1)],b=chain[Math.min(chain.length-1,i+1)];return {x:(a.x+p.x*2+b.x)/4,y:(a.y+p.y*2+b.y)/4};});
      const points=smooth.map(p=>projection(p.x,p.y,width,height));
      let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      if(length<22)continue;
      const cx=smooth.reduce((sum,p)=>sum+p.x,0)/smooth.length/width,cy=smooth.reduce((sum,p)=>sum+p.y,0)/smooth.length/height;
      const colour=cy<.44?0:cx<.50?1:2,closed=Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<scale*3;
      paths.push({points,length,width:1.2+Math.min(1.8,chain.length*.009),color:colour,phase:cx*6.28+cy,closed,camera:true});
      for(let i=4;i<points.length-4;i+=9){
        const a=points[i-4],b=points[i],c=points[i+4],ax=b.x-a.x,ay=b.y-a.y,bx=c.x-b.x,by=c.y-b.y;
        const bend=(ax*by-ay*bx)/(Math.hypot(ax,ay)*Math.hypot(bx,by)+.01);
        if(Math.abs(bend)>.28)eddies.push({x:b.x,y:b.y,r:16+Math.abs(bend)*14,life:Math.sign(bend)*.08,weight:Math.abs(bend)});
      }
    }
    const swirls=[];for(const eddy of eddies.sort((a,b)=>b.weight-a.weight))if(swirls.every(other=>Math.hypot(other.x-eddy.x,other.y-eddy.y)>65)){swirls.push(eddy);if(swirls.length===4)break;}
    return {paths,eddies:swirls,edgePixels:tail};
  }
  function pathLength(points){let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return length;}
  function refine(points,closed){
    for(let pass=0;pass<2;pass++){const refined=closed?[]:[points[0]];for(let i=0;i<points.length-(closed?0:1);i++){const a=points[i],b=points[(i+1)%points.length];refined.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25},{x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75});}if(!closed)refined.push(points.at(-1));points=refined;}
    if(closed)points.push({...points[0]});return points;
  }
  function detectedFrame(image,width,height,vision){
    const frame=extract(image,width,height,vision??{});
    if(!vision)return {...frame,detection:'edges'};
    const shapes=vision.faceCurves.map(curve=>{
      const closed=Math.hypot(curve.points[0].x-curve.points.at(-1).x,curve.points[0].y-curve.points.at(-1).y)<.001;
      const points=refine(curve.points.map(p=>projection(p.x*width,p.y*height,width,height)),closed);
      return {id:curve.id,points,length:pathLength(points),width:curve.id.startsWith('oval')?2.4:1.6,color:curve.color,phase:curve.id.length,closed,camera:true,feature:true};
    });
    const maskPixels=new Uint8ClampedArray(vision.maskWidth*vision.maskHeight*4);
    for(let i=0;i<vision.mask.length;i++){const value=vision.mask[i]>.5?255:0;maskPixels.set([value,value,value,255],i*4);}
    const maskScale=Math.min(1600*.78/vision.maskWidth,1000*.88/vision.maskHeight);
    const outline=extract(maskPixels,vision.maskWidth,vision.maskHeight).paths.filter(path=>path.length>100).slice(0,3).map((path,index)=>{const points=path.points.map(p=>projection(((p.x-800)/(maskScale*vision.maskWidth)+.5)*width,((p.y-500)/(maskScale*vision.maskHeight)+.5)*height,width,height));return {...path,points,length:pathLength(points),id:'body-'+index,width:2.4,body:true};});
    const detail=frame.paths.filter(path=>{
      const p=path.points[Math.floor(path.points.length*.5)];
      return !shapes.some(shape=>shape.points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<9));
    }).slice(0,28);
    return {...frame,paths:[...shapes,...outline,...detail],detection:vision.faceFound?'face-body':'person'};
  }
  function stabilize(frame,previous){
    if(!previous?.paths.length)return frame;
    const used=new Set();
    frame.paths=frame.paths.map(path=>{
      const middle=path.points[Math.floor(path.points.length*.5)];
      let best,score=Infinity;
      for(const old of previous.paths){
        if(used.has(old)||(path.id?old.id!==path.id:Boolean(old.id)))continue;
        const p=old.points[Math.floor(old.points.length*.5)],distance=Math.hypot(middle.x-p.x,middle.y-p.y)+Math.abs(path.length-old.length)*.15;
        if(distance<score){score=distance;best=old;}
      }
      if(!best||(!path.id&&score>45))return path;
      used.add(best);const count=Math.max(12,Math.min(180,path.points.length)),points=[];
      const reverse=!path.closed&&Math.hypot(path.points[0].x-best.points.at(-1).x,path.points[0].y-best.points.at(-1).y)<Math.hypot(path.points[0].x-best.points[0].x,path.points[0].y-best.points[0].y);
      let phase=0,backward=false;
      if(path.closed&&best.closed&&!path.feature){
        let closest=Infinity;const anchor=InkFlow.sample(best,0);
        for(let i=0;i<96;i++){const q=InkFlow.sample(path,i/96),distance=Math.hypot(q.x-anchor.x,q.y-anchor.y);if(distance<closest){closest=distance;phase=i/96;}}
        const a=InkFlow.sample(best,.02),b=InkFlow.sample(path,phase),c=InkFlow.sample(path,(phase+.02)%1);backward=(a.x-anchor.x)*(c.x-b.x)+(a.y-anchor.y)*(c.y-b.y)<0;
      }
      for(let i=0;i<count;i++){
        const t=i/(count-1),a=InkFlow.sample(best,reverse?1-t:t),sampleT=path.closed&&!path.feature?(phase+(backward?-t:t)+2)%1:t,b=InkFlow.sample(path,sampleT),distance=Math.hypot(a.x-b.x,a.y-b.y),alpha=distance<1.8?0:distance>35?.42:.18;
        points.push({x:a.x+(b.x-a.x)*alpha,y:a.y+(b.y-a.y)*alpha});
      }
      return {...path,points,length:pathLength(points)};
    });
    for(const old of previous.paths)if(old.id&&!used.has(old)&&!frame.paths.some(path=>path.id===old.id)&&(old.missing??0)<3)frame.paths.push({...old,missing:(old.missing??0)+1});
    return frame;
  }
  function paintContours(canvas,model,palette,concentration=.65){
    const context=canvas.getContext('2d');context.clearRect(0,0,1600,1000);context.lineCap='round';context.lineJoin='round';
    for(const path of model.paths){
      const rgb=InkPigments.swatch(palette,path.color).join(','),count=Math.max(12,Math.min(320,Math.ceil(path.length/3)));
      for(let lane=0;lane<5;lane++){
        const core=lane<2,offset=core?(lane-.5)*.7:(lane-3)*2.6,alpha=(core?.065:.018)*(.5+concentration),trace=new Path2D();
        for(let i=0;i<count;i++){
          const t=i/(count-1),q=InkFlow.sample(path,t),envelope=.55+.45*Math.sin(t*13+path.phase)**2,spread=offset*envelope+Math.sin(t*45+lane*3+path.phase)*.3;
          const x=q.x+q.nx*spread,y=q.y+q.ny*spread;if(i===0)trace.moveTo(x,y);else trace.lineTo(x,y);
        }
        context.strokeStyle=`rgba(${rgb},${alpha})`;context.lineWidth=core?.48:1.1;context.stroke(trace);
      }
    }
  }
  function material(frame,seed){
    const emitters=[],candidates=[],random=InkFlow.randomSource(seed+7301);
    for(const path of frame.paths){
      const count=Math.max(2,Math.ceil(path.length/24));
      for(let i=0;i<count;i++){
        const t=(i+.5)/count,q=InkFlow.sample(path,t),a=InkFlow.sample(path,Math.max(0,t-.035)),b=InkFlow.sample(path,Math.min(.9999,t+.035));
        const bend=Math.abs((q.x-a.x)*(b.y-q.y)-(q.y-a.y)*(b.x-q.x))/(Math.hypot(q.x-a.x,q.y-a.y)*Math.hypot(b.x-q.x,b.y-q.y)+1);
        const emitter={x:q.x,y:q.y,nx:q.nx,ny:q.ny,r:4+random()*7,color:path.color,phase:random()*Math.PI*2,weight:.4+random()*.5+bend};
        emitters.push(emitter);candidates.push({...emitter,r:8+random()*10,weight:bend+(path.length<300?.6:.1)+random()*.15});
      }
    }
    const pools=[];
    for(const candidate of candidates.sort((a,b)=>b.weight-a.weight))if(pools.every(pool=>Math.hypot(pool.x-candidate.x,pool.y-candidate.y)>58)){
      pools.push({...candidate,pool:true});if(pools.length===12)break;
    }
    return {emitters:emitters.length>384?Array.from({length:384},(_,i)=>emitters[Math.floor(i*emitters.length/384)]):emitters,pools};
  }
  function motion(previous,current,width,height){
    if(!previous)return {amount:0,currents:[]};
    const gray=i=>current[i*4]*.2126+current[i*4+1]*.7152+current[i*4+2]*.0722;
    const luma=new Float32Array(width*height);for(let i=0;i<luma.length;i++)luma[i]=gray(i);
    const candidates=[],scale=Math.min(1600*.72/width,1000*.78/height);
    for(let y=15;y<height-15;y+=12)for(let x=15;x<width-15;x+=12){
      if(((x-width*.5)/(width*.4))**2+((y-height*.48)/(height*.51))**2>1)continue;
      const center=y*width+x;let mean=0,variance=0;
      for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2){const value=previous[center+dy*width+dx];mean+=value;variance+=value*value;}
      if(variance/25-(mean/25)**2<45)continue;
      const score=(sx,sy)=>{
        let error=0,change=0;
        for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2)change+=luma[center+(dy+sy)*width+dx+sx]-previous[center+dy*width+dx];
        change/=25;
        for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2)error+=Math.abs(luma[center+(dy+sy)*width+dx+sx]-previous[center+dy*width+dx]-change);
        return error/25;
      };
      const resting=score(0,0);if(resting<2.5)continue;
      let best=resting,sx=0,sy=0;
      for(let dy=-6;dy<=6;dy+=2)for(let dx=-6;dx<=6;dx+=2){const error=score(dx,dy)+Math.hypot(dx,dy)*.12;if(error<best){best=error;sx=dx;sy=dy;}}
      if(!sx&&!sy||best>resting*.82)continue;
      const position=projection(x,y,width,height);
      candidates.push({...position,dx:Math.max(-.9,Math.min(.9,sx*scale*.06)),dy:Math.max(-.9,Math.min(.9,sy*scale*.06)),r:42+Math.hypot(sx,sy)*2,life:.12,weight:(resting-best)/Math.max(8,resting)});
    }
    const currents=[];for(const candidate of candidates.sort((a,b)=>b.weight-a.weight))if(currents.every(other=>Math.hypot(candidate.x-other.x,candidate.y-other.y)>90)){currents.push(candidate);if(currents.length===4)break;}
    return {amount:Math.min(.12,candidates.length/280),currents};
  }
  let pigmentPaper=null;
  function field(model,w=192,h=120){
    const field=InkFlow.transportField({...model,paths:model.paths.map(path=>({...path,width:2+path.width*1.3}))},w,h);
    if(!model.paths.length)return field;
    const key=`${model.seed}:${w}:${h}`;
    if(pigmentPaper?.key!==key){
      const values=new Float32Array(w*h*2);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const px=(x+.5)*1600/w,py=(y+.5)*1000/h,i=(y*w+x)*2;
        values[i]=(InkFlow.noise(px*.014,py*.014,model.seed)-.5)*.16;
        values[i+1]=.10+Math.pow(InkFlow.noise(px*.006,py*.006,model.seed+901),3)*1.3+InkFlow.noise(px*.019,py*.019,model.seed+307)*.12;
      }
      pigmentPaper={key,values};
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,px=(x+.5)*1600/w,py=(y+.5)*1000/h,density=field.guide[i+2]/255;
      let dx=(field.guide[i]/255-.5)*500,dy=-(field.guide[i+1]/255-.5)*500;
      let vx=(field.data[i]/255-.5)*12,vy=-(field.data[i+1]/255-.5)*12,pooling=0,swirlX=0,swirlY=0;
      const norm=Math.hypot(vx,vy)||1,tx0=vx/norm,ty0=vy/norm,along=dx*tx0+dy*ty0;
      dx-=along*tx0;dy-=along*ty0;
      const wander=pigmentPaper.values[(y*w+x)*2];
      for(const pool of model.pools){
        const ax=pool.x+pool.nx*pool.r*.35-px,ay=pool.y+pool.ny*pool.r*.35-py,weight=Math.exp(-(ax*ax+ay*ay)/(pool.r*pool.r*3));
        const spin=Math.sin(pool.phase)>0?1:-1;
        pooling=Math.max(pooling,weight);
        swirlX+=(ay*.105*spin+ax*.012)*weight;swirlY+=(-ax*.105*spin+ay*.012)*weight;
      }
      const tx=vx,ty=vy,pace=.65*(1-pooling*.8);vx=(tx-ty*wander)*pace+swirlX;vy=(ty+tx*wander)*pace+swirlY;
      // Guide alpha holds pigment retention; channel alpha locates the contour pools.
      const reservoir=Math.min(1,pigmentPaper.values[(y*w+x)*2+1]+Math.pow(pooling,1.7)*.72);
      field.data.set([Math.max(0,Math.min(255,128+vx/12*255)),Math.max(0,Math.min(255,128-vy/12*255)),Math.max(density*.8,pooling*.75)*255,pooling*255],i);
      field.guide.set([Math.max(0,Math.min(255,127.5+dx/500*255)),Math.max(0,Math.min(255,127.5-dy/500*255)),Math.max(density,pooling)*255,reservoir*255],i);
    }
    return field;
  }
  function samplePortrait(context,time){
    const w=context.canvas.width,h=context.canvas.height;context.fillStyle='#e8e3d9';context.fillRect(0,0,w,h);
    context.save();context.translate(w*.5+Math.sin(time*.4)*w*.025,h*.48);context.rotate(Math.sin(time*.31)*.045);context.scale(w/256,h/192);
    const light=context.createLinearGradient(-55,0,55,0);light.addColorStop(0,'#b0a394');light.addColorStop(.7,'#f1e7d5');light.addColorStop(1,'#dfcbb1');
    context.fillStyle=light;context.strokeStyle='#73655b';context.lineWidth=1.4;
    context.beginPath();context.ellipse(0,-9,48,68,0,0,Math.PI*2);context.fill();context.stroke();
    context.strokeStyle='#554c48';context.lineWidth=2.0;
    context.beginPath();context.moveTo(-46,-27);context.bezierCurveTo(-46,-91,32,-100,48,-29);context.bezierCurveTo(25,-52,8,-55,-8,-50);context.bezierCurveTo(-22,-40,-32,-35,-46,-27);context.stroke();
    const blink=.22+.78*(1-Math.max(0,Math.sin(time*.8))**24);
    for(const sign of [-1,1]){
      const x=sign*21;context.lineWidth=1.7;context.beginPath();context.moveTo(x-12,-20);context.quadraticCurveTo(x,-31,x+12,-21);context.stroke();
      context.beginPath();context.ellipse(x,-12,11,4.7*blink,0,0,Math.PI*2);context.stroke();context.fillStyle='#3e3e3b';context.beginPath();context.ellipse(x+Math.sin(time*.5)*2,-12,2.4,3.4*blink,0,0,Math.PI*2);context.fill();
    }
    context.lineWidth=1.3;context.beginPath();context.moveTo(1,-13);context.bezierCurveTo(-1,1,-8,10,-5,14);context.quadraticCurveTo(1,18,8,13);context.stroke();
    context.beginPath();context.moveTo(-17,30);context.quadraticCurveTo(0,23+Math.sin(time*.5)*2,18,30);context.quadraticCurveTo(1,43,-17,30);context.stroke();
    context.strokeStyle='#918071';context.beginPath();context.moveTo(-17,59);context.lineTo(-19,77);context.moveTo(18,58);context.lineTo(20,77);context.moveTo(-19,77);context.bezierCurveTo(-41,78,-65,81,-82,104);context.moveTo(20,77);context.bezierCurveTo(43,78,64,84,81,104);context.stroke();context.restore();
  }
  class InkCamera{
    constructor({onFrame,onState,enabled=()=>true,mode='still'}={}){this.onFrame=onFrame??(()=>{});this.onState=onState??(()=>{});this.enabled=enabled;this.mode=mode;this.state='off';this.version=0;this.stream=null;this.video=null;this.canvas=null;this.frame=0;this.lastAnalysis=-Infinity;this.previous=null;this.lastFrame=null;this.isDemo=false;}
    warmVision(){
      if(typeof InkPortraitVision==='undefined')return Promise.resolve(false);
      return this.visionReady??=(async()=>{try{this.vision=new InkPortraitVision();await this.vision.ready;return true;}catch(error){this.visionError=error.message;this.vision?.destroy();this.vision=null;return false;}})();
    }
    emit(state,message){this.state=state;this.message=message;this.onState(state,message);}
    async start(getMedia){
      this.stop(false);this.isDemo=false;const version=this.version;this.emit('requesting','Allow the camera to begin your ink portrait.');
      try{
        const request=getMedia??(constraints=>{if(!navigator.mediaDevices?.getUserMedia){const error=new Error('Camera access needs HTTPS or localhost.');error.name='NotSupportedError';throw error;}return navigator.mediaDevices.getUserMedia(constraints);});
        const stream=await request({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
        if(version!==this.version){for(const track of stream.getTracks())track.stop();return;}
        this.stream=stream;this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;this.video.srcObject=stream;await this.video.play();
        if(version!==this.version){for(const track of stream.getTracks())track.stop();return;}
        for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(this.stream===stream){this.stop(false);this.emit('off','Camera stopped. Your ink portrait is held.');}});
        this.emit('requesting','Preparing your portrait…');await this.warmVision();if(version!==this.version)return;
        this.prepare();this.emit('live',this.visionError?'Local face tracking is unavailable. Using image edges.':this.mode==='still'?'Find your pose, then Capture portrait. The ink will keep flowing.':'Let the contours settle. Small movements gently shift the ink.');this.loop();
      }catch(error){
        if(version!==this.version)return;this.release();
        const messages={NotAllowedError:'Camera access was not allowed. You can try again using the camera button.',NotFoundError:'No camera was found on this device.',NotReadableError:'The camera is busy. Close the other camera app and try again.',NotSupportedError:'Use the local launcher or an HTTPS website for camera access.'};
        this.emit('error',messages[error.name]??'The camera could not start. Try the camera button again.');
      }
    }
    prepare(){this.canvas??=document.createElement('canvas');this.canvas.width=WIDTH;this.canvas.height=HEIGHT;this.context=this.canvas.getContext('2d',{willReadFrequently:true});this.lastAnalysis=-Infinity;}
    demo(){this.stop(false);this.isDemo=true;this.prepare();this.emit('demo','Animated sample · Start camera to use your face.');this.loop();}
    setMode(mode){mode=mode==='motion'?'motion':'still';if(mode===this.mode)return;this.mode=mode;this.previous=null;if(this.state==='held')this.stop();else if(this.state==='off'||this.state==='error')this.emit('off','Start the camera to make an ink portrait. Video stays on this device.');else this.emit(this.state,this.isDemo?'Animated sample · Start camera to use your face.':this.mode==='still'?'Find your pose, then Capture portrait. The ink will keep flowing.':'Move gently to stir the ink. Rest to let the face gather.');}
    capture(){
      if(!this.lastFrame||!['live','demo'].includes(this.state))return false;
      const frame=this.lastFrame,sample=this.isDemo;this.stop(false);this.lastFrame=frame;this.isDemo=sample;frame.motion={amount:0,currents:[]};this.onFrame(frame);
      this.emit('held',sample?'Captured sample · The ink keeps flowing. Camera off.':'Pose captured · The ink keeps flowing. Camera off.');return true;
    }
    loop(){
      const version=this.version;
      const draw=async now=>{
        if(version!==this.version||!['live','demo'].includes(this.state))return;
        try{if(this.enabled()&&now-this.lastAnalysis>=120){
          const began=performance.now();
          if(this.state==='demo')samplePortrait(this.context,now/1000);
          else if(this.video?.readyState>=2&&this.video.videoWidth){
            const video=this.video,ratio=WIDTH/HEIGHT,vw=video.videoWidth,vh=video.videoHeight,sw=Math.min(vw,vh*ratio),sh=sw/ratio;
            this.context.save();this.context.translate(WIDTH,0);this.context.scale(-1,1);this.context.drawImage(video,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,WIDTH,HEIGHT);this.context.restore();
          }else{this.frame=requestAnimationFrame(draw);return;}
          this.lastAnalysis=now;const image=this.context.getImageData(0,0,WIDTH,HEIGHT),vision=this.vision&&!this.isDemo?await this.vision.analyze(image,now):null;
          if(version!==this.version)return;
          const frame=stabilize(detectedFrame(image.data,WIDTH,HEIGHT,vision),this.lastFrame);
          frame.motion=this.mode==='motion'?motion(this.previous,image.data,WIDTH,HEIGHT):{amount:0,currents:[]};
          this.previous=this.mode==='motion'?Float32Array.from({length:WIDTH*HEIGHT},(_,i)=>image.data[i*4]*.2126+image.data[i*4+1]*.7152+image.data[i*4+2]*.0722):null;
          frame.analysisMs=performance.now()-began;this.lastFrame=frame;this.onFrame(frame);
        }else if(!this.enabled()){this.previous=null;
        }}catch(error){this.stop(false);this.emit('error','The camera image could not be processed. Try starting the camera again.');return;}
        this.frame=requestAnimationFrame(draw);
      };
      this.frame=requestAnimationFrame(draw);
    }
    release(){if(this.stream)for(const track of this.stream.getTracks())track.stop();this.stream=null;if(this.video){this.video.pause();this.video.srcObject=null;this.video=null;}if(this.canvas){this.canvas.width=1;this.canvas.height=1;}this.context=null;this.previous=null;this.vision?.clear();}
    stop(notify=true){this.version++;if(this.frame&&typeof cancelAnimationFrame!=='undefined')cancelAnimationFrame(this.frame);this.frame=0;this.release();this.lastFrame=null;if(notify)this.emit('off','Camera off. Your ink portrait is held.');else this.state='off';}
    get active(){return ['live','demo','held'].includes(this.state);}
    static extract(...args){return extract(...args);}
    static detectedFrame(...args){return detectedFrame(...args);}
    static stabilize(...args){return stabilize(...args);}
    static paint(...args){return paintContours(...args);}
    static motion(...args){return motion(...args);}
    static field(...args){return field(...args);}
    static model(seed,frame={paths:[],eddies:[]}){return {paths:frame.paths,...material(frame,seed),guides:[],seed,w:1600,h:1000,camera:true,motion:frame.motion??{amount:0,currents:[]},design:{id:'camera',name:'Webcam portrait'},composition:{layout:{id:'camera',name:'Liquid portrait'},junctions:[],regions:[]},eddies:frame.eddies};}
  }
  root.InkCamera=InkCamera;if(typeof module!=='undefined')module.exports=InkCamera;
})(typeof window!=='undefined'?window:globalThis);
