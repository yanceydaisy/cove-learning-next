import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';
import {AppError} from '../src/core/errors.js';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ephemeris-model-'));let now=new Date('2026-10-19T01:00:00Z');
 const app=new LearningApplication(dir,false,()=>now);
 return {app,dir,advance:(minutes:number)=>now=new Date(now.getTime()+minutes*60000),end:()=>{app.close();rmSync(dir,{recursive:true,force:true})}};
}
const window={from:'2026-09-30T16:00:00Z',to:'2026-10-31T16:00:00Z'};
test('trace preserves pause gaps, elapsed/focused time, record identity and actual task completion',()=>{
 const f=fixture();
 try{
  const object=f.app.catalog.create({kind:'course',title:'现代控制'}) as any;
  const task=f.app.planning.create({title:'作业',object_id:object.id}) as any;
  const started=f.app.activity.start({object_id:object.id}) as any;
  f.advance(20);f.app.activity.pause(started.id);f.advance(10);f.app.activity.resume(started.id);f.advance(30);
  const session=f.app.activity.finish(started.id) as any;
  const raw=f.app.trace.list(window).events.find(e=>e.kind==='focus');
  assert.equal(raw.focused_ms,50*60000);assert.equal(raw.elapsed_ms,60*60000);
  assert.deepEqual(raw.intervals,[{started_at:'2026-10-19T01:00:00.000Z',ended_at:'2026-10-19T01:20:00.000Z'},{started_at:'2026-10-19T01:30:00.000Z',ended_at:'2026-10-19T02:00:00.000Z'}]);
  const input={local_date:'2026-10-19',started_at:session.started_at,ended_at:session.ended_at,title:'复习',summary:'能控性',focus_session_id:session.id,task_id:task.id,time_zone:'Asia/Shanghai',idempotency_key:'record-test:1',next_action:'整理错题',note:'课堂笔记',tags:['控制']};
  const record=f.app.records.create(input) as any;
  assert.equal(record.focused_minutes,50,'linked session supplies actual focused minutes by default');
  assert.equal(record.object_id,object.id);
  assert.equal((f.app.records.create(input) as any).id,record.id,'retry reuses exactly the same record');
  assert.throws(()=>f.app.records.create({...input,title:'different'}),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.records.create({...input,idempotency_key:'other'}),e=>e instanceof AppError&&e.code==='CONFLICT');
  const completed=f.app.planning.complete(task.id) as any;
  f.advance(60);f.app.database.raw.prepare('UPDATE tasks SET updated_at=? WHERE id=?').run('2026-10-19T03:00:00.000Z',task.id);
  const trace=f.app.trace.list(window);
  assert.equal(trace.events.filter(e=>e.kind==='focus').length,0,'a linked focus session does not appear twice');
  const learning=trace.events.find(e=>e.kind==='record');
  assert.equal(learning.object.title,'现代控制');assert.equal(learning.task.title,'作业');
  assert.equal(learning.summary,'能控性');assert.deepEqual(learning.tags,['控制']);assert.equal(learning.next_action,'整理错题');
  assert.equal(trace.events.find(e=>e.kind==='task').occurred_at,completed.completed_at,'editing task details never moves its completion point');
  f.app.records.update(record.id,{summary:'状态空间模型',tags:['复习']});
  assert.equal(f.app.records.get(record.id).summary,'状态空间模型');
  assert.equal(f.app.records.get(record.id).started_at,session.started_at);
  f.app.planning.reopen(task.id);
  assert.equal(f.app.trace.list(window).events.filter(e=>e.kind==='task').length,0);
 }finally{f.end()}
});
test('trace includes cross-month intervals and all monthly records, while marking legacy time honestly',()=>{
 const f=fixture();
 try{
  for(let i=0;i<105;i++)f.app.records.create({local_date:'2026-10-19',started_at:'2026-10-19T09:00:00+08:00',ended_at:'2026-10-19T10:00:00+08:00',title:'记录 '+i,time_zone:'Asia/Shanghai'});
  f.app.records.create({local_date:'2026-09-30',started_at:'2026-09-30T23:30:00+08:00',ended_at:'2026-10-01T00:30:00+08:00',title:'跨月'});
  const task=f.app.planning.create({title:'旧任务'}) as any;
  f.app.database.raw.prepare("UPDATE tasks SET status='done',completed_at=NULL WHERE id=?").run(task.id);
  const result=f.app.trace.list(window);
  assert.equal(result.events.filter(e=>e.kind==='record').length,106,'no silent 100-record cutoff');
  const legacy=result.events.find(e=>e.id==='task:'+task.id);
  assert.equal(legacy.time_source,'legacy_updated_at');assert.equal(legacy.intervals.length,0);
  assert.throws(()=>f.app.trace.list({from:window.from}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
  assert.throws(()=>f.app.trace.list({from:window.from,to:'2027-01-01T00:00:00Z'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
  assert.throws(()=>f.app.records.create({local_date:'2026-10-18',started_at:'2026-10-19T09:00:00+08:00',ended_at:'2026-10-19T10:00:00+08:00',title:'bad local date',time_zone:'Asia/Shanghai'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
  assert.throws(()=>f.app.records.create({local_date:'2026-10-19',started_at:'2026-10-19T09:00:00',ended_at:'2026-10-19T10:00:00',title:'ambiguous time'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
 }finally{f.end()}
});
test('recovery never turns an unobserved interruption into a focus arc',()=>{
 const f=fixture();let reopened:LearningApplication|undefined;
 try{
  const session=f.app.activity.start({}) as any;f.advance(20);f.app.activity.pause(session.id);
  f.advance(10);f.app.activity.resume(session.id);f.advance(180);
  f.app.close();reopened=new LearningApplication(f.dir,false,()=>new Date('2026-10-19T05:00:00Z'));
  const focus=reopened.trace.list(window).events.find(e=>e.kind==='focus');
  assert.equal(focus.focused_ms,20*60000);
  assert.deepEqual(focus.intervals,[{started_at:'2026-10-19T01:00:00.000Z',ended_at:'2026-10-19T01:20:00.000Z'}]);
 }finally{reopened?.close();rmSync(f.dir,{recursive:true,force:true})}
});
test('HTTP trace and record corrections use the same validated model',async()=>{
 const f=fixture(),server=createHttp(f.app,resolve(fileURLToPath(new URL('../public',import.meta.url))));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const addr=server.address();if(!addr||typeof addr==='string')throw Error('No port');
 const base='http://127.0.0.1:'+addr.port;
 try{
  const created=await fetch(base+'/api/learning-records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({local_date:'2026-10-19',started_at:'2026-10-19T09:00:00+08:00',ended_at:'2026-10-19T10:00:00+08:00',title:'HTTP 记录',summary:'初稿',time_zone:'Asia/Shanghai'})});
  assert.equal(created.status,201);const item=await created.json() as any;
  const corrected=await fetch(base+'/api/learning-records/'+item.id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({summary:'修正总结',next_action:'继续复习'})});
  assert.equal(corrected.status,200);
  const read=await (await fetch(base+'/api/learning-records/'+item.id)).json() as any;
  assert.equal(read.summary,'修正总结');assert.equal(read.next_action,'继续复习');
  const trace=await (await fetch(base+'/api/trace?'+new URLSearchParams(window))).json() as any;
  assert.equal(trace.events[0].record_id,item.id);assert.equal(trace.events[0].summary,'修正总结');
  const invalid=await fetch(base+'/api/trace?from=not-a-date&to=also-invalid');assert.equal(invalid.status,400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));f.end()}
});
