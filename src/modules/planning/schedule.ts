
import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {optionalId,record,requiredId,textOrNull,title} from '../../core/validation.js';
import type {CatalogService} from '../catalog/service.js';

function localDate(value:unknown,field='日期'):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||
  !Number.isFinite(Date.parse(value+'T12:00:00Z'))||
  new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)
  throw new AppError('VALIDATION_ERROR',field+'应为 YYYY-MM-DD。');
 return value;
}
function clock(value:unknown,field:string):string{
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
  throw new AppError('VALIDATION_ERROR',field+'应为 HH:MM。');
 return value;
}
function weekday(value:unknown):number{
 if(!Number.isInteger(value)||Number(value)<1||Number(value)>7)
  throw new AppError('VALIDATION_ERROR','星期应为 1～7（周一到周日）。');
 return Number(value);
}
function isoWeekday(date:string){
 const day=new Date(date+'T12:00:00Z').getUTCDay();
 return day===0?7:day;
}

export class ScheduleService{
 constructor(private db:Database,private catalog:CatalogService,private now=()=>new Date().toISOString()){}

 list(){
  return this.db.raw.prepare(
   'SELECT * FROM weekly_schedule_entries ORDER BY weekday,start_time,title,id'
  ).all();
 }

 forDate(inputDate:string){
  const date=localDate(inputDate),day=isoWeekday(date);
  return this.db.raw.prepare(
   `SELECT * FROM weekly_schedule_entries
    WHERE weekday=? AND effective_from<=?
      AND (effective_until IS NULL OR effective_until>=?)
    ORDER BY start_time,end_time,title,id`
  ).all(day,date,date);
 }

 create(input:unknown){
  const data=record(input),object_id=optionalId(data.object_id);
  if(object_id){
   const object=this.catalog.get(object_id) as {kind:string};
   if(object.kind!=='course')throw new AppError('CONFLICT','固定课表只能关联课程。');
  }
  const start_time=clock(data.start_time,'开始时间'),end_time=clock(data.end_time,'结束时间');
  if(start_time>=end_time)throw new AppError('VALIDATION_ERROR','结束时间必须晚于开始时间。');
  const effective_from=localDate(data.effective_from,'生效日期');
  const effective_until=data.effective_until==null||data.effective_until===''?null:localDate(data.effective_until,'结束日期');
  if(effective_until&&effective_until<effective_from)throw new AppError('VALIDATION_ERROR','课表结束日期不能早于生效日期。');
  const at=this.now(),item={
   id:randomUUID(),object_id,title:title(data.title),location:textOrNull(data.location,160),weekday:weekday(data.weekday),
   start_time,end_time,effective_from,effective_until,created_at:at,updated_at:at
  };
  this.db.transaction(()=>this.db.raw.prepare(
   'INSERT INTO weekly_schedule_entries(id,object_id,title,location,weekday,start_time,end_time,effective_from,effective_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  ).run(item.id,item.object_id,item.title,item.location,item.weekday,item.start_time,item.end_time,item.effective_from,item.effective_until,item.created_at,item.updated_at));
  return item;
 }

 update(id:string,input:unknown){
  const data=record(input);
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM weekly_schedule_entries WHERE id=?').get(requiredId(id)) as Record<string,unknown>|undefined;
   if(!current)throw new AppError('NOT_FOUND','课表条目不存在。');
   let object_id=current.object_id as string|null;
   if(Object.hasOwn(data,'object_id')){
    object_id=optionalId(data.object_id);
    if(object_id){
     const object=this.catalog.get(object_id) as {kind:string};
     if(object.kind!=='course')throw new AppError('CONFLICT','固定课表只能关联课程。');
    }
   }
   const next={
    title:Object.hasOwn(data,'title')?title(data.title):current.title as string,
    location:Object.hasOwn(data,'location')?textOrNull(data.location,160):current.location as string|null,
    weekday:Object.hasOwn(data,'weekday')?weekday(data.weekday):current.weekday as number,
    start_time:Object.hasOwn(data,'start_time')?clock(data.start_time,'开始时间'):current.start_time as string,
    end_time:Object.hasOwn(data,'end_time')?clock(data.end_time,'结束时间'):current.end_time as string,
    effective_from:Object.hasOwn(data,'effective_from')?localDate(data.effective_from,'生效日期'):current.effective_from as string,
    effective_until:Object.hasOwn(data,'effective_until')
     ?(data.effective_until==null||data.effective_until===''?null:localDate(data.effective_until,'结束日期'))
     :current.effective_until as string|null,
    object_id
   };
   if(next.start_time>=next.end_time)throw new AppError('VALIDATION_ERROR','结束时间必须晚于开始时间。');
   if(next.effective_until&&next.effective_until<next.effective_from)throw new AppError('VALIDATION_ERROR','课表结束日期不能早于生效日期。');
   this.db.raw.prepare(
    'UPDATE weekly_schedule_entries SET object_id=?,title=?,location=?,weekday=?,start_time=?,end_time=?,effective_from=?,effective_until=?,updated_at=? WHERE id=?'
   ).run(next.object_id,next.title,next.location,next.weekday,next.start_time,next.end_time,next.effective_from,next.effective_until,this.now(),id);
   return this.db.raw.prepare('SELECT * FROM weekly_schedule_entries WHERE id=?').get(id);
  });
 }
}

[executed on device: cove-prod-01 (996ee891-1352-4542-8974-83a3c70e71d0)]