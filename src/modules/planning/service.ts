import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,title,optionalId,requiredId} from '../../core/validation.js';
import type {CatalogService} from '../catalog/service.js';

function dueDate(value:unknown):string|null{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))
  throw new AppError('VALIDATION_ERROR','截止时间需使用 UTC ISO 日期。');
 const canonical=new Date(value).toISOString();
 if(canonical!==value.replace(/Z$/,value.includes('.')?'Z':'.000Z'))
  throw new AppError('VALIDATION_ERROR','截止时间不是有效日历日期。');
 return canonical;
}
function plannedDate(value:unknown):string|null{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)
  throw new AppError('VALIDATION_ERROR','计划日期应为 YYYY-MM-DD。');
 return value;
}
function estimate(value:unknown):number|null{
 if(value==null||value==='')return null;
 if(!Number.isInteger(value)||Number(value)<1||Number(value)>20_160)
  throw new AppError('VALIDATION_ERROR','预计耗时应为 1～20160 分钟。');
 return value as number;
}
function scheduledAt(value:unknown,field:string):string|null{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))
  throw new AppError('VALIDATION_ERROR',field+'需使用 UTC ISO 日期。');
 const canonical=new Date(value).toISOString();
 if(canonical!==value.replace(/Z$/,value.includes('.')?'Z':'.000Z'))throw new AppError('VALIDATION_ERROR',field+'不是有效日历日期。');
 return canonical;
}
function validateSchedule(start:string|null,end:string|null){
 if(!start&&end)throw new AppError('VALIDATION_ERROR','设置结束时间前需要先安排开始时间。');
 if(start&&end&&Date.parse(end)<=Date.parse(start))throw new AppError('VALIDATION_ERROR','日程结束时间必须晚于开始时间。');
}
export class PlanningService {
 constructor(private db:Database,private catalog:CatalogService,private now=()=>new Date().toISOString()){}
 list(){
  return this.db.raw.prepare("SELECT * FROM tasks ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,created_at DESC,id").all();
 }
 create(input:unknown){
  const data=record(input),object_id=optionalId(data.object_id);
  if(object_id)this.catalog.get(object_id);
  const scheduled_start=scheduledAt(data.scheduled_start,'日程开始时间');
  const scheduled_end=scheduledAt(data.scheduled_end,'日程结束时间');
  validateSchedule(scheduled_start,scheduled_end);
  const at=this.now(),task={
   id:randomUUID(),title:title(data.title),object_id,status:'open',created_at:at,updated_at:at,
   due_at:dueDate(data.due_at),estimated_minutes:estimate(data.estimated_minutes),planned_for:plannedDate(data.planned_for),
   scheduled_start,scheduled_end
  };
  this.db.transaction(()=>this.db.raw.prepare(
   'INSERT INTO tasks (id,title,object_id,status,created_at,updated_at,due_at,estimated_minutes,planned_for,scheduled_start,scheduled_end) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(task.id,task.title,task.object_id,task.status,at,at,task.due_at,task.estimated_minutes,task.planned_for,task.scheduled_start,task.scheduled_end));
  return task;
 }
 updateDetails(id:string,input:unknown){
  const data=record(input),fields=['due_at','estimated_minutes','planned_for','scheduled_start','scheduled_end'] as const;
  if(!fields.some(k=>Object.hasOwn(data,k)))throw new AppError('VALIDATION_ERROR','没有需要修改的任务属性。');
  return this.db.transaction(()=>{
   const task=this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(requiredId(id)) as Record<string,unknown>|undefined;
   if(!task)throw new AppError('NOT_FOUND','任务不存在。');
   if(task.status!=='open')throw new AppError('CONFLICT','已完成任务不可修改。');
   const due=Object.hasOwn(data,'due_at')?dueDate(data.due_at):task.due_at as string|null;
   const minutes=Object.hasOwn(data,'estimated_minutes')?estimate(data.estimated_minutes):task.estimated_minutes as number|null;
   const planned=Object.hasOwn(data,'planned_for')?plannedDate(data.planned_for):task.planned_for as string|null;
   const scheduled_start=Object.hasOwn(data,'scheduled_start')?scheduledAt(data.scheduled_start,'日程开始时间'):task.scheduled_start as string|null;
   const scheduled_end=Object.hasOwn(data,'scheduled_end')?scheduledAt(data.scheduled_end,'日程结束时间'):task.scheduled_end as string|null;
   validateSchedule(scheduled_start,scheduled_end);
   this.db.raw.prepare('UPDATE tasks SET due_at=?,estimated_minutes=?,planned_for=?,scheduled_start=?,scheduled_end=?,updated_at=? WHERE id=?')
    .run(due,minutes,planned,scheduled_start,scheduled_end,this.now(),id);
   return this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  });
 }
 setPreference(id:string,input:unknown){
  const data=record(input);
  if(!Number.isInteger(data.boost)||![0,1,2].includes(data.boost as number))
   throw new AppError('VALIDATION_ERROR','临时优先权重只能是 0、1、2。');
  const boost=data.boost as number,now=this.now();
  let expires:string|null=null;
  if(boost>0){
   if(typeof data.expires_at!=='string'||!Number.isFinite(Date.parse(data.expires_at))||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(data.expires_at))
    throw new AppError('VALIDATION_ERROR','需要提供本地当天结束时的 UTC 过期时间。');
   expires=new Date(data.expires_at).toISOString();
   if(expires!==data.expires_at.replace(/Z$/,data.expires_at.includes('.')?'Z':'.000Z'))
    throw new AppError('VALIDATION_ERROR','临时偏好过期日期不合法。');
   const ttl=Date.parse(expires)-Date.parse(now);
   if(ttl<=0||ttl>36*60*60_000)throw new AppError('VALIDATION_ERROR','临时偏好必须在 36 小时内过期。');
  }
  return this.db.transaction(()=>{
   const task=this.db.raw.prepare('SELECT status FROM tasks WHERE id=?').get(requiredId(id)) as {status:string}|undefined;
   if(!task)throw new AppError('NOT_FOUND','任务不存在。');
   if(task.status!=='open')throw new AppError('CONFLICT','已完成任务不可设置优先偏好。');
   if(!boost)this.db.raw.prepare('DELETE FROM task_preferences WHERE task_id=?').run(id);
   else this.db.raw.prepare(
    'INSERT INTO task_preferences(task_id,boost,expires_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET boost=excluded.boost,expires_at=excluded.expires_at,updated_at=excluded.updated_at'
   ).run(id,boost,expires,now);
   return {task_id:id,boost,expires_at:expires};
  });
 }
 complete(id:string){
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(requiredId(id));
   if(!current)throw new AppError('NOT_FOUND','任务不存在。');
   if((current as {status:string}).status==='done')return current;
   this.db.raw.prepare("UPDATE tasks SET status='done',updated_at=? WHERE id=?").run(this.now(),id);
   this.db.raw.prepare('DELETE FROM task_preferences WHERE task_id=?').run(id);
   return this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  });
 }
 reopen(id:string){
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(requiredId(id));
   if(!current)throw new AppError('NOT_FOUND','任务不存在。');
   if((current as {status:string}).status==='open')return current;
   this.db.raw.prepare("UPDATE tasks SET status='open',updated_at=? WHERE id=?").run(this.now(),id);
   return this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  });
 }
}
