export const VIDEO_RESOLUTIONS = {
  '1080p': {width:1920,height:1080,label:'1080p'},
  '4k': {width:3840,height:2160,label:'4K'}
};

export function renderPlan({duration=10,fps=30,samples=64,resolution='1080p',style='fast',seed=0}={}) {
  fps = Number(fps) === 60 ? 60 : 30;
  duration = Math.min(30,Math.max(1,Number(duration)||10));
  samples = [32,64,256].includes(Number(samples)) ? Number(samples) : 64;
  resolution = resolution === '4k' ? '4k' : '1080p';
  const dimensions=VIDEO_RESOLUTIONS[resolution];
  const bitrate=(resolution==='4k' ? (fps===60?192:144) : (fps===60?72:48))*1000000;
  style=style==='precision'?'precision':'fast';
  return {fps,samples,resolution,style,seed,duration,total:Math.round(duration*fps),...dimensions,bitrate,quantizer:samples===256?10:samples===64?14:18};
}

async function browserSink(canvas, plan) {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo } = await import('./vendor/mediabunny.mjs');
  const quality = new Quality({ quantizer:plan.quantizer,bitrate:plan.bitrate });
  if (!await canEncodeVideo('avc',{ width:plan.width,height:plan.height,frameRate:plan.fps,quality })) {
    throw new Error(`This browser cannot encode ${plan.label}. Try 1080p, or open the local app in Chrome or Safari.`);
  }
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas,{ codec: 'avc', quality, latencyMode: 'quality' });
  output.addVideoTrack(source,{ frameRate: plan.fps });
  await output.start();
  return {
    add: (timestamp,duration) => source.add(timestamp,duration),
    finish: async () => { await output.finalize(); return new Blob([output.target.buffer],{type:'video/mp4'}); },
    abort: () => output.cancel()
  };
}

export class ArtworkRecorder {
  constructor(canvas,{ onState, onSave, onError, prepare, renderFrame, restore, createSink = browserSink, yieldFrame = () => new Promise(resolve => setTimeout(resolve,0)), available }) {
    Object.assign(this,{ canvas,onState,onSave,onError,prepare,renderFrame,restore,createSink,yieldFrame });
    this.available = available || (() => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined');
    this.state = 'idle';
    this.stopRequested = false;
    this.failure = null;
    this.plan = null;
  }
  get supported() { return this.available(); }
  update(state,done=0,frameSamples=0) {
    this.state = state;
    this.done = done;
    const elapsed = (performance.now()-this.startedAt)/1000;
    const progress=done+frameSamples/(this.plan?.samples||64);
    this.onState({ state,done,frameSamples,progress,total:this.plan?.total||0,fps:this.plan?.fps||30,samples:this.plan?.samples||64,label:this.plan?.label||'1080p',eta:progress>1 && elapsed>3?elapsed/progress*(this.plan.total-progress):null });
  }
  async start(options={}) {
    if (this.state !== 'idle') return;
    if (!this.supported) { this.onError('High quality rendering is unavailable here. Open the local app in Chrome or Safari.'); return; }
    this.plan=renderPlan(options);
    const {fps,seed}=this.plan;
    this.stopRequested = false;
    this.failure = null;
    this.startedAt = performance.now();
    this.update('preparing');
    let sink,prepared=false,done=0,finished=false;
    try {
      prepared = true;
      await this.prepare(this.plan);
      if(this.failure)throw this.failure;
      sink = await this.createSink(this.canvas,this.plan);
      this.startedAt = performance.now();
      this.update('rendering');
      for (let index=0;index<this.plan.total && !this.stopRequested;index++) {
        const completed=await this.renderFrame(index,this.plan,{
          shouldStop:()=>this.stopRequested,
          onSample:count=>this.update(this.stopRequested?'stopping':'rendering',done,count)
        });
        if(this.failure)throw this.failure;
        if(completed===false)break;
        // Frame timestamps come from simulation time, independently of rendering speed.
        await sink.add(index/fps,1/fps);
        done++;
        this.update(this.stopRequested?'stopping':'rendering',done);
        await this.yieldFrame();
      }
      if(this.failure)throw this.failure;
      if (!done) { await sink.abort(); finished=true; return; }
      this.update('saving',done);
      const blob = await sink.finish();
      finished = true;
      await this.onSave(blob,seed);
    } catch (error) {
      if (sink && !finished) { try { await sink.abort(); } catch {} }
      this.onError(error.message || 'The video could not be rendered. Try again.');
    } finally {
      if (prepared) { try { await this.restore(); } catch { this.onError('The artwork needs a reload to restore its view.'); } }
      this.update('idle',done);
    }
  }
  stop() {
    if (this.state === 'idle' || this.state === 'saving') return;
    this.stopRequested = true;
    this.update('stopping',this.done || 0);
  }
  fail(message){
    if(this.state==='idle')return;
    this.failure=new Error(message);
    this.stopRequested=true;
  }
}
