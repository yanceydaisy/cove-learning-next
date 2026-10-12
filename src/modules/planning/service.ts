import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,title,optionalId,requiredId} from '../../core/validation.js';
import type {CatalogService} from '../catalog/service.js';
export class PlanningService {
 constructor(private db:Database,private catalog:CatalogService,private now=()=>new Date().toISOString()){}
 list(){
  return this.db.raw.prepare('SELECT * FROM tasks ORDER BY CASE status WHEN \'open\' THEN 0 ELSE 1 END,created_at DESC,id').all();
 }
 create(input:unknown){
  const data=record(input),object_id=optionalId(data.object_id);
  if(object_id)this.catalog.get(object_id);
  const at=this.now(),task={id:randomUUID(),title:title(data.title),object_id,status:'open',created_at:at,updated_at:at};
  this.db.transaction(()=>this.db.raw.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)').run(task.id,task.title,task.object_id,task.status,at,at));
  return task;
 }
 complete(id:string){
  return this.db.transaction(()=>{
   const current=this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(requiredId(id));
   if(!current)throw new AppError('NOT_FOUND','任务不存在。');
   if(current.status==='done')return current;
   this.db.raw.prepare("UPDATE tasks SET status='done',updated_at=? WHERE id=?").run(this.now(),id);
   return this.db.raw.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  });
 }
}
