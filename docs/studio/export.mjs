import {escapeHTML, TYPES} from './core.mjs';
import {sceneHTML} from './render.mjs';

export function download(name, content, type='application/json') {
  const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export const filename = title => (title||'Clarity').replace(/[\\/:*?"<>|]/g,'-').slice(0,60);
const safeJSON = data => JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

// The only executable code is this static, application-owned editor. Speech stays JSON/text.
function offlineEditor(){
  const data=JSON.parse(document.getElementById('session-data').textContent);
  const main=document.getElementById('scenes');
  function render(){main.innerHTML=data.scenes.map(s=>`<section>${sceneHTML(s)}</section>`).join('');document.getElementById('title').textContent=data.title;}
  render();
  document.addEventListener('keydown',event=>{const b=event.target.closest('.people-map [data-relation]');if(b&&['Enter',' '].includes(event.key)){event.preventDefault();b.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  document.addEventListener('click',event=>{const b=event.target.closest('[data-relation],[data-story-event]');if(!b)return;const s=data.scenes.find(s=>s.id===b.dataset.scene),item=b.hasAttribute('data-relation')?s?.edges[+b.dataset.relation]:s?.storyEvents[+b.dataset.storyEvent];if(item)alert(({stated:'原话陈述',uncertain:'猜测 / 传闻',denied:'原话否认'}[item.status])+'\n'+(item.quote||item.text)+'\n\n'+item.sourceIds.map(id=>id+': '+data.utterances.find(u=>u.id===id)?.text).join('\n'));});
  document.addEventListener('dblclick',event=>{
    const button=event.target.closest('[data-node]');
    if(button){
      const scene=data.scenes.find(s=>s.id===button.dataset.scene), node=scene.nodes[+button.dataset.node];
      const label=prompt('编辑节点文字',node.label);if(label===null)return;
      if(!label.trim()||Array.from(label).length>60){alert('请输入 1–60 个字符');return;}
      let value=node.value;
      if(Number.isFinite(value)){const answer=prompt('编辑数值（占比须为 0–100）',String(value));if(answer===null)return;if(!answer.trim()){alert('请输入数值');return;}value=Number(answer);if(!Number.isFinite(value)||scene.type==='proportion'&&(value<0||value>100||scene.nodes.reduce((s,n)=>s+(n===node?value:n.value),0)>100)){alert('数值无效');return;}}
      node.label=label;node.manual=true;scene.edited=true;if(Number.isFinite(value))node.value=value;render();
    }else if(event.target.id==='title'){
      const answer=prompt('编辑演讲标题',data.title);if(answer?.trim())data.title=answer.slice(0,200);render();
    }else if(event.target.closest('.scene-title')){
      const sections=[...main.children], index=sections.indexOf(event.target.closest('section'));const answer=prompt('编辑画面标题',data.scenes[index].title);if(answer?.trim())data.scenes[index].title=answer.slice(0,60);render();
    }
  });
  document.getElementById('save').onclick=()=>{
    document.getElementById('session-data').textContent=JSON.stringify(data).replace(/</g,'\\u003c');
    const blob=new Blob(['<!doctype html>\n'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Clarity-edited.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  document.getElementById('evidence').onclick=()=>{const panel=document.getElementById('sources');panel.hidden=!panel.hidden;};
}

export function editableHTML(session,css=''){
  const data=session.export(), summary=session.summary();
  const list=items=>items.map(p=>`<li>${escapeHTML(p.text)} <small>${escapeHTML(p.sourceIds.join(' · '))}</small></li>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(data.title)}</title><style>${css}\nbody{padding:32px;background:#f3f3ed}main,header,.summary,#sources{max-width:1100px;margin:0 auto 24px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}section,.summary,#sources{background:white;border:1px solid #dedfd8;padding:36px;margin-bottom:24px;border-radius:12px}section{min-height:450px;position:relative}section .scene-body{min-height:280px}.summary li{margin:12px 0}#sources[hidden]{display:none}#sources p{border-bottom:1px solid #eee;padding:12px}small{color:#647267}button{cursor:pointer}.node{cursor:text}</style></head><body><header><div><small>LIVECANVAS / 可编辑演讲记录</small><h1 id="title">${escapeHTML(data.title)}</h1><p>双击标题、节点或数字编辑，再保存一份新的 HTML。人工修改不改变原话。</p></div><div><button id="evidence">查看原话</button> <button id="save">保存编辑后的 HTML</button></div></header><main id="scenes"></main><div class="summary"><small>${escapeHTML(summary.mode)}</small><h2>演讲总结</h2><ul>${list(summary.points)}</ul><h3>主要结构</h3><p>${escapeHTML(summary.structures.join(' → '))}</p><h3>关键数字</h3><ul>${list(summary.numbers)}</ul><h3>值得记住</h3><ul>${list(summary.memorable)}</ul><h3>原话中的问题（未判断是否已解决）</h3><ul>${list(summary.questions)}</ul></div><div id="sources" hidden><h2>完整原话依据</h2>${data.utterances.map(u=>`<p><small>${escapeHTML(u.id)}</small> ${escapeHTML(u.text)}</p>`).join('')}</div><script type="application/json" id="session-data">${safeJSON(data)}</script><script>const e=${escapeHTML.toString()};const TYPES=${safeJSON(TYPES)};const sceneHTML=${sceneHTML.toString()};(${offlineEditor.toString()})();</script></body></html>`;
}

export function buildPPTX(session,PptxGenJS){
  const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='Clarity';pptx.title=session.title;pptx.subject='可编辑实时演讲记录';pptx.lang='zh-CN';pptx.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei',lang:'zh-CN'};
  const ink='111111',accent='4263E8',paper='F4F5F8',muted='555555';
  const text=(slide,value,opts)=>slide.addText(String(value),{fontFace:'Microsoft YaHei',fontSize:18,color:ink,margin:0,breakLine:false,fit:'shrink',...opts});
  const base=(title,kicker)=>{const s=pptx.addSlide();s.background={color:paper};text(s,kicker,{x:.6,y:.35,w:12,h:.25,fontSize:10,color:accent});text(s,title,{x:.6,y:.9,w:12,h:.65,fontSize:28});text(s,'Clarity · 原生文本 / 形状 / 图表均可编辑',{x:.6,y:7.08,w:10,h:.2,fontSize:9,color:muted});return s;};
  function node(slide,n,x,y,w,h,index){slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:.12,line:{color:'D5DDD5',width:1},fill:{color:'FFFFFF'},radius:.12});text(slide,`${String(index+1).padStart(2,'0')}`,{x:x+.18,y:y+.12,w:w-.36,h:.25,fontSize:10,color:accent});text(slide,n.label,{x:x+.18,y:y+.5,w:w-.36,h:h-.95,fontSize:18});text(slide,n.sourceIds.join(' · ')+(n.manual?' · 手动编辑':''),{x:x+.18,y:y+h-.3,w:w-.36,h:.16,fontSize:8,color:muted});}
  const arrow=(slide,x,y,w=.36)=>slide.addShape(pptx.ShapeType.line,{x,y,w,h:0,line:{color:accent,width:2,beginArrowType:'none',endArrowType:'triangle'}});
  for(const [index,scene] of session.scenes.entries()){
    const s=base(scene.title,`${String(index+1).padStart(2,'0')} / ${scene.presentation==='subtitle'?'大字幕':scene.presentation==='conclusion'?'关键结论':TYPES[scene.type]}`),ns=scene.nodes;
    if(scene.type==='relationship'){
      const points=ns.map((n,i)=>{const a=-Math.PI/2+i*2*Math.PI/ns.length;return {x:6.5+4.3*Math.cos(a),y:4.15+1.65*Math.sin(a)};});
      scene.edges.forEach((edge,i)=>{const a=points[ns.findIndex(n=>n.person===edge.from)],b=points[ns.findIndex(n=>n.person===edge.to)];s.addShape(pptx.ShapeType.line,{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(.001,Math.abs(b.x-a.x)),h:Math.abs(b.y-a.y),flipV:(b.x-a.x)*(b.y-a.y)<0,line:{color:edge.status==='stated'?'444444':'888888',width:1.5,...(edge.status!=='stated'?{dash:'dash'}:{})}});text(s,String(i+1),{x:(a.x+b.x)/2-.15,y:(a.y+b.y)/2-.15,w:.3,h:.3,fontSize:12,align:'center',fill:{color:'FFFFFF'}});});
      ns.forEach((n,i)=>{s.addShape(pptx.ShapeType.rect,{x:points[i].x-.85,y:points[i].y-.3,w:1.7,h:.6,line:{color:ink,width:1.5},fill:{color:'FFFFFF'}});text(s,n.label,{x:points[i].x-.8,y:points[i].y-.2,w:1.6,h:.4,fontSize:19,align:'center'});});
      text(s,'连线编号对应后续关系页；仅依据讲述内容，非剧情事实核验。',{x:.8,y:6.55,w:11.7,h:.3,fontSize:12,color:muted});
      const entries=[...scene.edges.map((r,i)=>({text:`${i+1}. ${ns.find(n=>n.person===r.from)?.label} ${r.directed?'→':'↔'} ${ns.find(n=>n.person===r.to)?.label} · ${r.label}`,detail:r.quote,status:r.status,sourceIds:r.sourceIds})),...scene.storyEvents.map(r=>({text:'事件 · '+r.text,detail:'',status:r.status,sourceIds:r.sourceIds}))];
      for(let offset=0;offset<entries.length;offset+=6){const detail=base('人物关系与大事件 · 原话依据',`${index+1} / 关系明细`);entries.slice(offset,offset+6).forEach((r,j)=>{text(detail,r.text,{x:.8,y:1.8+j*.78,w:11.7,h:.3,fontSize:17});text(detail,`${{stated:'原话陈述',uncertain:'猜测 / 传闻',denied:'原话否认'}[r.status]} · ${r.sourceIds.join(' / ')}  ${r.detail}`,{x:.8,y:2.13+j*.78,w:11.7,h:.35,fontSize:11,color:muted});});detail.addNotes(entries.slice(offset,offset+6).flatMap(r=>r.sourceIds).map(id=>`${id}: ${session.utterances.find(u=>u.id===id)?.text||''}`));}
    }else if(scene.type==='proportion'){
      const sum=ns.reduce((a,n)=>a+n.value,0),labels=ns.map(n=>n.label),values=ns.map(n=>n.value);if(sum<100){labels.push('其他 / 未说明部分');values.push(+(100-sum).toFixed(6));}
      s.addChart(pptx.ChartType.doughnut,[{name:'占比',labels,values}],{x:.8,y:1.9,w:6,h:4.6,showLegend:true,showPercent:true,holeSize:68,chartColors:[accent,'BC8B51','5C86A2','957BA9','BD7770','97A864','E7E9E3'],showTitle:false,legendFontSize:11});
      ns.forEach((n,i)=>text(s,`${n.label}\n${n.value}%  ·  ${n.sourceIds.join(' / ')}`,{x:7.2,y:2.2+i*.7,w:5.3,h:.65,fontSize:17}));
    }else if(scene.type==='bars'){
      s.addChart(pptx.ChartType.bar,[{name:ns[0].unit||'原话数值',labels:ns.map(n=>n.label),values:ns.map(n=>n.value)}],{x:.9,y:1.8,w:11.5,h:4.8,barDir:'col',showValue:true,showLegend:false,catAxisLabelFontSize:12,valAxisLabelFontSize:11,chartColors:[accent],showCatName:false});
    }else if(scene.type==='change'){
      ns.forEach((n,i)=>{text(s,`${n.value>=0?'+':''}${n.value}%`,{x:.9+i*6,y:2.1,w:5.5,h:1.5,fontSize:68,color:accent});text(s,n.label,{x:.9+i*6,y:3.9,w:5.5,h:.8,fontSize:22});});
      text(s,'仅表示变化幅度；未推算基期或总量。',{x:.9,y:5.7,w:10,h:.4,fontSize:14,color:muted});
    }else if(scene.type==='card'){
      text(s,'“',{x:.8,y:1.8,w:1,h:.9,fontSize:70,color:accent});text(s,ns.map(n=>n.label).join('\n'),{x:1.5,y:2.6,w:10.2,h:2.5,fontSize:32});
    }else if(scene.type==='hierarchy'){
      text(s,scene.title,{x:4.2,y:1.85,w:4.8,h:.5,align:'center',color:accent,fontSize:22});s.addShape(pptx.ShapeType.line,{x:6.6,y:2.5,w:0,h:.55,line:{color:accent,width:2}});
      const w=11.9/ns.length;ns.forEach((n,i)=>{node(s,n,.7+i*w,3.35,w-.18,2.2,i);s.addShape(pptx.ShapeType.line,{x:.7+i*w+(w-.18)/2,y:3.05,w:0,h:.3,line:{color:accent,width:1}});});if(ns.length>1)s.addShape(pptx.ShapeType.line,{x:.7+(w-.18)/2,y:3.05,w:w*(ns.length-1),h:0,line:{color:accent,width:1}});
    }else if(['flow','cause'].includes(scene.type)){
      const w=11.9/ns.length;ns.forEach((n,i)=>{node(s,n,.7+i*w,2.35,w-.35,3,i);if(i)arrow(s,.7+i*w-.32,3.85,.29);});
    }else{
      const cols=ns.length<=3?ns.length:3,w=11.6/cols;ns.forEach((n,i)=>{const col=i%cols,row=Math.floor(i/cols);node(s,n,.7+col*w,2.05+row*2.3,w-.4,1.95,i);if(col>0&&['flow','cause'].includes(scene.type))arrow(s,.7+col*w-.38,3.05+row*2.3,.33);});
      if(scene.type==='timeline')s.addShape(pptx.ShapeType.line,{x:.7,y:1.9,w:11.5,h:0,line:{color:accent,width:2,endArrowType:'triangle'}});
    }
    const ids=[...new Set(ns.flatMap(n=>n.sourceIds))];s.addNotes(ids.map(id=>`${id}: ${session.utterances.find(u=>u.id===id)?.text||''}`));
    text(s,ids.join(' · ')+(scene.edited?' · 含手动修改':''),{x:8.5,y:7.08,w:4.2,h:.2,fontSize:8,color:muted,align:'right'});
  }
  const summary=session.summary();
  const addList=(title,items)=>{const chunks=[];for(let i=0;i<items.length;i+=7)chunks.push(items.slice(i,i+7));if(!chunks.length)chunks.push([]);chunks.forEach((chunk,i)=>{const s=base(title+(chunks.length>1?` · ${i+1}`:''),summary.mode);if(!chunk.length)text(s,'原话中未提取到此类内容。',{x:.8,y:2,w:11.7,h:.5,fontSize:20});chunk.forEach((p,j)=>text(s,`${j+1}. ${p.text}  [${p.sourceIds.join(', ')}]`,{x:.8,y:1.9+j*.64,w:11.7,h:.52,fontSize:19}));s.addNotes(chunk.flatMap(p=>p.sourceIds).map(id=>`${id}: ${session.utterances.find(u=>u.id===id)?.text||''}`));});};
  addList('演讲总结',summary.points);addList('关键数字',summary.numbers);return pptx;
}
