import {relationshipScene,mergeRelationships,mentions,continueRelationship} from './relationships.mjs';
import {safePreparation} from './context.mjs';
import {crossSentenceUpdate} from './thought.mjs';
export const TYPES = { card:'观点卡片', list:'清单', flow:'流程图', hierarchy:'包含关系', cause:'因果图', compare:'对比图', proportion:'占比图', change:'增长 / 下降', bars:'数值柱状图', timeline:'时间线',relationship:'人物关系' };
export const clone = x => structuredClone(x);
export const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cleanText(s) {
  if(/^\s*(?:\[(?:music|applause|laughter|silence|noise)\]|[（(](?:音乐|掌声|笑声|静音|噪音)[）)])\s*$/i.test(String(s)))return '';
  return String(s).replace(/\b(uh+|um+|you know|I mean)\b[,，]?/gi,'').replace(/(?:呃+|额+|嗯+)[，,]?/g,'').replace(/然后那个|就是说|怎么说/g,'').replace(/(^|[，,。\s])那个(?=[，,\s]|$)/g,'$1').replace(/\s+/g,' ').replace(/^[，,\s]+|[，,\s]+$/g,'').trim();
}
export const short = s => { const a=Array.from(String(s).trim()); const n=/[\u4e00-\u9fff]/.test(s)?30:60;if(a.length<=n)return a.join('');let prefix=a.slice(0,n-1).join('');if(/[\d.]/.test(a[n-1])&&/\d[\d.]*$/.test(prefix))prefix=prefix.replace(/[-+]?\d[\d.]*$/,'');return (prefix.trim()||'数值详见原话')+'…'; };
export const numbers = s => (String(s).match(/[-+]?\d+(?:\.\d+)?/g)||[]).map(Number);
const parts = s => s.split(/[，,、；;]|\band\b/i).map(x=>x.trim().replace(/[。.]+$/,'')).filter(Boolean);
const transition = /换一个话题|接下来讨论|另一个主题|现在谈谈|moving on|new topic|let.s (?:talk|discuss)/i;
const step = /^(?:首先|第一步|第[二三四五六七八九十\d]+步|然后|然後|接着|接著|下一步|最后|最後|最终|最終|first\b(?!\s+(?:reason|benefit|point))|second\b|third\b|next\b|then\b|finally\b|step\s*\d+)/i;
const stepStrip = /^(?:首先|第[一二三四五六七八九十\d]+步|然后|然後|接着|接著|下一步|最后|最後|最终|最終|first|second|third|next|then|finally|step\s*\d+)[:：，,\s]*/i;
const finalStep = /(?:^|[，,。；;]\s*)(?:最后|最後|最终|最終|finally\b)/i;
export function infer(text, sourceId) {
  const t=cleanText(text), node=(label,extra={})=>({label:short(label),detail:label,sourceIds:[sourceId],...extra});
  let type='card', title=short(t), nodes=[node(t)];
  const percent=t.match(/(-?\d+(?:\.\d+)?)\s*[%％]/);
  const pivot=t.match(/^(.+?)[，,。；;]\s*(?:但是|但|然而|后来(?:我们)?发现|实际上)(.+)$/);
  if(pivot&&/原本|原来|以为|认为|曾经|起初/.test(pivot[1]))return {type:'compare',title:'认识的变化',tone:'neutral',nodes:[{...node(pivot[1]),role:'prior'},{...node(pivot[2]),role:'current'}]};
  if(percent && /占比|占|比例|份额|account(?:s)? for|share|percent of/i.test(t) && +percent[1]>=0 && +percent[1]<=100) { type='proportion';title='已知占比';nodes=[node(t,{value:+percent[1],unit:'%'})]; }
  else if(percent && /增长|增加|提升|下降|减少|下跌|grew|grow|growth|increas|decreas|declin|fell|drop/i.test(t)) {type='change';title='变化幅度';nodes=[node(t,{value:/下降|减少|下跌|decreas|declin|fell|drop/i.test(t)?-Math.abs(+percent[1]):+percent[1],unit:'%'})];}
  else if((t.match(/(?:19|20)\d{2}年?/g)||[]).length>=2) {type='timeline';title='时间线';nodes=parts(t).filter(x=>/(?:19|20)\d{2}/.test(x)).map(x=>node(x));}
  else if(/因为.+所以|由于.+因此|because.+(?:therefore|so\b)|.+\bbecause\b.+/i.test(t)) {type='cause';title='原因与结果';let p=t.split(/所以|因此|\btherefore\b|\bso\b/i);if(p.length===1){p=t.split(/\bbecause\b/i).reverse();} nodes=p.map(x=>node(x.replace(/^因为|^由于|^because\s*/i,'')));}
  else if(/相比|而|versus|\bvs\.?\b|whereas|while/i.test(t) && parts(t).length>=2) {type='compare';title='对比';nodes=parts(t).map(x=>node(x));}
  else if(/包括|包含|由.+组成|consists of|includes|comprises/i.test(t)) {type='hierarchy';const p=t.split(/包括|包含|由|consists of|includes|comprises/i);title=short(p[0]);nodes=parts(p.slice(1).join(' ').replace(/组成[。.]?$/,'')).map(x=>node(x));}
  else if(step.test(t)) {type='flow';title='处理流程';nodes=t.split(/[，,；;。]\s*(?=首先|第[一二三四五六七八九十\d]+步|然后|接着|下一步|最后|最终|first\b|second\b|third\b|next\b|then\b|finally\b|step\s*\d+)/i).map(x=>node(x.replace(stepStrip,'')));}
  else if(/清单|要点|优势|原因有|包括以下|reasons|benefits|checklist|first reason/i.test(t) && parts(t).length>=2) {type='list';title='核心要点';nodes=parts(t).map(x=>node(x));}
  else { const v=parts(t).map(x=>{const m=x.match(/^(.+?)\s*(?:是|为|:|：|\bis\b|=)\s*(-?\d+(?:\.\d+)?)([^\d]*)$/i);return m?node(m[1].trim(),{detail:x,value:+m[2],unit:m[3].trim()}):null;});if(v.length>=2 && v.every(Boolean) && new Set(v.map(n=>n.unit)).size===1) {type='bars';title='数值对比';nodes=v;}}
  nodes=nodes.filter(n=>n.label.trim());if(!nodes.length){type='card';title=short(t);nodes=[node(t)];}
  return {type,title,...(type==='card'?{presentation:!/\?|？/.test(t)&&/^(?:关键结论|核心观点|结论是|请记住|总结一下)/.test(t)?'conclusion':'subtitle'}:{}),tone:/[?？]/.test(t)?'question':/风险|谨慎|risk|caution/i.test(t)?'caution':/务必|必须|关键|must|important/i.test(t)?'emphasis':/好消息|成功|great|success/i.test(t)?'positive':'neutral',nodes:nodes.slice(0,6)};
}

