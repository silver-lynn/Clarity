// Captions follow recorded speech positions, never a separate typing timer.
export class DemoNarrator {
  constructor(){this.audio=new Audio();this.audio.preload='auto';}
  stop(){this.cancel?.();this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}
  async load(texts){
    const response=await fetch('/Clarity/studio/assets/gossip-narration/manifest.json');
    if(!response.ok)throw new Error('示例朗读文件未能加载，请刷新后重试');
    const {clips}=await response.json();
    if(clips?.length!==texts.length||clips.some((c,i)=>c.text!==texts[i]||!c.marks?.length))throw new Error('示例文字与朗读版本不一致，请刷新页面');
    return clips;
  }
  play(clip,{partial,commit}){
    this.stop();
    return new Promise((resolve,reject)=>{
      const audio=this.audio;let stopped=false,frame,lastShown=0,lastCommitted=0,queue=Promise.resolve();
      const finish=(error,cancelled=false)=>{
        if(stopped)return;stopped=true;cancelAnimationFrame(frame);audio.pause();
        audio.onended=audio.onerror=null;this.cancel=null;
        error?reject(error):resolve(!cancelled);
      };
      this.cancel=()=>finish(null,true);
      const enqueue=(fn)=>{queue=queue.then(()=>{if(!stopped)return fn();}).catch(error=>finish(error));};
      const update=()=>{
        if(stopped)return;
        let shown=0,spoken=0;
        for(const mark of clip.marks){if(mark.time>audio.currentTime)break;spoken=mark.start;shown=mark.start+mark.length;}
        const sentences=[...clip.text.slice(0,spoken).matchAll(/[。！？!?]/g)];
        const boundary=sentences.length?sentences.at(-1).index+1:0;
        if(boundary>lastCommitted){lastCommitted=boundary;enqueue(()=>commit(clip.text.slice(0,boundary)));}
        if(shown>lastShown){lastShown=shown;enqueue(()=>partial(clip.text.slice(0,shown)));}
        frame=requestAnimationFrame(update);
      };
      audio.onended=()=>{
        cancelAnimationFrame(frame);
        enqueue(()=>commit(clip.text));
        queue.then(()=>finish());
      };
      audio.onerror=()=>finish(new Error('示例声音加载失败，请检查本地服务后重试'));
      audio.src=clip.src;
      audio.play().then(()=>{if(!stopped)update();}).catch(()=>finish(new Error('声音未能播放，请再点一次播放示例')));
    });
  }
}
