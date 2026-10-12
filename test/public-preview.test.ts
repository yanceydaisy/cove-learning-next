import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

test('public preview has no login, but protects against browser cross-site mutation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cove-learning-public-preview-'));
 const app=new LearningApplication(dir);
 const root=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const server=createHttp(app,root);
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('No listener');
  const base='http://127.0.0.1:'+address.port;
  const html=await (await fetch(base+'/')).text();
  assert.doesNotMatch(html,/accessKey|connectDialog|connectionButton/);
  const health=await fetch(base+'/api/health');
  assert.equal(health.status,200);
  const today=await fetch(base+'/api/today');
  assert.equal(today.status,200);
  const rejected=await fetch(base+'/api/tasks',{
   method:'POST',headers:{'Content-Type':'application/json','Origin':'https://outside.example'},
   body:JSON.stringify({title:'X'})});
  assert.equal(rejected.status,401);
  const noJSON=await fetch(base+'/api/tasks',{
   method:'POST',headers:{'Content-Type':'text/plain'},
   body:JSON.stringify({title:'X'})});
  assert.equal(noJSON.status,400);
  const created=await fetch(base+'/api/tasks',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:base},
   body:JSON.stringify({title:'临时测试任务'})});
  assert.equal(created.status,201);
  const pending=await (await fetch(base+'/api/today')).json() as {openTasks:{title:string}[]};
  assert.equal(pending.openTasks.length,1);
  assert.equal(pending.openTasks[0]?.title,'临时测试任务');
 }finally{
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();rmSync(dir,{recursive:true,force:true});
 }
});
