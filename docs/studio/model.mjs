import {TYPES} from './core.mjs';
export class SemanticModel {
  constructor(){this.controller=null;}
  cancel(){this.controller?.abort();}
  async analyze(session,settings){
    this.cancel();const controller=new AbortController();this.controller=controller;
    const token=session.epoch, current=session.current;
    const input={stableUtterance:session.utterances.at(-1),recentUtterances:session.utterances.slice(-10),topic:current?.title||session.title,currentScene:current,elapsedMs:current?Date.now()-current.createdAt:0,nodeCount:current?.nodes.length||0,availableTypes:Object.keys(TYPES),limits:{nodes:6,chineseCharacters:30,englishCharacters:60}};
    const timer=setTimeout(()=>controller.abort(),settings.timeoutMs||4000);
    try {
      const endpoint=new URL(settings.endpoint);if(!['http:','https:'].includes(endpoint.protocol))throw new Error('模型地址必须使用 HTTP(S)');
      const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(settings.key?{Authorization:'Bearer '+settings.key}:{})},body:JSON.stringify({model:settings.model,temperature:.1,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a conservative live speech diagram editor. Return ONLY a JSON object: {action:create|update|append|replace|close|hold|rollback,confidence:0..1,topic:string,scene:{type,title,tone:neutral|positive|emphasis|question|caution,nodes:[{label,detail,sourceIds:[utteranceId],value?:number,unit?:string}]}}. The current scene is already a BASIC interpretation of the latest utterance. Prefer update to correct it; never append that utterance twice. Infer relationships from meaning and context, not keywords. New topic closes the old structure. At most 6 nodes. Each node MUST cite supplied source IDs. All numbers, labels, units and categories must be grounded in cited speech. Growth is change, NEVER fabricate baseline 100. If uncertain use a card or hold. When currentScene.type is relationship, prefer hold unless you can preserve source-backed edges and storyEvents. For relationship scenes nodes also need stable person identifiers; edges:[{from:person,to:person,label:EXACT relation word in quote,quote:EXACT source substring,kind:冲突|背叛|帮助|情感|结盟|亲友|指控|权力,status:stated|uncertain|denied,directed:boolean,sourceIds:[]}], storyEvents:[{text:EXACT source substring,status,sourceIds:[]}]. Do not turn rumors or denials into facts. Do not import canonical plot knowledge. Output data only, no markup or code.'},{role:'user',content:JSON.stringify(input)}]})});
      if(!response.ok)throw new Error('模型接口返回 '+response.status);
      const body=await response.json();const content=body.choices?.[0]?.message?.content;if(typeof content!=='string'||content.length>30000)throw new Error('模型未返回有效结构');
      if(session.epoch!==token)return {applied:false,reason:'stale'};
      return session.applyModel(JSON.parse(content),token);
    } finally {clearTimeout(timer);}
  }
}