function assert(ok,msg) {if(!ok) throw new Error(msg);}
export function validateScene(scene, utterances, {manual=false}={}) {
  assert(scene && TYPES[scene.type],'未知图形类型');
  assert(typeof scene.title==='string' && scene.title.length<=200,'画面标题无效');
  assert(['neutral','positive','emphasis','question','caution'].includes(scene.tone),'表达语气无效');
  assert(Array.isArray(scene.nodes) && scene.nodes.length>=1 && scene.nodes.length<=6,'每个画面须有 1–6 个节点');
  const sources=new Map(utterances.map(u=>[u.id,u.text]));
  const safe={type:scene.type,title:short(scene.title),tone:scene.tone,nodes:scene.nodes.map(n=>{
    assert(n && typeof n.label==='string' && n.label.trim() && n.label.length<=300,'节点文字无效');
    assert(Array.isArray(n.sourceIds)&&n.sourceIds.length>0&&n.sourceIds.length<=10&&n.sourceIds.every(id=>sources.has(id)),'节点缺少有效原话依据');
    assert(n.detail===undefined || typeof n.detail==='string' && n.detail.length<=3000,'节点说明过长');
    const source=n.sourceIds.map(id=>sources.get(id)).join(' '), nums=numbers(source);
    if(!manual) {
      assert(numbers(n.label+' '+(n.detail||'')).every(v=>nums.includes(v)),'节点含无原话依据的数字');
      if(n.value!==undefined) assert(Number.isFinite(n.value)&&nums.some(v=>Math.abs(v)===Math.abs(n.value)),'图表数字不在原话中');
      if(n.unit) assert(typeof n.unit==='string'&& (n.unit==='%'? /[%％]/.test(source):source.includes(n.unit)),'单位不在原话中');
    }
    if(['proportion','change','bars'].includes(scene.type)) assert(Number.isFinite(n.value),'数值图必须有有效数值');
    if(scene.type==='proportion') assert(n.value>=0 && n.value<=100,'占比必须为 0–100%');
    if(!manual && scene.type==='proportion') assert(/占|份额|比例|share|account(?:s)? for|percent of/i.test(source),'原话未表达占比关系');
    if(!manual && scene.type==='change') assert(/增长|增加|提升|下降|减少|下跌|grew|grow|increas|decreas|declin|fell|drop/i.test(source),'原话未表达变化关系');
    if(!manual && ['proportion','change'].includes(scene.type)) {
      assert(n.unit==='%' && [...source.matchAll(/(-?\d+(?:\.\d+)?)\s*[%％]/g)].some(m=>Math.abs(+m[1])===Math.abs(n.value)),'百分比数值或单位没有原话依据');
      if(scene.type==='change'&&/下降|减少|下跌|decreas|declin|fell|drop/i.test(source))assert(n.value<=0,'下降不能显示为增长');
    }
    return {label:short(n.label),detail:String(n.detail||n.label),sourceIds:[...new Set(n.sourceIds)],...(Number.isFinite(n.value)?{value:n.value,unit:String(n.unit||'').slice(0,20)}:{}),...(manual?{manual:true}:{})};
  })};
  if(scene.type==='proportion') assert(safe.nodes.reduce((s,n)=>s+n.value,0)<=100,'占比总和超出 100%');
  if(!manual) {const all=safe.nodes.flatMap(n=>n.sourceIds).map(id=>sources.get(id)).join(' '); assert(numbers(scene.title).every(v=>numbers(all).includes(v)),'标题含无依据数字');}
  if(scene.type==='compare')safe.nodes.forEach((n,i)=>{if(['prior','current'].includes(scene.nodes[i].role))n.role=scene.nodes[i].role;});
  if(scene.presentation!==undefined){assert(scene.type==='card'&&['subtitle','conclusion'].includes(scene.presentation),'呈现方式无效');safe.presentation=scene.presentation;}
  if(scene.type==='relationship'){
    const people=new Set();safe.nodes.forEach((n,i)=>{const person=scene.nodes[i].person;assert(typeof person==='string'&&person.length>0&&person.length<=20&&!people.has(person),'人物标识无效');assert(mentions(n.sourceIds.map(id=>sources.get(id)).join(' '),[person]).some(m=>m.name===person),'人物不在原话中');people.add(person);n.person=person;});
    const evidence=(item)=>{assert(Array.isArray(item.sourceIds)&&item.sourceIds.length>0&&item.sourceIds.length<=10&&item.sourceIds.every(id=>sources.has(id)),'关系缺少原话依据');assert(['stated','uncertain','denied'].includes(item.status),'关系状态无效');return item.sourceIds.map(id=>sources.get(id)).join(' ');};
    assert(Array.isArray(scene.edges)&&scene.edges.length<=12&&Array.isArray(scene.storyEvents)&&scene.storyEvents.length<=6,'关系图规模无效');
    safe.edges=scene.edges.map(edge=>{const source=evidence(edge);assert(people.has(edge.from)&&people.has(edge.to)&&edge.from!==edge.to,'关系端点无效');assert(typeof edge.label==='string'&&edge.label.length>0&&edge.label.length<=30&&typeof edge.quote==='string'&&edge.quote.length<=3000&&source.includes(edge.quote)&&edge.quote.includes(edge.label),'关系未引用原话');const names=mentions(edge.quote,[...people]).map(m=>m.name);assert(names.includes(edge.from)&&names.includes(edge.to),'关系原话未包含两个人物');return {from:edge.from,to:edge.to,label:edge.label,kind:['冲突','背叛','帮助','情感','结盟','亲友','指控','权力'].includes(edge.kind)?edge.kind:'亲友',status:edge.status,directed:edge.directed!==false,quote:edge.quote,sourceIds:[...edge.sourceIds]};});
    safe.storyEvents=scene.storyEvents.map(item=>{const source=evidence(item);assert(typeof item.text==='string'&&item.text.length>0&&item.text.length<=500&&source.includes(item.text),'事件没有原话依据');return {text:item.text,status:item.status,sourceIds:[...item.sourceIds]};});
    safe.incomplete=!!scene.incomplete;
  }
  return safe;
}

