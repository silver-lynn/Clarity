import {BrowserSpeechAdapter, WhisperLiveKitAdapter} from '../asr-adapter.js';

export function splitConfirmed(text){
  // Some Chinese ASR backends omit punctuation even for a complete speaker turn.
  // Split only when at least two explicit sequence markers establish a sequence.
  if((text.match(/首先|然后|然後|接着|接著|最后|最後/g)||[]).length>=2)text=text.replace(/(?=首先|然后|然後|接着|接著|最后|最後|真正重要|关键是|關鍵是|总结一下|總結一下)/g,'\n');
  return text.replace(/([。！？;；]|[.!?](?!\d))/g,'$1\n').replace(/([，,])\s*(?=首先|然后|接著|接着|最后|最後|第[一二三四五六]步|then\b|finally\b|next\b)/gi,'$1\n').split('\n').map(s=>s.trim()).filter(Boolean).flatMap(s=>{const chunks=[];for(let i=0;i<s.length;i+=2500)chunks.push(s.slice(i,i+2500));return chunks;});
}

// WLK snapshots replace a segment at the same start time; the end time can grow.
export class SegmentTracker {
  constructor(){this.segments=new Map();this.sequence=0;}
  accept(payload){
    const events=[], lines=payload.lines||payload.new_lines||payload.segments||payload.finals||payload.final||[];
    const list=Array.isArray(lines)?[...lines]:[lines];
    if(payload.type==='final'||payload.is_final)list.push({text:payload.text||payload.transcript,id:payload.id,start:payload.start});
    for(let i=0;i<list.length;i++){
      const line=list[i], text=String(typeof line==='string'?line:line?.text||line?.transcript||'').trim();if(!text)continue;
      const key=line.id!=null?'id:'+line.id:line.start!=null?'start:'+line.start:payload.type==='final'?'direct:'+text:'slot:'+i;
      const old=this.segments.get(key);if(old?.text===text)continue;
      const id=old?.id||'w'+(++this.sequence),parts=splitConfirmed(text),previous=old?.parts||[];
      for(let j=0;j<Math.max(parts.length,previous.length);j++){if(parts[j]===previous[j])continue;events.push({type:j<previous.length?'revision':'final',id:j?id+':'+j:id,text:parts[j]||''});}
      this.segments.set(key,{id,text,parts});
    }
    const partial=payload.buffer_transcription||payload.bufferTranscription||payload.partial||payload.partial_text||(payload.type==='partial'?payload.text:'');
    if(partial)events.push({type:'partial',text:String(partial)});
    if(['speech_end','session_end'].includes(payload.type))events.push({type:payload.type});
    if(payload.type==='revision'&&payload.id!=null){const old=this.segments.get('id:'+payload.id);if(old&&old.text!==payload.text){events.push({type:'revision',id:old.id,text:String(payload.text)});old.text=String(payload.text);}}
    if(this.segments.size>12000){const excess=this.segments.size-10000;for(const key of [...this.segments.keys()].slice(0,excess))this.segments.delete(key);}
    return events;
  }
}

