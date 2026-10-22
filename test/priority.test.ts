import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LearningApplication} from '../src/core/application.js';
import {rankTasks} from '../src/modules/priority/engine.js';
import {AppError} from '../src/core/errors.js';

const START='2026-10-12T10:00:00.000Z';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'cove-priority-'));
 let time=new Date(START);
 const app=new LearningApplication(dir,false,()=>time);
 return {dir,app,advance:(ms:number)=>{time=new Date(time.getTime()+ms);},
  finish:()=>{app.close();rmSync(dir,{recursive:true,force:true});}};
}
test('recommendation explains urgency, slack, aging, and leaves unknown importance unscored',()=>{
 const inputs=[
  {id:'a',title:'DDL',created_at:START,due_at:'2026-10-12T11:00:00.000Z',estimated_minutes:120,planned_for:null,boost:0},
  {id:'b',title:'No deadline',created_at:'2026-10-01T00:00:00.000Z',due_at:null,estimated_minutes:null,planned_for:null,boost:0},
  {id:'c',title:'Later',created_at:START,due_at:'2026-11-12T11:00:00.000Z',estimated_minutes:null,planned_for:null,boost:0}
 ];
 const ranked=rankTasks(inputs,new Date(START));
 assert.equal(ranked[0]?.id,'a');
 assert.equal(ranked[0]?.urgency,'at-risk');
 assert.equal(ranked[0]?.importance,null);
 assert.ok(ranked[0]?.reasons.some(x=>x.includes('剩余时间')));
 assert.equal(ranked[1]?.id,'b');
 assert.ok(ranked[1]?.reasons.some(x=>x.includes('等待')));
 assert.equal(ranked[2]?.urgency,'later');
 assert.deepEqual(rankTasks([{...inputs[1]!,boost:2}],new Date(START))[0]?.boost,2);
});
test('task metadata is optional, validated, editable, and survives restart',()=>{
 const f=fixture();
 try{
  const task=f.app.planning.create({title:'实验报告'}) as {id:string;due_at:null;planned_for:null};
  assert.equal(task.due_at,null);
  assert.equal(task.planned_for,null);
  const updated=f.app.planning.updateDetails(task.id,{
   due_at:'2026-10-13T07:00:00.000Z',estimated_minutes:90,planned_for:'2026-10-12'
  }) as {estimated_minutes:number;due_at:string};
  assert.equal(updated.estimated_minutes,90);
  assert.match(updated.due_at,/2026-10-13/);
  assert.throws(()=>f.app.planning.updateDetails(task.id,{planned_for:'2026-02-30'}),AppError);
  assert.throws(()=>f.app.planning.updateDetails(task.id,{due_at:'tomorrow'}),AppError);
  assert.throws(()=>f.app.planning.updateDetails(task.id,{due_at:'2026-02-30T00:00:00.000Z'}),AppError);
  assert.throws(()=>f.app.planning.updateDetails(task.id,{estimated_minutes:-1}),AppError);
  assert.equal(f.app.today.snapshot('2026-10-12').todayTasks.length,1);
  assert.equal(f.app.today.snapshot('2026-10-12').deadlineTasks.length,1);
  assert.throws(()=>f.app.today.snapshot('2026-99-99'),AppError);
  const again=new LearningApplication(f.dir);
  try{
   assert.equal((again.planning.list()[0] as {estimated_minutes:number}).estimated_minutes,90);
  }finally{again.close();}
 }finally{f.finish();}
});
test('preference is temporary, expires, changes order but never falsifies the 2D coordinates',()=>{
 const f=fixture();
 try{
  const urgent=f.app.planning.create({title:'马上截止',due_at:'2026-10-12T13:00:00.000Z'}) as {id:string};
  const personal=f.app.planning.create({title:'我想先做',due_at:'2026-12-12T13:00:00.000Z'}) as {id:string};
  const until='2026-10-12T16:00:00.000Z'; // Local UTC+8 midnight.
  const before=f.app.today.snapshot('2026-10-12');
  assert.equal(before.recommendations[0]?.id,urgent.id);
  f.app.planning.setPreference(personal.id,{boost:2,expires_at:until});
  const chosen=f.app.today.snapshot('2026-10-12');
  assert.equal(chosen.recommendations[0]?.id,personal.id);
  const selected=chosen.recommendations.find(t=>t.id===personal.id)!;
  assert.equal(selected.urgency,'later');
  assert.equal(selected.importance,null);
  assert.equal(selected.boost,2);
  assert.ok(selected.reasons.some(r=>r.includes('今天想优先')));
  assert.throws(()=>f.app.planning.setPreference(personal.id,{boost:2,expires_at:'2026-11-12T13:00:00.000Z'}),AppError);
  f.advance(6*60*60_000+1);
  const tomorrow=f.app.today.snapshot('2026-10-13');
  assert.equal(tomorrow.recommendations.find(t=>t.id===personal.id)?.boost,0);
  assert.equal(tomorrow.recommendations[0]?.id,urgent.id);
  f.app.planning.complete(personal.id);
  assert.equal(f.app.today.snapshot().recommendations.length,1);
  assert.equal(f.app.database.raw.prepare('SELECT COUNT(*) AS n FROM task_preferences').get()?.n,0);
 }finally{f.finish();}
});
test('preference can be lowered or cancelled and cannot target completed tasks',()=>{
 const f=fixture();
 try{
  const id=(f.app.planning.create({title:'Task'}) as {id:string}).id;
  f.app.planning.setPreference(id,{boost:2,expires_at:'2026-10-12T16:00:00.000Z'});
  f.app.planning.setPreference(id,{boost:1,expires_at:'2026-10-12T16:00:00.000Z'});
  assert.equal(f.app.today.snapshot().recommendations[0]?.boost,1);
  f.app.planning.setPreference(id,{boost:0});
  assert.equal(f.app.today.snapshot().recommendations[0]?.boost,0);
  f.app.planning.complete(id);
  assert.throws(()=>f.app.planning.setPreference(id,{boost:1,expires_at:'2026-10-12T16:00:00.000Z'}),AppError);
 }finally{f.finish();}
});