export class Session {
  constructor(title='我的讲述') {this.preparation=safePreparation();this.viewMode='auto';this.cast=[];this.title=title;this.utterances=[];this.scenes=[];this.operations=[];this.events=[];this.revisions=[];this.partial='';this.epoch=0;this.counter=0;this.undoStack=[];this.startedAt=Date.now();this.ended=false;}
  get current(){return this.scenes.at(-1)||null;}
  get previous(){return this.scenes.at(-2)||null;}
  event(type,data={}) {this.events.push({type,at:Date.now(),...data});if(this.events.length>12000)this.events.splice(0,1000);}
  commit(action, changes, meta={}) {
    const patches=changes.map(after=>({id:after.id,before:clone(this.scenes.find(s=>s.id===after.id)||null),after:clone(after)}));
    for(const p of patches) {const i=this.scenes.findIndex(s=>s.id===p.id); if(i<0)this.scenes.push(p.after);else this.scenes[i]=p.after;}
    this.operations.push({id:'o'+(++this.counter),action,at:Date.now(),patches,...meta});
    if(action!=='rollback'){this.undoStack.push(this.operations.length-1);if(this.undoStack.length>100)this.undoStack.shift();}
    this.epoch++;return this.current;
  }
  ingest({type='final',text='',id,at=Date.now(),provider='text'}) {
    if(type==='partial'){this.partial=String(text).slice(0,3000);return;}
    if(type==='speech_end'){this.partial='';this.event(type);return;}
    if(type==='session_end'){this.close('演讲结束');this.partial='';this.ended=true;this.epoch++;this.event(type);return;}
    if(type==='revision') {
      const u=this.utterances.find(x=>x.id===id);assert(u,'找不到待修订原话');assert(typeof text==='string'&&text.length<=3000,'原话过长');
      this.revisions.push({id,previous:u.text,text,at});u.text=text;u.clean=cleanText(text);this.partial='';this.event('revision',{id});this.reviseScenes(id);return u;
    }
    assert(typeof text==='string' && text.length<=3000,'单段原话上限 3000 字符，请分段输入');
    const t=cleanText(text);this.partial='';if(!/[\p{L}\p{N}]/u.test(t))return;
    if(id && this.utterances.some(u=>u.id===id)) {const old=this.utterances.find(u=>u.id===id); if(old.text!==text)return this.ingest({type:'revision',id,text,at});return old;}
    assert(this.utterances.length<10000,'会话已达 10000 段，请导出后新建会话');
    const u={id:id||'u'+(++this.counter),text,clean:t,at,provider};this.utterances.push(u);this.ended=false;this.event('final',{id:u.id});this.draw(u);return u;
  }
  draw(u) {
    if(!u.clean)return;
    let relation=this.viewMode==='gossip'?relationshipScene(u.clean,u.id,this.cast||[]):null;
    if(this.viewMode==='gossip'&&!relation?.edges.length&&this.current&&!this.current.closed){
      const previous=this.utterances[this.utterances.findIndex(x=>x.id===u.id)-1];
      const continued=continueRelationship(previous,u,this.cast||[]);
      if(continued)relation={...continued,storyEvents:relation?.storyEvents||[]};
    }
    const next=relation||infer(u.clean,u.id), active=this.current, within=active && u.at-active.updatedAt<=20000;
    const thought=this.viewMode==='auto'?crossSentenceUpdate(active,u):null;
    if(thought){const checked=validateScene(thought,this.utterances);this.commit('replace',[{...active,...checked,presentation:undefined,updatedAt:u.at}],{sourceIds:[u.id],origin:'thought-revision'});return;}
    if(this.viewMode==='gossip'&&!relation&&active?.type==='relationship'&&!active.closed&&!transition.test(u.clean)){this.commit('update',[{...active,incomplete:true,updatedAt:u.at}],{sourceIds:[u.id]});return;}
    const merged=active&&!active.closed&&!transition.test(u.clean)?mergeRelationships(active,next):null;
    if(merged){this.commit('append',[{...active,...validateScene(merged,this.utterances),updatedAt:u.at}],{sourceIds:[u.id]});return;}
    if(active && !active.closed && ['flow','list'].includes(active.type) && next.type===active.type && within && !transition.test(u.clean) && active.nodes.length+next.nodes.length<=6) {
      this.commit('append',[{...active,nodes:[...active.nodes,...next.nodes],updatedAt:u.at,closed:active.nodes.length+next.nodes.length===6||finalStep.test(u.clean)}],{sourceIds:[u.id]});
    } else {
      const changes=[];if(active&&!active.closed)changes.push({...active,closed:true,closeReason:transition.test(u.clean)?'主题切换':'结构结束'});
      changes.push({...next,id:'s'+(++this.counter),createdAt:u.at,updatedAt:u.at,closed:next.type!=='relationship'&&next.nodes.length===6||next.type==='flow'&&finalStep.test(u.clean)});
      this.commit('create',changes,{sourceIds:[u.id]});
    }
  }
  close(reason='手动结束主题') {if(this.current&&!this.current.closed)this.commit('close',[{...this.current,closed:true,closeReason:reason}]);else this.epoch++;}
  tick(at=Date.now()) {if(this.current&&!this.current.closed&&['flow','list'].includes(this.current.type)&&at-this.current.updatedAt>20000)this.close('20 秒没有新增步骤');}
  undo() {
    const index=this.undoStack.pop();if(index===undefined)return false;
    const op=this.operations[index], patches=op.patches.map(p=>({id:p.id,before:clone(p.after),after:clone(p.before)}));
    for(const p of patches){const i=this.scenes.findIndex(s=>s.id===p.id);if(p.after===null){if(i>=0)this.scenes.splice(i,1);}else if(i>=0)this.scenes[i]=clone(p.after);else this.scenes.push(clone(p.after));}
    this.operations.push({id:'o'+(++this.counter),action:'rollback',at:Date.now(),patches,undoOf:op.id});this.epoch++;return true;
  }
  edit(sceneId,index,changes) {const s=this.scenes.find(s=>s.id===sceneId);assert(s&&s.nodes[index],'节点不存在');const edited=clone(s);Object.assign(edited.nodes[index],changes);const checked=validateScene(edited,this.utterances,{manual:true});this.commit('replace',[{...edited,...checked,edited:true}]);}
  reviseScenes(sourceId) {
    // Rebuild only the scenes citing this ASR segment. Unrelated confirmed/user-edited scenes stay frozen.
    const affected=this.scenes.filter(s=>s.nodes.some(n=>n.sourceIds.includes(sourceId)));
    if(!affected.length){this.epoch++;return;}
    const patches=[];
    for(const old of affected){
      const sourceIds=new Set(old.nodes.flatMap(n=>n.sourceIds)),temp=new Session(this.title);temp.counter=this.counter;temp.viewMode=old.type==='relationship'?'gossip':this.viewMode;temp.cast=this.cast;
      temp.utterances=this.utterances;for(const u of this.utterances)if(sourceIds.has(u.id))temp.draw(u);
      this.counter=temp.counter;
      const replacements=temp.scenes.map((s,i)=>({...s,id:i?s.id:old.id,closed:i<temp.scenes.length-1||old.closed||s.closed}));
      const index=this.scenes.findIndex(s=>s.id===old.id);this.scenes.splice(index,1,...replacements);
      patches.push({id:old.id,before:clone(old),after:clone(replacements[0]||null)});
      for(const s of replacements.slice(1))patches.push({id:s.id,before:null,after:clone(s)});
    }
    this.operations.push({id:'o'+(++this.counter),action:'replace',at:Date.now(),patches,order:this.scenes.map(s=>s.id),sourceIds:[sourceId],origin:'revision'});this.undoStack=[];this.epoch++;
  }
  regenerate() {const old=clone(this.scenes), temp=new Session(this.title);temp.counter=this.counter;temp.viewMode=this.viewMode;temp.cast=this.cast;temp.utterances=this.utterances;for(const u of this.utterances)temp.draw(u);this.counter=temp.counter;const ids=new Set([...old,...temp.scenes].map(s=>s.id));const patches=[...ids].map(id=>({id,before:old.find(s=>s.id===id)||null,after:temp.scenes.find(s=>s.id===id)||null}));this.scenes=temp.scenes;this.operations.push({id:'o'+(++this.counter),action:'regenerate',at:Date.now(),patches});this.undoStack=[];this.epoch++;}
  applyModel(result, token) {
    if(token!==this.epoch)return {applied:false,reason:'stale'};
    assert(result&&['create','update','append','replace','close','hold','rollback'].includes(result.action),'模型操作无效');
    assert(Number.isFinite(result.confidence)&&result.confidence>=0&&result.confidence<=1,'模型置信度无效');
    if(result.confidence<.65||result.action==='hold')return {applied:false,reason:'hold'};
    if(result.action==='close'){this.close('模型结束主题');return {applied:true};}
    if(result.action==='rollback'){this.undo();return {applied:true};}
    let scene=validateScene(result.scene,this.utterances), active=this.current;
    if(result.action==='append'){assert(active&&!active.closed,'当前结构已关闭');scene=validateScene({...scene,nodes:[...active.nodes,...scene.nodes]},this.utterances);}
    const changes=[];
    if(result.action==='create'){if(active&&!active.closed)changes.push({...active,closed:true});scene={...scene,id:'s'+(++this.counter),createdAt:Date.now()};}
    else {assert(active,'当前没有可修正的画面');scene={...active,...scene};}
    scene.updatedAt=Date.now();scene.closed=!!scene.closed||scene.nodes.length===6;scene.origin='model';changes.push(scene);this.commit(result.action,changes,{origin:'model'});return {applied:true};
  }
  summary() {
    const item=u=>({text:short(u.clean),sourceIds:[u.id]});
    return {mode:'基础总结 · 原话抽取',title:this.title,points:this.utterances.filter(u=>u.clean).filter((u,i,a)=>a.findIndex(v=>v.clean===u.clean)===i).slice(0,7).map(item),structures:[...new Set(this.scenes.map(s=>TYPES[s.type]))],numbers:this.utterances.filter(u=>/\d/.test(u.clean)).map(item),memorable:this.utterances.filter(u=>/关键|记住|结论|重要|remember|key|takeaway/i.test(u.clean)).slice(0,3).map(item),questions:this.utterances.filter(u=>/[?？]/.test(u.clean)).slice(0,7).map(item)};
  }
  export() {return {format:'livecanvas',version:2,preparation:safePreparation(this.preparation),viewMode:this.viewMode,cast:[...this.cast],title:this.title,startedAt:this.startedAt,ended:this.ended,utterances:clone(this.utterances),scenes:clone(this.scenes),operations:clone(this.operations),events:clone(this.events),revisions:clone(this.revisions)};}
}

