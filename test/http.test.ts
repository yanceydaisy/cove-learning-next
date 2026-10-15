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
  const courseRes=await request('/api/objects',{method:'POST',body:JSON.stringify({kind:'course',title:'现代控制'})});
  assert.equal(courseRes.status,201);const course=await courseRes.json() as {id:string};
  const scheduleRes=await request('/api/schedule',{method:'POST',body:JSON.stringify({object_id:course.id,title:'现代控制',weekday:2,start_time:'13:30',end_time:'15:05',effective_from:'2026-09-07'})});
  assert.equal(scheduleRes.status,201);
  const scheduleDay=await (await request('/api/schedule?local_date=2026-10-13')).json() as {title:string;start_time:string}[];
  assert.equal(scheduleDay.length,1);assert.equal(scheduleDay[0]?.title,'现代控制');assert.equal(scheduleDay[0]?.start_time,'13:30');
  const objectiveRes=await request('/api/courses/'+course.id+'/context',{method:'POST',body:JSON.stringify({kind:'objective',title:'掌握状态空间模型分析'})});
  assert.equal(objectiveRes.status,201);const objective=await objectiveRes.json() as {id:string};
  const assessmentRes=await request('/api/courses/'+course.id+'/context',{method:'POST',body:JSON.stringify({kind:'assessment',title:'期末考试',weight_percent:60})});
  assert.equal(assessmentRes.status,201);
  const contextRead=await (await request('/api/courses/'+course.id+'/context')).json() as {items:unknown[];evidence:{confirmedObjectives:number;weightedAssessments:number}};
  assert.equal(contextRead.items.length,2);assert.equal(contextRead.evidence.confirmedObjectives,1);assert.equal(contextRead.evidence.weightedAssessments,1);
  assert.equal((await request('/api/course-context/'+objective.id,{method:'POST',body:JSON.stringify({title:'掌握状态空间分析'})})).status,200);
  assert.equal((await request('/api/objects')).status,200);
  const courseTaskRes=await request('/api/tasks',{method:'POST',body:JSON.stringify({title:'整理状态空间题型',object_id:course.id})});
  assert.equal(courseTaskRes.status,201);const courseTask=await courseTaskRes.json() as {id:string};
  const evidenceRead=await (await request('/api/tasks/'+courseTask.id+'/evidence')).json() as {available:{id:string}[];links:unknown[]};
  assert.equal(evidenceRead.available.length,2);assert.equal(evidenceRead.links.length,0);
  const evidenceSet=await request('/api/tasks/'+courseTask.id+'/evidence',{method:'POST',body:JSON.stringify({context_item_id:objective.id,linked:true})});
  assert.equal(evidenceSet.status,200);
  const importanceSet=await request('/api/tasks/'+courseTask.id+'/importance',{method:'POST',body:JSON.stringify({context_item_id:objective.id,contribution:'high'})});
  assert.equal(importanceSet.status,200);
  const evidenceToday=await (await request('/api/today?local_date=2026-10-12')).json() as {recommendations:{id:string;importance:'low'|'medium'|'high'|null;evidence:{id:string}[];reasons:string[]}[];priorityModel:{importanceAvailable:boolean;importanceScale:string}};
  const evidenceTask=evidenceToday.recommendations.find(t=>t.id===courseTask.id)!;
  assert.equal(evidenceTask.importance,'high');assert.equal(evidenceTask.evidence.length,1);
  assert.ok(evidenceTask.reasons.some(reason=>reason.includes('重要度：高')));
  assert.equal(evidenceToday.priorityModel.importanceAvailable,true);
  assert.equal(evidenceToday.priorityModel.importanceScale,'ordinal-low-medium-high');
  assert.equal((await request('/api/tasks/'+courseTask.id+'/complete',{method:'POST',body:'{}'})).status,200);
  const task=await request('/api/tasks',{method:'POST',body:JSON.stringify({title:'写需求',object_id:item.id})});
  assert.equal(task.status,201);
  const taskData=await task.json() as {id:string};
  const meta=await request('/api/tasks/'+taskData.id+'/details',{method:'POST',body:JSON.stringify({
   due_at:'2026-10-13T10:00:00.000Z',estimated_minutes:40,planned_for:'2026-10-12'
  })});
  assert.equal(meta.status,200);
  assert.equal((await meta.json() as {estimated_minutes:number}).estimated_minutes,40);
  assert.equal((await request('/api/tasks/'+taskData.id+'/preference',{method:'POST',body:JSON.stringify({
   boost:1,expires_at:new Date(Date.now()+3600_000).toISOString()
  })})).status,200);
  const ranked=await (await request('/api/today?local_date=2026-10-12')).json() as {recommendations:{id:string;boost:number}[];todayTasks:unknown[]};
  assert.equal(ranked.recommendations[0]?.boost,1);
  assert.equal(ranked.todayTasks.length,1);
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

test('morning letter is an isolated, CSP-compatible public gift',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cove-morning-letter-')),app=new LearningApplication(dir);
 const publicDir=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const server=createHttp(app,publicDir);
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const addr=server.address();
 if(!addr||typeof addr==='string')throw Error('No listener');
 const base='http://127.0.0.1:'+addr.port;
 try{
  for(const [path,type] of [['/morning-letter.html','text/html'],['/morning-letter.css','text/css'],['/morning-letter.js','text/javascript']] as const){
   const response=await fetch(base+path);
   assert.equal(response.status,200,path);
   assert.match(response.headers.get('content-type')??'',new RegExp(type));
   assert.match(response.headers.get('content-security-policy')??'',/script-src 'self'/);
   assert.ok((await response.text()).length>200,path+' should not be empty');
  }
  const page=await (await fetch(base+'/morning-letter.html')).text();
  assert.match(page,/Before the/);
  assert.match(page,/id="dawn"/);
  assert.doesNotMatch(page,/<script(?![^>]*src=)[^>]*>/i,'no inline script under strict CSP');
 }finally{
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();rmSync(dir,{recursive:true,force:true});
 }
});