test('completed tasks planned for today remain visible in Today history',()=>{
 const f=fixture();
 try{
  const task=f.app.planning.create({title:'完成后仍保留',planned_for:'2026-10-12'}) as {id:string};
  f.app.planning.complete(task.id);
  const snapshot=f.app.today.snapshot('2026-10-12') as unknown as {todayTasks:{id:string}[];completedTodayTasks:{id:string;status:string}[]};
  assert.equal(snapshot.todayTasks.some(item=>item.id===task.id),false);
  assert.equal(snapshot.completedTodayTasks.some(item=>item.id===task.id&&item.status==='done'),true);
  f.app.planning.reopen(task.id);
  const restored=f.app.today.snapshot('2026-10-12') as unknown as {todayTasks:{id:string}[];completedTodayTasks:{id:string}[]};
  assert.equal(restored.todayTasks.some(item=>item.id===task.id),true);
  assert.equal(restored.completedTodayTasks.some(item=>item.id===task.id),false);
 }finally{f.finish();}
});

test('execution fields are optional, validated, editable, and preserved',()=>{
 const f=fixture();
 try{
  const task=f.app.planning.create({title:'后端字段',description:'补齐决策输入',task_type:'project',workflow_state:'in_progress',progress_percent:40,estimated_minutes:120,remaining_minutes:70}) as any;
  assert.equal(task.remaining_minutes,70);
  assert.equal(task.workflow_state,'in_progress');
  const updated=f.app.planning.updateDetails(task.id,{progress_percent:65,remaining_minutes:35,workflow_state:'blocked',blocked_reason:'等待字段确认'}) as any;
  assert.equal(updated.progress_percent,65);
  assert.equal(updated.blocked_reason,'等待字段确认');
  assert.throws(()=>f.app.planning.updateDetails(task.id,{workflow_state:'todo'}),AppError);
  const resumed=f.app.planning.updateDetails(task.id,{workflow_state:'in_progress',blocked_reason:null}) as any;
  assert.equal(resumed.blocked_reason,null);
  const projection=f.app.today.snapshot('2026-10-12').recommendations.find(item=>item.id===task.id)!;
  assert.equal(projection.progress_percent,65);
  assert.equal(projection.remaining_minutes,35);
  assert.equal(projection.task_type,'project');
  assert.throws(()=>f.app.planning.create({title:'坏类型',task_type:'magic'}),AppError);
 }finally{f.finish();}
});

test('recommendation v2 uses remaining work, explicit plans and importance while sidelining non-actionable tasks',()=>{
 const now=new Date(START);
 const base={created_at:START,estimated_minutes:null,remaining_minutes:null,scheduled_start:null,scheduled_end:null,available_from:null,importance:null,boost:0};
 const ranked=rankTasks([
  {...base,id:'planned',title:'今天做',due_at:null,planned_for:'2026-10-12',workflow_state:'todo' as const},
  {...base,id:'blocked',title:'阻塞',due_at:'2026-10-12T10:30:00.000Z',planned_for:null,workflow_state:'blocked' as const},
  {...base,id:'important',title:'重要',due_at:null,planned_for:null,importance:'high' as const,workflow_state:'todo' as const},
  {...base,id:'risk',title:'余量风险',due_at:'2026-10-12T11:00:00.000Z',remaining_minutes:90,planned_for:null,workflow_state:'todo' as const}
 ],now,'2026-10-12');
 assert.equal(ranked[0]?.id,'risk');
 assert.equal(ranked[0]?.urgency,'at-risk');
 assert.equal(ranked.at(-1)?.id,'blocked');
 assert.equal(ranked.at(-1)?.actionability,'blocked');
 assert.ok(ranked.find(item=>item.id==='planned')?.reasons.some(reason=>reason.includes('安排在今天')));
 assert.ok(ranked.find(item=>item.id==='important')?.reasons.some(reason=>reason.includes('高重要度')));
});
