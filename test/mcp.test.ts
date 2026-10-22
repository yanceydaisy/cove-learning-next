import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

function toolJson(value:any){
 const item=value.content?.find((entry:any)=>entry.type==='text');
 assert.ok(item?.text,'tool result contains JSON text');
 return JSON.parse(item.text);
}

test('capability URL exposes only bounded Learning MCP tools and performs the evidence→importance flow',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cove-learning-mcp-'));
 const app=new LearningApplication(dir,false,()=>new Date('2026-10-15T07:30:00.000Z'));
 const publicDir=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const capability='mcp_test_capability_0123456789abcdefghijklmno';
 const server=createHttp(app,publicDir,'',capability);
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const addr=server.address();
 assert.ok(addr&&typeof addr==='object');
 const origin='http://127.0.0.1:'+addr.port;
 const endpoint=new URL(origin+'/mcp/'+capability);

 try{
  const wrong=await fetch(origin+'/mcp/not-the-capability',{
   method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'wrong',version:'1'}}})
  });
  assert.equal(wrong.status,404,'unknown MCP capability is indistinguishable from a missing route');

  const client=new Client({name:'learning-mcp-test',version:'1.0.0'});
  const transport=new StreamableHTTPClientTransport(endpoint);
  await client.connect(transport);
  try{
   const listed=await client.listTools();
   const names=listed.tools.map(tool=>tool.name).sort();
   assert.ok(names.includes('learning_today'));
   assert.ok(names.includes('learning_create_task'));
   assert.ok(names.includes('learning_task_evidence'));
   assert.ok(names.includes('learning_set_importance'));
   assert.ok(names.includes('learning_focus'));
   assert.ok(names.includes('learning_add_record'));
   assert.ok(names.includes('learning_course_context'));
   assert.ok(names.includes('learning_update_object'));
   assert.ok(names.includes('learning_schedule'));
   assert.ok(names.includes('learning_plan_day'));
   assert.ok(names.includes('learning_plan_week'));
   assert.ok(names.includes('learning_schedule_task'));
   assert.ok(names.includes('learning_unschedule_task'));
   assert.ok(!names.some(name=>/delete|remove|upload/i.test(name)),'V0 exposes no delete/remove/upload tool');

   const project=toolJson(await client.callTool({
    name:'learning_create_object',
    arguments:{kind:'project',title:'Cove Reader',description:'触摸墨水屏共读器',project_stage:'构想',next_action:'验证硬件方案'}
   }));
   assert.equal(project.project_status,'idea');assert.equal(project.progress_percent,0);
   const projectUpdated=toolJson(await client.callTool({
    name:'learning_update_object',arguments:{object_id:project.id,project_status:'active',progress_percent:10,next_action:'跑通第一版'}
   }));
   assert.equal(projectUpdated.project_status,'active');assert.equal(projectUpdated.next_action,'跑通第一版');

   const course=toolJson(await client.callTool({
    name:'learning_create_object',
    arguments:{kind:'course',title:'现代控制'}
   }));
   const slot=toolJson(await client.callTool({
    name:'learning_schedule',
    arguments:{action:'create',object_id:course.id,title:'现代控制',weekday:4,start_time:'09:55',end_time:'11:30',effective_from:'2026-09-07'}
   }));
   assert.equal(slot.start_time,'09:55');
   const dateSlots=toolJson(await client.callTool({name:'learning_schedule',arguments:{action:'date',local_date:'2026-10-15'}}));
   assert.equal(dateSlots.length,1);
   const objective=toolJson(await client.callTool({
    name:'learning_course_context',
    arguments:{action:'create',course_id:course.id,kind:'objective',title:'掌握状态空间模型分析'}
   }));
   const task=toolJson(await client.callTool({
    name:'learning_create_task',
    arguments:{title:'状态空间复习',description:'复习状态空间模型',task_type:'review',workflow_state:'in_progress',progress_percent:20,remaining_minutes:30,object_id:course.id,due_at:'2026-10-18T12:00:00.000Z',estimated_minutes:45}
   }));
   assert.equal(task.task_type,'review');
   assert.equal(task.workflow_state,'in_progress');
   assert.equal(task.remaining_minutes,30);
   const beforePlan=toolJson(await client.callTool({
    name:'learning_plan_day',arguments:{local_date:'2026-10-15'}
   }));
   assert.ok(beforePlan.unscheduled_with_ddl.some((item:any)=>item.id===task.id));
   const scheduledTask=toolJson(await client.callTool({
    name:'learning_schedule_task',
    arguments:{task_id:task.id,local_date:'2026-10-15',start_time:'14:00',end_time:'14:45'}
   }));
   assert.equal(scheduledTask.planned_for,'2026-10-15');
   assert.equal(scheduledTask.scheduled_start,'2026-10-15T06:00:00.000Z');
   assert.equal(scheduledTask.scheduled_end,'2026-10-15T06:45:00.000Z');
   const planDay=toolJson(await client.callTool({name:'learning_plan_day',arguments:{local_date:'2026-10-15'}}));
   assert.deepEqual(planDay.timeline.map((item:any)=>[item.kind,item.start_time]),[['course','09:55'],['task','14:00']]);
   assert.ok(!planDay.unscheduled_with_ddl.some((item:any)=>item.id===task.id));
   const planWeek=toolJson(await client.callTool({name:'learning_plan_week',arguments:{anchor_date:'2026-10-15'}}));
   assert.equal(planWeek.week_start,'2026-10-12');
   assert.equal(planWeek.week_end,'2026-10-18');
   assert.ok(planWeek.days.find((day:any)=>day.local_date==='2026-10-15').timeline.some((item:any)=>item.id===task.id));
   const evidence=toolJson(await client.callTool({
    name:'learning_task_evidence',
    arguments:{action:'link',task_id:task.id,context_item_id:objective.id}
   }));
   assert.equal(evidence.links.length,1);

   const importance=toolJson(await client.callTool({
    name:'learning_set_importance',
    arguments:{task_id:task.id,context_item_id:objective.id,contribution:'high'}
   }));
   assert.equal(importance.importance_input.contribution,'high');

   const today=toolJson(await client.callTool({
    name:'learning_today',
    arguments:{local_date:'2026-10-15'}
   }));
   const ranked=today.recommendations.find((item:any)=>item.id===task.id);
   assert.equal(ranked.importance,'high');
   assert.ok(ranked.reasons.some((reason:string)=>reason.includes('主依据')));

   const unscheduledTask=toolJson(await client.callTool({
    name:'learning_unschedule_task',arguments:{task_id:task.id}
   }));
   assert.equal(unscheduledTask.scheduled_start,null);
   assert.equal(unscheduledTask.scheduled_end,null);
   assert.equal(unscheduledTask.planned_for,'2026-10-15','unscheduling preserves the planned date by default');
   const afterPlan=toolJson(await client.callTool({name:'learning_plan_day',arguments:{local_date:'2026-10-15'}}));
   assert.ok(afterPlan.unscheduled_with_ddl.some((item:any)=>item.id===task.id));

   const learningRecord=toolJson(await client.callTool({name:'learning_add_record',arguments:{
    local_date:'2026-10-15',started_at:'2026-10-15T14:00:00+08:00',ended_at:'2026-10-15T14:45:00+08:00',focused_minutes:38,
    title:'状态空间复习记录',summary:'复习状态转移矩阵与能控性。',activity_type:'review',object_id:course.id,task_id:task.id,next_action:'整理错题',tags:['控制','复习']
   }}));
   assert.equal(learningRecord.elapsed_minutes,45);assert.equal(learningRecord.focused_minutes,38);assert.equal(learningRecord.source,'mcp');assert.equal(learningRecord.task_id,task.id);
   const revised=toolJson(await client.callTool({name:'learning_update_record',arguments:{record_id:learningRecord.id,summary:'修正后的学习总结'}}));
   assert.equal(revised.summary,'修正后的学习总结');
   const ephemeris=toolJson(await client.callTool({name:'learning_get_trace',arguments:{from:'2026-09-30T16:00:00Z',to:'2026-10-31T16:00:00Z'}}));
   assert.ok(ephemeris.events.some((event:any)=>event.record_id===learningRecord.id&&event.summary==='修正后的学习总结'));


   const started=toolJson(await client.callTool({name:'learning_focus',arguments:{action:'start',object_id:course.id}}));
   assert.equal(started.state,'running');
   const active=toolJson(await client.callTool({name:'learning_focus',arguments:{action:'active'}}));
   assert.equal(active.id,started.id);
   const finished=toolJson(await client.callTool({name:'learning_focus',arguments:{action:'finish'}}));
   assert.equal(finished.state,'finished');
  }finally{
   await client.close();
  }
 }finally{
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
