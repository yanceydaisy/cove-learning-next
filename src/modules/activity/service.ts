
import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,optionalId,requiredId} from '../../core/validation.js';
import type {CatalogService} from '../catalog/service.js';
export class ActivityService {
 constructor(private db:Database,private catalog:CatalogService,private clock=()=>new Date()) { this.recoverInterrupted(); }
 private recoverInterrupted(){
  const running=this.db.raw.prepare("SELECT id FROM focus_sessions WHERE state='running'").get() as {id:string}|undefined;
  if(!running)return;
  // After restart, unobserved time must never be presented as real focused time.
  this.db.transaction(()=>{
   const now=this.now();
   this.db.raw.prepare("UPDATE focus_sessions SET state='paused',current_started_at=NULL,updated_at=? WHERE id=?").run(now,running.id);
   this.event(running.id,'focus.recovery_needed',now,JSON.stringify({reason:'unverified_interval_after_restart'}));
  });
 }
 private now(){return this.clock().toISOString();}
 private event(session_id:string,event_type:string,at:string,payload='{}'){
  this.db.raw.prepare('INSERT INTO learning_events VALUES (?,?,?,?,?)').run(randomUUID(),session_id,event_type,at,payload);
 }
 active(){return this.db.raw.prepare("SELECT * FROM focus_sessions WHERE state IN ('running','paused') LIMIT 1").get()??null;}
 recent(){return this.db.raw.prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC,id DESC LIMIT 12').all();}
 events(id:string){return this.db.raw.prepare('SELECT * FROM learning_events WHERE session_id=? ORDER BY occurred_at,id').all(requiredId(id));}
 start(input:unknown={}){
  const data=record(input),object_id=optionalId(data.object_id);
  if(object_id)this.catalog.get(object_id);
  return this.db.transaction(()=>{
   const previous=this.active();
   if(previous)throw new AppError('CONFLICT','已有学习会话，请先继续或结束。',{active_session_id:previous.id});
   const id=randomUUID(),now=this.now();
   this.db.raw.prepare("INSERT INTO focus_sessions VALUES (?,?,?,?,?,?,?,?)").run(id,'running',now,now,0,null,object_id,now);
   this.event(id,'focus.started',now);
   return this.db.raw.prepare('SELECT * FROM focus_sessions WHERE id=?').get(id);
  });
 }
 private change(id:string,operation:'pause'|'resume'|'finish'){
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM focus_sessions WHERE id=?').get(requiredId(id)) as {id:string;state:string;current_started_at:string|null;accumulated_ms:number}|undefined;
   if(!current)throw new AppError('NOT_FOUND','专注会话不存在。');
   if(operation==='pause'&&current.state!=='running'||operation==='resume'&&current.state!=='paused'||operation==='finish'&&current.state==='finished')throw new AppError('CONFLICT','当前专注状态不允许该操作。');
   const now=this.now(),delta=current.state==='running'&&current.current_started_at?Math.max(0,Date.parse(now)-Date.parse(current.current_started_at)):0;
   const accumulated=current.accumulated_ms+delta;
   const state=operation==='finish'?'finished':operation==='pause'?'paused':'running';
   const runningSince=state==='running'?now:null;
   this.db.raw.prepare('UPDATE focus_sessions SET state=?,current_started_at=?,accumulated_ms=?,ended_at=?,updated_at=? WHERE id=?')
    .run(state,runningSince,accumulated,state==='finished'?now:null,now,id);
   this.event(id,'focus.'+({pause:'paused',resume:'resumed',finish:'finished'}[operation]),now);
   return this.db.raw.prepare('SELECT * FROM focus_sessions WHERE id=?').get(id);
  });
 }
 pause(id:string){return this.change(id,'pause');}
 resume(id:string){return this.change(id,'resume');}
 finish(id:string){return this.change(id,'finish');}
}

[executed on device: cove-prod-01 (996ee891-1352-4542-8974-83a3c70e71d0)]