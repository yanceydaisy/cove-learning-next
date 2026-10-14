// Decision support, not an automatic scheduler. All scores are transparent heuristics.
// No importance coordinate is fabricated before course goals/assessment context exists.
export type DeadlineState = 'overdue'|'at-risk'|'within-day'|'within-three-days'|'within-week'|'later'|'unknown';
export type DecisionInput = {
 id:string; title:string; created_at:string; due_at:string|null;
 estimated_minutes:number|null; planned_for:string|null; boost:number;
};
export type RankedTask = DecisionInput & {
 urgency:DeadlineState; importance:null; score:number; reasons:string[];
};
const DAY=86_400_000;
export function rankTasks(tasks:DecisionInput[], now:Date):RankedTask[]{
 const current=now.getTime();
 return tasks.map(task=>{
  let urgency:DeadlineState='unknown',base=35;
  const reasons:string[]=[];
  if(task.due_at){
   const due=new Date(task.due_at).getTime();
   const remaining=due-current;
   const slack=remaining-(task.estimated_minutes??0)*60_000;
   if(remaining<0){urgency='overdue';base=100;reasons.push('已超过截止时间');}
   else if(task.estimated_minutes!=null&&slack<0){urgency='at-risk';base=92;reasons.push('剩余时间可能不足以完成');}
   else if(remaining<=DAY){urgency='within-day';base=85;reasons.push('24 小时内截止');}
   else if(remaining<=3*DAY){urgency='within-three-days';base=70;reasons.push('三天内截止');}
   else if(remaining<=7*DAY){urgency='within-week';base=52;reasons.push('七天内截止');}
   else{urgency='later';base=25;reasons.push('截止时间尚远');}
  }else reasons.push('未设置截止时间，紧急度未知');
  const waitingDays=Math.max(0,Math.floor((current-new Date(task.created_at).getTime())/DAY));
  const aging=Math.min(14,waitingDays*2);
  if(aging>0)reasons.push('等待 '+waitingDays+' 天，获得适度补偿');
  if(task.boost>0)reasons.push('你今天想优先做');
  return {...task,urgency,importance:null,score:base+aging+task.boost*40,reasons};
 }).sort((a,b)=>b.score-a.score||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
