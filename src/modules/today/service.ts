
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
  const evidenceRows=this.db.raw.prepare(
   `SELECT l.task_id,c.id,c.kind,c.title,c.weight_percent,c.source_locator
    FROM task_context_links l
    JOIN course_context_items c ON c.id=l.context_item_id
    JOIN tasks t ON t.id=l.task_id
    WHERE t.status='open' AND c.status='confirmed'
    ORDER BY l.task_id,CASE c.kind WHEN 'objective' THEN 0 ELSE 1 END,c.created_at,c.id`
  ).all() as unknown as {task_id:string;id:string;kind:'objective'|'assessment';title:string;weight_percent:number|null;source_locator:string|null}[];
  const evidenceByTask=new Map<string,typeof evidenceRows>();
  for(const row of evidenceRows){
   const rows=evidenceByTask.get(row.task_id)??[];
   rows.push(row);evidenceByTask.set(row.task_id,rows);
  }
  const importanceRows=this.db.raw.prepare(
   `SELECT i.task_id,i.context_item_id,i.contribution,
           c.kind,c.title,c.weight_percent
    FROM task_importance_inputs i
    JOIN course_context_items c ON c.id=i.context_item_id
    JOIN tasks t ON t.id=i.task_id
    WHERE t.status='open' AND c.status='confirmed'`
  ).all() as unknown as {task_id:string;context_item_id:string;contribution:'low'|'medium'|'high';kind:'objective'|'assessment';title:string;weight_percent:number|null}[];
  const importanceByTask=new Map(importanceRows.map(row=>[row.task_id,row]));
  const importanceName={low:'低',medium:'中',high:'高'} as const;
  const recommendations=ranked.map(task=>{
   const evidence=evidenceByTask.get(task.id)??[];
   const importanceInput=importanceByTask.get(task.id)??null;
   const evidenceReasons=evidence.map(item=>item.kind==='objective'
    ?'关联课程目标：'+item.title
    :'关联考核：'+item.title+(item.weight_percent!=null?'（'+item.weight_percent+'%）':''));
   const importanceReasons=importanceInput
    ?['重要度：'+importanceName[importanceInput.contribution]+' · 主依据：'+importanceInput.title]
    :[];
   return {...task,importance:importanceInput?.contribution??null,importance_input:importanceInput,evidence,
    reasons:[...task.reasons,...importanceReasons,...evidenceReasons]};
  });
  const activeFocus=this.db.raw.prepare("SELECT * FROM focus_sessions WHERE state IN ('running','paused') LIMIT 1").get()??null;
  const recentSessions=this.db.raw.prepare("SELECT id,state,started_at,ended_at,accumulated_ms,object_id FROM focus_sessions ORDER BY started_at DESC,id DESC LIMIT 5").all();
  const recentResources=this.db.raw.prepare('SELECT id,title,mime_type,created_at FROM resources ORDER BY created_at DESC,id DESC LIMIT 5').all();
  const horizon=instant.getTime()+7*86_400_000;
  const deadlineTasks=recommendations.filter(t=>t.due_at && Date.parse(t.due_at)<=horizon).slice(0,8);
  const todayTasks=recommendations.filter(t=>t.planned_for===today);
  const completedTodayTasks=this.db.raw.prepare(
   `SELECT id,title,object_id,status,created_at,updated_at,due_at,estimated_minutes,planned_for,scheduled_start,scheduled_end
    FROM tasks WHERE status='done' AND planned_for=? ORDER BY updated_at DESC,id DESC`
  ).all(today) as unknown as Record<string,unknown>[];
  return {openTasks,activeFocus,recentSessions,recentResources,
   todayTasks,completedTodayTasks,deadlineTasks,recommendations,
   priorityModel:{version:'rules-v0+importance-ordinal-v1',importanceAvailable:importanceRows.length>0,
    importanceScale:'ordinal-low-medium-high',evidenceLinksAvailable:evidenceRows.length>0,
    description:'重要度只来自你确认的主依据与低/中/高贡献等级；当前仍不与紧急度合并成一个黑箱分数。'},
   generated_at:instant.toISOString()};
 }
}

[executed on device: cove-prod-01 (996ee891-1352-4542-8974-83a3c70e71d0)]