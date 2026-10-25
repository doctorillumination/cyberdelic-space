export const clamp = (v,lo=0,hi=1) => Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));
export function bandEnergy(spectrum,sampleRate,fftSize,low,high){
  const start=Math.max(1,Math.floor(low*fftSize/sampleRate)),end=Math.min(spectrum.length,Math.ceil(high*fftSize/sampleRate));
  if(end<=start)return 0;
  let sum=0;for(let i=start;i<end;i++)sum+=(spectrum[i]/255)**2;
  return Math.sqrt(sum/(end-start));
}
export class PulseEnvelope{
  constructor(){this.reset();}
  reset(){this.bass=0;this.mean=.01;this.cooldown=0;this.last=0;}
  sample(bass,dt){
    dt=clamp(dt,0,.1);bass=clamp(bass);
    const rise=Math.max(0,bass-this.last);this.last=bass;
    this.bass+=(bass-this.bass)*(1-Math.exp(-dt*(bass>this.bass?26:7)));
    this.mean+=(bass-this.mean)*(1-Math.exp(-dt*1.8));this.cooldown=Math.max(0,this.cooldown-dt);
    const onset=this.cooldown===0 && bass>.035 && (rise>.025 || bass>this.mean*1.35+.025);
    if(onset)this.cooldown=.18;
    return {level:clamp(this.bass),pulse:onset?clamp(.2+this.bass*1.4):0};
  }
}
export class MusicEnvelope{
  constructor(){this.low=new PulseEnvelope();this.middle=new PulseEnvelope();this.upper=new PulseEnvelope();this.reset();}
  reset(){this.low.reset();this.middle.reset();this.upper.reset();this.mean=.15;}
  sample(bands,dt){
    if(typeof bands==='number')bands={bass:bands,mid:0,high:0};
    const bass=this.low.sample(bands.bass,dt),mid=this.middle.sample(bands.mid,dt),high=this.upper.sample(bands.high,dt);
    const level=clamp(bass.level*.6+mid.level*.3+high.level*.1);
    this.mean+=(level-this.mean)*(1-Math.exp(-clamp(dt,0,.1)*.7));
    const gain=clamp(.32/Math.max(.14,this.mean),.85,2.2);
    return {level:clamp(level*gain),pulse:clamp(bass.pulse*gain),midPulse:clamp(mid.pulse*gain),highPulse:clamp(high.pulse*gain),bass:clamp(bass.level*gain),mid:clamp(mid.level*gain),high:clamp(high.level*gain)};
  }
}
export class AudioInput{
  constructor(player,onStatus=()=>{}){this.player=player;this.onStatus=onStatus;this.context=null;this.stream=null;this.source=null;this.fileSource=null;this.url=null;this.kind='ambient';this.envelope=new MusicEnvelope();this.generation=0;this.busy=false;}
  async contextReady(){
    const Context=globalThis.AudioContext || globalThis.webkitAudioContext;
    if(!Context)throw new Error('Audio analysis is unavailable in this browser.');
    if(!this.context){this.context=new Context();this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=.55;this.spectrum=new Uint8Array(this.analyser.frequencyBinCount);}
    await this.context.resume();
  }
  release(){
    this.generation++;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.source?.disconnect();this.source=null;this.player.pause();this.player.removeAttribute('src');this.player.load();
    if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.envelope.reset();this.kind='ambient';
  }
  ambient(){this.release();this.context?.suspend();this.onStatus('Ambient rhythm. No sound plays.');}
  stop(){this.release();this.kind='quiet';this.context?.suspend();this.onStatus('Quiet. Touch the water to make a ripple.');}
  async file(file){
    this.release();const generation=this.generation;this.kind='quiet';
    await this.contextReady();if(generation!==this.generation)return;
    this.fileSource ??= this.context.createMediaElementSource(this.player);
    this.fileSource.disconnect();this.fileSource.connect(this.analyser);this.fileSource.connect(this.context.destination);
    this.url=URL.createObjectURL(file);this.player.src=this.url;this.player.loop=true;
    await this.player.play();if(generation!==this.generation)return;
    this.kind='file';this.onStatus(file.name);
  }
  async tab(){
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Tab audio is unavailable here. Choose a music file instead.');
    this.release();this.kind='quiet';const generation=this.generation;
    // Start the browser picker inside the visitor's click activation.
    let captureReleased=false;
    const releaseCapture=stream=>{if(captureReleased)return;captureReleased=true;stream.getTracks().forEach(track=>track.stop());};
    const capture=navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:1},audio:true,selfBrowserSurface:'exclude',systemAudio:'exclude',monitorTypeSurfaces:'exclude'});
    try{
      const [,stream]=await Promise.all([this.contextReady(),capture]);
      if(generation!==this.generation){releaseCapture(stream);return;}
      if(!stream.getAudioTracks().length){releaseCapture(stream);throw new Error('No audio was shared. Select a playing tab and enable Share tab audio, or choose a music file.');}
      this.stream=stream;this.source=this.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));this.source.connect(this.analyser);
      // Capture is analysed locally and is never connected to the speakers.
      stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(this.stream===stream)this.stop();},{once:true}));
      this.kind='tab';this.onStatus('Listening to shared tab audio.');
    }catch(error){capture.then(releaseCapture).catch(()=>{});if(generation===this.generation){this.kind='quiet';this.onStatus('No tab audio connected.');}throw error;}
  }
  sample(dt){
    if((this.kind!=='file' && this.kind!=='tab') || this.context?.state!=='running' || (this.kind==='file' && this.player.paused))return this.envelope.sample(0,dt);
    this.analyser.getByteFrequencyData(this.spectrum);
    return this.envelope.sample({bass:bandEnergy(this.spectrum,this.context.sampleRate,this.analyser.fftSize,35,240),mid:bandEnergy(this.spectrum,this.context.sampleRate,this.analyser.fftSize,240,2400),high:bandEnergy(this.spectrum,this.context.sampleRate,this.analyser.fftSize,2400,9000)},dt);
  }
  dispose(){this.release();this.fileSource?.disconnect();this.context?.close();}
}
