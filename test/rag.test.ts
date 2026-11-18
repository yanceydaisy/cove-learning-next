import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

test('RAG indexes UTF-8 resources and returns grounded citations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-rag-'));
 try{
  const app=new LearningApplication(dir);
  const control=app.library.ingest({title:'现代控制讲义.md',mime_type:'text/markdown',base64:Buffer.from(
   '# 极点配置\n状态反馈通过选择反馈增益矩阵，使闭环系统的极点配置到期望位置。\n\n# 观测器\n全维状态观测器用于估计无法直接测量的状态变量。'
  ).toString('base64')}) as {id:string};
  const network=app.library.ingest({title:'计算机网络.txt',mime_type:'text/plain',base64:Buffer.from(
   'TCP 使用滑动窗口与拥塞控制。路由器根据转发表选择下一跳。'
  ).toString('base64')}) as {id:string};
  assert.equal((await app.rag.indexResource(control.id) as {status:string}).status,'ready');
  assert.equal((await app.rag.indexResource(network.id) as {status:string}).status,'ready');
  const result=await app.rag.search({query:'状态反馈怎样配置闭环极点',limit:3}) as {results:{resource_id:string;locator:string;score:number}[]};
  assert.equal(result.results[0]?.resource_id,control.id);
  assert.ok(result.results[0]!.score>0);
  const answer=await app.rag.answer({query:'全维观测器有什么用途',resource_ids:[control.id]}) as {answer:string;citations:{resource_id:string;title:string}[]};
  assert.match(answer.answer,/观测器/);
  assert.equal(answer.citations[0]?.resource_id,control.id);
  assert.equal(answer.citations[0]?.title,'现代控制讲义.md');
  const unsupported=app.library.ingest({title:'图像.png',mime_type:'image/png',base64:Buffer.from('not-a-real-image').toString('base64')}) as {id:string};
  assert.equal((await app.rag.indexResource(unsupported.id) as {status:string}).status,'unsupported');
  assert.equal((app.library.list().find((item:any)=>item.id===unsupported.id) as any).index_status,'unsupported');
  app.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('HTTP upload auto-indexes text and exposes search and reindex routes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-rag-http-')),app=new LearningApplication(dir);
 const publicDir=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const server=createHttp(app,publicDir,'rag-secret');
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const addr=server.address();assert.ok(addr&&typeof addr==='object');
 const request=(path:string,method='GET',body?:unknown)=>fetch('http://127.0.0.1:'+addr.port+path,{
  method,headers:{'x-learning-key':'rag-secret',...(method==='GET'?{}:{'content-type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 try{
  const upload=await request('/api/resources','POST',{title:'操作系统.txt',mime_type:'text/plain',base64:Buffer.from('分页存储通过页表完成虚拟地址到物理地址的映射。').toString('base64')});
  assert.equal(upload.status,201);
  const resource=await upload.json() as {id:string;index:{status:string;chunk_count:number}};
  assert.equal(resource.index.status,'ready');assert.equal(resource.index.chunk_count,1);
  const ask=await request('/api/rag/ask','POST',{query:'页表负责什么映射'});
  assert.equal(ask.status,200);
  const answer=await ask.json() as {answer:string;citations:{resource_id:string}[]};
  assert.match(answer.answer,/页表/);assert.equal(answer.citations[0]?.resource_id,resource.id);
  assert.equal((await request('/api/resources/'+resource.id+'/index','POST',{})).status,200);
  assert.equal((await request('/api/rag/status')).status,200);
 }finally{
  await new Promise<void>(done=>server.close(()=>done()));app.close();rmSync(dir,{recursive:true,force:true});
 }
});