export function importSession(raw) {
  assert(typeof raw==='string'&&raw.length<=15_000_000,'会话文件上限 15 MB');
  const x=JSON.parse(raw.replace(/^\uFEFF/,''));assert(x?.format==='livecanvas'&&x.version===2,'仅支持 Clarity / LiveCanvas v2 会话');
  assert(typeof x.title==='string'&&x.title.length<=200,'演讲标题无效');
  assert(Array.isArray(x.utterances)&&x.utterances.length<=10000&&Array.isArray(x.scenes)&&x.scenes.length<=10000,'会话规模无效');
  const s=new Session(x.title), ids=new Set();
  s.preparation=safePreparation(x.preparation);
  s.viewMode=x.viewMode==='gossip'?'gossip':'auto';if(x.cast!==undefined){assert(Array.isArray(x.cast)&&x.cast.length<=40&&x.cast.every(n=>typeof n==='string'&&/^[\p{L}·]{1,20}$/u.test(n)),'人物名单无效');s.cast=[...new Set(x.cast)];}
  s.utterances=x.utterances.map(u=>{assert(u&&typeof u.id==='string'&&/^[\w:-]{1,100}$/.test(u.id)&&!ids.has(u.id),'原话 ID 无效或重复');ids.add(u.id);assert(typeof u.text==='string'&&u.text.length<=3000&&Number.isFinite(u.at),'原话无效');return {id:u.id,text:u.text,clean:cleanText(u.text),at:u.at,provider:'import'};});
  assert(Array.isArray(x.revisions)&&x.revisions.length<=30000,'修订记录无效');
  s.revisions=x.revisions.map(r=>{assert(r&&ids.has(r.id)&&typeof r.previous==='string'&&r.previous.length<=3000&&typeof r.text==='string'&&r.text.length<=3000&&Number.isFinite(r.at),'修订内容无效');return {id:r.id,previous:r.previous,text:r.text,at:r.at};});
  const historicalSources=s.utterances.map(u=>({...u,text:[u.text,...s.revisions.filter(r=>r.id===u.id).flatMap(r=>[r.previous,r.text])].join(' ')}));
  const sceneIds=new Set();const sanitizeScene=(q,historical=false)=>{assert(q&&/^[\w:-]{1,100}$/.test(q.id)&&Number.isFinite(q.createdAt)&&Number.isFinite(q.updatedAt),'画面无效');return {...validateScene(q,historical?historicalSources:s.utterances,{manual:q.edited===true}),id:q.id,createdAt:q.createdAt,updatedAt:q.updatedAt,closed:!!q.closed,edited:!!q.edited,...(['model','jev'].includes(q.origin)?{origin:q.origin}:{})};};
  s.scenes=x.scenes.map(q=>{assert(!sceneIds.has(q.id),'画面 ID 重复');sceneIds.add(q.id);return sanitizeScene(q);});
  assert(Array.isArray(x.operations)&&x.operations.length<=30000,'操作日志无效');
  s.operations=x.operations.map(o=>{assert(o&&typeof o.id==='string'&&['create','update','append','replace','close','hold','rollback','regenerate'].includes(o.action)&&Number.isFinite(o.at)&&Array.isArray(o.patches)&&o.patches.length<=20000,'操作无效');return {id:o.id.slice(0,100),action:o.action,at:o.at,patches:o.patches.map(p=>{assert(p&&typeof p.id==='string'&&(p.before===null||p.before?.id===p.id)&&(p.after===null||p.after?.id===p.id),'操作补丁无效');return {id:p.id,before:p.before===null?null:sanitizeScene(p.before,true),after:p.after===null?null:sanitizeScene(p.after,true)};})};});
  if(Array.isArray(x.events)){assert(x.events.length<=12000,'事件记录过多');s.events=x.events.map(v=>{assert(v&&typeof v.type==='string'&&Number.isFinite(v.at),'事件无效');return {type:v.type.slice(0,50),at:v.at,...(typeof v.id==='string'?{id:v.id.slice(0,100)}:{})};});}
  x.operations.forEach((o,i)=>{if(o.order!==undefined){assert(Array.isArray(o.order)&&o.order.length<=10000&&o.order.every(id=>typeof id==='string'&&/^[\w:-]{1,100}$/.test(id)),'画面顺序无效');s.operations[i].order=[...o.order];}});
  s.startedAt=Number.isFinite(x.startedAt)?x.startedAt:Date.now();s.ended=!!x.ended;s.counter=Math.max(0,...[...s.utterances,...s.scenes,...s.operations].map(v=>Number(v.id.replace(/^\D+/,''))||0))+100;assert(s.counter<1e9,'ID 超出范围');s.event('import');return s;
}

export function replayFrames(session) {let scenes=new Map();return session.operations.map(op=>{for(const p of op.patches){if(p.after)scenes.set(p.id,p.after);else scenes.delete(p.id);}if(op.order)scenes=new Map(op.order.filter(id=>scenes.has(id)).map(id=>[id,scenes.get(id)]));const values=[...scenes.values()];return {action:op.action,at:op.at,current:values.at(-1)||null,previous:values.at(-2)||null};});}
