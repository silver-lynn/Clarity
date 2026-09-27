import {escapeHTML as e} from './core.mjs';

// Use every confirmed utterance, never preparation notes or intermediate frames.
export function buildKnowledgeTree(session){
 const groups=new Map();let topic='';
 const classify=text=>/关键结论|总结|综上|请记住|核心观点|结论是|in conclusion|takeaway/i.test(text)?'核心结论':/[？?]|问题是|难点|挑战|困难/.test(text)?'问题与挑战':/例如|比如|实验|测试|数据|验证|案例|调查|for example/i.test(text)?'实例与验证':/方法|步骤|首先|然后|最后|方案|建议|应该|可以通过|做法/.test(text)?'方法与行动':'主要内容';
 for(const u of session.utterances){
  const text=u.text?.trim();if(!text)continue;
  const heading=text.match(/^(?:第[一二三四五六七八九十\d]+(?:部分|个主题)[：:，、\s]*|接下来(?:我们)?(?:讨论|谈谈)|现在(?:我们)?(?:讨论|谈谈)|关于)([^。！？?]{2,40})[。！？?]?$/u);
  if(heading)topic=heading[1].trim();
  const name=topic||classify(text);if(!groups.has(name))groups.set(name,{title:name,items:[],lookup:new Map()});
  const group=groups.get(name),key=text.replace(/\s+/g,'');
  if(group.lookup.has(key)){group.lookup.get(key).sourceIds.push(u.id);continue;}
  const item={label:text.length>88?text.slice(0,87)+'…':text,sourceIds:[u.id]};group.items.push(item);group.lookup.set(key,item);
 }
 return {title:session.title||'我的讲述',mode:'原话整理',utterances:session.utterances.map(u=>({id:u.id,text:u.text,at:u.at})),branches:[...groups.values()].map(({title,items})=>({title,items})),ended:!!session.ended};
}

export const treeCSS=`
.knowledge-dialog{width:min(1500px,96vw)!important;max-width:96vw!important;height:90dvh;max-height:94dvh;padding:22px!important;box-sizing:border-box;overflow:hidden}
.knowledge-dialog #panel-body{height:calc(100% - 52px);min-height:0;overflow:hidden}
.kt{height:100%;display:flex;flex-direction:column;gap:10px;color:#182b49;font:14px Inter,"Segoe UI","Microsoft YaHei",sans-serif}
.kt-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:none}.kt-tools button{background:#edf2ff;color:#2348c6;border:0;border-radius:8px;padding:9px 12px;cursor:pointer}.kt-tools button:focus-visible,.kt button:focus-visible{outline:3px solid #2855f5;outline-offset:2px}.kt-info{font-size:12px;color:#607088;margin:0;line-height:1.6}.kt-viewport{flex:1;min-height:160px;overflow:auto;background:#f8faff;border:1px solid #e0e6f0;border-radius:12px;cursor:grab;touch-action:pan-x pan-y}.kt-space{position:relative;min-width:100%;min-height:100%}.kt-map{display:flex;align-items:center;gap:56px;width:max-content;padding:48px;box-sizing:border-box;transform-origin:0 0}.kt-root{width:210px;flex:none;background:#2855f5;color:white;border-radius:14px;padding:24px;font-size:22px;line-height:1.5;overflow-wrap:anywhere;position:relative}.kt-root:after{content:'';position:absolute;left:100%;top:50%;width:56px;border-top:2px solid #b0c1ee}.kt-branches{display:flex;flex-direction:column;gap:32px;border-left:2px solid #b0c1ee;padding:16px 0}.kt-branch{display:flex;align-items:center;position:relative;padding-left:32px;gap:28px}.kt-branch:before{content:'';position:absolute;left:0;top:50%;width:32px;border-top:2px solid #b0c1ee}.kt-topic{width:180px;flex:none;background:#eaf0ff;color:#2348b0;border:1px solid #d5dff6;border-radius:10px;padding:16px;text-align:left;font-family:inherit;font-size:15px;font-weight:600;overflow-wrap:anywhere;cursor:pointer}.kt-topic small{display:block;font-size:11px;font-weight:400;margin-top:8px}.kt-leaves{display:flex;flex-direction:column;gap:10px;width:330px;border-left:1px solid #d6dfef;padding-left:22px}.kt-leaf{position:relative;text-align:left;background:white;color:#263550;border:1px solid #dde5f0;border-radius:8px;padding:12px 14px;font-family:inherit;font-size:14px;line-height:1.6;cursor:pointer;overflow-wrap:anywhere}.kt-leaf:before{content:'';position:absolute;right:100%;top:50%;width:22px;border-top:1px solid #d6dfef}.kt-leaf small{display:block;font-size:10px;color:#6c7c95;margin-top:4px}.kt-leaf[aria-pressed=true]{border-color:#2855f5;background:#eff3ff}.kt-more{background:transparent;border:0;color:#2855f5;padding:10px;cursor:pointer}.kt-evidence{flex:none;max-height:23%;min-height:44px;overflow:auto;border-top:1px solid #e0e6f0;padding-top:10px;line-height:1.7;font-size:13px;overflow-wrap:anywhere}.kt-evidence p{margin:6px 0}.kt-empty{padding:36px;color:#607088}.kt button:disabled{opacity:.4;cursor:default}@media(max-width:700px){.knowledge-dialog{padding:14px!important;height:94dvh}.kt-tools{gap:5px}.kt-tools button{padding:8px;font-size:12px}.kt-info{font-size:11px}.kt-evidence{max-height:25%}.kt-map{flex-direction:column;align-items:flex-start;padding:20px;gap:28px}.kt-root{width:230px}.kt-root:after{left:20px;top:100%;height:28px;width:0;border-top:0;border-left:2px solid #b0c1ee}.kt-branches{gap:18px;margin-left:20px}.kt-branch{padding-left:18px;gap:16px}.kt-branch:before{width:18px}.kt-topic{width:180px}.kt-leaves{width:260px}}
`;

