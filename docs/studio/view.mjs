// Patch in place: unchanged nodes retain identity, focus and reading position.
export function patchMarkup(element,html){
  if(element._markup===html)return false;
  const t=document.createElement('template');t.innerHTML=html;
  function patch(parent,wanted){
    for(let i=0;i<wanted.childNodes.length;i++){
      const next=wanted.childNodes[i],old=parent.childNodes[i];
      if(!old){parent.append(next.cloneNode(true));continue;}
      if(old.nodeType!==next.nodeType||old.nodeName!==next.nodeName){old.replaceWith(next.cloneNode(true));continue;}
      if(next.nodeType===Node.TEXT_NODE){if(old.textContent!==next.textContent)old.textContent=next.textContent;continue;}
      if(next.nodeType!==Node.ELEMENT_NODE)continue;
      for(const a of [...old.attributes])if(!next.hasAttribute(a.name))old.removeAttribute(a.name);
      for(const a of next.attributes)if(old.getAttribute(a.name)!==a.value)old.setAttribute(a.name,a.value);
      patch(old,next);
    }
    while(parent.childNodes.length>wanted.childNodes.length)parent.lastChild.remove();
  }
  patch(element,t.content);element._markup=html;return true;
}
