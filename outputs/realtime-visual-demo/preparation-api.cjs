const path=require('node:path'),{spawn}=require('node:child_process');
module.exports=async function preparation(request,response,{json}){
 if(request.method!=='POST')return json(response,405,{error:'只支持上传资料'});
 const origin=request.headers.origin;if(origin&&origin!==`http://${request.headers.host}`)return json(response,403,{error:'仅允许本机工作台上传'});
 const chunks=[];let size=0;
 try{
  for await(const chunk of request){size+=chunk.length;if(size>14_000_000)return json(response,413,{error:'单份资料上限 10 MB'});chunks.push(chunk);}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(typeof value.name!=='string'||! /\.(pdf|docx|pptx)$/i.test(value.name)||typeof value.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))return json(response,400,{error:'仅支持 PDF、DOCX、PPTX 文字提取'});
  const python=path.resolve(__dirname,'../../work/whisperlivekit-venv/Scripts/python.exe');
  const text=await new Promise((resolve,reject)=>{
   const child=spawn(python,[path.join(__dirname,'studio/extract-preparation.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
   const timer=setTimeout(()=>{child.kill();reject(new Error('文档读取超时，请精简或粘贴文本'));},25000);
   child.stdout.setEncoding('utf8');child.stdout.on('data',b=>{output+=b;if(output.length>500000){child.kill();reject(new Error('文档文字过多'));}});
   child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('本机文档解析器不可用'));});
   child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('文档无法读取：请检查是否加密、损坏或格式不符'));try{resolve(JSON.parse(output));}catch{reject(new Error('文档读取失败'));}});
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(value));
  });
  json(response,200,text);
 }catch(error){json(response,400,{error:error.message});}
};
