// Same-origin bridge. Credentials live only for this request; never persist/log them.
module.exports=async function jevProxy(request,response,{body,json,fetchImpl=fetch}){
  const host=request.headers.host||'';
  if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)||request.headers.origin&&request.headers.origin!==`http://${host}`)return json(response,403,{error:'仅允许本机同源请求'});
  if(request.method!=='POST')return json(response,405,{error:'仅支持 POST'});
  const auth=request.headers.authorization;
  if(typeof auth!=='string'||!/^Bearer \S{1,512}$/.test(auth))return json(response,401,{error:'请在设置中输入 TypeSafe API 密钥'});
  const input=await body(request);
  if(JSON.stringify(input).length>100000||input.model!=='jev-latest'||!input.state||!input.questions||Object.keys(input.questions).length!==1||input.questions.display?.type!=='choice')return json(response,400,{error:'Jev 请求无效'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5500);
  const abort=()=>controller.abort();response.on('close',abort);
  try{
    const upstream=await fetchImpl('https://api.typesafe.ai/v1/systemone',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:auth},body:JSON.stringify(input)});
    // Never relay provider error bodies, which can echo request data or credentials.
    if(!upstream.ok)return json(response,upstream.status,{error:'Jev 服务暂不可用'});
    const result=await upstream.json();return json(response,200,{model:result.model,answers:result.answers});
  }catch{return json(response,502,{error:'Jev 连接失败或超时'});}
  finally{clearTimeout(timer);response.removeListener('close',abort);}
};
