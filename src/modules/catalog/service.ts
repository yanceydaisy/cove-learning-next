import {randomUUID} from 'node:crypto';
import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {record,title,textOrNull,requiredId} from '../../core/validation.js';
export class CatalogService {
 constructor(private db:Database,private now=()=>new Date().toISOString()){}
 list(){return this.db.raw.prepare('SELECT * FROM learning_objects ORDER BY created_at DESC,id').all();}
 get(id:string){
  const result=this.db.raw.prepare('SELECT * FROM learning_objects WHERE id=?').get(requiredId(id));
  if(!result)throw new AppError('NOT_FOUND','学习对象不存在。');
  return result;
 }
 create(input:unknown){
  const data=record(input);
  if(!['course','project','track'].includes(String(data.kind)))throw new AppError('VALIDATION_ERROR','学习对象类型不合法。');
  const item={id:randomUUID(),kind:data.kind as string,title:title(data.title),description:textOrNull(data.description),created_at:this.now()};
  this.db.transaction(()=>this.db.raw.prepare('INSERT INTO learning_objects VALUES (?,?,?,?,?)').run(item.id,item.kind,item.title,item.description,item.created_at));
  return item;
 }
}
