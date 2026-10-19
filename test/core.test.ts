import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LearningApplication} from '../src/core/application.js';
import {AppError} from '../src/core/errors.js';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'cove-learning-next-'));
 let instant=new Date('2026-10-09T07:00:00.000Z');
 const app=new LearningApplication(dir,false,()=>instant);
 return {app,dir,tick:(ms:number)=>{instant=new Date(instant.getTime()+ms);},end:()=>{app.close();rmSync(dir,{recursive:true,force:true});}};
}
test('cross-module: object → task → focus → real Today read model',()=>{
 const f=fixture();
 try{
  const obj=f.app.catalog.create({kind:'course',title:'现代控制理论'}) as {id:string};
  const task=f.app.planning.create({title:'极点配置',object_id:obj.id}) as {id:string};
  const session=f.app.activity.start({object_id:obj.id}) as {id:string};
  assert.equal(f.app.today.snapshot().openTasks.length,1);
  assert.equal((f.app.activity.active() as {id:string}).id,session.id);
  f.tick(60_000);f.app.activity.pause(session.id);
  assert.equal((f.app.activity.active() as {accumulated_ms:number}).accumulated_ms,60_000);
  f.tick(120_000);f.app.activity.resume(session.id);
  f.tick(30_000);const finished=f.app.activity.finish(session.id) as {accumulated_ms:number;state:string};
  assert.equal(finished.accumulated_ms,90_000);
  const history=f.app.activity.history() as unknown as {total_ms:number;sessions:{id:string}[]};
  assert.equal(history.total_ms,90_000);
  assert.equal(history.sessions.some(item=>item.id===session.id),true);
  assert.equal(finished.state,'finished');
  assert.equal(f.app.activity.events(session.id).length,4);
  f.app.planning.complete(task.id);
  assert.equal(f.app.today.snapshot().openTasks.length,0);
  assert.equal(f.app.today.snapshot().activeFocus,null);
  assert.equal(f.app.today.snapshot().recentSessions.length,1);
 }finally{f.end();}
});

test('learning records keep truthful time, focus, summary and associations',()=>{
 const f=fixture();
 try{
  const course=f.app.catalog.create({kind:'course',title:'计算机网络'}) as {id:string};
  const other=f.app.catalog.create({kind:'course',title:'操作系统'}) as {id:string};
  const task=f.app.planning.create({title:'第三章作业',object_id:course.id}) as {id:string};
  const item=f.app.records.create({
   local_date:'2026-10-09',started_at:'2026-10-09T15:00:00+08:00',ended_at:'2026-10-09T16:10:00+08:00',focused_minutes:55,
   title:'第三章复习',summary:'复习了拥塞控制和滑动窗口。',activity_type:'review',task_id:task.id,next_action:'完成第三章作业',tags:['计网',' 复习 ','计网']
  }) as any;
  assert.equal(item.elapsed_minutes,70);assert.equal(item.focused_minutes,55);assert.equal(item.object_id,course.id);assert.equal(item.task_id,task.id);
  assert.equal(item.summary,'复习了拥塞控制和滑动窗口。');assert.deepEqual(item.tags,['计网','复习']);assert.equal(item.source,'manual');
  assert.equal((f.app.records.list({local_date:'2026-10-09'}) as any[])[0].id,item.id);
  assert.throws(()=>f.app.records.create({local_date:'2026-10-09',started_at:'2026-10-09T15:00:00+08:00',ended_at:'2026-10-09T16:00:00+08:00',focused_minutes:61,title:'bad'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
  assert.throws(()=>f.app.records.create({local_date:'2026-10-09',started_at:'2026-10-09T15:00:00+08:00',ended_at:'2026-10-09T16:00:00+08:00',title:'bad link',object_id:other.id,task_id:task.id}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
 }finally{f.end();}
});

test('project metadata supports idea → active progress and next actions',()=>{
 const f=fixture();
 try{
  const project=f.app.catalog.create({
   kind:'project',title:'Cove Reader',description:'触摸墨水屏共读器',project_stage:'构想',next_action:'验证屏幕与触摸方案'
  }) as any;
  assert.equal(project.project_status,'idea');assert.equal(project.progress_percent,0);
  const updated=f.app.catalog.update(project.id,{project_status:'active',project_stage:'原型',progress_percent:15,next_action:'跑通显示与触摸',blocker:null}) as any;
  assert.equal(updated.project_status,'active');assert.equal(updated.project_stage,'原型');assert.equal(updated.progress_percent,15);
  assert.equal(updated.next_action,'跑通显示与触摸');assert.equal(updated.blocker,null);
  const course=f.app.catalog.create({kind:'course',title:'课程'}) as any;
  assert.throws(()=>f.app.catalog.update(course.id,{project_status:'active'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
 }finally{f.end();}
});

test('Focus remains unbound, rejects duplicate active sessions and invalid transitions',()=>{
 const f=fixture();
 try{
  const s=f.app.activity.start() as {id:string};
  assert.throws(()=>f.app.activity.start(),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.activity.resume(s.id),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.equal(f.app.activity.events(s.id).length,1);
  f.app.activity.finish(s.id);
  assert.throws(()=>f.app.activity.finish(s.id),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.equal(f.app.activity.events(s.id).length,2);
 }finally{f.end();}
});
test('immutable resource bytes with SHA and version survives app restart',()=>{
 const f=fixture();
 const src=Buffer.from('Learning 原始内容 2026-10-09','utf8');
 let id:string;
 try{
  const resource=f.app.library.ingest({title:'资料.txt',mime_type:'text/plain',base64:src.toString('base64')}) as {id:string;version_id:string;sha256:string};
  id=resource.id;
  assert.match(resource.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(f.app.library.content(resource.id).bytes,src);
  assert.equal(f.app.library.list().length,1);
  const f2=new LearningApplication(f.dir);
  try{assert.deepEqual(f2.library.content(id).bytes,src);}finally{f2.close();}
  assert.throws(()=>f.app.library.ingest({title:'bad',mime_type:'text/plain',base64:'!!!!'}),AppError);
  assert.equal(f.app.library.list().length,1);
 }finally{f.end();}
});
test('restart conservatively pauses unknown interval instead of inflating focus duration',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cove-focus-recover-'));
 let time=new Date('2026-10-09T07:00:00.000Z');
 const first=new LearningApplication(dir,false,()=>time);
 try{
  const session=first.activity.start() as {id:string};
  first.close();
  time=new Date('2026-10-09T09:00:00.000Z');
  const second=new LearningApplication(dir,false,()=>time);
  try{
   const active=second.activity.active() as {state:string;accumulated_ms:number};
   assert.equal(active.state,'paused');
   assert.equal(active.accumulated_ms,0);
   assert.equal(second.activity.events(session.id).at(-1)?.event_type,'focus.recovery_needed');
   const finished=second.activity.finish(session.id) as {accumulated_ms:number};
   assert.equal(finished.accumulated_ms,0);
  }finally{second.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('transaction rolls back and migration metadata stays stable',()=>{
 const f=fixture();
 try{
  const before=f.app.database.raw.prepare('SELECT * FROM schema_migrations').all();
  assert.equal(before.length,9);
  assert.throws(()=>f.app.database.transaction(()=>{
   f.app.catalog.create({kind:'track',title:'中途回滚'});
   throw new Error('abort');
  }));
  assert.equal(f.app.catalog.list().length,0);
  const again=new LearningApplication(f.dir);
  try{assert.deepEqual(again.database.raw.prepare('SELECT * FROM schema_migrations').all(),before);}
  finally{again.close();}
 }finally{f.end();}
});
