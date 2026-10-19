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
 ,{version:2,name:'task_decision_inputs_and_transient_preference',sql:`
ALTER TABLE tasks ADD COLUMN due_at TEXT;
ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN planned_for TEXT;
CREATE TABLE task_preferences (
 task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 boost INTEGER NOT NULL CHECK(boost IN (1,2)),
 expires_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_preferences_expiry ON task_preferences(expires_at);
`}
 ,{version:3,name:'course_context_evidence',sql:`
CREATE TABLE course_context_items (
 id TEXT PRIMARY KEY,
 object_id TEXT NOT NULL REFERENCES learning_objects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('objective','assessment')),
 title TEXT NOT NULL,
 weight_percent REAL CHECK(weight_percent IS NULL OR (weight_percent>=0 AND weight_percent<=100)),
 source_resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
 source_locator TEXT,
 source_excerpt TEXT,
 status TEXT NOT NULL CHECK(status IN ('suggested','confirmed')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(kind='assessment' OR weight_percent IS NULL)
);
CREATE INDEX idx_course_context_object ON course_context_items(object_id,kind,status,created_at);
CREATE INDEX idx_course_context_source ON course_context_items(source_resource_id);
`}
 ,{version:4,name:'task_course_evidence_links',sql:`
CREATE TABLE task_context_links (
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 context_item_id TEXT NOT NULL REFERENCES course_context_items(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 PRIMARY KEY(task_id,context_item_id)
);
CREATE INDEX idx_task_context_item ON task_context_links(context_item_id,task_id);
`}
 ,{version:5,name:'task_importance_input',sql:`
CREATE TABLE task_importance_inputs (
 task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 context_item_id TEXT NOT NULL,
 contribution TEXT NOT NULL CHECK(contribution IN ('low','medium','high')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(task_id,context_item_id) REFERENCES task_context_links(task_id,context_item_id) ON DELETE CASCADE
);
CREATE INDEX idx_task_importance_context ON task_importance_inputs(context_item_id,task_id);
`}
 ,{version:6,name:'plan_timeline_and_weekly_schedule',sql:`
ALTER TABLE tasks ADD COLUMN scheduled_start TEXT;
ALTER TABLE tasks ADD COLUMN scheduled_end TEXT;
CREATE TABLE weekly_schedule_entries (
 id TEXT PRIMARY KEY,
 object_id TEXT REFERENCES learning_objects(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 effective_from TEXT NOT NULL,
 effective_until TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(start_time < end_time),
 CHECK(effective_until IS NULL OR effective_from <= effective_until)
);
CREATE INDEX idx_weekly_schedule_day ON weekly_schedule_entries(weekday,effective_from,effective_until,start_time);
`}
 ,{version:7,name:'weekly_schedule_location',sql:`
ALTER TABLE weekly_schedule_entries ADD COLUMN location TEXT;
`}
 ,{version:8,name:'project_metadata',sql:`
ALTER TABLE learning_objects ADD COLUMN project_status TEXT CHECK(project_status IS NULL OR project_status IN ('idea','active','paused','done'));
ALTER TABLE learning_objects ADD COLUMN project_stage TEXT;
ALTER TABLE learning_objects ADD COLUMN progress_percent INTEGER CHECK(progress_percent IS NULL OR (progress_percent BETWEEN 0 AND 100));
ALTER TABLE learning_objects ADD COLUMN next_action TEXT;
ALTER TABLE learning_objects ADD COLUMN blocker TEXT;
ALTER TABLE learning_objects ADD COLUMN updated_at TEXT;
UPDATE learning_objects SET updated_at=created_at WHERE updated_at IS NULL;
CREATE INDEX idx_learning_objects_project_status ON learning_objects(kind,project_status,updated_at);
`}
 ,{version:9,name:'learning_records',sql:`
CREATE TABLE learning_records (
 id TEXT PRIMARY KEY,
 local_date TEXT NOT NULL,
 started_at TEXT NOT NULL,
 ended_at TEXT NOT NULL,
 elapsed_minutes INTEGER NOT NULL CHECK(elapsed_minutes>=0),
 focused_minutes INTEGER NOT NULL CHECK(focused_minutes>=0 AND focused_minutes<=elapsed_minutes),
 title TEXT NOT NULL,
 summary TEXT,
 activity_type TEXT NOT NULL CHECK(activity_type IN ('study','review','practice','reading','project','other')),
 object_id TEXT REFERENCES learning_objects(id) ON DELETE SET NULL,
 task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
 next_action TEXT,
 note TEXT,
 tags_json TEXT NOT NULL DEFAULT '[]',
 source TEXT NOT NULL CHECK(source IN ('manual','focus','mcp','import')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_learning_records_date ON learning_records(local_date,started_at,id);
CREATE INDEX idx_learning_records_object ON learning_records(object_id,local_date);
CREATE INDEX idx_learning_records_task ON learning_records(task_id,local_date);
`}
 ,{version:10,name:'ephemeris_record_identity_and_completion_time',sql:`
ALTER TABLE tasks ADD COLUMN completed_at TEXT;
ALTER TABLE learning_records ADD COLUMN focus_session_id TEXT REFERENCES focus_sessions(id) ON DELETE SET NULL;
ALTER TABLE learning_records ADD COLUMN time_zone TEXT;
ALTER TABLE learning_records ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX idx_record_focus_session ON learning_records(focus_session_id) WHERE focus_session_id IS NOT NULL;
CREATE UNIQUE INDEX idx_record_idempotency ON learning_records(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_records_interval ON learning_records(started_at,ended_at);
CREATE INDEX idx_task_completed_at ON tasks(completed_at) WHERE status='done';
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
