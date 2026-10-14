import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {optionalId,record,requiredId,textOrNull,title} from '../../core/validation.js';
import type {CatalogService} from './service.js';

export type CourseContextKind='objective'|'assessment';
export type CourseContextStatus='suggested'|'confirmed';

function contextStatus(value:unknown):CourseContextStatus{
 if(value==null||value==='')return 'confirmed';
 if(value!=='suggested'&&value!=='confirmed')throw new AppError('VALIDATION_ERROR','课程上下文状态不合法。');
 return value;
}
function assessmentWeight(value:unknown):number|null{
 if(value==null||value==='')return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)
  throw new AppError('VALIDATION_ERROR','考核权重应为 0～100。');
 return Math.round(value*10)/10;
}

export class CourseContextService {
 constructor(private db:Database,private catalog:CatalogService,private now=()=>new Date().toISOString()){}
 private course(id:string){
  const item=this.catalog.get(id) as {id:string;kind:string;title:string};
  if(item.kind!=='course')throw new AppError('CONFLICT','只有课程可以建立课程上下文。');
  return item;
 }
 private resource(id:string|null){
  if(!id)return;
  const found=this.db.raw.prepare('SELECT id FROM resources WHERE id=?').get(id);
  if(!found)throw new AppError('NOT_FOUND','来源资料不存在。');
 }
 list(courseId:string){
  const course=this.course(requiredId(courseId));
  const items=this.db.raw.prepare(
   "SELECT * FROM course_context_items WHERE object_id=? ORDER BY CASE kind WHEN 'objective' THEN 0 ELSE 1 END,created_at,id"
  ).all(course.id) as unknown as {kind:CourseContextKind;status:CourseContextStatus;weight_percent:number|null}[];
  const confirmed=items.filter(i=>i.status==='confirmed');
  return {
   course,
   items,
   evidence:{
    confirmedObjectives:confirmed.filter(i=>i.kind==='objective').length,
    confirmedAssessments:confirmed.filter(i=>i.kind==='assessment').length,
    weightedAssessments:confirmed.filter(i=>i.kind==='assessment'&&i.weight_percent!=null).length
   }
  };
 }
 create(courseId:string,input:unknown){
  const course=this.course(requiredId(courseId)),data=record(input);
  if(data.kind!=='objective'&&data.kind!=='assessment')throw new AppError('VALIDATION_ERROR','课程上下文类型不合法。');
  const kind=data.kind as CourseContextKind;
  const source_resource_id=optionalId(data.source_resource_id);
  const itemStatus=contextStatus(data.status);
  this.resource(source_resource_id);
  if(itemStatus==='suggested'&&!source_resource_id)throw new AppError('VALIDATION_ERROR','待确认条目必须保留来源资料。');
  const at=this.now();
  const item={
   id:randomUUID(),object_id:course.id,kind,title:title(data.title),
   weight_percent:kind==='assessment'?assessmentWeight(data.weight_percent):null,
   source_resource_id,
   source_locator:textOrNull(data.source_locator,300),
   source_excerpt:textOrNull(data.source_excerpt,1200),
   status:itemStatus,created_at:at,updated_at:at
  };
  this.db.transaction(()=>this.db.raw.prepare(
   'INSERT INTO course_context_items(id,object_id,kind,title,weight_percent,source_resource_id,source_locator,source_excerpt,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  ).run(item.id,item.object_id,item.kind,item.title,item.weight_percent,item.source_resource_id,item.source_locator,item.source_excerpt,item.status,item.created_at,item.updated_at));
  return item;
 }
 update(itemId:string,input:unknown){
  const id=requiredId(itemId),data=record(input);
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM course_context_items WHERE id=?').get(id) as Record<string,unknown>|undefined;
   if(!current)throw new AppError('NOT_FOUND','课程上下文条目不存在。');
   this.course(String(current.object_id));
   const kind=current.kind as CourseContextKind;
   const source_resource_id=Object.hasOwn(data,'source_resource_id')?optionalId(data.source_resource_id):current.source_resource_id as string|null;
   this.resource(source_resource_id);
   const nextStatus=Object.hasOwn(data,'status')?contextStatus(data.status):current.status as CourseContextStatus;
   if(nextStatus==='suggested'&&!source_resource_id)throw new AppError('VALIDATION_ERROR','待确认条目必须保留来源资料。');
   const next={
    title:Object.hasOwn(data,'title')?title(data.title):current.title as string,
    weight_percent:kind==='assessment'&&Object.hasOwn(data,'weight_percent')?assessmentWeight(data.weight_percent):current.weight_percent as number|null,
    source_resource_id,
    source_locator:Object.hasOwn(data,'source_locator')?textOrNull(data.source_locator,300):current.source_locator as string|null,
    source_excerpt:Object.hasOwn(data,'source_excerpt')?textOrNull(data.source_excerpt,1200):current.source_excerpt as string|null,
    status:nextStatus,updated_at:this.now()
   };
   this.db.raw.prepare(
    'UPDATE course_context_items SET title=?,weight_percent=?,source_resource_id=?,source_locator=?,source_excerpt=?,status=?,updated_at=? WHERE id=?'
   ).run(next.title,next.weight_percent,next.source_resource_id,next.source_locator,next.source_excerpt,next.status,next.updated_at,id);
   return this.db.raw.prepare('SELECT * FROM course_context_items WHERE id=?').get(id);
  });
 }
 remove(itemId:string){
  const id=requiredId(itemId);
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM course_context_items WHERE id=?').get(id) as {id:string;object_id:string}|undefined;
   if(!current)throw new AppError('NOT_FOUND','课程上下文条目不存在。');
   this.course(current.object_id);
   this.db.raw.prepare('DELETE FROM course_context_items WHERE id=?').run(id);
   return {id};
  });
 }
}
