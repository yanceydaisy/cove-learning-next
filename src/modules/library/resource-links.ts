import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {requiredId} from '../../core/validation.js';

export type ResourceLinkKind='task'|'record';

// Distinct FK-backed tables keep links valid without polymorphic, unverified target IDs.
const targets={
 task:{table:'task_resource_links',key:'task_id',owner:'tasks'},
 record:{table:'learning_record_resource_links',key:'record_id',owner:'learning_records'}
} as const;

export class ResourceLinksService {
 constructor(private db:Database,private now=()=>new Date().toISOString()){}
 private target(kind:ResourceLinkKind,id:string){
  const config=targets[kind];
  if(!config)throw new AppError('VALIDATION_ERROR','资料关联类型只能是 task 或 record。');
  const targetId=requiredId(id);
  const exists=this.db.raw.prepare('SELECT id FROM '+config.owner+' WHERE id=?').get(targetId);
  if(!exists)throw new AppError('NOT_FOUND',kind==='task'?'任务不存在。':'学习记录不存在。');
  return {config,targetId};
 }
 list(kind:ResourceLinkKind,id:string){
  const {config,targetId}=this.target(kind,id);
  const items=this.db.raw.prepare(
   'SELECT r.id AS resource_id,r.title,r.mime_type,r.created_at,v.id AS version_id,v.sha256,v.size_bytes,l.created_at AS linked_at'+
   ' FROM '+config.table+' l JOIN resources r ON r.id=l.resource_id'+
   ' JOIN resource_versions v ON v.resource_id=r.id AND v.revision=1'+
   ' WHERE l.'+config.key+'=? ORDER BY l.created_at,r.id'
  ).all(targetId);
  return {kind,target_id:targetId,count:items.length,items};
 }
 set(kind:ResourceLinkKind,id:string,resourceId:string,linked:boolean){
  const {config,targetId}=this.target(kind,id);
  const resource=requiredId(resourceId);
  if(typeof linked!=='boolean')throw new AppError('VALIDATION_ERROR','linked 必须是布尔值。');
  if(!this.db.raw.prepare('SELECT id FROM resources WHERE id=?').get(resource))
   throw new AppError('NOT_FOUND','关联资料不存在。');
  return this.db.transaction(()=>{
   if(linked)this.db.raw.prepare(
    'INSERT INTO '+config.table+'('+config.key+',resource_id,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING'
   ).run(targetId,resource,this.now());
   else this.db.raw.prepare('DELETE FROM '+config.table+' WHERE '+config.key+'=? AND resource_id=?').run(targetId,resource);
   return this.list(kind,targetId);
  });
 }
}
