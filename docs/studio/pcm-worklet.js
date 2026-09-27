// Capture in the audio thread; send 100ms PCM packets and explicitly flush the
// last short packet before the WebSocket end-of-stream signal.
class LiveCanvasPCM extends AudioWorkletProcessor {
  constructor(){
    super();this.samples=[];this.sum=0;this.count=0;this.position=0;this.ratio=sampleRate/16000;this.stopped=false;
    this.port.onmessage=event=>{if(event.data==='flush'){this.stopped=true;if(this.count){this.samples.push(this.sum/this.count);this.sum=0;this.count=0;}this.send();this.port.postMessage({type:'flushed'});}};
  }
  send(){
    if(!this.samples.length)return;const buffer=new ArrayBuffer(this.samples.length*2),view=new DataView(buffer);
    this.samples.forEach((s,i)=>{const value=Math.max(-1,Math.min(1,s));view.setInt16(i*2,value<0?value*32768:value*32767,true);});
    this.samples=[];this.port.postMessage({type:'pcm',buffer},[buffer]);
  }
  process(inputs){
    if(this.stopped)return true;const input=inputs[0]?.[0];if(!input)return true;
    for(const value of input){this.sum+=value;this.count++;this.position++;if(this.position>=this.ratio){this.samples.push(this.sum/this.count);this.position-=this.ratio;this.sum=0;this.count=0;if(this.samples.length>=1600)this.send();}}
    return true;
  }
}
registerProcessor('livecanvas-pcm',LiveCanvasPCM);
