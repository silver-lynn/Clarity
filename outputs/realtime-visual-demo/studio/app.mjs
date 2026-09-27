import {Session,importSession,infer,clone,escapeHTML as e,TYPES,replayFrames} from './core.mjs';
import {sceneHTML} from './render.mjs';
import {makeASR} from './asr.mjs';
import {SemanticModel} from './model.mjs';
import {JevModel} from './jev.mjs';
import {patchMarkup} from './view.mjs';
import {createExperience} from './experience.mjs';
import {liveScene} from './experience-logic.mjs';
import {showKnowledgeTree} from './knowledge-tree.mjs';
import {relationshipScene} from './relationships.mjs';
import {download,filename,editableHTML,buildPPTX} from './export.mjs';
import {DEMOS} from './demo.mjs';
import {DemoNarrator} from './demo-audio.mjs';
const narrator=new DemoNarrator();
window.addEventListener('pagehide',()=>narrator.stop());
const $=id=>document.getElementById(id);
window.addEventListener('pagehide',()=>{try{localStorage.setItem('livecanvas.studio.v2',JSON.stringify(session.export()));}catch{}});
if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(rs=>rs.filter(r=>r.active?.scriptURL.endsWith('/sw.js')).forEach(r=>r.unregister())).catch(()=>{});
if('caches' in window)caches.keys().then(keys=>keys.filter(k=>k.startsWith('livecanvas-')).forEach(k=>caches.delete(k))).catch(()=>{});
let held=null,heldCount=0,pendingView=null,experience=null,renderedScene=null,captionFrame=null;
let session=new Session(), pinned=null, selected=null, adapter=null, recording=false, draining=false, demoRun=0, playing=false, saveTimer, toastTimer, latency=null;
const semanticModel=new SemanticModel(),jevModel=new JevModel();
const model={cancel(){semanticModel.cancel();jevModel.cancel();},analyze(target,options){return settings.engine==='jev'?jevModel.analyze(target,{key:settings.jevKey,threshold:settings.jevThreshold}):semanticModel.analyze(target,options);}};
const settings={provider:'doubao',cloudKey:'',endpoint:'ws://127.0.0.1:8001/asr',enabled:false,engine:'chat',jevKey:'',jevThreshold:.7,modelEndpoint:'',modelName:'',key:''};
let settingsReady=Promise.resolve();
let mode='基础模式', asrLabel='文字输入';
try {const saved=localStorage.getItem('livecanvas.studio.v2');if(saved)session=importSession(saved);}catch{toast('旧会话未能恢复；可通过 JSON 文件导入。');}
$('title').value=session.title;
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#more-menu'))$('more-menu').open=false;});
document.querySelectorAll('#more-menu button').forEach(button=>button.addEventListener('click',()=>{$('more-menu').open=false;}));
$('outline-toggle').onclick=()=>{const open=document.body.classList.toggle('outline-open');$('outline-toggle').setAttribute('aria-expanded',String(open));};
$('hold').onclick=()=>{if(held){held=null;selected=null;}else{held=clone(selected?session.scenes.find(s=>s.id===selected):liveScene(session));heldCount=session.utterances.length;}render();};
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('livecanvas.studio.v2',JSON.stringify(session.export()));$('save-state').textContent='已保存在此浏览器 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}catch{$('save-state').textContent='本地存储已满 · 请导出会话 JSON';}},650);}
function render(){
  experience?.syncSession();
  if(held&&!session.scenes.some(s=>s.id===held.id))held=null;
  $('scene-mode').value=session.viewMode;
  $('text-input').placeholder=session.viewMode==='gossip'?'例如：甄嬛与沈眉庄是好友。听说华妃可能陷害甄嬛。皇帝册封甄嬛。':'也可以打字，Enter 发送';
  let current=selected?session.scenes.find(s=>s.id===selected):liveScene(session);
  let previous=selected?session.scenes[session.scenes.findIndex(s=>s.id===selected)-1]:session.previous;
  if(!selected&&pendingView?.session===session&&pendingView.epoch===session.epoch)current=pendingView.scene;
  if(held){current=held;previous=null;}
  if(experience?.review){current=experience.review.scene;previous=null;}
  renderedScene=current;
  $('hold').disabled=!current;$('hold').textContent=held?'继续跟随'+(session.utterances.length>heldCount?' · '+(session.utterances.length-heldCount)+' 段新内容':''):'保留画面';$('hold').setAttribute('aria-pressed',String(!!held));
  $('thought-status').textContent=held?'画面已保留，讲述仍在继续。':selected?'正在回看，可以点击“当前思路”返回。':session.partial?'正在听，等意思完整再更新画面。':current?.nodes.some(n=>n.role)?'把原先的判断与新的认识放在一起看。':session.operations.at(-1)?.action==='append'?'接着刚才的思路，补充了新内容。':current?'围绕当前想法展开。':'从一个想法开始。';
  patchMarkup($('previous'),sceneHTML(pinned||previous));
  if(!pinned&&!previous)patchMarkup($('previous'),'<div class="empty"><h2>还没有上一段</h2><p>新的主题出现后，可以在这里回看。</p></div>');
  patchMarkup($('current'),sceneHTML(current,{editable:!selected&&!held}));
  $('left-info').textContent=pinned?'已固定':previous?'已确认':'等待确认';
  $('right-info').textContent=held?'已保留':selected?'正在查看历史':session.partial?'正在听 · 尚未确认':session.ended?'演讲已完成':current?.closed?'主题已结束':'随表达生成';
  $('live-text').textContent=session.partial||session.utterances.at(-1)?.text||'先说一句，或者播放一段内置演讲。';$('live-text').classList.toggle('partial',!!session.partial);
  $('transcript-kind').textContent=session.partial?'临时识别':'确认原话';$('utterance-count').textContent=session.utterances.length+' 段';
  $('scene-count').textContent=String(session.scenes.length).padStart(2,'0');
  const history=session.scenes.slice(-100);
  $('history').innerHTML=history.length?history.map((s,i)=>`<button class="history-item ${s.id===(selected||session.current?.id)?'selected':''}" data-history="${e(s.id)}"><small><span>${String(session.scenes.length-history.length+i+1).padStart(2,'0')} / ${e(TYPES[s.type])}</span><span>${s.closed?'✓':'•'}</span></small><b>${e(s.title)}</b></button>`).join(''):'<p class="sidebar-empty">每个已确认画面<br>会保存在这里</p>';
  const tones={neutral:'😐 中性',positive:'🙂 积极',emphasis:'❗ 强调',question:'🤔 疑问',caution:'⚠️ 谨慎 / 风险'};
  $('tone').textContent=tones[current?.tone||'neutral'];$('tone').title='根据文本表达估计语气，不代表真实心理状态';$('latency').textContent='出图 '+(latency??'—')+' ms';$('latency').title='稳定文字提交至下一帧的本机测量；不包括语音识别或模型请求';
  $('model-status').textContent=mode;$('asr-status').textContent=asrLabel;
  $('mode-note').textContent=settings.enabled?(settings.engine==='jev'?'Jev 选择呈现方式 · 文字引用原话 · 低置信度保留基础画面':'语义模型已启用 · 输出经原话校验'):'基础模式：有限规则，不等同于完整语义理解。';
  $('correct').disabled=!session.utterances.length;
  $('undo').disabled=!session.undoStack.length;$('close-topic').disabled=!session.current||session.current.closed;$('pin').textContent=pinned?'⌖ 取消固定':'⌖ 固定左侧';
  $('record').classList.toggle('active',recording);$('record').innerHTML=draining?'接收尾句…':recording?'<span class="transport-icon stop" aria-hidden="true"></span> 停止录音':'<span class="transport-icon play" aria-hidden="true"></span> 开始讲述';$('record').disabled=draining||playing;$('record').setAttribute('aria-pressed',String(recording));$('record').title=recording?'停止麦克风并接收最后一句':'开启麦克风，将讲述实时转为字幕与结构';
  $('language').disabled=recording||draining;$('settings-open').disabled=recording||draining;
  $('demo').innerHTML=playing?'<span class="transport-icon stop" aria-hidden="true"></span> 停止演示':'<span class="transport-icon play" aria-hidden="true"></span> 播放示例';$('demo').disabled=recording||draining;
  $('record-status').innerHTML='<span class="dot"></span>'+(draining?'接收尾句':recording?'正在录音':playing?'文字回放':session.ended?'演讲已完成':'准备就绪');
  $('language-status').textContent=$('language').selectedOptions[0].textContent;
  experience?.render({current,held,selected,recording});
}
async function accept(event){
  try {
    if(event.type==='partial'){
      session.ingest(event);
      if(captionFrame===null){const target=session;captionFrame=requestAnimationFrame(()=>{captionFrame=null;if(target!==session)return;experience?.render({current:renderedScene,held,selected,recording,captionsOnly:true});});}
      return;
    }
    if(captionFrame!==null){cancelAnimationFrame(captionFrame);captionFrame=null;}
    const t=performance.now(),target=session,before=clone(session.current),beforeEpoch=session.epoch;
    if(event.type!=='partial'){model.cancel();pendingView=null;selected=null;}
    const utterance=session.ingest(event);
    const needsDecision=utterance&&target.epoch!==beforeEpoch&&settings.enabled&&target.current?.nodes.some(n=>n.sourceIds.includes(utterance.id));
    const waiting=needsDecision&&settings.engine==='jev'?{session:target,epoch:target.epoch,scene:before}:null;
    if(waiting)pendingView=waiting;
    render();
    if(event.type==='partial')return;
    persist();requestAnimationFrame(()=>{latency=Math.round(performance.now()-t);$('latency').textContent='出图 '+latency+' ms';});
    if(needsDecision){
      const token=target.epoch;mode=(settings.engine==='jev'?'Jev 判断中':'模型分析中')+' · 基础画面已就绪';render();
      try {const result=await model.analyze(target,{endpoint:settings.modelEndpoint,model:settings.modelName,key:settings.key});if(target!==session||token!==target.epoch&&!result.applied)return;mode=result.reason==='local-relationship'?'人物关系 · 原话规则':['grounded','cooldown'].includes(result.reason)?'保留有依据的基础画面':result.reason==='hold'?'判断不确定 · 保留基础画面':settings.engine==='jev'?'Jev 决策 · '+Math.round(result.confidence*100)+'%':'模型模式';$('decision-health').textContent=result.applied?'上次判断 '+(result.durationMs??'—')+' ms · 已应用':result.reason==='grounded'?'明确的数字或转折，无需额外判断':result.reason==='cooldown'?'服务限流，暂用基础画面':result.reason==='local-relationship'?'人物关系由原话规则提取':'判断未采用，保留当前画面';render();persist();}
      catch(error){if(target!==session||token!==target.epoch)return;mode='基础模式 · 模型不可用';$('decision-health').textContent=error.name==='AbortError'?'判断未在时间预算内完成；基础画面仍可用':'判断服务不可用；基础画面仍可用';render();toast('语义模型未应用：'+(error.name==='AbortError'?'请求超时或已取消':error.message));}
      finally{if(waiting&&pendingView===waiting){pendingView=null;render();}}
    }
  }catch(error){toast(error.message);}
}
function panel(title,html){$('panel-title').textContent=title;$('panel-body').innerHTML=html;if(!$('panel').open)$('panel').showModal();}
$('panel-close').onclick=()=>$('panel').close();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('send').onclick=()=>{const text=$('text-input').value.trim();if(!text)return;$('text-input').value='';accept({type:'final',text});};
$('text-input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('send').click();}};
$('title').onchange=()=>{session.title=$('title').value.trim()||'未命名演讲';session.epoch++;model.cancel();persist();};
$('undo').onclick=()=>{model.cancel();session.undo();selected=null;render();persist();toast('已撤销图形修改；原话仍然保留。');};
$('close-topic').onclick=()=>{model.cancel();session.close();render();persist();};
$('pin').onclick=()=>{pinned=pinned?null:clone(session.previous||session.current);render();};
$('right-info').onclick=()=>{selected=null;held=null;experience?.clearReview();render();};
$('history').onclick=event=>{const b=event.target.closest('[data-history]');if(b){held=null;selected=b.dataset.history===session.current?.id?null:b.dataset.history;render();}};
function showNode(sceneId,index){
  const snapshot=experience?.review?.scene||held;
  if(snapshot&&snapshot.id===sceneId){const node=snapshot.nodes[index];if(node)panel('当时的原话',`<p class="hint">这是保留的历史画面。回到现场后可以修正当前内容。</p><h3>${e(node.detail||node.label)}</h3>${node.sourceIds.map(id=>`<div class="evidence-quote"><small>${e(id)}</small>${e(experience.review?experience.sourceText(id):session.utterances.find(u=>u.id===id)?.text)}</div>`).join('')}`);return;}
  if(sceneId==='draft'){toast('临时预览尚未确认，不会进入导出或修改已确认画面。');return;}
  const scene=session.scenes.find(s=>s.id===sceneId),node=scene?.nodes[index];if(!node)return;
  panel('原话依据与节点编辑',`<span class="badge">${e(TYPES[scene.type])} · ${e(node.sourceIds.join(' / '))}</span>${node.sourceIds.map(id=>{const u=session.utterances.find(u=>u.id===id);return `<div class="evidence-quote"><small>${e(id)}</small>${e(u?.text)}</div>`;}).join('')}<form id="node-form"><label>节点文字<input id="node-label" maxlength="60" value="${e(node.label)}"></label>${Number.isFinite(node.value)?`<label>数值<input id="node-value" type="number" step="any" value="${node.value}"></label>`:''}<p class="hint">修改会标注为人工编辑，原话保持不变。可用“撤销”恢复。</p><button class="primary">保存修改</button></form>`);
  $('node-form').onsubmit=event=>{event.preventDefault();try{const changes={label:$('node-label').value.trim()};if($('node-value')){if(!$('node-value').value.trim())throw new Error('请输入数值');changes.value=Number($('node-value').value);}model.cancel();session.edit(sceneId,index,changes);$('panel').close();render();persist();}catch(error){toast(error.message);}};
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-node]');if(b&&b.closest('.canvas'))showNode(b.dataset.scene,+b.dataset.node);});
function showSources(){
  panel('完整原话与修订',`<p class="hint">共 ${session.utterances.length} 段原话 · ${session.revisions.length} 次识别修订。修订原话后，会根据新原话重新生成基础画面。</p><ul class="panel-list">${session.utterances.map(u=>`<li><small>${e(u.id)} · ${new Date(u.at).toLocaleTimeString()}</small>${e(u.text)}<button data-revise="${e(u.id)}">修订</button></li>`).join('')||'<li>还没有确认原话。</li>'}</ul><button id="regenerate" class="outline">从全部原话重新生成</button>`);
  $('regenerate').onclick=()=>{model.cancel();session.regenerate();selected=null;render();persist();$('panel').close();toast('已从原话重新生成基础画面。');};
  $('panel-body').querySelectorAll('[data-revise]').forEach(b=>b.onclick=()=>{const u=session.utterances.find(u=>u.id===b.dataset.revise);panel('修订原话',`<form id="revision-form"><label>${e(u.id)}<textarea id="revision-text" maxlength="3000">${e(u.text)}</textarea></label><button class="primary">保存并重新生成</button></form>`);$('revision-form').onsubmit=event=>{event.preventDefault();accept({type:'revision',id:u.id,text:$('revision-text').value});$('panel').close();};});
}
$('sources-open').onclick=showSources;
$('correct').onclick=()=>{const u=session.utterances.at(-1);if(!u)return;panel('修正刚才的表达',`<p class="hint">修正原话后，相关画面会重新整理；其他内容保留。</p><form id="quick-correction"><textarea id="correct-text" maxlength="3000" aria-label="修正原话">${e(u.text)}</textarea><button class="primary">更新画面</button></form>`);$('quick-correction').onsubmit=async event=>{event.preventDefault();held=null;await accept({type:'revision',id:u.id,text:$('correct-text').value});$('panel').close();};};
function showSummary(){const s=session.summary(),list=items=>items.length?`<ul class="panel-list">${items.map(x=>`<li>${e(x.text)}<small>原话 ${e(x.sourceIds.join(' / '))}</small></li>`).join('')}</ul>`:'<p class="hint">原话中未明确提及。</p>';panel('演讲总结',`<span class="badge">${e(s.mode)}</span><h3>${e(s.title)}</h3>${list(s.points)}<h3>主要逻辑结构</h3><p class="hint">${e(s.structures.join(' → '))||'暂无画面'}</p><h3>关键数字</h3>${list(s.numbers)}<h3>值得记住</h3>${list(s.memorable)}<h3>原话中的问题</h3><p class="hint">基础模式仅抽取疑问句，不能判断问题是否已解决。</p>${list(s.questions)}<p class="hint">全部 ${session.scenes.length} 个画面保存在左侧历史和会话文件中。</p>`);}
$('summary-open').onclick=showSummary;
$('summary-open').insertAdjacentHTML('beforebegin','<button id="knowledge-open">整场知识树</button>');
$('knowledge-open').onclick=()=>showKnowledgeTree(session,panel);
async function stopRecording(){
  if(!adapter)return;draining=true;render();
  if(settings.provider!=='browser')await adapter.stop();
  else await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};adapter.addEventListener('status',event=>{if(event.detail.status==='idle')finish();});const timer=setTimeout(finish,2000);adapter.stop();});
  recording=false;draining=false;adapter=null;session.ingest({type:'speech_end'});render();persist();
}
$('record').onclick=async()=>{
  await settingsReady;
  if(playing){demoRun++;playing=false;narrator.stop();session.partial='';render();}
  if(recording){await stopRecording();return;}
  if(settings.provider==='doubao'&&!settings.cloudKey){$('settings-open').click();$('cloud-key').focus();toast('先配置豆包 API Key，再开始讲述。');return;}
  try {
    recording=true;asrLabel=(settings.provider==='doubao'?'豆包云端':settings.provider==='local'?'本地流式':'浏览器识别')+' · 正在连接';render();
    const currentAdapter=makeASR({provider:settings.provider,endpoint:settings.endpoint,cloudKey:settings.cloudKey,language:$('language').value,hotwords:session.preparation.terms},event=>{if(adapter===currentAdapter)accept(event);},status=>{if(adapter!==currentAdapter)return;session.event('audio_'+status);asrLabel=(settings.provider==='doubao'?'豆包云端':settings.provider==='local'?'本地流式':'浏览器识别')+' · '+({listening:'已连接',draining:'接收尾句',reconnecting:'重连中',idle:'已停止'}[status]||status);if(status==='idle'&&!draining)recording=false;render();},message=>{if(adapter!==currentAdapter)return;toast('识别服务：'+message);recording=false;asrLabel='识别不可用 · 可输入文字';if(!draining){currentAdapter.requested=false;adapter=null;if(settings.provider!=='browser')currentAdapter.cleanup();else currentAdapter.stop();}render();});
    currentAdapter.addEventListener('quality',event=>{if(adapter!==currentAdapter)return;const q=event.detail;if(q.message){toast(q.message);return;}toast(q.confirmation?'准确优先：实时预览，停顿后确认整句。':'当前使用快速识别；整句确认模型未启用。');});
    currentAdapter.addEventListener('context',event=>{const {accepted=[],rejected=[],scope='final'}=event.detail;experience?.setRecognition({accepted,rejected,scope});const message=`已应用 ${accepted.length} 个${scope==='preview'?'预览':'识别'}热词`+(scope==='preview'?'；整句确认按音频重新识别':'')+(rejected.length?`；${rejected.length} 个词暂不支持直接加权，可在讲前准备中查看`:'');$('decision-health').textContent=message;if(rejected.length)toast(message);});
    adapter=currentAdapter;await adapter.start();
    if(settings.provider==='browser'&&$('language').value==='auto')toast('浏览器模式以中文识别，中英混合建议使用豆包云端识别。');
  }catch(error){recording=false;toast(error.message);render();}
};
document.addEventListener('click',event=>{const b=event.target.closest('[data-relation],[data-story-event]');if(!b)return;const snapshot=experience?.review?.scene||held;const s=snapshot?.id===b.dataset.scene?snapshot:session.scenes.find(s=>s.id===b.dataset.scene);const item=b.hasAttribute('data-relation')?s?.edges[+b.dataset.relation]:s?.storyEvents[+b.dataset.storyEvent];if(!item)return;panel('剧情依据',`<span class="badge">${e({stated:'原话陈述，不代表已核实剧情',uncertain:'猜测 / 传闻',denied:'原话否认'}[item.status])}</span><h3>${e(item.quote||item.text)}</h3>${item.sourceIds.map(id=>`<div class="evidence-quote"><small>${e(id)}</small>${e(experience?.review?experience.sourceText(id):session.utterances.find(u=>u.id===id)?.text)}</div>`).join('')}<p class="hint">基础模式按明确句式提取，不补充未讲述的剧情。矛盾说法分别保留；可在“全部原话”中修订。</p>`);});
document.addEventListener('keydown',event=>{const n=event.target.closest('.people-map [data-node]');if(n&&['Enter',' '].includes(event.key)){event.preventDefault();showNode(n.dataset.scene,+n.dataset.node);}});
document.addEventListener('keydown',event=>{const relation=event.target.closest('.people-map [data-relation]');if(relation&&['Enter',' '].includes(event.key)){event.preventDefault();relation.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
$('language').onchange=render;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
$('demo').onclick=async()=>{
  if(playing){demoRun++;playing=false;narrator.stop();session.partial='';asrLabel='文字输入';render();return;}
  if($('demo-select').value==='gossip'){session.close('开始剧情演示');session.viewMode='gossip';}else if(session.viewMode==='gossip'){session.close('切换演示');session.viewMode='auto';}
  const run=++demoRun,selection=$('demo-select').value,texts=DEMOS[selection];
  playing=true;asrLabel=selection==='gossip'?'示例朗读 · 字幕随声音同步（非实时识别）':'内置演讲 · 模拟流式文字';render();
  try{
    if(selection==='gossip'){
      const clips=await narrator.load(texts);
      for(const [index,clip] of clips.entries()){
        if(run!==demoRun)break;
        const id=`demo-${run}-${Date.now()}-${index}`;
        const completed=await narrator.play(clip,{
          partial:text=>run===demoRun?accept({type:'partial',text}):undefined,
          commit:text=>run===demoRun?accept({type:'final',text,id,provider:'demo-audio'}):undefined
        });
        if(!completed)break;
      }
    }else{
      for(const text of texts){
        if(run!==demoRun)break;
        const chars=Array.from(text);for(let i=5;i<chars.length;i+=5){if(run!==demoRun)break;await accept({type:'partial',text:chars.slice(0,i).join('')});await wait(95);}
        if(run!==demoRun)break;await accept({type:'final',text,provider:'demo'});await wait(900);
      }
    }
    if(run===demoRun)toast('示例播放完成，可查看历史或导出。');
  }catch(error){if(run===demoRun)toast(error.message);}
  finally{if(run===demoRun){narrator.stop();playing=false;session.partial='';asrLabel='文字输入';render();}}

};
$('finish').textContent='结束并回顾';
$('finish').onclick=async()=>{demoRun++;playing=false;narrator.stop();if(recording||draining)await stopRecording();model.cancel();await accept({type:'session_end'});showKnowledgeTree(session,panel);};
document.querySelector('.toolbar-actions').prepend($('new-session'));
$('new-session').textContent='＋ 新演讲';
$('new-session').title='清空本场并新建演讲；录音中会接收尾句后开始新一场，上一场自动下载备份';
let startingNewSession=false;
$('new-session').onclick=async()=>{
  if(startingNewSession)return;startingNewSession=true;const resume=recording;let backedUp=false;
  $('new-session').disabled=true;$('new-session').textContent=recording||draining?'收好上一场…':'正在新建…';
  demoRun++;playing=false;narrator.stop();model.cancel();
  try{
    if(recording||draining)await stopRecording();model.cancel();
    if(session.utterances.length){download(filename(session.title)+'-备份.json',JSON.stringify(session.export(),null,2));backedUp=true;}
    clearTimeout(saveTimer);session=new Session();held=null;heldCount=0;pinned=null;selected=null;pendingView=null;experience?.clearReview();
    $('title').value=session.title;$('text-input').value='';$('import-file').value='';latency=null;mode='基础模式';asrLabel='文字输入';
    $('decision-health').textContent='尚未请求语义判断';render();
    try{localStorage.setItem('livecanvas.studio.v2',JSON.stringify(session.export()));}catch{$('save-state').textContent='本地存储已满 · 请导出会话 JSON';}
    persist();toast('新演讲已准备好。'+(backedUp?'上一场已下载备份，可通过“导入会话”恢复。':''));
    if(resume)await $('record').onclick();else $('text-input').focus({preventScroll:true});
  }catch(error){toast('新建未完成：'+error.message);}
  finally{startingNewSession=false;$('new-session').disabled=false;$('new-session').textContent='＋ 新演讲';}
};
$('decision-engine').onchange=()=>{const jev=$('decision-engine').value==='jev';$('jev-settings').hidden=!jev;$('chat-settings').hidden=jev;};
$('scene-mode').onchange=()=>{model.cancel();session.close('切换呈现模式');session.viewMode=$('scene-mode').value;if(session.viewMode==='gossip')$('demo-select').value='gossip';render();persist();toast(session.viewMode==='gossip'?'人物关系模式：识别明确人物、关系与事件；可在设置补充人物名单。':'已切换自动图形模式。');};
$('settings-open').onclick=()=>{$('cast-names').value=session.cast.join('、');$('settings').showModal();};
$('provider').onchange=()=>{$('cloud-asr-settings').hidden=$('provider').value!=='doubao';$('local-asr-settings').hidden=$('provider').value!=='local';};
$('provider').onchange();
$('settings-form').onsubmit=async event=>{
  event.preventDefault();try{
    if(recording||draining)throw new Error('请先停止录音，再修改识别设置');
    if($('provider').value==='doubao'&&!$('cloud-key').value.trim())throw new Error('请输入豆包 API Key');
    const cast=$('cast-names').value.split(/[、,，\n]/).map(x=>x.trim()).filter(Boolean);if(cast.length>40||!cast.every(n=>/^[\p{L}·]{1,20}$/u.test(n)))throw new Error('人物名单最多 40 人，每人 1–20 个文字字符');
    const url=new URL($('asr-endpoint').value);if(!['ws:','wss:'].includes(url.protocol))throw new Error('识别地址须为 ws:// 或 wss://');
    const enabled=$('model-enabled').checked;if(enabled&&$('decision-engine').value==='jev'&&!$('jev-key').value.trim())throw new Error('请输入 TypeSafe API 密钥');if(enabled&&$('decision-engine').value==='chat'){const u=new URL($('model-endpoint').value);if(!['http:','https:'].includes(u.protocol))throw new Error('模型地址须为 HTTP(S)');if(!$('model-name').value.trim())throw new Error('请输入模型名称');}
    session.cast=[...new Set(cast)];persist();Object.assign(settings,{provider:$('provider').value,cloudKey:$('cloud-key').value.trim(),endpoint:url.href,enabled,engine:$('decision-engine').value,jevKey:$('jev-key').value.trim(),jevThreshold:Number($('jev-threshold').value),modelEndpoint:$('model-endpoint').value,modelName:$('model-name').value.trim(),key:$('model-key').value});model.cancel();session.epoch++;mode=enabled?'模型待命 · 当前基础模式':'基础模式';try{await storeSettings($('remember-keys').checked?'PUT':'DELETE',settings);}catch{render();toast('设置本次可用，但加密保存失败。请启动云端识别服务后重新应用。');return;}$('settings').close();render();toast($('remember-keys').checked?'设置已加密保存在此设备，下次自动恢复。':'设置仅本次有效，已清除本地保存。');
  }catch(error){toast(error.message);}
};
async function storeSettings(method='GET',value){
 const response=await fetch('http://127.0.0.1:8002/settings',{method,headers:method==='PUT'?{'Content-Type':'application/json'}:{},...(method==='PUT'?{body:JSON.stringify(value)}:{}),cache:'no-store',signal:AbortSignal.timeout(4000)});
 if(!response.ok)throw new Error('无法访问加密存储');return response.json();
}
function syncSettingsFields(){
 const fields={provider:'provider',cloudKey:'cloud-key',endpoint:'asr-endpoint',engine:'decision-engine',jevKey:'jev-key',jevThreshold:'jev-threshold',modelEndpoint:'model-endpoint',modelName:'model-name',key:'model-key'};
 for(const [key,id] of Object.entries(fields))$(id).value=settings[key];
 $('model-enabled').checked=settings.enabled;$('provider').onchange();$('decision-engine').onchange();
}
$('forget-keys').onclick=async()=>{
 if(recording||draining){toast('请先停止录音，再清除密钥。');return;}
 try{await storeSettings('DELETE');settings.cloudKey='';settings.jevKey='';settings.key='';settings.enabled=false;model.cancel();syncSettingsFields();$('remember-keys').checked=false;render();toast('已清除本机保存及当前页面中的密钥。');}catch{toast('清除失败，请检查云端识别服务是否正在运行。');}
};
$('settings-form').inert=true;
settingsReady=storeSettings().then(saved=>{
 for(const key of Object.keys(settings))if(Object.hasOwn(saved,key)&&typeof saved[key]===typeof settings[key])settings[key]=saved[key];
 syncSettingsFields();mode=settings.enabled?'模型待命 · 当前基础模式':'基础模式';render();
}).catch(()=>{}).finally(()=>{$('settings-form').inert=false;});
$('import-open').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>15_000_000)throw new Error('文件上限 15 MB');const restored=importSession(await file.text());if(recording||draining)await stopRecording();demoRun++;playing=false;narrator.stop();model.cancel();session=restored;held=null;pinned=null;selected=null;$('title').value=session.title;render();persist();toast('会话已恢复。');}catch(error){toast('导入失败：'+error.message);}event.target.value='';};
$('export-open').onclick=()=>{
  panel('把表达带走',`<p class="hint">导出 ${session.scenes.length} 个确认画面及总结。临时识别内容不会进入导出。</p><div class="export-grid"><button id="export-ppt"><b>PowerPoint ↗</b><small>独立文本框、流程箭头与原生图表，可继续编辑。</small></button><button id="export-html"><b>离线 HTML ↗</b><small>双击修改文字和数字，保存编辑后的文件，附带原话与完整会话。</small></button><button id="export-json"><b>会话 JSON ↗</b><small>保留原话、修订和画面版本，可导入恢复、回放。</small></button></div>`);
  $('export-json').onclick=()=>{download(filename(session.title)+'.json',JSON.stringify(session.export(),null,2));toast('会话文件已生成。');};
  $('export-html').onclick=async()=>{try{const css=(await Promise.all(['/studio/styles.css','/studio/c1.css','/studio/focus.css'].map(async path=>{const r=await fetch(path);if(!r.ok)throw new Error('导出样式加载失败');return r.text();}))).join('\n');download(filename(session.title)+'.html',editableHTML(session,css),'text/html;charset=utf-8');toast('离线可编辑 HTML 已生成。');}catch(error){toast(error.message);}};
  $('export-ppt').onclick=async()=>{try{const Pptx=window.pptxgen||window.PptxGenJS;if(!Pptx)throw new Error('PPT 导出组件未加载');$('export-ppt').disabled=true;await buildPPTX(session,Pptx).writeFile({fileName:filename(session.title)+'.pptx'});toast('可编辑 PowerPoint 已生成。');}catch(error){toast(error.message);}finally{if($('export-ppt'))$('export-ppt').disabled=false;}};
};
$('replay-open').onclick=()=>{
  const frames=replayFrames(session);let auto=null;
  panel('画面版本与回放',`<p class="hint">每次创建、追加、修改和撤销均保留记录。回放只查看历史，不改变当前会话。</p><div class="version-controls"><button id="play-versions" class="outline"><span class="transport-icon play" aria-hidden="true"></span> 播放</button><input id="version-range" aria-label="画面版本" type="range" min="0" max="${Math.max(0,frames.length-1)}" value="${Math.max(0,frames.length-1)}"><span id="version-label"></span></div><div id="version-scene" class="version-preview"></div><h3>实时与全文处理对比</h3><p class="hint">全文基线先按句末标点合并碎片，再运行相同基础规则。此对比用于发现分段差异，不等于准确率评估。</p><button id="compare-full" class="outline">生成对比报告</button><div id="comparison"></div>`);
  function show(){const i=+$('version-range').value,f=frames[i];$('version-label').textContent=frames.length?`${i+1} / ${frames.length}`:'0 / 0';$('version-scene').innerHTML=f?`<small class="hint">${e(f.action)} · ${new Date(f.at).toLocaleTimeString()}</small>`+sceneHTML(f.current):'<p class="hint">还没有画面版本。</p>';}
  $('version-range').oninput=show;show();
  $('play-versions').onclick=()=>{if(auto){clearInterval(auto);auto=null;$('play-versions').innerHTML='<span class="transport-icon play" aria-hidden="true"></span> 播放';return;}$('version-range').value=0;show();$('play-versions').innerHTML='<span class="transport-icon pause" aria-hidden="true"></span> 暂停';auto=setInterval(()=>{const range=$('version-range');if(!range||+range.value>=frames.length-1){clearInterval(auto);auto=null;if($('play-versions'))$('play-versions').innerHTML='<span class="transport-icon play" aria-hidden="true"></span> 播放';return;}range.value=+range.value+1;show();},600);};
  $('panel').addEventListener('close',()=>clearInterval(auto),{once:true});
  $('compare-full').onclick=()=>{const full=new Session(session.title), joined=session.utterances.map(u=>u.text).join(' '),sentences=joined.match(/[^。！？.!?]+[。！？.!?]*/g)||[];let at=0;sentences.forEach(text=>full.ingest({text:text.slice(0,3000).trim(),at:at+=1000}));const count=s=>Object.fromEntries(Object.keys(TYPES).map(t=>[t,s.scenes.filter(x=>x.type===t).length]));const report={title:session.title,mode:'基础规则分段对比',streaming:{utterances:session.utterances.length,scenes:session.scenes.length,types:count(session)},fullText:{sentences:sentences.length,scenes:full.scenes.length,types:count(full)},note:'图形数量差异不代表语义准确率；需人工检查。'};$('comparison').innerHTML=`<div class="compare-stats"><div><small>实时画面</small><strong>${report.streaming.scenes}</strong><small>${report.streaming.utterances} 段原话</small></div><div><small>全文基线画面</small><strong>${report.fullText.scenes}</strong><small>${report.fullText.sentences} 个合并句子</small></div></div><button id="download-comparison">下载对比 JSON</button>`;$('download-comparison').onclick=()=>download('Clarity-comparison.json',JSON.stringify(report,null,2));};
};
setInterval(()=>{if(!playing&&!selected&&recording){const epoch=session.epoch;session.tick();if(epoch!==session.epoch){render();persist();}}},1500);
// Exposes domain state for repeatable integration tests, without API credentials.
experience=createExperience({getSession:()=>session,render,persist,panel,toast,accept,returnLive(){selected=null;held=null;experience.clearReview();render();}});
window.liveCanvasStudio={get session(){return session;},accept,reset(){model.cancel();session=new Session();pinned=null;selected=null;held=null;pendingView=null;experience.clearReview();render();},render,showSummary,editableHTML,buildPPTX};
render();
