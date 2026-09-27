// Extractive emphasis only: never invent a summary or drop a qualification.
export const fillerOnly=text=>/^(?:嗯|啊|哦|好的|好|对|是的|然后|接着说|继续|大家好|谢谢|[，。！？,.!?\s])+$/.test(text.trim());
export function keywordFocus(text,terms=[]){
 if(!text?.trim()||fillerOnly(text))return null;
 const clauses=text.split(/[。！!；;，,\n]/).map(s=>s.trim()).filter(s=>s&&!fillerOnly(s));
 const candidates=clauses.map(raw=>{
  let phrase=raw.replace(/^(?:(?:我们|我|大家|你们)(?:最近|今天|现在|一直|都|正在|在|想|要|会|也|真正)*|最近|今天|现在|接下来|换一个话题|另一个主题|其实|嗯|那么|所以|也就是说|真正重要的是|关键是|核心是|请记住|首先)+[：:\s]*/,'').replace(/^(?:讨论|聊聊|讲讲|研究|关注|谈谈|讨论的是|说的是)[：:\s]*/, '').replace(/[。！？!?]+$/,'').trim();
  if(!phrase)return null;
  const qualified=/不|没|未|可能|也许|或许|是否|会不会|怎样|怎么|如何|为什么|[?？]|\b(?:not|never|might|may|could|if)\b/i.test(raw);
  if(qualified)return {primary:raw,score:14};
  if(phrase.length<=18)return {primary:phrase,score:10+(phrase.length>=4?2:0)};
  const supplied=terms.filter(t=>t.length>=2&&phrase.includes(t)).sort((a,b)=>phrase.lastIndexOf(b)-phrase.lastIndexOf(a));
  if(supplied.length)return {primary:supplied[0],score:13};
  const words=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'word'}).segment(phrase)].filter(w=>w.index>=Math.max(0,phrase.length-36)&&w.isWordLike&&w.segment.length>=2&&!/^(我们|你们|他们|这个|那个|事情|问题|东西|大家|可以|因为|所以|很多|一些|一个|已经|现在|真的|非常|一直)$/.test(w.segment)):[];
  words.sort((a,b)=>b.index-a.index||b.segment.length-a.segment.length);
  return {primary:words[0]?.segment||phrase,score:words[0]?5:1};
 }).filter(Boolean);
 // Live speech advances through clauses; an old high-scoring word must not win forever.
 candidates.reverse();
 const primary=candidates[0]?.primary;
 return primary?{primary,secondary:[...new Set(candidates.slice(1).map(c=>c.primary))].filter(t=>t!==primary&&t.length<=14).slice(0,2)}:null;
}
