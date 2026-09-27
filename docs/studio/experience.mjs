import {escapeHTML as e} from './core.mjs';
import {displayKind,expressionHint,timelineEntries,transcriptAt} from './experience-logic.mjs';
import {safePreparation,extractTerms,contextSuggestions} from './context.mjs';
import {patchMarkup} from './view.mjs';
import {keywordFocus} from './keywords.mjs';

export function createExperience({getSession,render,persist,panel,toast,accept,returnLive}){
 const $=id=>document.getElementById(id);
 const css=document.createElement('link');css.rel='stylesheet';css.href='/Clarity/studio/experience.css';document.head.append(css);
 let sessionRef=null,entries=[],entryVersion=-1,review=null,pausedCaptions=false,captionSnapshot=[],hint=null,hintAt=0,recognition=null;
 let preferences={size:36,contrast:false,emoji:true};try{preferences={...preferences,...JSON.parse(localStorage.getItem('livecanvas.reading')||'{}')};}catch{}
 preferences.size=Math.min(56,Math.max(24,Number(preferences.size)||36));
 $('outline-toggle').textContent='时间轴';$('outline-toggle').onclick=()=>{$('lecture-timeline').scrollIntoView({behavior:'smooth',block:'center'});$('timeline-range').focus();};
 $('export-open').insertAdjacentHTML('beforebegin','<button id="prepare-open">讲前准备</button><button id="reading-open" aria-label="字幕阅读设置">Aa</button>');
 $('current').closest('.panes').insertAdjacentHTML('beforebegin',`<section id="caption-stage" aria-label="实时原话"><div class="caption-meta"><span id="caption-state">说说你的想法</span><span id="expression-hint" title="根据文字判断表达功能，不代表真实情绪"></span><button id="captions-pause">暂停滚动</button><button id="captions-all">完整字幕</button></div><div id="caption-lines" aria-live="off"></div><div id="context-suggestion"></div></section>`);
 const stage=document.createElement('section');stage.id='clarity-stage';stage.setAttribute('aria-label','讲述画布');
 const panes=$('current').closest('.panes');panes.before(stage);stage.append(panes,$('caption-stage'));
 stage.insertAdjacentHTML('afterbegin','<div id="stage-idle"><img src="/Clarity/studio/assets/clarity-mark.svg" alt="" width="44" height="44"><p id="stage-idle-text" class="caption-empty">让思想在眼前成形</p><span id="stage-idle-note">逻辑与关系将在这里展开</span></div>');
 const focusDwellMs=450;
 let focus=null,focusAt=0,focusTimer=null,previewText='',previewAt=0,previewTimer=null,focusSource='';
 let fitFrame=null;
 function fitDiagram(){
  if(fitFrame!==null)return;
  fitFrame=requestAnimationFrame(()=>{
   fitFrame=null;const canvas=$('current'),width=panes.clientWidth,height=panes.clientHeight;
   if(!width||!height)return;
   const relationship=!!canvas.querySelector('.relationship-view');
   canvas.classList.toggle('relationship-canvas',relationship);
   if(relationship){canvas.style.width=Math.max(1,width-24)+'px';canvas.style.height=Math.max(1,height-12)+'px';canvas.style.setProperty('--scene-scale','1');return;}
   canvas.style.height='';
   canvas.style.width=Math.min(1100,Math.max(520,width-32))+'px';
   const naturalWidth=Math.max(canvas.offsetWidth,canvas.scrollWidth),naturalHeight=Math.max(canvas.offsetHeight,canvas.scrollHeight);
   const scale=Math.min(1,(width-24)/naturalWidth,(height-16)/Math.max(1,naturalHeight));
   canvas.style.setProperty('--scene-scale',String(Math.max(.01,scale)));
  });
 }
 const fitObserver=new ResizeObserver(fitDiagram);fitObserver.observe(panes);fitObserver.observe($('current'));
 css.addEventListener('load',fitDiagram);document.fonts?.ready.then(fitDiagram);
 document.querySelector('.composer').insertAdjacentHTML('beforebegin',`<section id="lecture-timeline" aria-label="讲述时间轴"><div class="timeline-top"><span id="timeline-label">讲述时间轴 · 等待开始</span><button id="return-live" hidden>回到现场</button></div><input id="timeline-range" type="range" min="0" max="0" value="0" aria-label="回顾讲述时间点" disabled><div id="timeline-markers"></div><div id="timeline-preview" aria-live="polite"></div></section>`);
 $('captions-pause').onclick=()=>{pausedCaptions=!pausedCaptions;if(pausedCaptions)captionSnapshot=structuredClone(visibleUtterances());render();};
 $('return-live').onclick=()=>{review=null;pausedCaptions=false;returnLive();};
 function select(index){if(!entries[index])return;review={...entries[index],count:getSession().utterances.length};pausedCaptions=false;render();}
 $('timeline-range').oninput=event=>select(+event.target.value);
 $('timeline-markers').onclick=event=>{const b=event.target.closest('[data-time-index]');if(b)select(+b.dataset.timeIndex);};
 $('timeline-markers').onpointerover=event=>{const b=event.target.closest('[data-time-index]');if(b){const v=entries[+b.dataset.timeIndex];$('timeline-preview').textContent=format(v.at)+' · '+v.scene.nodes.map(n=>n.detail||n.label).join(' / ');}};
 $('timeline-markers').onfocusin=$('timeline-markers').onpointerover;
 $('timeline-markers').onpointerleave=()=>{$('timeline-preview').textContent=review?'正在回看 · 现场继续记录':'点击时间点回看字幕与结构 · 本版不保存音频';};
 function format(at){const seconds=Math.max(0,Math.floor((at-(getSession().utterances[0]?.at||getSession().startedAt))/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
 function visibleUtterances(){return review?transcriptAt(getSession(),review.at):getSession().utterances;}
 $('captions-all').onclick=()=>{
  const s=getSession();panel('完整字幕',`<p class="hint">确认原话完整保留；系统提炼的结构不替代字幕。${review?'当前正在回看，以下显示截至所选时刻的内容。':''}</p><div class="full-captions">${visibleUtterances().map(u=>`<p><small>${format(u.at)}</small>${e(u.text)}</p>`).join('')||'<p>还没有确认原话。</p>'}</div>`);
 };
 function applyPreferences(){document.documentElement.style.setProperty('--caption-size',preferences.size+'px');document.body.classList.toggle('reading-contrast',!!preferences.contrast);try{localStorage.setItem('livecanvas.reading',JSON.stringify(preferences));}catch{}}
 $('reading-open').onclick=()=>{panel('按你的方式阅读',`<form id="reading-form"><label>字幕字号 <output id="reading-size-output">${preferences.size}px</output><input id="reading-size" type="range" min="24" max="56" step="2" value="${preferences.size}"></label><label class="checkbox"><input id="reading-contrast" type="checkbox" ${preferences.contrast?'checked':''}>高对比阅读</label><label class="checkbox"><input id="reading-emoji" type="checkbox" ${preferences.emoji?'checked':''}>显示表达提示（疑问 / 重点 / 风险）</label><p class="hint">提示来自文字内容，不识别真实情绪。没有明确表达时不显示。</p><button class="primary">完成</button></form>`);$('reading-size').oninput=()=>{$('reading-size-output').textContent=$('reading-size').value+'px';};$('reading-form').onsubmit=event=>{event.preventDefault();preferences={size:+$('reading-size').value,contrast:$('reading-contrast').checked,emoji:$('reading-emoji').checked};applyPreferences();$('panel').close();render();};};
 $('prepare-open').onclick=()=>{
  let p=safePreparation(getSession().preparation);
  panel('讲前准备',`<p class="hint">资料帮助听懂，不会被当成已经讲出的内容。文档只在本机解析；热词在下一次开始录音时生效。</p><form id="preparation-form"><label>本场主题<input id="prep-topic" maxlength="200" value="${e(p.topic)}" placeholder="例如：冰雪的力学强度"></label><label class="upload-label">添加资料（TXT / Markdown）<input id="prep-file" type="file" accept=".txt,.md" multiple></label><p id="prep-file-status" class="hint">${e(p.files.map(f=>f.name).join('、')||'可跳过上传，直接填写主题和术语。')}</p><label>背景摘录<textarea id="prep-notes" maxlength="50000" rows="5" placeholder="也可以粘贴讲稿、摘要或参考资料">${e(p.notes)}</textarea></label><button type="button" id="prep-extract">提取候选术语</button><label>本场词表（可修改，逗号或换行分隔）<textarea id="prep-terms" rows="3" placeholder="雪、冰晶、抗压强度、剪切强度">${e(p.terms.join('、'))}</textarea></label><p class="hint">自动提取是候选，请核对。网页版支持 TXT / Markdown 或粘贴资料。术语提示提高识别概率，不保证绝对正确。</p><button class="primary" id="prep-save">保存准备</button></form>`);
  $('prep-extract').onclick=()=>{const existing=$('prep-terms').value.split(/[、,，;；\n]+/).map(t=>t.trim()).filter(Boolean);$('prep-terms').value=[...new Set([...existing,...extractTerms($('prep-topic').value+'\n'+$('prep-notes').value)])].slice(0,80).join('、');};
  if(recognition)$('prep-terms').insertAdjacentHTML('afterend',`<p class="hint">上次录音热词已加权（整句确认模式下仅影响实时预览）：${e(recognition.accepted.join('、')||'无')}。${recognition.rejected.length?'暂不支持直接加权：'+e(recognition.rejected.join('、'))+'；仍保留在词表中供核对。':''}</p>`);
  $('prep-file').onchange=async event=>{
   const files=[...event.target.files];$('prep-save').disabled=true;$('prep-file-status').textContent='正在本机读取资料…';
   try{if(files.length+p.files.length>10)throw new Error('每场最多 10 份资料');
    for(const file of files){if(file.size>10_000_000)throw new Error('单份资料上限 10 MB');let text;
     if(/\.(txt|md)$/i.test(file.name))text=await file.text();
     else {throw new Error('网页版请使用 TXT / Markdown 或直接粘贴文字');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));const r=await fetch('/api/preparation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,data:btoa(binary)})});const result=await r.json();if(!r.ok)throw new Error(result.error||'读取失败');text=result.text;}
     if(!text.trim())throw new Error(file.name+' 没有可提取文字，请粘贴文本或使用文字版文档');
     if(($('prep-notes').value+'\n'+text).length>50000)throw new Error('背景摘录上限 5 万字，请拆分或精简资料');
     $('prep-notes').value+=($('prep-notes').value?'\n\n':'')+text;p.files.push({name:file.name,chars:text.length});
    }
    $('prep-file-status').textContent=p.files.map(f=>f.name).join('、');$('prep-extract').click();
   }catch(error){$('prep-file-status').textContent=error.message;}finally{$('prep-save').disabled=false;event.target.value='';}
  };
  $('preparation-form').onsubmit=event=>{event.preventDefault();getSession().preparation=safePreparation({...p,topic:$('prep-topic').value,notes:$('prep-notes').value,terms:$('prep-terms').value.split(/[、,，;；\n]+/)});persist();$('panel').close();render();toast('讲前准备已保存，下一次录音将使用本场词表。');};
 };
 $('context-suggestion').onclick=event=>{
  const b=event.target.closest('[data-fix-from]');if(!b)return;const u=getSession().utterances.at(-1);if(!u)return;
  panel('核对同音词',`<p class="evidence-quote">${e(u.text)}</p><form id="context-fix"><label>修改后的完整原话<textarea id="context-fix-text" maxlength="3000">${e(u.text.replaceAll(b.dataset.fixFrom,b.dataset.fixTo))}</textarea></label><label class="checkbox"><input id="context-remember" type="checkbox">本场再次遇到时提示我（不会强制替换）</label><button class="primary">确认修正</button></form>`);
  $('context-fix').onsubmit=async event=>{event.preventDefault();if($('context-remember').checked){getSession().preparation.rules.push({from:b.dataset.fixFrom,to:b.dataset.fixTo});getSession().preparation=safePreparation(getSession().preparation);}await accept({type:'revision',id:u.id,text:$('context-fix-text').value});$('panel').close();persist();};
 };
 applyPreferences();
 function syncSession(){const s=getSession();if(sessionRef!==s){sessionRef=s;review=null;pausedCaptions=false;entryVersion=-1;hint=null;recognition=null;focus=null;focusAt=0;focusSource='';previewText='';previewAt=0;clearTimeout(previewTimer);previewTimer=null;clearTimeout(focusTimer);focusTimer=null;}}
 return {
  syncSession,
  get review(){return review;},clearReview(){review=null;pausedCaptions=false;},setRecognition(value){recognition=value;},sourceText(id){return visibleUtterances().find(u=>u.id===id)?.text||'';},
  render({current,held,selected,recording,captionsOnly=false}){
   if(!captionsOnly)fitDiagram();
   syncSession();const s=getSession();
   if(!captionsOnly&&entryVersion!==s.operations.length){entries=timelineEntries(s);entryVersion=s.operations.length;}
   if(review&&!entries.some(v=>v.key===review.key))review=null;
   const kind=displayKind(current);document.body.classList.toggle('subtitle-mode',kind!=='diagram');document.body.classList.toggle('structure-mode',kind==='diagram');document.body.classList.toggle('conclusion-mode',kind==='conclusion');
   $('prepare-open').textContent=s.preparation?.terms.length?'资料 · '+s.preparation.terms.length+' 词':'讲前准备';
   const us=pausedCaptions?captionSnapshot:visibleUtterances();const latest=us.at(-1),partial=!review&&!pausedCaptions?s.partial:'';
   const previous=partial?latest:us.at(-2);const text=partial||latest?.text||'';
   const hintText=latest?.text||'';const nextHint=expressionHint(hintText);
   if(!nextHint)hint=null;else if(nextHint.label!==hint?.label&&(Date.now()-hintAt>4000||!hint)){hint=nextHint;hintAt=Date.now();}
   $('expression-hint').textContent=preferences.emoji&&hint?hint.icon+' '+hint.label:'';
   $('caption-state').textContent=review?'回看原话 · '+format(review.at):pausedCaptions?'字幕已暂停 · 现场继续记录':partial?'正在识别 · 文字可能修订':text?(kind==='conclusion'?'关键结论 · 原话':'讲述原话'):'说说你的想法';
   patchMarkup($('caption-lines'),text?`<p class="caption-current ${partial?'is-partial':''}">${e(text)}</p>`:'<p class="caption-invitation">开始讲述，字幕会出现在这里</p>');
   const historical=!!review||!!held||!!selected;
   const livePartial=!historical&&kind==='subtitle'&&s.viewMode!=='gossip'?partial:'';
   if(!livePartial){previewText='';clearTimeout(previewTimer);previewTimer=null;}
   else if(livePartial!==previewText){
    if(Date.now()-previewAt>=focusDwellMs){previewText=livePartial;previewAt=Date.now();clearTimeout(previewTimer);previewTimer=null;}
    else if(!previewTimer)previewTimer=setTimeout(()=>{previewTimer=null;previewText=getSession().partial;previewAt=Date.now();render();},focusDwellMs-(Date.now()-previewAt));
   }
   const sceneText=current?.nodes.map(n=>n.detail||n.label).join('。')||'';
   const focusText=historical||kind!=='subtitle'?sceneText:previewText||latest?.text||sceneText;
   const candidate=s.viewMode!=='gossip'&&kind==='subtitle'?keywordFocus(focusText,s.preparation?.terms||[]):null;
   const sourceKey=previewText?'preview':latest?.id+':'+latest?.text;
   const confirmedChange=!historical&&!previewText&&sourceKey!==focusSource;
   if(confirmedChange)previewAt=Date.now();
   if(kind!=='subtitle'||s.viewMode==='gossip'){focus=null;clearTimeout(focusTimer);focusTimer=null;}
   else if(candidate&&(!focus||candidate.primary!==focus.primary)){
    const immediate=historical||confirmedChange||!focus||Date.now()-focusAt>=focusDwellMs||/换一个话题|接下来讨论|另一个主题|现在谈谈|不|没|可能|是否|[?？]/.test(focusText);
    if(immediate){focus=candidate;focusSource=sourceKey;focusAt=Date.now();clearTimeout(focusTimer);focusTimer=null;}
    else if(!focusTimer)focusTimer=setTimeout(()=>{focusTimer=null;render();},focusDwellMs-(Date.now()-focusAt));
   }
   const visibleFocus=historical?candidate:focus;
   document.body.classList.toggle('keyword-mode',kind==='subtitle'&&!!visibleFocus&&s.viewMode!=='gossip');
   $('stage-idle-text').textContent=kind==='conclusion'?(focusText||'值得记住的观点'):visibleFocus?.primary||'让思想在眼前成形';
   $('stage-idle-text').classList.toggle('long-focus',($('stage-idle-text').textContent.length>18));
   $('stage-idle-note').textContent=kind==='conclusion'?'关键结论 · 引自原话':visibleFocus?(visibleFocus.secondary.join(' · ')||(previewText?'实时重点 · 随识别修正':'此刻的重点 · 引自原话')):'重点与结构将在这里展开';
   if(!pausedCaptions)$('caption-lines').scrollTop=$('caption-lines').scrollHeight;
   $('captions-pause').textContent=pausedCaptions?'恢复滚动':'暂停滚动';$('captions-pause').setAttribute('aria-pressed',String(pausedCaptions));
   if(captionsOnly)return;
   const suggestions=!review?contextSuggestions(s.utterances.at(-1)?.text||'',s.preparation):[];
   patchMarkup($('context-suggestion'),suggestions.map(r=>`<button data-fix-from="${e(r.from)}" data-fix-to="${e(r.to)}" title="${e(r.reason)}">核对：${e(r.from)} → ${e(r.to)}？</button>`).join(''));
   $('timeline-range').disabled=!entries.length;$('timeline-range').max=Math.max(0,entries.length-1);$('timeline-range').value=review?Math.max(0,entries.findIndex(v=>v.key===review.key)):Math.max(0,entries.length-1);
   $('timeline-range').setAttribute('aria-valuetext',review?format(review.at)+' '+review.label:'现场最新内容');
   $('timeline-label').textContent=entries.length?`讲述时间轴 · ${format(entries.at(-1).at)} · ${entries.length} 个片段`:'讲述时间轴 · 等待开始';
   const start=Math.max(0,(review?entries.findIndex(v=>v.key===review.key):entries.length-1)-12),shown=entries.slice(start,start+25);
   patchMarkup($('timeline-markers'),shown.map((v,i)=>`<button data-time-index="${start+i}" class="${review?.key===v.key?'active':''}" aria-label="${e(format(v.at)+' '+v.label+' '+v.scene.title)}" title="${e(v.scene.nodes.map(n=>n.detail||n.label).join(' / '))}"><span>${format(v.at)}</span><b>${e(v.label)}</b></button>`).join(''));
   $('return-live').hidden=!review&&!held&&!selected;$('return-live').textContent='回到现场'+(review&&s.utterances.length>review.count?' · '+(s.utterances.length-review.count)+' 段新内容':'');
   $('timeline-preview').textContent=review?'正在回看 · 现场继续记录':'点击时间点回看字幕与结构 · 本版不保存音频';
   $('thought-status').textContent=review?'回看这一刻的思路':kind==='diagram'&&current?.id!==s.current?.id&&!held&&!selected?'最近的结构 · 字幕继续更新':kind==='subtitle'?'让此刻的重点看得见':kind==='conclusion'?'这句话值得记住':'让话里的关系看得见';
  }
 };
}
