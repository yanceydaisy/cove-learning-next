import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,title,textOrNull,optionalId,requiredId} from '../../core/validation.js';
import type {CatalogService} from '../catalog/service.js';

const taskTypes=['assignment','exam','review','practice','reading','project','admin','other'] as const;
const workflowStates=['todo','in_progress','waiting','blocked'] as const;

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
function enumOrNull<T extends readonly string[]>(value:unknown,values:T,field:string):T[number]|null{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!values.includes(value as T[number]))throw new AppError('VALIDATION_ERROR',field+' 不合法。');
 return value as T[number];
}
function workflowState(value:unknown,fallback='todo'){
 if(value===undefined)return fallback;
 if(typeof value!=='string'||!workflowStates.includes(value as typeof workflowStates[number]))throw new AppError('VALIDATION_ERROR','执行状态不合法。');
 return value;
}
function percent(value:unknown):number|null{
 if(value==null||value==='')return null;
 if(!Number.isInteger(value)||Number(value)<0||Number(value)>100)throw new AppError('VALIDATION_ERROR','任务进度必须是 0～100 的整数。');
 return value as number;
}
function remaining(value:unknown):number|null{
 if(value==null||value==='')return null;
 if(!Number.isInteger(value)||Number(value)<0||Number(value)>20_160)throw new AppError('VALIDATION_ERROR','剩余耗时应为 0～20160 分钟。');
 return value as number;
}
function validateExecution(state:string,reason:string|null){
 if(state!=='blocked'&&reason)throw new AppError('VALIDATION_ERROR','只有阻塞任务可以设置 blocked_reason。');
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
  const workflow_state=workflowState(data.workflow_state);
  const blocked_reason=textOrNull(data.blocked_reason,1200);
  validateExecution(workflow_state,blocked_reason);
  const at=this.now(),task={
   id:randomUUID(),title:title(data.title),object_id,status:'open',created_at:at,updated_at:at,
   due_at:dueDate(data.due_at),estimated_minutes:estimate(data.estimated_minutes),planned_for:plannedDate(data.planned_for),
   scheduled_start,scheduled_end,description:textOrNull(data.description,4000),
   task_type:enumOrNull(data.task_type,taskTypes,'任务类型'),workflow_state,
   progress_percent:percent(data.progress_percent),remaining_minutes:remaining(data.remaining_minutes),
   available_from:scheduledAt(data.available_from,'可开始时间'),blocked_reason
  };
  this.db.transaction(()=>this.db.raw.prepare(
   'INSERT INTO tasks (id,title,object_id,status,created_at,updated_at,due_at,estimated_minutes,planned_for,scheduled_start,scheduled_end,description,task_type,workflow_state,progress_percent,remaining_minutes,available_from,blocked_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(task.id,task.title,task.object_id,task.status,at,at,task.due_at,task.estimated_minutes,task.planned_for,task.scheduled_start,task.scheduled_end,task.description,task.task_type,task.workflow_state,task.progress_percent,task.remaining_minutes,task.available_from,task.blocked_reason));
  return task;
 }
 updateDetails(id:string,input:unknown){
  const data=record(input),fields=['title','description','task_type','workflow_state','progress_percent','remaining_minutes','available_from','blocked_reason','due_at','estimated_minutes','planned_for','scheduled_start','scheduled_end'] as const;
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
   const name=Object.hasOwn(data,'title')?title(data.title):task.title as string;
   const description=Object.hasOwn(data,'description')?textOrNull(data.description,4000):task.description as string|null;
   const task_type=Object.hasOwn(data,'task_type')?enumOrNull(data.task_type,taskTypes,'任务类型'):task.task_type as string|null;
   const workflow_state=Object.hasOwn(data,'workflow_state')?workflowState(data.workflow_state):task.workflow_state as string;
   const progress_percent=Object.hasOwn(data,'progress_percent')?percent(data.progress_percent):task.progress_percent as number|null;
   const remaining_minutes=Object.hasOwn(data,'remaining_minutes')?remaining(data.remaining_minutes):task.remaining_minutes as number|null;
   const available_from=Object.hasOwn(data,'available_from')?scheduledAt(data.available_from,'可开始时间'):task.available_from as string|null;
   const blocked_reason=Object.hasOwn(data,'blocked_reason')?textOrNull(data.blocked_reason,1200):task.blocked_reason as string|null;
   validateSchedule(scheduled_start,scheduled_end);
   validateExecution(workflow_state,blocked_reason);
   this.db.raw.prepare('UPDATE tasks SET title=?,description=?,task_type=?,workflow_state=?,progress_percent=?,remaining_minutes=?,available_from=?,blocked_reason=?,due_at=?,estimated_minutes=?,planned_for=?,scheduled_start=?,scheduled_end=?,updated_at=? WHERE id=?')
    .run(name,description,task_type,workflow_state,progress_percent,remaining_minutes,available_from,blocked_reason,due,minutes,planned,scheduled_start,scheduled_end,this.now(),id);
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
   const now=this.now();
   this.db.raw.prepare("UPDATE tasks SET status='done',updated_at=?,completed_at=? WHERE id=?").run(now,now,id);
   this.db.raw.prepare('DELETE FROM task_preferences WHERE task_id=?').run(id);
   return this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  });
 }
 reopen(id:string){
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(requiredId(id));
   if(!current)throw new AppError('NOT_FOUND','任务不存在。');
   if((current as {status:string}).status==='open')return current;
   this.db.raw.prepare("UPDATE tasks SET status='open',updated_at=?,completed_at=NULL WHERE id=?").run(this.now(),id);
   return this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  });
 }
}
