import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LearningApplication} from '../src/core/application.js';
import {AppError} from '../src/core/errors.js';

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'cove-task-evidence-'));
 const app=new LearningApplication(dir,false,()=>new Date('2026-10-15T04:00:00.000Z'));
 return {dir,app,end:()=>{app.close();rmSync(dir,{recursive:true,force:true});}};
}

test('tasks explicitly link only to confirmed evidence from their own course',()=>{
 const f=fixture();
 try{
  const course=f.app.catalog.create({kind:'course',title:'现代控制'}) as {id:string};
  const otherCourse=f.app.catalog.create({kind:'course',title:'随机过程'}) as {id:string};
  const project=f.app.catalog.create({kind:'project',title:'Cove Learning'}) as {id:string};
  const source=f.app.library.ingest({
   title:'课程目标.txt',mime_type:'text/plain',base64:Buffer.from('课程目标').toString('base64')
  }) as {id:string};
  const objective=f.app.courseContext.create(course.id,{
   kind:'objective',title:'掌握状态空间模型分析'
  }) as {id:string};
  const assessment=f.app.courseContext.create(course.id,{
   kind:'assessment',title:'期末考试',weight_percent:60
  }) as {id:string};
  const suggested=f.app.courseContext.create(course.id,{
   kind:'objective',title:'待确认目标',status:'suggested',source_resource_id:source.id
  }) as {id:string};
  const foreign=f.app.courseContext.create(otherCourse.id,{
   kind:'objective',title:'另一个课程目标'
  }) as {id:string};
  const task=f.app.planning.create({title:'整理状态空间题型',object_id:course.id}) as {id:string};
  const projectTask=f.app.planning.create({title:'写 README',object_id:project.id}) as {id:string};

  const initial=f.app.taskEvidence.list(task.id);
  assert.equal(initial.course?.id,course.id);
  assert.deepEqual(initial.available.map(x=>x.id),[objective.id,assessment.id]);
  assert.equal(initial.links.length,0);

  f.app.taskEvidence.set(task.id,{context_item_id:objective.id,linked:true});
  f.app.taskEvidence.set(task.id,{context_item_id:objective.id,linked:true});
  f.app.taskEvidence.set(task.id,{context_item_id:assessment.id,linked:true});
  const linked=f.app.taskEvidence.list(task.id);
  assert.equal(linked.links.length,2);
  assert.throws(()=>f.app.taskEvidence.set(task.id,{context_item_id:suggested.id,linked:true}),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.taskEvidence.set(task.id,{context_item_id:foreign.id,linked:true}),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.taskEvidence.set(projectTask.id,{context_item_id:objective.id,linked:true}),e=>e instanceof AppError&&e.code==='CONFLICT');

  const beforeImportance=f.app.today.snapshot('2026-10-15');
  const unscored=beforeImportance.recommendations.find(t=>t.id===task.id)!;
  assert.equal(unscored.importance,null);
  assert.equal(unscored.evidence.length,2);
  assert.ok(unscored.reasons.some(x=>x==='关联课程目标：掌握状态空间模型分析'));
  assert.ok(unscored.reasons.some(x=>x==='关联考核：期末考试（60%）'));
  assert.equal(beforeImportance.priorityModel.importanceAvailable,false);
  assert.equal(beforeImportance.priorityModel.evidenceLinksAvailable,true);
  assert.throws(()=>f.app.taskEvidence.setImportance(task.id,{context_item_id:foreign.id,contribution:'high'}),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.taskEvidence.setImportance(task.id,{context_item_id:objective.id,contribution:'extreme'}),e=>e instanceof AppError&&e.code==='VALIDATION_ERROR');

  f.app.taskEvidence.setImportance(task.id,{context_item_id:objective.id,contribution:'medium'});
  const scored=f.app.today.snapshot('2026-10-15');
  const recommended=scored.recommendations.find(t=>t.id===task.id)!;
  assert.equal(recommended.importance,'medium');
  assert.equal(recommended.score,unscored.score,'ordinal importance does not silently alter the ranking score');
  assert.ok(recommended.reasons.some(x=>x==='重要度：中 · 主依据：掌握状态空间模型分析'));
  assert.equal(scored.priorityModel.importanceAvailable,true);
  assert.equal(scored.priorityModel.importanceScale,'ordinal-low-medium-high');
  assert.equal(f.app.taskEvidence.list(task.id).importance_input?.contribution,'medium');

  f.app.taskEvidence.set(task.id,{context_item_id:objective.id,linked:false});
  const afterUnlink=f.app.taskEvidence.list(task.id);
  assert.deepEqual(afterUnlink.links.map(x=>x.id),[assessment.id]);
  assert.equal(afterUnlink.importance_input,null,'unlinking the primary evidence clears its importance input by FK cascade');
  f.app.taskEvidence.setImportance(task.id,{context_item_id:assessment.id,contribution:'high'});
  f.app.planning.complete(task.id);
  assert.throws(()=>f.app.taskEvidence.set(task.id,{context_item_id:objective.id,linked:true}),e=>e instanceof AppError&&e.code==='CONFLICT');
  assert.throws(()=>f.app.taskEvidence.setImportance(task.id,{clear:true}),e=>e instanceof AppError&&e.code==='CONFLICT');

  const again=new LearningApplication(f.dir);
  try{
   assert.equal((again.database.raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {n:number}).n,8);
   assert.equal(again.taskEvidence.list(task.id).links.length,1);
   assert.equal(again.taskEvidence.list(task.id).importance_input?.contribution,'high');
  }finally{again.close();}
 }finally{f.end();}
});
