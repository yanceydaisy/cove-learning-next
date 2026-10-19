import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {optionalId,record,textOrNull,title} from '../../core/validation.js';
import type {CatalogService} from '../catalog/service.js';

const activityTypes=new Set(['study','review','practice','reading','project','other']);
const sources=new Set(['manual','focus','mcp','import']);
function dateField(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new AppError('VALIDATION_ERROR','local_date 必须是 YYYY-MM-DD。');
 const d=new Date(value+'T00:00:00Z');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw new AppError('VALIDATION_ERROR','local_date 不是有效日期。');
 return value;
}
function instant(value:unknown,field:string){
 if(typeof value!=='string'||value.length>80||Number.isNaN(Date.parse(value)))throw new AppError('VALIDATION_ERROR',field+' 必须是有效 ISO 日期时间。');
 return value;
}
function wholeMinutes(value:unknown,field:string,max=24*60){
 if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>max)throw new AppError('VALIDATION_ERROR',field+' 不合法。');
 return value;
}
function tagsField(value:unknown){
 if(value==null)return [] as string[];
 if(!Array.isArray(value)||value.length>20)throw new AppError('VALIDATION_ERROR','tags 不合法。');
 const result:string[]=[];
 for(const raw of value){
  if(typeof raw!=='string')throw new AppError('VALIDATION_ERROR','tags 不合法。');
  const item=raw.trim();
  if(!item||item.length>40)throw new AppError('VALIDATION_ERROR','tag 不合法。');
  if(!result.includes(item))result.push(item);
 }
 return result;
}
export class LearningRecordsService {
 constructor(private db:Database,private catalog:CatalogService,private now=()=>new Date().toISOString()){}
 private present(row:any){
  const {tags_json,...rest}=row;
  let tags:string[]=[];try{tags=JSON.parse(tags_json||'[]');}catch{}
  return {...rest,tags};
 }
 list(input:unknown={}){
  const data=record(input),where:string[]=[],params:any[]=[];
  if(data.local_date!=null){where.push('local_date=?');params.push(dateField(data.local_date));}
  if(data.object_id!=null){where.push('object_id=?');params.push(optionalId(data.object_id));}
  if(data.task_id!=null){where.push('task_id=?');params.push(optionalId(data.task_id));}
  const limit=data.limit==null?100:wholeMinutes(data.limit,'limit',200);
  const sql='SELECT * FROM learning_records'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY started_at DESC,id DESC LIMIT ?';
  return (this.db.raw.prepare(sql).all(...params,limit) as any[]).map(row=>this.present(row));
 }
 create(input:unknown){
  const data=record(input),local_date=dateField(data.local_date),started_at=instant(data.started_at,'started_at'),ended_at=instant(data.ended_at,'ended_at');
  const start=Date.parse(started_at),end=Date.parse(ended_at);
  if(end<=start)throw new AppError('VALIDATION_ERROR','ended_at 必须晚于 started_at。');
  const elapsed_minutes=Math.max(1,Math.round((end-start)/60000));
  if(elapsed_minutes>24*60)throw new AppError('VALIDATION_ERROR','单条学习记录不能超过 24 小时。');
  const focused_minutes=data.focused_minutes==null?elapsed_minutes:wholeMinutes(data.focused_minutes,'focused_minutes');
  if(focused_minutes>elapsed_minutes)throw new AppError('VALIDATION_ERROR','focused_minutes 不能大于实际经过时长。');
  let object_id=optionalId(data.object_id),task_id=optionalId(data.task_id);
  if(object_id)this.catalog.get(object_id);
  if(task_id){
   const task=this.db.raw.prepare('SELECT id,object_id FROM tasks WHERE id=?').get(task_id) as {id:string;object_id:string|null}|undefined;
   if(!task)throw new AppError('NOT_FOUND','关联任务不存在。');
   if(!object_id&&task.object_id)object_id=task.object_id;
   if(object_id&&task.object_id&&object_id!==task.object_id)throw new AppError('VALIDATION_ERROR','学习记录关联对象与任务所属对象不一致。');
  }
  const activity_type=typeof data.activity_type==='string'?data.activity_type:'study';
  if(!activityTypes.has(activity_type))throw new AppError('VALIDATION_ERROR','activity_type 不合法。');
  const source=typeof data.source==='string'?data.source:'manual';
  if(!sources.has(source))throw new AppError('VALIDATION_ERROR','source 不合法。');
  const tags=tagsField(data.tags),id=randomUUID(),now=this.now();
  this.db.raw.prepare(`INSERT INTO learning_records
   (id,local_date,started_at,ended_at,elapsed_minutes,focused_minutes,title,summary,activity_type,object_id,task_id,next_action,note,tags_json,source,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,local_date,started_at,ended_at,elapsed_minutes,focused_minutes,title(data.title),textOrNull(data.summary,4000),activity_type,
    object_id,task_id,textOrNull(data.next_action,1200),textOrNull(data.note,4000),JSON.stringify(tags),source,now,now
   );
  return this.present(this.db.raw.prepare('SELECT * FROM learning_records WHERE id=?').get(id));
 }
}