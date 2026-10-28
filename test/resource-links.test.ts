import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

test('FK-backed task and record resource links are idempotent, persistent, and preserve originals',()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-resource-links-'));
 try{
  const app=new LearningApplication(dir);
  const course=app.catalog.create({kind:'course',title:'计算机网络'}) as {id:string};
  const task=app.planning.create({object_id:course.id,title:'复习网络协议'}) as {id:string};
  const record=app.records.create({
   local_date:'2026-10-28',started_at:'2026-10-28T08:00:00+08:00',ended_at:'2026-10-28T08:25:00+08:00',
   focused_minutes:20,title:'TCP 复盘',object_id:course.id,task_id:task.id
  }) as {id:string};
  const blob=Buffer.from('append-only original content');
  const resource=app.library.ingest({title:'TCP 讲义',mime_type:'text/plain',base64:blob.toString('base64')}) as {id:string};
  assert.equal(app.resourceLinks.list('task',task.id).count,0);
  const first=app.resourceLinks.set('task',task.id,resource.id,true);
  assert.equal(first.count,1);
  const stamped=(first.items[0] as {linked_at:string}).linked_at;
  assert.equal(app.resourceLinks.set('task',task.id,resource.id,true).count,1);
  assert.equal((app.resourceLinks.list('task',task.id).items[0] as {linked_at:string}).linked_at,stamped);
  assert.equal(app.resourceLinks.set('record',record.id,resource.id,true).count,1);
  assert.equal(app.resourceLinks.list('task',task.id).count,1);
  assert.equal(app.resourceLinks.list('record',record.id).count,1);
  assert.equal(app.library.content(resource.id).bytes.compare(blob),0);
  assert.throws(()=>app.resourceLinks.set('task',record.id,resource.id,true),/任务不存在/);
  assert.throws(()=>app.resourceLinks.set('record',task.id,resource.id,true),/学习记录不存在/);
  assert.throws(()=>app.resourceLinks.set('record',record.id,'6ee24c44-b997-411b-b1cd-f1ecea28c518',true),/关联资料不存在/);
  assert.equal(app.resourceLinks.set('task',task.id,resource.id,false).count,0);
  assert.equal(app.resourceLinks.set('task',task.id,resource.id,false).count,0);
  assert.equal(app.resourceLinks.list('record',record.id).count,1,'unlinking from task does not change record links');
  app.close();

  const reopened=new LearningApplication(dir);
  assert.equal(reopened.resourceLinks.list('task',task.id).count,0);
  assert.equal(reopened.resourceLinks.list('record',record.id).count,1);
  reopened.database.raw.prepare('DELETE FROM learning_records WHERE id=?').run(record.id);
  assert.equal(reopened.database.raw.prepare('SELECT COUNT(*) AS n FROM learning_record_resource_links').get()!['n'],0,'FK cascade removes orphan links');
  assert.equal(reopened.library.list().length,1,'original resource is immutable and remains');
  reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('HTTP resource association routes work for tasks and records without touching existing records',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-resource-link-http-'));
 const app=new LearningApplication(dir);
 const publicDir=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const server=createHttp(app,publicDir,'test-secret');
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const addr=server.address();
 assert.ok(addr&&typeof addr==='object');
 const base='http://127.0.0.1:'+addr.port;
 const request=(path:string,method='GET',body?:unknown)=>fetch(base+path,{
  method,headers:{'x-learning-key':'test-secret','content-type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 try{
  const task=app.planning.create({title:'摘录教材'}) as {id:string};
  const record=app.records.create({
   local_date:'2026-10-28',started_at:'2026-10-28T08:00:00+08:00',ended_at:'2026-10-28T08:20:00+08:00',
   title:'阅读教材'
  }) as {id:string};
  const resource=app.library.ingest({title:'材料',mime_type:'text/plain',base64:'YWJj'}) as {id:string};
  for(const [kind,id] of [['tasks',task.id],['learning-records',record.id]]){
   const path='/api/'+kind+'/'+id+'/resources';
   assert.equal((await request(path)).status,200);
   const res=await request(path,'POST',{resource_id:resource.id,linked:true});
   assert.equal(res.status,200);
   assert.equal((await res.json() as {count:number}).count,1);
   assert.equal((await request(path,'POST',{resource_id:resource.id,linked:true})).status,200);
   assert.equal((await (await request(path)).json() as {count:number}).count,1);
   assert.equal((await request(path,'POST',{resource_id:'5df8f2a3-b2c9-4a55-a237-2d3c61189f32',linked:true})).status,404);
  }
  assert.equal((await request('/api/tasks/'+record.id+'/resources')).status,404);
  assert.equal((await request('/api/learning-records/'+task.id+'/resources')).status,404);
 }finally{
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();rmSync(dir,{recursive:true,force:true});
 }
});
