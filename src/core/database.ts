import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const steps = [
  {version:1,name:'independent_horizontal_skeleton',sql:`
CREATE TABLE learning_objects (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('course','project','track')),
 title TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, object_id TEXT REFERENCES learning_objects(id) ON DELETE SET NULL,
 status TEXT NOT NULL CHECK(status IN ('open','done')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_status ON tasks(status,updated_at);
CREATE TABLE resources (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, mime_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE resource_versions (
 id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id),
 revision INTEGER NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
 stored_name TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(resource_id,revision)
);
CREATE TABLE focus_sessions (
 id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('running','paused','finished')),
 started_at TEXT NOT NULL, current_started_at TEXT,
 accumulated_ms INTEGER NOT NULL DEFAULT 0, ended_at TEXT,
 object_id TEXT REFERENCES learning_objects(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_one_live_focus ON focus_sessions((1)) WHERE state IN ('running','paused');
CREATE TABLE learning_events (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES focus_sessions(id),
 event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX idx_events_session ON learning_events(session_id,occurred_at,id);
`}
] as const;

export class Database {
  readonly raw: DatabaseSync;
  private transactionDepth = 0;
  constructor(file: string) {
    if (file!==':memory:') mkdirSync(dirname(file),{recursive:true,mode:0o700});
    this.raw=new DatabaseSync(file);
    try {
      this.raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      this.migrate();
    } catch(error) {this.raw.close();throw error;}
  }
  private migrate() {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
      const applied=this.raw.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all() as unknown as {version:number;name:string;checksum:string}[];
      for(let i=0;i<applied.length;i++){
        const row=applied[i]!,step=steps[i];
        if(!step || row.version!==step.version || row.name!==step.name || row.checksum!==createHash('sha256').update(step.sql).digest('hex')) throw new Error('Unknown or modified migration: database unchanged');
      }
      for(const step of steps.slice(applied.length)){
        this.raw.exec(step.sql);
        this.raw.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)').run(step.version,step.name,createHash('sha256').update(step.sql).digest('hex'),new Date().toISOString());
      }
      this.raw.exec('COMMIT');
    }catch(error){this.raw.exec('ROLLBACK');throw error;}
  }
  transaction<T>(fn:()=>T):T {
    if(fn.constructor.name==='AsyncFunction') throw new Error('Transactions must be synchronous');
    const level=this.transactionDepth++,sp='tx_'+level;
    try{
      this.raw.exec(level===0?'BEGIN IMMEDIATE':'SAVEPOINT '+sp);
      try{
        const value=fn();
        if(value && typeof (value as {then?:unknown}).then==='function')throw new Error('Transactions must be synchronous');
        this.raw.exec(level===0?'COMMIT':'RELEASE SAVEPOINT '+sp);
        return value;
      }catch(error){
        this.raw.exec(level===0?'ROLLBACK':'ROLLBACK TO SAVEPOINT '+sp);
        if(level>0)this.raw.exec('RELEASE SAVEPOINT '+sp);
        throw error;
      }
    }finally{this.transactionDepth--;}
  }
  close(){this.raw.close();}
}
