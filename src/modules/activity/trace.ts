import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record} from '../../core/validation.js';
import {DEFAULT_LEARNING_TIME_ZONE,localMonthBounds} from '../../core/time.js';

type Interval={started_at:string;ended_at:string};
function instant(value:unknown,field:string){
 if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/i.test(value)||!Number.isFinite(Date.parse(value)))throw new AppError('VALIDATION_ERROR',field+' 必须包含明确的时区。');
 return new Date(value).toISOString();
}
export class TraceService{
 constructor(private db:Database,private clock=()=>new Date(),private timeZone=DEFAULT_LEARNING_TIME_ZONE){}
 private focusIntervals(session:any,now:string):Interval[]{
  const logs=this.db.raw.prepare('SELECT event_type,occurred_at FROM learning_events WHERE session_id=? ORDER BY julianday(occurred_at),rowid').all(session.id) as any[];
  const result:Interval[]=[];let open:string|null=null;
  for(const log of logs){
   if(log.event_type==='focus.started'||log.event_type==='focus.resumed')open=log.occurred_at;
   else if(log.event_type==='focus.paused'||log.event_type==='focus.finished'){
    if(open&&Date.parse(log.occurred_at)>Date.parse(open))result.push({started_at:open,ended_at:log.occurred_at});
    open=null;
   }else if(log.event_type==='focus.recovery_needed')open=null;
  }
  if(open&&session.state==='running'&&session.current_started_at&&Date.parse(now)>Date.parse(session.current_started_at))result.push({started_at:session.current_started_at,ended_at:now});
  return result;
 }
 list(input:unknown={}){
  const data=record(input),now=this.clock(),nowIso=now.toISOString();
  if((data.from==null)!==(data.to==null))throw new AppError('VALIDATION_ERROR','from 和 to 必须一起提供。');
  const month=localMonthBounds(now,this.timeZone);
  const from=data.from==null?month.from:instant(data.from,'from');
  const to=data.to==null?month.to:instant(data.to,'to');
  if(Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>32*86400000)throw new AppError('VALIDATION_ERROR','轨迹查询范围必须大于零且不能超过 32 天。');
  const objects=new Map((this.db.raw.prepare('SELECT id,title,kind FROM learning_objects').all() as any[]).map(item=>[item.id,item]));
  const object=(id:string|null)=>id?objects.get(id)??null:null;
  const records=this.db.raw.prepare('SELECT * FROM learning_records WHERE julianday(started_at)<julianday(?) AND julianday(ended_at)>julianday(?)').all(to,from) as any[];
  const linkedFocus=new Set(records.map(row=>row.focus_session_id).filter(Boolean));
  const taskRows=this.db.raw.prepare("SELECT * FROM tasks WHERE status='done' AND julianday(COALESCE(completed_at,updated_at))>=julianday(?) AND julianday(COALESCE(completed_at,updated_at))<julianday(?)").all(from,to) as any[];
  const taskTitles=new Map((this.db.raw.prepare('SELECT id,title FROM tasks').all() as any[]).map(item=>[item.id,item.title]));
  const focus=this.db.raw.prepare("SELECT * FROM focus_sessions WHERE julianday(started_at)<julianday(?) AND julianday(CASE WHEN state='running' THEN ? ELSE COALESCE(ended_at,updated_at) END)>=julianday(?)").all(to,nowIso,from) as any[];
  const events:any[]=[];
  for(const row of records){
   let tags:string[]=[];try{tags=JSON.parse(row.tags_json)}catch{}
   events.push({
    id:'record:'+row.id,record_id:row.id,kind:'record',activity_type:row.activity_type,title:row.title,
    occurred_at:row.started_at,started_at:row.started_at,ended_at:row.ended_at,
    elapsed_ms:Math.max(0,Date.parse(row.ended_at)-Date.parse(row.started_at)),focused_ms:row.focused_minutes*60000,
    intervals:[{started_at:row.started_at,ended_at:row.ended_at}],summary:row.summary,note:row.note,next_action:row.next_action,tags,
    object:object(row.object_id),task:row.task_id?{id:row.task_id,title:taskTitles.get(row.task_id)??''}:null,
    focus_session_id:row.focus_session_id,time_zone:row.time_zone,local_date:row.local_date,source:row.source,status:'completed',time_source:'recorded'
   });
  }
  for(const session of focus){
   if(linkedFocus.has(session.id))continue;
   const running=session.state==='running'&&session.current_started_at?Math.max(0,now.getTime()-Date.parse(session.current_started_at)):0;
   const focused_ms=Math.max(0,Number(session.accumulated_ms)||0)+running;
   if(focused_ms<=0)continue;
   const end=session.state==='running'?nowIso:session.ended_at||session.updated_at;
   const intervals=this.focusIntervals(session,nowIso);
   events.push({
    id:'focus:'+session.id,focus_session_id:session.id,kind:'focus',activity_type:'study',title:'专注 '+Math.max(1,Math.floor(focused_ms/60000))+' 分钟',
    occurred_at:session.started_at,started_at:session.started_at,ended_at:end,
    elapsed_ms:Math.max(0,Date.parse(end)-Date.parse(session.started_at)),focused_ms,intervals,
    summary:null,note:null,next_action:null,tags:[],object:object(session.object_id),task:session.task_id?{id:session.task_id,title:taskTitles.get(session.task_id)??''}:null,source:'focus',
    status:session.state,time_source:intervals.length?'recorded':'legacy'
   });
  }
  for(const task of taskRows){
   events.push({
    id:'task:'+task.id,task_id:task.id,kind:'task',activity_type:'task',title:task.title,
    occurred_at:task.completed_at||task.updated_at,started_at:null,ended_at:null,elapsed_ms:0,focused_ms:null,intervals:[],
    summary:null,note:null,next_action:null,tags:[],object:object(task.object_id),task:{id:task.id,title:task.title},source:'task',
    status:'completed',time_source:task.completed_at?'recorded':'legacy_updated_at'
   });
  }
  events.sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.id.localeCompare(b.id));
  const latest=this.db.raw.prepare("SELECT at FROM (SELECT started_at AS at FROM learning_records UNION ALL SELECT started_at AS at FROM focus_sessions WHERE accumulated_ms>0 OR state='running' UNION ALL SELECT COALESCE(completed_at,updated_at) AS at FROM tasks WHERE status='done') ORDER BY julianday(at) DESC LIMIT 1").get() as {at:string}|undefined;
  return {range:{from,to},generated_at:nowIso,latest_at:latest?.at??null,events};
 }
}
