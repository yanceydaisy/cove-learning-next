// Decision support, not an automatic scheduler. All scores are transparent heuristics.
// Base urgency ranking never fabricates importance. Today may enrich a task with a user-confirmed
// ordinal importance (low / medium / high). V2 surfaces that signal but still does not fold it into score.
export type DeadlineState = 'overdue'|'at-risk'|'within-day'|'within-three-days'|'within-week'|'later'|'unknown';
export type Actionability = 'actionable'|'blocked'|'waiting'|'deferred';
export type DecisionInput = {
 id:string; title:string; created_at:string; due_at:string|null;
 estimated_minutes:number|null; planned_for:string|null; boost:number;
 description?:string|null; task_type?:'assignment'|'exam'|'review'|'practice'|'reading'|'project'|'admin'|'other'|null;
 remaining_minutes?:number|null; progress_percent?:number|null; scheduled_start?:string|null; scheduled_end?:string|null;
 workflow_state?:'todo'|'in_progress'|'waiting'|'blocked'; available_from?:string|null; blocked_reason?:string|null;
 importance?:'low'|'medium'|'high'|null;
};
export type RankedTask = DecisionInput & {
 urgency:DeadlineState; importance:'low'|'medium'|'high'|null; actionability:Actionability; score:number; reasons:string[];
};
const DAY=86_400_000;
export function rankTasks(tasks:DecisionInput[], now:Date,localDate=now.toISOString().slice(0,10)):RankedTask[]{
 const current=now.getTime();
 return tasks.map(task=>{
  let urgency:DeadlineState='unknown',base=35;
  const reasons:string[]=[];
  if(task.due_at){
   const due=new Date(task.due_at).getTime();
   const remaining=due-current;
   const effort=task.remaining_minutes??task.estimated_minutes;
   const slack=remaining-(effort??0)*60_000;
   if(remaining<0){urgency='overdue';base=100;reasons.push('已超过截止时间');}
   else if(effort!=null&&slack<0){urgency='at-risk';base=92;reasons.push('按当前剩余工作量，截止前剩余时间可能不足');}
   else if(remaining<=DAY){urgency='within-day';base=85;reasons.push('24 小时内截止');}
   else if(remaining<=3*DAY){urgency='within-three-days';base=70;reasons.push('三天内截止');}
   else if(remaining<=7*DAY){urgency='within-week';base=52;reasons.push('七天内截止');}
   else{urgency='later';base=25;reasons.push('截止时间尚远');}
  }else reasons.push('未设置截止时间，紧急度未知');
  const waitingDays=Math.max(0,Math.floor((current-new Date(task.created_at).getTime())/DAY));
  const aging=Math.min(14,waitingDays*2);
  if(aging>0)reasons.push('等待 '+waitingDays+' 天，获得适度补偿');
  let plan=0;
  if(task.planned_for===localDate){plan+=18;reasons.push('已安排在今天');}
  if(task.scheduled_start){
   const until=Date.parse(task.scheduled_start)-current;
   const ended=task.scheduled_end?Date.parse(task.scheduled_end)<=current:false;
   if(!ended&&until<=0&&until>=-12*60*60_000){plan+=35;reasons.push('已经到达安排时间');}
   else if(until>0&&until<=6*60*60_000){plan+=28;reasons.push('六小时内已安排时间块');}
   else if(until>0&&until<=DAY){plan+=16;reasons.push('24 小时内已安排时间块');}
  }
  if(task.workflow_state==='in_progress'){plan+=12;reasons.push('已明确标记为进行中');}
  const importance=task.importance??null;
  if(importance)reasons.push('已确认'+({low:'低',medium:'中',high:'高'} as const)[importance]+'重要度');
  if(task.boost>0)reasons.push('你今天想优先做');
  let actionability:Actionability='actionable';
  if(task.workflow_state==='blocked')actionability='blocked';
  else if(task.workflow_state==='waiting')actionability='waiting';
  else if(task.available_from&&Date.parse(task.available_from)>current)actionability='deferred';
  if(actionability!=='actionable')reasons.push(actionability==='blocked'?'当前被阻塞':actionability==='waiting'?'正在等待外部条件':'尚未到可开始时间');
  const actionabilityPenalty=actionability==='actionable'?0:-1000;
  return {...task,urgency,importance,actionability,score:base+aging+plan+task.boost*40+actionabilityPenalty,reasons};
 }).sort((a,b)=>(a.actionability==='actionable'?0:1)-(b.actionability==='actionable'?0:1)||b.score-a.score||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
