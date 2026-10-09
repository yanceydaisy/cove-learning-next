import type {Database} from '../../core/database.js';
export class TodayService {
 constructor(private db:Database){}
 snapshot(){
  const openTasks=this.db.raw.prepare("SELECT * FROM tasks WHERE status='open' ORDER BY created_at DESC,id LIMIT 8").all();
  const activeFocus=this.db.raw.prepare("SELECT * FROM focus_sessions WHERE state IN ('running','paused') LIMIT 1").get()??null;
  const recentSessions=this.db.raw.prepare("SELECT id,state,started_at,ended_at,accumulated_ms,object_id FROM focus_sessions ORDER BY started_at DESC,id DESC LIMIT 5").all();
  const recentResources=this.db.raw.prepare('SELECT id,title,mime_type,created_at FROM resources ORDER BY created_at DESC,id DESC LIMIT 5').all();
  return {openTasks,activeFocus,recentSessions,recentResources,generated_at:new Date().toISOString()};
 }
}