export class LocalASR extends WhisperLiveKitAdapter {
  constructor(options){super(options);this.hotwords=options.hotwords||[];this.tracker=new SegmentTracker();this.drainMs=options.drainMs??30000;this.maxDrainMs=options.maxDrainMs??120000;this.stopPromise=null;this.prefix='w'+Date.now()+':';this.pendingAudio=Promise.resolve();}
  handleSocketMessage(data){
    if(typeof data!=='string')return;let payload;try{payload=JSON.parse(data);}catch{return;}
    if(this.finishStop&&this.refreshDrain)this.refreshDrain();
    if(payload.type==='ready_to_stop'){this.emitStatus('tail_confirmed');this.emit('segment',{type:'speech_end'});this.finishStop?.();return;}
    const config=payload.config||(payload.type==='config'?payload:null);
    if(config?.engine)this.engine=config.engine;
    if(config)this.emit('quality',{confirmation:!!config.confirmation});
    if(payload.type==='quality_warning'){this.emit('quality',{message:payload.message});return;}
    if(config?.supportsHotwords&&this.socketOpen())this.socket.send(JSON.stringify({type:'context',terms:this.hotwords.slice(0,80)}));
    if(payload.type==='context_status'){this.metrics.context=payload;this.emit('context',payload);return;}
    if(payload.type==='error'){this.emit('error',{message:payload.message||'本地识别失败'});return;}
    if(config&&!this.captureStarted&&this.requested){if(config.useAudioWorklet||config.use_audio_worklet||config.pcmInput||config.pcm_input)this.startPcmCapture();else this.startMediaRecorderCapture();}
    for(const e of this.tracker.accept(payload)){this.emit('segment',{...e,id:e.id?this.prefix+e.id:undefined,provider:this.engine||'whisper-local'});if(e.type==='session_end'&&this.finishStop)this.finishStop();}
  }
  startMediaRecorderCapture(){
    super.startMediaRecorderCapture();
    if(this.recorder)this.recorder.ondataavailable=e=>{if(e.data?.size)this.pendingAudio=this.pendingAudio.then(async()=>{const b=await e.data.arrayBuffer();if(this.socketOpen())this.socket.send(b);});};
  }
  async startPcmCapture(){
    if(this.captureStarted||!this.stream||!this.socketOpen()||!this.requested)return;
    this.captureStarted=true;
    try{
      const Context=window.AudioContext||window.webkitAudioContext;this.audioContext=new Context({sampleRate:16000});
      await this.audioContext.resume();
      if(!this.audioContext.audioWorklet)throw new Error('此浏览器不支持低延迟音频采集，请使用 Chrome 或 Edge');
      await this.audioContext.audioWorklet.addModule('/studio/pcm-worklet.js');
      if(!this.requested){this.cleanup();return;}
      this.source=this.audioContext.createMediaStreamSource(this.stream);this.processor=new AudioWorkletNode(this.audioContext,'livecanvas-pcm');
      this.processor.port.onmessage=event=>{if(event.data.type==='pcm'&&this.socketOpen()){if(this.socket.bufferedAmount>(this.maxBufferedBytes??Infinity)){this.emit('error',{message:'音频发送已积压超过 2 秒，已停止识别。请检查网络后重新开始，刚才未确认的话可能需要重说。'});return;}this.socket.send(event.data.buffer);}if(event.data.type==='flushed')this.onPcmFlushed?.();};
      this.processor.onprocessorerror=()=>this.emit('error',{message:'音频采集处理器停止工作'});
      this.source.connect(this.processor);this.processor.connect(this.audioContext.destination);this.metrics.audioMode='audio-worklet-pcm-16khz';
    }catch(error){this.emit('error',{message:error.message});}
  }
  flushPcm(){
    if(!this.processor?.port)return Promise.resolve();
    return new Promise(resolve=>{const timer=setTimeout(()=>{this.emit('error',{message:'末尾音频刷新未确认，请检查尾句。'});resolve();},1000);this.onPcmFlushed=()=>{clearTimeout(timer);this.onPcmFlushed=null;resolve();};this.processor.port.postMessage('flush');});
  }
  async start(){
    if(!LocalASR.supported())throw new Error('当前浏览器不支持麦克风或 WebSocket');
    if(this.requested||this.listening)return;
    this.requested=true;this.metrics=this.createMetrics();this.metrics.startedAt=performance.now();
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(!this.requested){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;this.openSocket();}
    catch(error){this.requested=false;this.cleanup();throw error;}
  }
  stop(){
    if(this.stopPromise)return this.stopPromise;
    this.requested=false;clearTimeout(this.configTimer);this.emitStatus('draining');
    this.stopPromise=new Promise(resolve=>{
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;clearTimeout(this.drainTimer);clearTimeout(this.hardDrainTimer);this.finishStop=null;this.refreshDrain=null;this.cleanup();this.emitStatus('idle');resolve();};
      this.finishStop=finish;
      if(!this.socketOpen()&&!this.recorder){finish();return;}
      const timeout=()=>{this.emit('error',{message:'服务端未完成尾句确认；请检查最后一段原话。'});finish();};
      this.refreshDrain=()=>{clearTimeout(this.drainTimer);this.drainTimer=setTimeout(timeout,this.drainMs);};
      const pcmFlush=this.flushPcm();
      const signal=async()=>{try{await pcmFlush;this.processor?.disconnect();this.source?.disconnect();await this.pendingAudio;this.endStreamSignal();}catch(error){this.emit('error',{message:error.message});}if(!finished){this.refreshDrain();this.hardDrainTimer=setTimeout(timeout,this.maxDrainMs);}};
      if(this.recorder&&this.recorder.state!=='inactive'){this.recorder.addEventListener('stop',()=>{this.stream?.getTracks().forEach(t=>t.stop());signal();},{once:true});this.recorder.stop();}
      else {this.stream?.getTracks().forEach(t=>t.stop());signal();}
    });return this.stopPromise;
  }
}

export class CloudASR extends LocalASR {
  constructor(options){super(options);this.cloudKey=options.cloudKey;this.maxBufferedBytes=64000;}
  openSocket(){
    this.socket=new WebSocket('ws://127.0.0.1:8002/asr');
    this.configTimer=setTimeout(()=>this.emit('error',{message:'云端连接超时，请检查网络和密钥。'}),35000);
    this.socket.onopen=()=>{if(!this.requested){this.cleanup();return;}this.socket.send(JSON.stringify({type:'start',key:this.cloudKey,hotwords:this.hotwords}));};
    this.socket.onmessage=event=>{let payload;try{payload=JSON.parse(event.data);}catch{return;}if(payload.type==='config'){clearTimeout(this.configTimer);this.listening=true;this.emitStatus('listening');}this.handleSocketMessage(event.data);};
    this.socket.onerror=()=>this.emit('error',{message:'无法连接云端识别桥接服务。请运行 start-cloud-asr.cmd 后重试。'});
    this.socket.onclose=()=>{clearTimeout(this.configTimer);if(this.requested||this.finishStop)this.emit('error',{message:'云端识别连接已中断，请检查最后一句并重新开始。'});this.finishStop?.();this.cleanup({keepSocket:true});this.emitStatus('idle');};
  }
}

export function makeASR(options,onSegment,onStatus,onError){
  const adapter=options.provider==='doubao'?new CloudASR(options):options.provider==='local'?new LocalASR(options):new BrowserSpeechAdapter(options);
  if(options.provider!=='browser')adapter.addEventListener('segment',e=>onSegment(e.detail));
  else adapter.addEventListener('transcript',e=>onSegment({type:e.detail.isFinal?'final':'partial',text:e.detail.text,provider:'browser'}));
  adapter.addEventListener('status',e=>onStatus(e.detail.status));adapter.addEventListener('error',e=>onError(e.detail.message||e.detail.error));return adapter;
}
