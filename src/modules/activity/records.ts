import {randomUUID,createHash} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {optionalId,requiredId,record,textOrNull,title} from '../../core/validation.js';
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
 if(typeof value!=='string'||value.length>80||!/(Z|[+-]\d{2}:\d{2})$/i.test(value)||Number.isNaN(Date.parse(value)))throw new AppError('VALIDATION_ERROR',field+' 必须包含明确的时区偏移或 Z。');
 return new Date(value).toISOString();
}
function wholeMinutes(value:unknown,field:string,max=1440){
 if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>max)throw new AppError('VALIDATION_ERROR',field+' 不合法。');
 return value;
}
function tagsField(value:unknown){
 if(value==null)return [] as string[];
 if(!Array.isArray(value)||value.length>20)throw new AppError('VALIDATION_ERROR','tags 不合法。');
 const result:string[]=[];
 for(const raw of value){
  if(typeof raw!=='string')throw new AppError('VALIDATION_ERROR','tags 不合法。');
  const item=raw.trim();if(!item||item.length>40)throw new AppError('VALIDATION_ERROR','tag 不合法。');
  if(!result.includes(item))result.push(item);
 }
 return result;
}
export class LearningRecordsService {
 constructor(private db:Database,private catalog:CatalogService,private now=()=>new Date().toISOString()){}
 private present(row:any){
  const {tags_json,...rest}=row;
  let tags:string[]=[];try{tags=JSON.parse(tags_json||'[]')}catch{}
  return {...rest,tags};
 }
 get(id:string){
  const row=this.db.raw.prepare('SELECT * FROM learning_records WHERE id=?').get(requiredId(id));
  if(!row)throw new AppError('NOT_FOUND','学习记录不存在。');
  return this.present(row);
 }
 list(input:unknown={}){
  const data=record(input),where:string[]=[],params:any[]=[];
  if(data.local_date!=null){where.push('local_date=?');params.push(dateField(data.local_date))}
  if(data.object_id!=null){where.push('object_id=?');params.push(optionalId(data.object_id))}
  if(data.task_id!=null){where.push('task_id=?');params.push(optionalId(data.task_id))}
  const limit=data.limit==null?100:wholeMinutes(data.limit,'limit',200);
  const offset=data.offset==null?0:wholeMinutes(data.offset,'offset',1_000_000);
  return (this.db.raw.prepare('SELECT * FROM learning_records'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY started_at DESC,id DESC LIMIT ? OFFSET ?').all(...params,limit,offset) as any[]).map(row=>this.present(row));
 }
 private values(data:Record<string,unknown>){
  const local_date=dateField(data.local_date),started_at=instant(data.started_at,'started_at'),ended_at=instant(data.ended_at,'ended_at');
  const start=Date.parse(started_at),end=Date.parse(ended_at),elapsed_minutes=Math.max(1,Math.round((end-start)/60000));
  if(end<=start||end-start>86400000)throw new AppError('VALIDATION_ERROR','记录结束时间必须晚于开始时间，且单条不能超过 24 小时。');
  let focused_minutes=data.focused_minutes==null?elapsed_minutes:wholeMinutes(data.focused_minutes,'focused_minutes');
  if(focused_minutes>elapsed_minutes)throw new AppError('VALIDATION_ERROR','focused_minutes 不能大于实际经过时长。');
  let object_id=optionalId(data.object_id),task_id=optionalId(data.task_id);
  if(object_id)this.catalog.get(object_id);
  if(task_id){
   const task=this.db.raw.prepare('SELECT id,object_id FROM tasks WHERE id=?').get(task_id) as any;
   if(!task)throw new AppError('NOT_FOUND','关联任务不存在。');
   if(!object_id&&task.object_id)object_id=task.object_id;
   if(object_id&&task.object_id&&object_id!==task.object_id)throw new AppError('VALIDATION_ERROR','学习记录关联对象与任务所属对象不一致。');
  }
  const focus_session_id=optionalId(data.focus_session_id);
  if(focus_session_id){
   const session=this.db.raw.prepare('SELECT * FROM focus_sessions WHERE id=?').get(focus_session_id) as any;
   if(!session)throw new AppError('NOT_FOUND','关联专注会话不存在。');
   if(session.state!=='finished'||start!==Date.parse(session.started_at)||end!==Date.parse(session.ended_at))throw new AppError('VALIDATION_ERROR','关联专注记录必须覆盖已结束会话的完整起止时间。');
   if(object_id&&session.object_id&&object_id!==session.object_id)throw new AppError('VALIDATION_ERROR','学习记录与专注会话的关联对象不一致。');
   if(!object_id)object_id=session.object_id;
   if(data.focused_minutes==null)focused_minutes=Math.min(elapsed_minutes,Math.floor(Number(session.accumulated_ms)/60000));
   if(focused_minutes>Math.ceil(Number(session.accumulated_ms)/60000))throw new AppError('VALIDATION_ERROR','专注分钟数不能超过关联会话的真实累计时长。');
  }
  const activity_type=typeof data.activity_type==='string'?data.activity_type:'study';
  if(!activityTypes.has(activity_type))throw new AppError('VALIDATION_ERROR','activity_type 不合法。');
  const source=typeof data.source==='string'?data.source:'manual';
  if(!sources.has(source))throw new AppError('VALIDATION_ERROR','source 不合法。');
  const time_zone=textOrNull(data.time_zone,80);
  if(time_zone){
   let parts:Intl.DateTimeFormatPart[];
   try{parts=new Intl.DateTimeFormat('en-CA',{timeZone:time_zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(start))}catch{throw new AppError('VALIDATION_ERROR','time_zone 必须是有效 IANA 时区。')}
   const part=(type:string)=>parts.find(item=>item.type===type)!.value;
   if(local_date!==[part('year'),part('month'),part('day')].join('-'))throw new AppError('VALIDATION_ERROR','local_date 必须与记录在指定时区的开始日期一致。');
  }
  const idempotency_key=textOrNull(data.idempotency_key,120);
  if(idempotency_key&&!/^[A-Za-z0-9._:-]+$/.test(idempotency_key))throw new AppError('VALIDATION_ERROR','idempotency_key 格式不合法。');
  return {local_date,started_at,ended_at,elapsed_minutes,focused_minutes,title:title(data.title),summary:textOrNull(data.summary,4000),activity_type,object_id,task_id,next_action:textOrNull(data.next_action,1200),note:textOrNull(data.note,4000),tags:tagsField(data.tags),source,focus_session_id,time_zone,idempotency_key};
 }
 private ensureUnique(value:ReturnType<LearningRecordsService['values']>,exceptId?:string){
  if(value.focus_session_id){
   const row=this.db.raw.prepare('SELECT id FROM learning_records WHERE focus_session_id=?').get(value.focus_session_id) as any;
   if(row&&row.id!==exceptId)throw new AppError('CONFLICT','这个专注会话已经关联了学习记录。');
  }
 }
 // Backfill keeps provenance and uncertainty visible, and is atomic across records.
 backfill(entries:unknown,dryRun=false){
  if(!Array.isArray(entries)||entries.length<1||entries.length>20)
   throw new AppError('VALIDATION_ERROR','单次补录数量须为 1～20 条。');
  const prepared=entries.map((raw:unknown)=>{
   const item=record(raw);
   if(item.time_precision!=='exact'&&item.time_precision!=='estimated')
    throw new AppError('VALIDATION_ERROR','时间精度必须是 exact 或 estimated。');
   const evidence=typeof item.evidence_note==='string'?item.evidence_note.trim():'';
   if(!evidence||evidence.length>500)
    throw new AppError('VALIDATION_ERROR','每条补录都必须填写聊天/笔记依据。');
   const userNote=typeof item.note==='string'?item.note.trim():'';
   const note=[userNote,'补录依据：'+evidence,'时间精度：'+(item.time_precision==='estimated'?'估计，非计时器实测':'有明确时间证据')].filter(Boolean).join('\n');
   const originalTags=item.tags??[];
   if(!Array.isArray(originalTags))throw new AppError('VALIDATION_ERROR','tags 必须是数组。');
   const tags=Array.from(new Set([...originalTags,'历史补录',item.time_precision==='estimated'?'时间估计':'时间已核实']));
   const identity=[item.local_date,item.started_at,item.ended_at,item.title,item.object_id??'',item.task_id??''];
   const key='backfill-v1:'+createHash('sha256').update(JSON.stringify(identity)).digest('hex');
   const value=this.values({...item,note,tags,source:'import',idempotency_key:key,focused_minutes:item.focused_minutes??0});
   const keyed=this.db.raw.prepare('SELECT * FROM learning_records WHERE idempotency_key=?').get(key) as any;
   if(keyed){
    const old=this.present(keyed);
    if(Object.entries(value).some(([k,v])=>JSON.stringify(old[k])!==JSON.stringify(v)))
     throw new AppError('CONFLICT','相同学习片段已补录但内容有变化，请修改原记录。');
   }
   const matched=this.db.raw.prepare("SELECT * FROM learning_records WHERE local_date=? AND started_at=? AND ended_at=? AND title=? AND COALESCE(object_id,'')=COALESCE(?,'') AND COALESCE(task_id,'')=COALESCE(?,'') LIMIT 1")
    .get(value.local_date,value.started_at,value.ended_at,value.title,value.object_id,value.task_id) as any;
   return {value,existing:keyed??matched};
  });
  const keys=prepared.map(p=>p.value.idempotency_key);
  if(new Set(keys).size!==keys.length)throw new AppError('VALIDATION_ERROR','同批次包含重复学习片段。');
  const format=(list:Array<{status:string;record:any}>)=>({
    dry_run:dryRun,total:list.length,
    created:list.filter(x=>x.status==='created').length,
    existing:list.filter(x=>x.status==='existing').length,records:list
  });
  if(dryRun)return format(prepared.map(p=>({
   status:p.existing?'existing':'created',
   record:p.existing?this.present(p.existing):{...p.value}
  })));
  this.db.raw.exec('BEGIN IMMEDIATE');
  try{
   const result=prepared.map(p=>({
    status:p.existing?'existing':'created',
    record:p.existing?this.present(p.existing):this.create(p.value)
   }));
   this.db.raw.exec('COMMIT');
   return format(result);
  }catch(err){this.db.raw.exec('ROLLBACK');throw err;}
 }

 create(input:unknown){
  const value=this.values(record(input));
  if(value.idempotency_key){
   const previous=this.db.raw.prepare('SELECT * FROM learning_records WHERE idempotency_key=?').get(value.idempotency_key) as any;
   if(previous){
    const presented=this.present(previous);
    if(Object.entries(value).some(([key,item])=>JSON.stringify(presented[key])!==JSON.stringify(item)))throw new AppError('CONFLICT','相同幂等键对应的记录内容不同。');
    return presented;
   }
  }
  this.ensureUnique(value);
  const id=randomUUID(),now=this.now(),{tags,...columns}=value,fields={id,...columns,tags_json:JSON.stringify(tags),created_at:now,updated_at:now};
  const names=Object.keys(fields);
  this.db.raw.prepare('INSERT INTO learning_records ('+names.join(',')+') VALUES ('+names.map(()=>'?').join(',')+')').run(...Object.values(fields));
  return this.get(id);
 }
 update(id:string,input:unknown){
  const current=this.get(id),patch=record(input);
  const value=this.values({...current,...patch,source:current.source,idempotency_key:current.idempotency_key});
  this.ensureUnique(value,id);
  const {tags,...columns}=value,fields={...columns,tags_json:JSON.stringify(tags),updated_at:this.now()};
  this.db.raw.prepare('UPDATE learning_records SET '+Object.keys(fields).map(name=>name+'=?').join(',')+' WHERE id=?').run(...Object.values(fields),id);
  return this.get(id);
 }
}
