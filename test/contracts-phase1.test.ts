import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LearningApplication} from '../src/core/application.js';
import {localDateAt,offsetMinutesForDate} from '../src/core/time.js';
import {AppError} from '../src/core/errors.js';

function fixture(iso='2026-10-27T16:30:00Z',zone='Asia/Shanghai'){
 const dir=mkdtempSync(join(tmpdir(),'cove-contracts-'));
 let now=new Date(iso);
 const app=new LearningApplication(dir,false,()=>now,zone);
 return {app,dir,tick:(ms:number)=>{now=new Date(now.getTime()+ms)},end:()=>{app.close();rmSync(dir,{recursive:true,force:true})}};
}

test('Local Today and trace agree near UTC midnight',()=>{
 const f=fixture();
 try{
  const task=f.app.planning.create({title:'今日复习',planned_for:'2026-10-28'}) as any;
  const today=f.app.today.snapshot();
  assert.equal(today.local_date,'2026-10-28');
  assert.equal(today.time_zone,'Asia/Shanghai');
  assert.equal(today.todayTasks[0]?.id,task.id);
  assert.deepEqual(f.app.trace.list().range,{from:'2026-09-30T16:00:00.000Z',to:'2026-10-31T16:00:00.000Z'});
  assert.equal(localDateAt(new Date('2026-10-27T15:30:00Z'),'Asia/Tokyo'),'2026-10-28');
  assert.equal(offsetMinutesForDate('2026-10-28','Asia/Shanghai'),480);
  assert.equal(offsetMinutesForDate('2026-10-28','Asia/Tokyo'),540);
 }finally{f.end()}
});

test('Focus belongs to a task, can repeat, and the record inherits its task',()=>{
 const f=fixture('2026-10-28T01:00:00Z');
 try{
  const course=f.app.catalog.create({kind:'course',title:'操作系统'}) as any;
  const other=f.app.catalog.create({kind:'course',title:'计网'}) as any;
  const task=f.app.planning.create({title:'复习进程调度',object_id:course.id}) as any;
  assert.throws(()=>f.app.activity.start({task_id:task.id,object_id:other.id}),AppError);
  const first=f.app.activity.start({task_id:task.id}) as any;
  assert.equal(first.object_id,course.id);assert.equal(first.task_id,task.id);
  assert.equal((f.app.today.snapshot().activeFocus as any).task_id,task.id);
  f.tick(20*60_000);
  const complete=f.app.activity.finish(first.id) as any;
  const r=f.app.records.create({local_date:'2026-10-28',started_at:complete.started_at,ended_at:complete.ended_at,title:'复习记录',focus_session_id:first.id}) as any;
  assert.equal(r.task_id,task.id);assert.equal(r.object_id,course.id);assert.equal(r.focused_minutes,20);
  const second=f.app.activity.start({task_id:task.id}) as any;
  f.tick(10*60_000);f.app.activity.finish(second.id);
  assert.notEqual(second.id,first.id);
  assert.equal((f.app.activity.history() as any).sessions.filter((s:any)=>s.task_id===task.id).length,2);
 }finally{f.end()}
});

test('Completed task state is canonical and reopening allows a fresh session',()=>{
 const f=fixture();
 try{
  const task=f.app.planning.create({title:'实验报告',workflow_state:'blocked',blocked_reason:'等待材料'}) as any;
  const done=f.app.planning.complete(task.id) as any;
  assert.equal(done.status,'done');assert.equal(done.workflow_state,'todo');assert.equal(done.blocked_reason,null);
  assert.ok(done.completed_at);
  assert.throws(()=>f.app.activity.start({task_id:task.id}),AppError);
  assert.equal((f.app.planning.complete(task.id) as any).completed_at,done.completed_at);
  const open=f.app.planning.reopen(task.id) as any;
  assert.equal(open.status,'open');assert.equal(open.workflow_state,'todo');assert.equal(open.completed_at,null);
  assert.equal((f.app.activity.start({task_id:task.id}) as any).task_id,task.id);
 }finally{f.end()}
});

test('Unbound focus is still valid and schema v14 has intact foreign keys',()=>{
 const f=fixture();
 try{
  const focus=f.app.activity.start({}) as any;
  assert.equal(focus.task_id,null);
  assert.equal(f.app.database.raw.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal((f.app.database.raw.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as any).v,14);
 }finally{f.end()}
});
