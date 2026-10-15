import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,requiredId} from '../../core/validation.js';

type TaskRow={id:string;title:string;object_id:string|null;status:string};
type CourseRow={id:string;kind:string;title:string};
type ContextRow={
 id:string;object_id:string;kind:'objective'|'assessment';title:string;
 weight_percent:number|null;source_resource_id:string|null;source_locator:string|null;
 source_excerpt:string|null;status:'suggested'|'confirmed';created_at:string;updated_at:string;
};

export class TaskEvidenceService {
 constructor(private db:Database,private now=()=>new Date().toISOString()){}

 private task(taskId:string){
  const task=this.db.raw.prepare('SELECT id,title,object_id,status FROM tasks WHERE id=?').get(requiredId(taskId)) as TaskRow|undefined;
  if(!task)throw new AppError('NOT_FOUND','任务不存在。');
  return task;
 }

 private course(task:TaskRow){
  if(!task.object_id)return null;
  const object=this.db.raw.prepare('SELECT id,kind,title FROM learning_objects WHERE id=?').get(task.object_id) as CourseRow|undefined;
  if(!object)return null;
  return object.kind==='course'?object:null;
 }

 list(taskId:string){
  const task=this.task(taskId),course=this.course(task);
  const links=this.db.raw.prepare(
   `SELECT c.*,l.created_at AS linked_at
    FROM task_context_links l
    JOIN course_context_items c ON c.id=l.context_item_id
    WHERE l.task_id=?
    ORDER BY CASE c.kind WHEN 'objective' THEN 0 ELSE 1 END,c.created_at,c.id`
  ).all(task.id) as unknown as (ContextRow&{linked_at:string})[];
  const available=course?this.db.raw.prepare(
   `SELECT * FROM course_context_items
    WHERE object_id=? AND status='confirmed'
    ORDER BY CASE kind WHEN 'objective' THEN 0 ELSE 1 END,created_at,id`
  ).all(course.id) as unknown as ContextRow[]:[];
  return {task,course,links,available};
 }

 set(taskId:string,input:unknown){
  const data=record(input),contextId=requiredId(data.context_item_id);
  if(typeof data.linked!=='boolean')throw new AppError('VALIDATION_ERROR','需要明确是否关联课程证据。');
  const linked=data.linked;
  return this.db.transaction(()=>{
   const task=this.task(taskId);
   if(task.status!=='open')throw new AppError('CONFLICT','已完成任务不可修改课程证据关联。');
   if(!linked){
    this.db.raw.prepare('DELETE FROM task_context_links WHERE task_id=? AND context_item_id=?').run(task.id,contextId);
    return this.list(task.id);
   }
   const course=this.course(task);
   if(!course)throw new AppError('CONFLICT','只有关联课程的任务可以绑定课程证据。');
   const context=this.db.raw.prepare('SELECT * FROM course_context_items WHERE id=?').get(contextId) as ContextRow|undefined;
   if(!context)throw new AppError('NOT_FOUND','课程证据不存在。');
   if(context.object_id!==course.id)throw new AppError('CONFLICT','任务只能关联自己课程里的证据。');
   if(context.status!=='confirmed')throw new AppError('CONFLICT','待确认课程证据不能关联到任务。');
   this.db.raw.prepare(
    'INSERT INTO task_context_links(task_id,context_item_id,created_at) VALUES(?,?,?) ON CONFLICT(task_id,context_item_id) DO NOTHING'
   ).run(task.id,context.id,this.now());
   return this.list(task.id);
  });
 }
}
