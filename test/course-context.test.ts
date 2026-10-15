import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LearningApplication} from '../src/core/application.js';
import {AppError} from '../src/core/errors.js';

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'cove-course-context-'));
 const app=new LearningApplication(dir,false,()=>new Date('2026-10-14T02:00:00.000Z'));
 return {dir,app,end:()=>{app.close();rmSync(dir,{recursive:true,force:true});}};
}

test('course context stores confirmed objectives and assessment evidence without inventing importance',()=>{
 const f=fixture();
 try{
  const course=f.app.catalog.create({kind:'course',title:'现代控制'}) as {id:string};
  const project=f.app.catalog.create({kind:'project',title:'Cove Learning'}) as {id:string};
  const resource=f.app.library.ingest({
   title:'第一章目标.txt',mime_type:'text/plain',base64:Buffer.from('掌握状态空间分析').toString('base64')
  }) as {id:string};
  assert.throws(()=>f.app.courseContext.create(project.id,{kind:'objective',title:'不应允许'}),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.courseContext.create(course.id,{kind:'objective',title:'待确认但没有来源',status:'suggested'}),AppError);
  const objective=f.app.courseContext.create(course.id,{
   kind:'objective',title:'掌握状态空间模型分析',status:'suggested',source_resource_id:resource.id,
   source_locator:'第 1 章 · 学习目标',source_excerpt:'掌握状态空间分析'
  }) as {id:string;status:string;weight_percent:null};
  assert.equal(objective.status,'suggested');
  assert.equal(objective.weight_percent,null);
  const assessment=f.app.courseContext.create(course.id,{
   kind:'assessment',title:'期末考试',weight_percent:60
  }) as {id:string;weight_percent:number};
  assert.equal(assessment.weight_percent,60);
  let context=f.app.courseContext.list(course.id);
  assert.equal(context.evidence.confirmedObjectives,0);
  assert.equal(context.evidence.confirmedAssessments,1);
  assert.equal(context.evidence.weightedAssessments,1);
  f.app.courseContext.update(objective.id,{status:'confirmed'});
  context=f.app.courseContext.list(course.id);
  assert.equal(context.evidence.confirmedObjectives,1);
  assert.equal(context.items.length,2);
  assert.throws(()=>f.app.courseContext.create(course.id,{kind:'assessment',title:'坏权重',weight_percent:101}),AppError);
  assert.throws(()=>f.app.courseContext.update(assessment.id,{source_resource_id:'00000000-0000-4000-8000-000000000000'}),AppError);
  assert.equal(f.app.today.snapshot().priorityModel.importanceAvailable,false);
  assert.equal(f.app.today.snapshot().recommendations.length,0);
  f.app.courseContext.remove(assessment.id);
  assert.equal(f.app.courseContext.list(course.id).items.length,1);
  const again=new LearningApplication(f.dir);
  try{
   const restored=again.courseContext.list(course.id);
   assert.equal(restored.items.length,1);
   assert.equal(restored.evidence.confirmedObjectives,1);
   assert.equal((again.database.raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {n:number}).n,6);
  }finally{again.close();}
 }finally{f.end();}
});
