// Names/aliases are a vocabulary, not a plot database. Every edge needs supplied speech.
export const CAST={甄嬛:['莞常在','莞贵人','莞嫔','熹贵妃','嬛嬛'],皇帝:['皇上','雍正','四郎'],皇后:['宜修','乌拉那拉宜修'],华妃:['年世兰'],果郡王:['允礼','十七爷'],沈眉庄:['眉庄','惠贵人','惠嫔'],安陵容:[],温实初:[],苏培盛:[],槿汐:[],浣碧:[],祺贵人:[],叶澜依:[],端妃:[],敬妃:[],纯元皇后:[]};
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function mentions(text,extra=[]){
 const aliases=new Map();for(const [name,other] of Object.entries(CAST))for(const a of [name,...other])aliases.set(a,name);
 for(const name of extra)if(!aliases.has(name))aliases.set(name,name);
 const pattern=[...aliases.keys()].sort((a,b)=>b.length-a.length).map(esc).join('|');
 return [...text.matchAll(new RegExp(pattern,'g'))].map(m=>({name:aliases.get(m[0]),alias:m[0],start:m.index,end:m.index+m[0].length}));
}
const rules=[['陷害|诬陷|谋害|毒害|加害|害死|针对','冲突'],['背叛|出卖','背叛'],['保护|护着|帮助|帮着|帮了|帮(?!忙|凶|派|倒忙|手)|救下|救了|支持|撑腰|站在?(?=[^。！？]{0,20}(?:这边|那边|一边))','帮助'],['爱上|喜欢|爱慕|深爱|情人','情感'],['讨厌|嫉妒|憎恨|敌视','冲突'],['结盟|联手|盟友|一伙的|一伙','结盟'],['好友|朋友|姐妹|兄弟|夫妻|母亲|父亲|女儿|儿子|姐姐|妹妹|哥哥|弟弟','亲友'],['怀疑|指控|举报|揭发|咬定|告状','指控'],['册封|晋封|赐死|禁足|打入冷宫','权力']];
const uncertain=/听说|据说|传闻|传言|可能|也许|似乎|猜测|怀疑|指控|咬定|告状|是否|会不会|如果|假如|打算|计划|准备|试图|想要|[?？]/;
const denied=/没有|并未|并非|不是|不曾|未曾|并不|不再|不会|不喜欢|不爱|没(?:有)?|不(?=帮助|支持|保护|讨厌|嫉妒|陷害|背叛)|未(?=帮助|支持|保护|陷害|背叛)/;
const negativeRelation=new RegExp('(?:不|未)(?:再|会|肯|愿意)?(?:'+rules.map(([pattern])=>pattern).join('|')+')');
// Only rejoin a dangling name/verb across commas. Never join independent claims.
function spokenClauses(sentence,extra){
 const chunks=sentence.split(/[，,；;]/).map(s=>s.trim()).filter(Boolean),out=[];
 for(let i=0;i<chunks.length;i++){
  let raw=chunks[i];
  for(let j=i+1;j<Math.min(chunks.length,i+3);j++){
   const people=mentions(raw,extra);if(people.length!==1)break;
   const tail=raw.slice(people[0].end).replace(/[，,\s]/g,'');
   const filler='(?:呢|啊|呀|嘛|吧|就|是|在|也|还|一直|当时|这时候|其实|正|要|想|不|没|没有|并非|并不|可能|听说|据说)*';
   const dangling=new RegExp('^'+filler+'(?:'+rules.map(([p])=>p).join('|')+')?$');
   if(!dangling.test(tail)||mentions(chunks[j],extra).length>1)break;
   const begin=sentence.indexOf(raw),end=sentence.indexOf(chunks[j],begin+raw.length)+chunks[j].length;
   raw=sentence.slice(begin,end);i=j;
   if(mentions(raw,extra).length===2)break;
  }
  out.push(raw);
 }
 return out;
}
export function relationshipScene(text,sourceId,extra=[]){
 const found=mentions(text,extra),names=[...new Set(found.map(m=>m.name))];if(!names.length)return null;
 const selected=names.slice(0,6),nodes=selected.map(person=>({person,label:person,detail:found.filter(m=>m.name===person).map(m=>m.alias).filter((x,i,a)=>a.indexOf(x)===i).join(' / '),sourceIds:[sourceId]}));
 const edges=[],storyEvents=[];let unresolved=0;
 for(const sentence of text.match(/[^。！？!?\n]+[。！？!?]?/g)||[]){
  const sentenceUncertain=uncertain.test(sentence),sentenceDenied=denied.test(sentence);
  for(const raw of spokenClauses(sentence,extra)){
   const people=mentions(raw,extra),ids=[...new Set(people.map(m=>m.name))];
   const complexNegation=/不是没有|并非没有|不能不|不可能不/.test(raw);
   const status=sentenceUncertain||complexNegation?'uncertain':denied.test(raw)||negativeRelation.test(raw)?'denied':'stated';
   const rule=rules.find(([pattern])=>new RegExp(pattern).test(raw));
   if(rule&&ids.length===2&&people.length===2&&ids.every(n=>selected.includes(n))){
    const a=people[0],b=people[1],between=raw.slice(a.end,b.start),after=raw.slice(b.end);
    const term=raw.match(new RegExp(rule[0]))[0];
    // A 被 B 陷害 reverses the direction; coordinated kinship/alliances are undirected.
    const passive=/被|遭/.test(between),symmetric=/好友|朋友|姐妹|兄弟|夫妻|结盟|联手|盟友|一伙/.test(raw);
    const termAt=raw.search(new RegExp(rule[0]));
    const positioned=(termAt>=a.end&&termAt<b.start)||(termAt>=b.end&&(passive||symmetric||/把|将|跟|和|与|是|为|给/.test(between)||/^的?(?:情人|好友|朋友|姐妹|兄弟|夫妻|母亲|父亲|女儿|儿子|姐姐|妹妹|哥哥|弟弟)/.test(after)));
    if(positioned)edges.push({from:passive?b.name:a.name,to:passive?a.name:b.name,label:term,kind:rule[1],status,directed:!symmetric,quote:raw,sourceIds:[sourceId]});
    else unresolved++;
   }else if(rule)unresolved++;
   if(/入宫|册封|晋封|被废|禁足|流产|遇害|去世|赐死|出宫|回宫|打入冷宫|滴血验亲|滴血认亲|作证|白矾|复验|揭发|背叛|失宠|获宠/.test(raw))storyEvents.push({text:raw.slice(0,500),status:sentenceUncertain?'uncertain':sentenceDenied?'denied':'stated',sourceIds:[sourceId]});
  }
 }
 return {type:'relationship',title:'人物关系与大事件',tone:'neutral',nodes,edges:edges.slice(0,12),storyEvents:storyEvents.slice(0,6),incomplete:names.length>6||edges.length>12||storyEvents.length>6||unresolved>0};
}
export function continueRelationship(previous,current,extra=[]){
 if(!previous||current.at-previous.at>15000||current.at<previous.at)return null;
 const left=previous.text.trim(),right=current.text.trim(),a=mentions(left,extra),b=mentions(right,extra);
 if(a.length!==1||b.length!==1||a[0].name===b[0].name)return null;
 const filler='(?:[，,。.!！?？\\s]|呢|啊|呀|嘛|吧|就|是|在|也|还|一直|当时|这时候|其实|正|要|想|不|没|没有|并非|并不|可能|听说|据说)*';
 const fragment=new RegExp('^'+filler+'(?:'+rules.map(([p])=>p).join('|')+')?'+filler+'$');
 if(!new RegExp('^'+filler+'$').test(left.slice(0,a[0].start))||!fragment.test(left.slice(a[0].end))||!fragment.test(right.slice(0,b[0].start)))return null;
 const joined=left+' '+right;
 const scene=relationshipScene(left.replace(/[。.!！?？]+$/,'，')+' '+right,current.id,extra);
 if(!scene?.edges.length)return null;
 // Retain both literal ASR fragments as evidence, including their punctuation.
 for(const node of scene.nodes)node.sourceIds=[previous.id,current.id];
 for(const edge of scene.edges){edge.quote=joined;edge.sourceIds=[previous.id,current.id];if(/[?？]/.test(joined))edge.status='uncertain';}
 scene.storyEvents=[];
 return scene;
}
export function mergeRelationships(a,b){
 if(a.type!=='relationship'||b.type!=='relationship')return null;
 const nodes=structuredClone(a.nodes);
 for(const n of b.nodes){const old=nodes.find(x=>x.person===n.person);if(old)old.sourceIds=[...new Set([...old.sourceIds,...n.sourceIds])];else nodes.push(n);}
 // Preserve contradictory reports as separate, attributed edges instead of rewriting history.
 const edges=[...a.edges,...b.edges],storyEvents=[...a.storyEvents,...b.storyEvents];
 if(nodes.length>6||nodes.some(n=>n.sourceIds.length>10)||edges.length>12||storyEvents.length>6)return null;
 return {...b,nodes,edges,storyEvents,incomplete:!!a.incomplete||!!b.incomplete};
}