// Self contained so downloaded knowledge trees work without a server or API key.
export function mountKnowledgeTree(root,data){
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const byId=new Map(data.utterances.map(u=>[u.id,u]));const base=data.utterances[0]?.at||0;
 const time=id=>{const t=Math.max(0,Math.floor(((byId.get(id)?.at||base)-base)/1000));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
 const closed=new Set(data.branches.map((_,i)=>i)),expanded=new Set();let zoom=1,selected=null;
 root.innerHTML='<div class="kt-tools"><button data-act="out" aria-label="缩小知识树">−</button><span class="kt-zoom">100%</span><button data-act="in" aria-label="放大知识树">＋</button><button data-act="reset">原始大小</button><button data-act="collapse">收起分支</button><button data-act="expand">展开分支</button><button data-act="save">下载知识树</button></div><p class="kt-info"></p><div class="kt-viewport" tabindex="0" aria-label="知识树画布，可滚动或拖动画布查看"><div class="kt-space"><div class="kt-map"></div></div></div><div class="kt-evidence" aria-live="polite">点击要点查看时间点与完整原话。</div>';
 root.querySelector('.kt-info').textContent=`${data.ended?'整场回顾':'截至此刻'} · ${data.utterances.length} 段原话 · ${data.branches.length} 个分支 · 原话整理，按明确主题和句式归类；可滚动或拖动查看。`;
 const map=root.querySelector('.kt-map'),space=root.querySelector('.kt-space'),view=root.querySelector('.kt-viewport'),evidence=root.querySelector('.kt-evidence');
 function size(){map.style.transform=`scale(${zoom})`;space.style.width=map.offsetWidth*zoom+'px';space.style.height=map.offsetHeight*zoom+'px';root.querySelector('.kt-zoom').textContent=Math.round(zoom*100)+'%';root.querySelector('[data-act="out"]').disabled=zoom<=.5;root.querySelector('[data-act="in"]').disabled=zoom>=1.6;}
 function draw(){map.innerHTML=data.branches.length?`<div class="kt-root">${escape(data.title)}</div><div class="kt-branches">${data.branches.map((b,i)=>`<div class="kt-branch"><button class="kt-topic" data-branch="${i}" aria-expanded="${!closed.has(i)}">${escape(b.title)}<small>${b.items.length} 个要点 · ${closed.has(i)?'展开':'收起'}</small></button>${closed.has(i)?'':`<div class="kt-leaves">${b.items.slice(0,expanded.has(i)?b.items.length:6).map((n,j)=>`<button class="kt-leaf" data-item="${i}:${j}" aria-pressed="${selected===i+':'+j}">${escape(n.label)}<small>${time(n.sourceIds[0])} · ${n.sourceIds.length} 处原话</small></button>`).join('')}${b.items.length>6?`<button class="kt-more" data-more="${i}">${expanded.has(i)?'只看前 6 项':'展开剩余 '+(b.items.length-6)+' 项'}</button>`:''}</div>`}</div>`).join('')}</div>`:'<div class="kt-empty">还没有确认原话。开始讲述后，再来生成知识树。</div>';size();}
 root.onclick=event=>{const b=event.target.closest('button');if(!b)return;
  if(b.dataset.branch!==undefined){const i=+b.dataset.branch;closed.has(i)?closed.delete(i):closed.add(i);draw();}
  if(b.dataset.more!==undefined){const i=+b.dataset.more;expanded.has(i)?expanded.delete(i):expanded.add(i);draw();}
  if(b.dataset.item){selected=b.dataset.item;const [i,j]=selected.split(':').map(Number),n=data.branches[i].items[j];root.querySelectorAll('[data-item]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));evidence.innerHTML=n.sourceIds.map(id=>{const u=byId.get(id);return `<p><b>${time(id)} · 原话</b><br>${escape(u?.text)}</p>`;}).join('');evidence.scrollTop=0;}
  const action=b.dataset.act;if(action==='in'||action==='out'){zoom=Math.round(Math.min(1.6,Math.max(.5,zoom+(action==='in'?.1:-.1)))*10)/10;size();}if(action==='reset'){zoom=1;size();view.scrollTo(0,0);}if(action==='collapse'){data.branches.forEach((_,i)=>closed.add(i));draw();}if(action==='expand'){closed.clear();draw();}
  if(action==='save'){const json=JSON.stringify(data).replace(/</g,'\\u003c');const css=root.dataset.css;const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clarity · 知识树</title><style>body{margin:0;padding:20px;box-sizing:border-box;height:100dvh;background:#fff}*{box-sizing:border-box}'+css+'</style><div id="tree" class="kt"></div><script>const d='+json+';const r=document.getElementById("tree");r.dataset.css='+JSON.stringify(css)+';('+mountKnowledgeTree.toString()+')(r,d);<\/script></html>';const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Clarity-知识树.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
 };
 let drag=null;view.onpointerdown=event=>{if(event.pointerType==='touch'||event.button!==0||event.target.closest('button'))return;drag={x:event.clientX,y:event.clientY,left:view.scrollLeft,top:view.scrollTop};view.setPointerCapture(event.pointerId);};view.onpointermove=event=>{if(drag){view.scrollLeft=drag.left+drag.x-event.clientX;view.scrollTop=drag.top+drag.y-event.clientY;}};view.onpointerup=view.onpointercancel=()=>{drag=null;};draw();
 const observer=new ResizeObserver(size);observer.observe(map);return ()=>observer.disconnect();
}

export function showKnowledgeTree(session,panel){
 let style=document.getElementById('knowledge-tree-css');if(!style){style=document.createElement('style');style.id='knowledge-tree-css';style.textContent=treeCSS;document.head.append(style);}
 panel('整场知识树',`<div class="kt" id="knowledge-tree" aria-label="${e(session.title)}的知识树"></div>`);
 const dialog=document.getElementById('panel');dialog.classList.add('knowledge-dialog');dialog.addEventListener('close',()=>dialog.classList.remove('knowledge-dialog'),{once:true});
 const root=document.getElementById('knowledge-tree');root.dataset.css=treeCSS;const cleanup=mountKnowledgeTree(root,buildKnowledgeTree(session));dialog.addEventListener('close',cleanup,{once:true});
}
