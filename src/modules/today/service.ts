import type {Database} from '../../core/database.js';
import {AppError} from '../../core/errors.js';
import {rankTasks,type DecisionInput} from '../priority/engine.js';

export class TodayService {
 constructor(private db:Database,private now=()=>new Date()){}
 snapshot(localDate?:string){
  const instant=this.now(),today=localDate??instant.toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isFinite(Date.parse(today+'T12:00:00Z'))||
    new Date(today+'T12:00:00Z').toISOString().slice(0,10)!==today)
   throw new AppError('VALIDATION_ERROR','今日日期不合法。');
  const openTasks=this.db.raw.prepare("SELECT * FROM tasks WHERE status='open' ORDER BY created_at DESC,id LIMIT 8").all();
  const decisionInputs=this.db.raw.prepare(
   "SELECT t.id,t.title,t.created_at,t.due_at,t.estimated_minutes,t.planned_for,COALESCE(p.boost,0) AS boost FROM tasks t "+
   "LEFT JOIN task_preferences p ON p.task_id=t.id AND p.expires_at>? "+
   "WHERE t.status='open'"
  ).all(instant.toISOString()) as unknown as DecisionInput[];
  const ranked=rankTasks(decisionInputs,instant);
  const activeFocus=this.db.raw.prepare("SELECT * FROM focus_sessions WHERE state IN ('running','paused') LIMIT 1").get()??null;
  const recentSessions=this.db.raw.prepare("SELECT id,state,started_at,ended_at,accumulated_ms,object_id FROM focus_sessions ORDER BY started_at DESC,id DESC LIMIT 5").all();
  const recentResources=this.db.raw.prepare('SELECT id,title,mime_type,created_at FROM resources ORDER BY created_at DESC,id DESC LIMIT 5').all();
  const horizon=instant.getTime()+7*86_400_000;
  const deadlineTasks=ranked.filter(t=>t.due_at && Date.parse(t.due_at)<=horizon).slice(0,8);
  const todayTasks=ranked.filter(t=>t.planned_for===today);
  return {openTasks,activeFocus,recentSessions,recentResources,
   todayTasks,deadlineTasks,recommendations:ranked,
   priorityModel:{version:'rules-v0',importanceAvailable:false,description:'规则建议，不替代你的选择；重要度尚无足够数据。'},
   generated_at:instant.toISOString()};
 }
}
