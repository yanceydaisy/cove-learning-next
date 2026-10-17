import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,title,textOrNull,requiredId} from '../../core/validation.js';

const projectStatuses=['idea','active','paused','done'] as const;
function projectStatus(value:unknown,fallback:'idea'|'active'|'paused'|'done'='idea'){
 if(value===undefined)return fallback;
 if(typeof value!=='string'||!projectStatuses.includes(value as typeof projectStatuses[number]))throw new AppError('VALIDATION_ERROR','项目状态不合法。');
 return value;
}
function projectProgress(value:unknown){
 if(value==null||value==='')return null;
 if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>100)throw new AppError('VALIDATION_ERROR','项目进度必须是 0～100 的整数。');
 return value;
}

export class CatalogService {
 constructor(private db:Database,private now=()=>new Date().toISOString()){}
 list(){return this.db.raw.prepare('SELECT * FROM learning_objects ORDER BY created_at DESC,id').all();}
 get(id:string){
  const result=this.db.raw.prepare('SELECT * FROM learning_objects WHERE id=?').get(requiredId(id));
  if(!result)throw new AppError('NOT_FOUND','学习对象不存在。');
  return result;
 }
 create(input:unknown){
  const data=record(input),kind=String(data.kind);
  if(!['course','project','track'].includes(kind))throw new AppError('VALIDATION_ERROR','学习对象类型不合法。');
  const projectKeys=['project_status','project_stage','progress_percent','next_action','blocker'];
  if(kind!=='project'&&projectKeys.some(key=>data[key]!==undefined))throw new AppError('VALIDATION_ERROR','项目字段只能用于 Project。');
  const created_at=this.now();
  const item={
   id:randomUUID(),kind,title:title(data.title),description:textOrNull(data.description,1200),created_at,
   project_status:kind==='project'?projectStatus(data.project_status):null,
   project_stage:kind==='project'?textOrNull(data.project_stage,160):null,
   progress_percent:kind==='project'?(data.progress_percent===undefined?0:projectProgress(data.progress_percent)):null,
   next_action:kind==='project'?textOrNull(data.next_action,1200):null,
   blocker:kind==='project'?textOrNull(data.blocker,1200):null,
   updated_at:created_at
  };
  this.db.transaction(()=>this.db.raw.prepare(`INSERT INTO learning_objects
   (id,kind,title,description,created_at,project_status,project_stage,progress_percent,next_action,blocker,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    item.id,item.kind,item.title,item.description,item.created_at,item.project_status,item.project_stage,
    item.progress_percent,item.next_action,item.blocker,item.updated_at
   ));
  return item;
 }
 update(id:string,input:unknown){
  const objectId=requiredId(id),current=this.get(objectId) as Record<string,unknown>,data=record(input);
  const allowed=['title','description','project_status','project_stage','progress_percent','next_action','blocker'];
  const supplied=allowed.filter(key=>Object.prototype.hasOwnProperty.call(data,key));
  if(!supplied.length)throw new AppError('VALIDATION_ERROR','没有可更新的学习对象字段。');
  const projectKeys=['project_status','project_stage','progress_percent','next_action','blocker'];
  if(current.kind!=='project'&&projectKeys.some(key=>Object.prototype.hasOwnProperty.call(data,key)))throw new AppError('VALIDATION_ERROR','项目字段只能用于 Project。');
  const updates:Array<[string,any]>=[];
  if(Object.prototype.hasOwnProperty.call(data,'title'))updates.push(['title',title(data.title)]);
  if(Object.prototype.hasOwnProperty.call(data,'description'))updates.push(['description',textOrNull(data.description,1200)]);
  if(Object.prototype.hasOwnProperty.call(data,'project_status'))updates.push(['project_status',projectStatus(data.project_status,current.project_status as any)]);
  if(Object.prototype.hasOwnProperty.call(data,'project_stage'))updates.push(['project_stage',textOrNull(data.project_stage,160)]);
  if(Object.prototype.hasOwnProperty.call(data,'progress_percent'))updates.push(['progress_percent',projectProgress(data.progress_percent)]);
  if(Object.prototype.hasOwnProperty.call(data,'next_action'))updates.push(['next_action',textOrNull(data.next_action,1200)]);
  if(Object.prototype.hasOwnProperty.call(data,'blocker'))updates.push(['blocker',textOrNull(data.blocker,1200)]);
  const updated_at=this.now();updates.push(['updated_at',updated_at]);
  const set=updates.map(([key])=>key+'=?').join(',');
  this.db.transaction(()=>this.db.raw.prepare('UPDATE learning_objects SET '+set+' WHERE id=?').run(...updates.map(([,value])=>value),objectId));
  return this.get(objectId);
 }
}
