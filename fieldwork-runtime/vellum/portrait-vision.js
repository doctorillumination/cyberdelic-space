/* Person masks and facial geometry are computed locally, away from the ink renderer. */
(function(root){
  'use strict';
  class PortraitVision{
    constructor(){
      this.worker=new Worker(new URL('portrait-worker.js',document.baseURI));this.serial=0;this.pending=new Map();
      this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
      this.worker.onmessage=({data})=>{
        if(data.type==='progress'){this.onprogress?.(data.message);return;}
        if(data.type==='ready'){this.resolveReady();return;}
        if(data.type==='error'&&!data.id){this.rejectReady(new Error(data.message));return;}
        const pending=this.pending.get(data.id);if(!pending)return;this.pending.delete(data.id);
        if(data.type==='error')pending.reject(new Error(data.message));else pending.resolve(data);
      };
      this.worker.onerror=error=>{const failure=new Error(error.message||'The local portrait detector could not start.');this.rejectReady(failure);for(const pending of this.pending.values())pending.reject(failure);this.pending.clear();};
      this.worker.postMessage({type:'init'});
    }
    async analyze(image,time){
      await this.ready;const id=++this.serial,pixels=image.data.slice();
      return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({type:'frame',id,time,width:image.width,height:image.height,pixels},[pixels.buffer]);});
    }
    clear(){this.worker.postMessage({type:'clear'});}
    destroy(){this.worker.terminate();for(const pending of this.pending.values())pending.reject(new Error('Portrait detector closed.'));this.pending.clear();}
  }
  root.InkPortraitVision=PortraitVision;
})(window);
