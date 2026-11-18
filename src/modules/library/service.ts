import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,linkSync,unlinkSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,title,requiredId} from '../../core/validation.js';
const MAX_BYTES=8*1024*1024;
export class LibraryService {
 constructor(private db:Database,private blobDir:string,private now=()=>new Date().toISOString()){}
 list(){
  return this.db.raw.prepare(`SELECT r.*,v.id AS version_id,v.sha256,v.size_bytes,v.created_at AS version_created_at,
     COALESCE(i.status,'not_indexed') AS index_status,i.extractor,i.embedding_model,
     COALESCE(i.chunk_count,0) AS chunk_count,i.error_message,i.indexed_at
     FROM resources r INNER JOIN resource_versions v ON v.resource_id=r.id AND v.revision=1
     LEFT JOIN resource_index_states i ON i.resource_id=r.id
     ORDER BY r.created_at DESC,r.id`).all();
 }
 ingest(input:unknown){
  const data=record(input),name=title(data.title);
  if(typeof data.mime_type!=='string'||!/^[\w.+-]+\/[\w.+-]+$/.test(data.mime_type)||data.mime_type.length>100)throw new AppError('VALIDATION_ERROR','文件类型不合法。');
  if(typeof data.base64!=='string'||data.base64.length<1||data.base64.length>MAX_BYTES*4/3+8||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.base64))throw new AppError('VALIDATION_ERROR','文件内容不合法或过大。');
  const bytes=Buffer.from(data.base64,'base64');
  if(bytes.length===0||bytes.length>MAX_BYTES||bytes.toString('base64')!==data.base64)throw new AppError('VALIDATION_ERROR','文件内容不合法或过大。');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const id=randomUUID(),version_id=randomUUID(),at=this.now();
  mkdirSync(this.blobDir,{recursive:true,mode:0o700});
  const file=join(this.blobDir,sha256),temp=join(this.blobDir,'.tmp-'+randomUUID());
  writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
  try{
   try{linkSync(temp,file);}
   catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  }finally{unlinkSync(temp);}
  const size_bytes=bytes.length,mime_type=data.mime_type;
  this.db.transaction(()=>{
   this.db.raw.prepare('INSERT INTO resources VALUES(?,?,?,?)').run(id,name,mime_type,at);
   this.db.raw.prepare('INSERT INTO resource_versions VALUES(?,?,?,?,?,?,?)').run(version_id,id,1,sha256,size_bytes,sha256,at);
  });
  return {id,title:name,mime_type,created_at:at,version_id,sha256,size_bytes};
 }
 content(id:string){
  const result=this.db.raw.prepare(`SELECT r.title,r.mime_type,v.sha256,v.size_bytes,v.stored_name
   FROM resources r JOIN resource_versions v ON r.id=v.resource_id AND v.revision=1 WHERE r.id=?`).get(requiredId(id)) as {title:string;mime_type:string;sha256:string;size_bytes:number;stored_name:string}|undefined;
  if(!result)throw new AppError('NOT_FOUND','原始资料不存在。');
  if(!/^[a-f0-9]{64}$/.test(result.stored_name))throw new AppError('INTERNAL_ERROR','资料存储路径无效。');
  const path=join(this.blobDir,result.stored_name);
  if(!existsSync(path))throw new AppError('INTERNAL_ERROR','原始文件暂时不可读取。');
  const bytes=readFileSync(path);
  if(bytes.length!==result.size_bytes||createHash('sha256').update(bytes).digest('hex')!==result.sha256)throw new AppError('INTERNAL_ERROR','原件校验未通过。');
  return {bytes,title:result.title,mime_type:result.mime_type};
 }
}
