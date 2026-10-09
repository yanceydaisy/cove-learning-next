import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

test('HTTP adapter serves all four workspaces and writes only through owned services',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cove-learning-http-')),app=new LearningApplication(dir);
 const publicDir=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const server=createHttp(app,publicDir,'my-test-key');
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const addr=server.address();
 if(!addr||typeof addr==='string')throw Error('No listener');
 const base='http://127.0.0.1:'+addr.port;
 const request=async(path:string,init:RequestInit={})=>fetch(base+path,{...init,headers:{'x-learning-key':'my-test-key','content-type':'application/json',...init.headers}});
 try{
  const root=await fetch(base+'/');assert.equal(root.status,200);assert.match(await root.text(),/data-nav="library"/);
  const manifest=await fetch(base+'/manifest.webmanifest');assert.equal(manifest.status,200);assert.match(manifest.headers.get('content-type')??'',/manifest/);
  const worker=await fetch(base+'/sw.js');assert.equal(worker.status,200);
  const alias=await fetch(base+'/learning-next/');assert.equal(alias.status,200);
  const noKey=await fetch(base+'/api/today');assert.equal(noKey.status,401);
  const object=await request('/api/objects',{method:'POST',body:JSON.stringify({kind:'project',title:'我们的项目'})});
  assert.equal(object.status,201);const item=await object.json() as {id:string};
  assert.equal((await request('/api/objects')).status,200);
  const task=await request('/api/tasks',{method:'POST',body:JSON.stringify({title:'写需求',object_id:item.id})});
  assert.equal(task.status,201);
  const started=await request('/api/focus/start',{method:'POST',body:'{}'});assert.equal(started.status,201);
  const focus=await started.json() as {id:string};
  assert.equal((await request('/api/focus/start',{method:'POST',body:'{}'})).status,409);
  assert.equal((await request('/api/focus/'+focus.id+'/finish',{method:'POST'})).status,200);
  const today=await (await request('/api/today')).json() as {openTasks:unknown[];recentSessions:unknown[]};
  assert.equal(today.openTasks.length,1);assert.equal(today.recentSessions.length,1);
  assert.equal((await request('/api/resources')).status,200);
 }finally{
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();rmSync(dir,{recursive:true,force:true});
 }
});
