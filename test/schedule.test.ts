import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LearningApplication} from '../src/core/application.js';
import {AppError} from '../src/core/errors.js';

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'cove-plan-timeline-'));
 const app=new LearningApplication(dir,false,()=>new Date('2026-10-16T01:30:00+08:00'));
 return {dir,app,end:()=>{app.close();rmSync(dir,{recursive:true,force:true});}};
}

test('weekly class schedule and task time blocks stay explicit and date-addressable',()=>{
 const f=fixture();
 try{
  const course=f.app.catalog.create({kind:'course',title:'现代控制系统'}) as {id:string};
  const project=f.app.catalog.create({kind:'project',title:'Cove Learning'}) as {id:string};
  const slot=f.app.schedule.create({
   object_id:course.id,title:'现代控制系统',location:'1教 1A111 多',weekday:2,start_time:'13:30',end_time:'15:05',effective_from:'2026-09-07'
  }) as {id:string};
  assert.equal(f.app.schedule.forDate('2026-10-13').length,1,'Tuesday resolves recurring course');
  assert.equal((f.app.schedule.forDate('2026-10-13')[0] as {location:string}).location,'1教 1A111 多');
  assert.equal(f.app.schedule.forDate('2026-10-14').length,0,'Wednesday does not inherit Tuesday course');
  assert.throws(()=>f.app.schedule.create({
   object_id:project.id,title:'不合法固定课',weekday:2,start_time:'10:00',end_time:'11:00',effective_from:'2026-09-07'
  }),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.schedule.update(slot.id,{end_time:'12:00',start_time:'13:30'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');

  const task=f.app.planning.create({
   title:'状态空间复习',object_id:course.id,planned_for:'2026-10-16',
   scheduled_start:'2026-10-16T06:20:00.000Z',scheduled_end:'2026-10-16T07:05:00.000Z',
   due_at:'2026-10-18T12:00:00.000Z',estimated_minutes:45
  }) as {id:string;scheduled_start:string;scheduled_end:string};
  assert.equal(task.scheduled_start,'2026-10-16T06:20:00.000Z');
  assert.equal(task.scheduled_end,'2026-10-16T07:05:00.000Z');
  assert.throws(()=>f.app.planning.create({
   title:'坏时间',scheduled_start:'2026-10-16T07:00:00.000Z',scheduled_end:'2026-10-16T06:00:00.000Z'
  }),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');
  const cleared=f.app.planning.updateDetails(task.id,{scheduled_start:null,scheduled_end:null}) as {scheduled_start:null;scheduled_end:null};
  assert.equal(cleared.scheduled_start,null);assert.equal(cleared.scheduled_end,null);

  const again=new LearningApplication(f.dir);
  try{
   assert.equal((again.database.raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {n:number}).n,9);
   assert.equal(again.schedule.list().length,1);
   assert.equal(again.schedule.forDate('2026-10-13').length,1);
  }finally{again.close();}
 }finally{f.end();}
});
