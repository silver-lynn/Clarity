// Preparation is recognition context, never an extra source of spoken claims.
export function safePreparation(value={}) {
 value=value&&typeof value==='object'?value:{};
 const str=(x,n)=>typeof x==='string'?x.slice(0,n):'';
 const terms=Array.isArray(value.terms)?value.terms:[];
 return {topic:str(value.topic,200),notes:str(value.notes,50000),terms:[...new Set(terms.filter(t=>typeof t==='string').map(t=>t.trim()).filter(t=>t&&t.length<=40))].slice(0,80),files:(Array.isArray(value.files)?value.files:[]).slice(0,10).map(f=>({name:str(f.name,200),chars:Math.max(0,Math.min(50000,Number(f.chars)||0))})),rules:(Array.isArray(value.rules)?value.rules:[]).slice(0,40).filter(r=>typeof r.from==='string'&&typeof r.to==='string'&&r.from.trim()&&r.to.trim()).map(r=>({from:str(r.from,40),to:str(r.to,40)}))};
}
export function extractTerms(text){
 const found=[];
 const add=t=>{t=t.trim().replace(/^[：:、\s]+|[。；;\s]+$/g,'');if(t.length>=2&&t.length<=20&&!found.includes(t))found.push(t);};
 for(const m of text.matchAll(/[“「《]([^”」》]{2,20})[”」》]/g))add(m[1]);
 for(const line of text.split(/\r?\n/)){
  if(/术语|关键词|专有名词|keywords/i.test(line))line.replace(/^.*?[:：]/,'').split(/[、,，;；\s]+/).forEach(add);
  if(/^(?:#{1,6}\s|\d+[.、]\s*)/.test(line))add(line.replace(/^(?:#{1,6}\s|\d+[.、]\s*)/,''));
 }
 for(const m of text.matchAll(/[\u4e00-\u9fff]{1,7}(?:强度|密度|模量|应力|应变|冰晶|雪层|算法|效应|定律|系数|模型)/g))add(m[0]);
 for(const m of text.matchAll(/\b[A-Z][A-Za-z0-9-]{1,24}\b/g))add(m[0]);
 return found.slice(0,80);
}
export function contextSuggestions(text,preparation){
 const p=safePreparation(preparation),out=[];
 // Suggest, never silently replace single-character homophones.
 if(/[雪冰]/.test(p.topic+' '+p.terms.join(' '))&&text.includes('血')&&!/出血|血液|血管|流血|血压|血糖/.test(text))out.push({from:'血',to:'雪',reason:'本场冰雪主题，建议核对同音词'});
 for(const r of p.rules)if(text.includes(r.from))out.push({...r,reason:'你为本场保存的纠错建议'});
 return out.filter((r,i)=>out.findIndex(x=>x.from===r.from&&x.to===r.to)===i);
}
