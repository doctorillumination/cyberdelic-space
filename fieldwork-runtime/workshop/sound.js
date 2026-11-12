// Original procedural room tone. No music, voices, or third-party recordings.
export class WorkshopSound {
  constructor() { this.enabled = false; this.context = null; this.creakTimer = null; this.visible = true; }
  async toggle() {
    if (!this.context) this.create();
    this.enabled = !this.enabled;
    if (this.enabled) {
      await this.context.resume();
      this.master.gain.setTargetAtTime(.36, this.context.currentTime, .45);
      this.scheduleCreak(12 + Math.random() * 8);
    } else {
      this.master.gain.setTargetAtTime(0, this.context.currentTime, .08);
      clearTimeout(this.creakTimer);
      setTimeout(() => { if (!this.enabled) this.context.suspend(); }, 450);
    }
    return this.enabled;
  }
  create() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Spatial sound is unavailable in this browser.');
    const c = this.context = new Ctx({ latencyHint: 'interactive' });
    this.master = c.createGain(); this.master.gain.value = 0;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -20; limiter.knee.value = 12; limiter.ratio.value = 3;
    limiter.attack.value = .025; limiter.release.value = .45;
    this.analyser=c.createAnalyser();this.analyser.fftSize=1024;
    this.waveform=new Float32Array(this.analyser.fftSize);
    this.master.connect(limiter);limiter.connect(this.analyser);this.analyser.connect(c.destination);
    this.reverb = c.createConvolver();
    const impulse = c.createBuffer(2, Math.floor(c.sampleRate * 1.05), c.sampleRate);
    for (let channel=0; channel<2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i=0; i<data.length; i++) {
        const t=i/c.sampleRate;
        data[i] = t < .018 ? 0 : (Math.random()*2-1)*Math.exp(-t*8)*.12;
      }
      for (const [time,level] of [[.021,.24],[.039,.16],[.061,.10],[.089,.055]]) {
        data[Math.floor((time + channel*.0017)*c.sampleRate)] += level;
      }
    }
    this.reverb.buffer = impulse;
    const wet = c.createGain(); wet.gain.value = .12; this.reverb.connect(wet); wet.connect(this.master);

    // A quiet mains hum, situated at the electrical panel on the right wall.
    const hum = c.createGain(); hum.gain.value = .010;
    this.spatial(hum, [3.02, .30, 1.50], 2.7, .35);
    for (const [hz,level] of [[60,.50],[120,.18],[180,.035],[240,.018]]) {
      const tone=c.createOscillator(), gain=c.createGain();
      tone.frequency.value=hz; gain.gain.value=level; tone.connect(gain); gain.connect(hum); tone.start();
    }
    const drift=c.createOscillator(), driftAmount=c.createGain();
    drift.frequency.value=.043; driftAmount.gain.value=.0005;
    drift.connect(driftAmount); driftAmount.connect(hum.gain); drift.start();

    // Broad, filtered exterior air, heard through the two rear window bays.
    for (const [index,position] of [[0,[-1.55,4.20,1.80]],[1,[1.75,4.20,1.90]]]) {
      const source=c.createBufferSource();source.buffer=this.airBuffer(37+index*4);source.loop=true;
      const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=85;
      const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=750+index*180;low.Q.value=.55;
      const gain=c.createGain();gain.gain.value=.024;
      source.connect(high);high.connect(low);low.connect(gain);this.spatial(gain,position,3.5,.30);
      const swell=c.createOscillator(), depth=c.createGain();
      swell.frequency.value=index ? .023 : .031;depth.gain.value=.004;
      swell.connect(depth);depth.connect(gain.gain);swell.start();source.start(0,Math.random()*12);
    }
  }
  spatial(node, position, reference=2.5, rolloff=.4) {
    const c=this.context,panner=c.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';
    panner.refDistance=reference;panner.rolloffFactor=rolloff;panner.maxDistance=50;
    [panner.positionX.value,panner.positionY.value,panner.positionZ.value]=position;
    node.connect(panner);panner.connect(this.master);panner.connect(this.reverb);
    return panner;
  }
  airBuffer(seconds) {
    const c=this.context,buffer=c.createBuffer(1,Math.floor(c.sampleRate*seconds),c.sampleRate);
    const data=buffer.getChannelData(0);let brown=0;
    for (let i=0;i<data.length;i++) { brown=(brown+.021*(Math.random()*2-1))/1.021;data[i]=brown*3.4; }
    // Seamless buffer boundaries without rhythmic pulsing.
    const seam=Math.floor(c.sampleRate*.8);
    for(let i=0;i<seam;i++){const t=i/seam;data[data.length-seam+i]=data[data.length-seam+i]*(1-t)+data[i]*t;}
    return buffer;
  }
  scheduleCreak(delay) {
    clearTimeout(this.creakTimer);
    this.creakTimer=setTimeout(()=>{
      if(!this.enabled || !this.visible)return;
      this.creak();this.scheduleCreak(28+Math.random()*32);
    },delay*1000);
  }
  creak() {
    const c=this.context,duration=1.15+Math.random()*.65;
    const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);
    const pitch=115+Math.random()*65;let phase=0,noise=0;
    for(let i=0;i<data.length;i++){
      const t=i/c.sampleRate,u=t/duration;
      phase+=2*Math.PI*(pitch+14*Math.sin(t*5)+28*u*u)/c.sampleRate;
      noise=.88*noise+.12*(Math.random()*2-1);
      const envelope=Math.pow(Math.sin(Math.PI*u),2.3)*( .68+.32*Math.sin(t*29+Math.sin(t*9)) );
      data[i]=envelope*(.09*Math.sin(phase)+.035*Math.sin(phase*2.7)+noise*.55);
    }
    const source=c.createBufferSource();source.buffer=buffer;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1450;filter.Q.value=.5;
    const gain=c.createGain();gain.gain.value=.055;
    source.connect(filter);filter.connect(gain);
    const position=Math.random()<.5 ? [-1.0,1.7,3.45] : [2.7,2.8,2.65];
    const panner=this.spatial(gain,position,2.4,.4);
    source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};
    this.lastCreak={time:c.currentTime,position};
  }
  update(position, forward, up) {
    if (!this.context || !this.enabled || !this.visible) return;
    const listener=this.context.listener,t=this.context.currentTime;
    if(listener.positionX){
      const values=[...position,...forward,...up];
      const params=['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'];
      params.forEach((key,i)=>listener[key].setTargetAtTime(values[i],t,.025));
    } else {listener.setPosition(...position);listener.setOrientation(...forward,...up);}
  }
  visibility(visible) {
    this.visible=visible;if(!this.context)return;
    if(!visible){clearTimeout(this.creakTimer);this.context.suspend();}
    else if(this.enabled){this.context.resume();this.scheduleCreak(20+Math.random()*25);}
  }
  diagnostics() {
    if(!this.context)return {enabled:false,context:'not started'};
    this.analyser.getFloatTimeDomainData(this.waveform);
    let sum=0,peak=0;for(const sample of this.waveform){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
    return {enabled:this.enabled,context:this.context.state,
      rmsDb:20*Math.log10(Math.max(1e-12,Math.sqrt(sum/this.waveform.length))),
      peakDb:20*Math.log10(Math.max(1e-12,peak)),lastCreak:this.lastCreak??null};
  }
}
