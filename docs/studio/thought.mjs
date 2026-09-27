// Deliberately narrow discourse rules: no implicit pronoun or causal inference.
export function crossSentenceUpdate(active,u){
 if(!active||active.closed||u.at-active.updatedAt>60000)return null;
 const t=u.clean;
 const prior=active.nodes.at(-1)?.detail||active.nodes.at(-1)?.label||'';
 const node={label:t,detail:t,sourceIds:[u.id]};
 // Join explicit speech relations across ASR sentence boundaries.
 if(active.type==='card'&&/^(?:因为|由于)/.test(prior)&&/^(?:所以|因此|因而)/.test(t))
  return {type:'cause',title:'原因与结果',tone:'neutral',nodes:[...active.nodes,node]};
 if(active.type==='card'&&/^一方面/.test(prior)&&/^另一方面/.test(t))
  return {type:'compare',title:'两个方面',tone:'neutral',nodes:[...active.nodes,node]};
 const ordinal=text=>{const m=text.match(/^第([一二三四五六])(?:点|个(?:原因|方面|要点|因素))?[，,：:、\s]/);return m?'一二三四五六'.indexOf(m[1])+1:0;};
 const before=ordinal(prior),after=ordinal(t);
 if(['card','list'].includes(active.type)&&before&&after===before+1&&active.nodes.length<6)
  return {type:'list',title:'核心要点',tone:'neutral',nodes:[...active.nodes,node]};
 const correction=/^(?:不对[，,]?|更正一下[，,:：]?|准确地说[，,:：]?|我收回刚才的判断[，,:：]?|但(?:是)?(?:后来)?(?:我们)?发现[，,:：]?)/;
 if(correction.test(t)&&t.replace(correction,'').trim().length>2){
  const old=active.nodes.filter(n=>n.role!=='prior').slice(-2);
  return {type:'compare',title:'认识的修正',tone:'neutral',nodes:[...old.map(n=>({...n,role:'prior'})),{label:t,detail:t,sourceIds:[u.id],role:'current'}]};
 }
 if(/^(?:补充一点|还有一点|另外一点)[，,:：]/.test(t)&&['card','list','hierarchy'].includes(active.type)&&active.nodes.length<6){
  return {type:'list',title:'观点与补充',tone:'neutral',nodes:[...active.nodes,{label:t,detail:t,sourceIds:[u.id]}]};
 }
 return null;
}
