import {replayFrames,clone} from './core.mjs';
import {fillerOnly} from './keywords.mjs';
export function liveScene(session){
 const current=session.current;
 if(!current||displayKind(current)!=='subtitle'||current.type!=='card')return current;
 if(fillerOnly(current.nodes.map(n=>n.detail||n.label).join('。'))){
  const prior=session.scenes.slice(0,-1).reverse().find(s=>!fillerOnly(s.nodes.map(n=>n.detail||n.label).join('。')));
  if(prior)return prior;
 }
 // Brief supporting speech must not make a useful diagram flash and disappear.
 // Explicit topic changes, conclusions and questions restore the caption view.
 const barrier=s=>s.presentation==='conclusion'||s.nodes.some(n=>/换一个话题|接下来讨论|另一个主题|现在谈谈|[？?]/.test(n.detail||n.label));
 for(const scene of session.scenes.slice(-4).reverse()){
  if(barrier(scene))return current;
  if(current.updatedAt-scene.updatedAt>20000)return current;
  if(displayKind(scene)==='diagram')return scene;
 }
 return current;
}
export function displayKind(scene){
 if(!scene)return 'subtitle';
 if(scene.presentation==='conclusion')return 'conclusion';
 if(scene.type==='card'||(['flow','list','cause','compare','hierarchy','timeline'].includes(scene.type)&&scene.nodes.length<2))return 'subtitle';
 return 'diagram';
}
export function expressionHint(text){
 if(/[？?]|为什么|如何|是否/.test(text))return {icon:'🤔',label:'提出疑问'};
 if(/风险|谨慎|注意安全|需要警惕/.test(text))return {icon:'⚠️',label:'提醒风险'};
 if(/关键(?:是|结论)|核心(?:是|观点)|请记住|务必/.test(text))return {icon:'💡',label:'强调重点'};
 return null;
}
export function transcriptAt(session,at){
 return session.utterances.filter(u=>u.at<=at).map(u=>{
  const later=session.revisions.filter(r=>r.id===u.id&&r.at>at).sort((a,b)=>a.at-b.at);
  return {...u,text:later.length?later[0].previous:u.text};
 });
}
export function timelineEntries(session){
 const frames=replayFrames(session),out=[];
 frames.forEach((f,i)=>{
  if(!f.current||['close','hold'].includes(f.action))return;
  const op=session.operations[i],ids=[...new Set(f.current.nodes.flatMap(n=>n.sourceIds))];
  const revision=op.origin==='revision'||f.action==='replace';
  const signature=ids.join('|');const previous=out.at(-1);
  const entry={key:op.id,at:op.at,scene:clone(f.current),label:revision?'修正':f.action==='append'?'补充':displayKind(f.current)==='subtitle'?'讲述':displayKind(f.current)==='conclusion'?'结论':'结构',signature};
  // Replace intermediate rule/model decisions for the same speech, not revisions.
  if(previous&&(previous.signature===signature||previous.scene.id===f.current.id)&&!revision&&f.action==='update')out[out.length-1]=entry;
  else out.push(entry);
 });
 return out;
}
