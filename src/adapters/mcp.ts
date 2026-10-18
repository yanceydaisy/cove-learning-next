
import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import type {LearningApplication} from '../core/application.js';
import {AppError} from '../core/errors.js';

type Session={
 transport:StreamableHTTPServerTransport;
 server:McpServer;
 lastActive:number;
};

function clean<T extends Record<string,unknown>>(value:T){
 return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined)) as Partial<T>;
}
function result(value:unknown){
 return {content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]};
}
function failure(error:unknown){
 const payload=error instanceof AppError
  ?{error:{code:error.code,message:error.message,details:error.details}}
  :{error:{code:'INTERNAL_ERROR',message:error instanceof Error?error.message:'Learning MCP 操作失败。'}};
 return {isError:true,content:[{type:'text' as const,text:JSON.stringify(payload,null,2)}]};
}
async function safe(fn:()=>unknown|Promise<unknown>){
 try{return result(await fn());}catch(error){return failure(error);}
}
function requireValue<T>(value:T|undefined,message:string):T{
 if(value===undefined||value===null||value==='')throw new AppError('VALIDATION_ERROR',message);
 return value;
}

const localDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTimeSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
function utcOffset(value:number|undefined){
 const offset=value??480;
 if(!Number.isInteger(offset)||offset < -840||offset > 840)throw new AppError('VALIDATION_ERROR','UTC offset 应为 -840～840 的整数分钟。');
 return offset;
}
function localParts(iso:string,offset:number){
 const shifted=new Date(Date.parse(iso)+offset*60_000).toISOString();
 return {date:shifted.slice(0,10),time:shifted.slice(11,16)};
}
function localToUtc(date:string,time:string,offset:number){
 const ms=Date.parse(date+'T'+time+':00.000Z')-offset*60_000;
 if(!Number.isFinite(ms))throw new AppError('VALIDATION_ERROR','本地日程时间无效。');
 return new Date(ms).toISOString();
}
function addDays(date:string,days:number){
 const d=new Date(date+'T12:00:00.000Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
function mondayOf(date:string){
 const d=new Date(date+'T12:00:00.000Z'),day=d.getUTCDay()||7;
 d.setUTCDate(d.getUTCDate()-(day-1));return d.toISOString().slice(0,10);
}
function planDay(app:LearningApplication,date:string,offset:number,includeLoose=true){
 const tasks=app.planning.list() as Array<Record<string,any>>;
 const open=tasks.filter(task=>task.status==='open');
 const courses=(app.schedule.forDate(date) as Array<Record<string,any>>).map(item=>({
  kind:'course',id:item.id,title:item.title,object_id:item.object_id,start_time:item.start_time,end_time:item.end_time,
  source:'weekly_schedule'
 }));
 const scheduled=open.filter(task=>task.scheduled_start&&localParts(task.scheduled_start,offset).date===date).map(task=>{
  const start=localParts(task.scheduled_start,offset),end=task.scheduled_end?localParts(task.scheduled_end,offset):null;
  return {kind:'task',id:task.id,title:task.title,object_id:task.object_id,start_time:start.time,end_time:end?.time??null,
   scheduled_start:task.scheduled_start,scheduled_end:task.scheduled_end,planned_for:task.planned_for,due_at:task.due_at,
   estimated_minutes:task.estimated_minutes,source:'task_schedule'};
 });
 const timeline=[...courses,...scheduled].sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time))||String(a.end_time??'').localeCompare(String(b.end_time??''))||String(a.title).localeCompare(String(b.title),'zh-CN'));
 const payload:any={local_date:date,utc_offset_minutes:offset,timeline,count:timeline.length};
 if(includeLoose){
  payload.unscheduled_with_ddl=open.filter(task=>!task.scheduled_start&&task.due_at).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at));
  payload.other_unscheduled=open.filter(task=>!task.scheduled_start&&!task.due_at).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 }
 return payload;
}

export function createLearningMcpServer(app:LearningApplication){
 const server=new McpServer(
  {name:'cove-learning',version:'0.1.0'},
  {capabilities:{logging:{}}}
 );

 server.registerTool('learning_today',{
  title:'Learning Today',
  description:'Read the current Learning Today model: open tasks, recommendations, urgency, confirmed ordinal importance, evidence links, focus state, and recent learning activity.',
  inputSchema:{local_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Optional device-local YYYY-MM-DD date.')},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({local_date})=>safe(()=>app.today.snapshot(local_date)));

 server.registerTool('learning_list_tasks',{
  title:'List Learning Tasks',
  description:'List all Learning tasks. Open tasks are returned before completed tasks.',
  inputSchema:{},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async()=>safe(()=>app.planning.list()));

 server.registerTool('learning_create_task',{
  title:'Create Learning Task',
  description:'Create a Learning task. object_id may point to a course/project/track. due_at and scheduled_start/end are canonical UTC ISO; planned_for is local YYYY-MM-DD.',
  inputSchema:{
   title:z.string().min(1).max(160),
   object_id:z.string().uuid().optional(),
   due_at:z.string().optional(),
   estimated_minutes:z.number().int().min(1).max(20160).optional(),
   planned_for:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
   scheduled_start:z.string().optional(),
   scheduled_end:z.string().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async args=>safe(()=>app.planning.create(clean(args as Record<string,unknown>))));

 server.registerTool('learning_update_task',{
  title:'Update Learning Task',
  description:'Update an open task’s planned date, UTC deadline, estimated minutes, or explicit scheduled start/end. Pass null to clear a field.',
  inputSchema:{
   task_id:z.string().uuid(),
   due_at:z.string().nullable().optional(),
   estimated_minutes:z.number().int().min(1).max(20160).nullable().optional(),
   planned_for:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
   scheduled_start:z.string().nullable().optional(),
   scheduled_end:z.string().nullable().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({task_id,...fields})=>safe(()=>app.planning.updateDetails(task_id,clean(fields as Record<string,unknown>))));

 server.registerTool('learning_complete_task',{
  title:'Complete Learning Task',
  description:'Mark one task complete. This is idempotent but changes task state.',
  inputSchema:{task_id:z.string().uuid()},
  annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}
 },async({task_id})=>safe(()=>app.planning.complete(task_id)));

 server.registerTool('learning_reopen_task',{
  title:'Reopen Learning Task',
  description:'Restore one completed task to open state. This is idempotent but changes task state.',
  inputSchema:{task_id:z.string().uuid()},
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({task_id})=>safe(()=>app.planning.reopen(task_id)));

 server.registerTool('learning_task_evidence',{
  title:'Task Course Evidence',
  description:'Read, link, or unlink confirmed course evidence for a course task. A task can only link evidence from its own course.',
  inputSchema:{
   action:z.enum(['list','link','unlink']),
   task_id:z.string().uuid(),
   context_item_id:z.string().uuid().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({action,task_id,context_item_id})=>safe(()=>{
  if(action==='list')return app.taskEvidence.list(task_id);
  const id=requireValue(context_item_id,'link / unlink 需要 context_item_id。');
  return app.taskEvidence.set(task_id,{context_item_id:id,linked:action==='link'});
 }));

 server.registerTool('learning_set_importance',{
  title:'Set Task Importance',
  description:'Set or clear truthful ordinal task importance. To set: choose one already-linked confirmed evidence item as primary basis and contribution low/medium/high. Does not change the hidden recommendation score.',
  inputSchema:{
   task_id:z.string().uuid(),
   context_item_id:z.string().uuid().optional(),
   contribution:z.enum(['low','medium','high']).optional(),
   clear:z.boolean().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({task_id,context_item_id,contribution,clear})=>safe(()=>{
  if(clear)return app.taskEvidence.setImportance(task_id,{clear:true});
  return app.taskEvidence.setImportance(task_id,{
   context_item_id:requireValue(context_item_id,'设置重要度需要 context_item_id。'),
   contribution:requireValue(contribution,'设置重要度需要 contribution。')
  });
 }));

 server.registerTool('learning_focus',{
  title:'Learning Focus Session',
  description:'Read or control the Learning focus timer. pause/resume/finish may omit session_id to target the current active session.',
  inputSchema:{
   action:z.enum(['active','recent','history','start','pause','resume','finish']),
   session_id:z.string().uuid().optional(),
   object_id:z.string().uuid().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async({action,session_id,object_id})=>safe(()=>{
  if(action==='active')return app.activity.active();
  if(action==='recent')return app.activity.recent();
  if(action==='history')return app.activity.history();
  if(action==='start')return app.activity.start(clean({object_id}));
  const active=app.activity.active() as {id?:string}|null;
  const id=session_id??active?.id;
  requireValue(id,'当前没有可操作的学习会话。');
  if(action==='pause')return app.activity.pause(id!);
  if(action==='resume')return app.activity.resume(id!);
  return app.activity.finish(id!);
 }));

 server.registerTool('learning_course_context',{
  title:'Learning Course Context',
  description:'List, create, or update course objectives and assessment evidence. No delete action is exposed through MCP.',
  inputSchema:{
   action:z.enum(['list','create','update']),
   course_id:z.string().uuid().optional(),
   item_id:z.string().uuid().optional(),
   kind:z.enum(['objective','assessment']).optional(),
   title:z.string().min(1).max(160).optional(),
   weight_percent:z.number().min(0).max(100).nullable().optional(),
   status:z.enum(['suggested','confirmed']).optional(),
   source_resource_id:z.string().uuid().nullable().optional(),
   source_locator:z.string().max(300).nullable().optional(),
   source_excerpt:z.string().max(1200).nullable().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async args=>safe(()=>{
  if(args.action==='list')return app.courseContext.list(requireValue(args.course_id,'list 需要 course_id。'));
  const payload=clean({
   kind:args.kind,title:args.title,weight_percent:args.weight_percent,status:args.status,
   source_resource_id:args.source_resource_id,source_locator:args.source_locator,source_excerpt:args.source_excerpt
  });
  if(args.action==='create')return app.courseContext.create(requireValue(args.course_id,'create 需要 course_id。'),payload);
  return app.courseContext.update(requireValue(args.item_id,'update 需要 item_id。'),payload);
 }));

 server.registerTool('learning_list_objects',{
  title:'List Learning Objects',
  description:'List courses, projects, and tracks in Learning.',
  inputSchema:{},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async()=>safe(()=>app.catalog.list()));

 server.registerTool('learning_create_object',{
  title:'Create Learning Object',
  description:'Create a course, project, or track in Learning. Projects may include status, stage, progress, next action, and blocker. No delete action is exposed through MCP.',
  inputSchema:{
   kind:z.enum(['course','project','track']),
   title:z.string().min(1).max(160),
   description:z.string().max(1200).nullable().optional(),
   project_status:z.enum(['idea','active','paused','done']).optional(),
   project_stage:z.string().max(160).nullable().optional(),
   progress_percent:z.number().int().min(0).max(100).nullable().optional(),
   next_action:z.string().max(1200).nullable().optional(),
   blocker:z.string().max(1200).nullable().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async args=>safe(()=>app.catalog.create(clean(args as Record<string,unknown>))));

 server.registerTool('learning_update_object',{
  title:'Update Learning Object',
  description:'Update a Learning object. Project fields support status, stage, progress, next action, and blocker. Pass null to clear nullable fields.',
  inputSchema:{
   object_id:z.string().uuid(),
   title:z.string().min(1).max(160).optional(),
   description:z.string().max(1200).nullable().optional(),
   project_status:z.enum(['idea','active','paused','done']).optional(),
   project_stage:z.string().max(160).nullable().optional(),
   progress_percent:z.number().int().min(0).max(100).nullable().optional(),
   next_action:z.string().max(1200).nullable().optional(),
   blocker:z.string().max(1200).nullable().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({object_id,...fields})=>safe(()=>app.catalog.update(object_id,clean(fields as Record<string,unknown>))));

 server.registerTool('learning_plan_day',{
  title:'Learning Plan Day',
  description:'Read one local Plan day exactly as a planning surface: recurring classes plus explicitly scheduled open tasks, followed by DDL-unscheduled and other unscheduled tasks. utc_offset_minutes defaults to +480 (Taipei) and may be overridden.',
  inputSchema:{
   local_date:localDateSchema,
   utc_offset_minutes:z.number().int().min(-840).max(840).optional()
  },
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({local_date,utc_offset_minutes})=>safe(()=>planDay(app,local_date,utcOffset(utc_offset_minutes),true)));

 server.registerTool('learning_plan_week',{
  title:'Learning Plan Week',
  description:'Read the Monday-Sunday Plan week containing anchor_date. Each day contains recurring classes and explicitly scheduled open tasks. Unscheduled tasks are returned once at the week level. utc_offset_minutes defaults to +480 (Taipei) and may be overridden.',
  inputSchema:{
   anchor_date:localDateSchema,
   utc_offset_minutes:z.number().int().min(-840).max(840).optional()
  },
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({anchor_date,utc_offset_minutes})=>safe(()=>{
  const offset=utcOffset(utc_offset_minutes),week_start=mondayOf(anchor_date);
  const days=Array.from({length:7},(_,i)=>planDay(app,addDays(week_start,i),offset,false));
  const tasks=app.planning.list() as Array<Record<string,any>>,open=tasks.filter(task=>task.status==='open');
  return {
   week_start,week_end:addDays(week_start,6),utc_offset_minutes:offset,days,
   unscheduled_with_ddl:open.filter(task=>!task.scheduled_start&&task.due_at).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at)),
   other_unscheduled:open.filter(task=>!task.scheduled_start&&!task.due_at).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
  };
 }));

 server.registerTool('learning_schedule_task',{
  title:'Schedule Learning Task',
  description:'Put an existing open task onto the Plan timeline using a local date and HH:MM clock time. The task planned_for date is updated to match. end_time is optional; utc_offset_minutes defaults to +480 (Taipei).',
  inputSchema:{
   task_id:z.string().uuid(),
   local_date:localDateSchema,
   start_time:localTimeSchema,
   end_time:localTimeSchema.optional(),
   utc_offset_minutes:z.number().int().min(-840).max(840).optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({task_id,local_date,start_time,end_time,utc_offset_minutes})=>safe(()=>{
  if(end_time&&end_time<=start_time)throw new AppError('VALIDATION_ERROR','同一天的结束时间必须晚于开始时间。');
  const offset=utcOffset(utc_offset_minutes);
  return app.planning.updateDetails(task_id,{
   planned_for:local_date,
   scheduled_start:localToUtc(local_date,start_time,offset),
   scheduled_end:end_time?localToUtc(local_date,end_time,offset):null
  });
 }));

 server.registerTool('learning_unschedule_task',{
  title:'Unschedule Learning Task',
  description:'Remove an open task from its explicit Plan time block without deleting or completing it. By default planned_for is preserved; set clear_planned_for=true to clear that date too.',
  inputSchema:{
   task_id:z.string().uuid(),
   clear_planned_for:z.boolean().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async({task_id,clear_planned_for})=>safe(()=>app.planning.updateDetails(task_id,clean({
  scheduled_start:null,scheduled_end:null,planned_for:clear_planned_for?null:undefined
 }))));

 server.registerTool('learning_schedule',{
  title:'Learning Weekly Schedule',
  description:'List the weekly class schedule, read one resolved local date, or create/update a recurring class slot. Weekday uses 1=Monday through 7=Sunday.',
  inputSchema:{
   action:z.enum(['list','date','create','update']),
   local_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
   entry_id:z.string().uuid().optional(),
   object_id:z.string().uuid().nullable().optional(),
   title:z.string().min(1).max(160).optional(),
   location:z.string().max(160).nullable().optional(),
   weekday:z.number().int().min(1).max(7).optional(),
   start_time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
   end_time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
   effective_from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
   effective_until:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  },
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async args=>safe(()=>{
  if(args.action==='list')return app.schedule.list();
  if(args.action==='date')return app.schedule.forDate(requireValue(args.local_date,'date 需要 local_date。'));
  const payload=clean({object_id:args.object_id,title:args.title,location:args.location,weekday:args.weekday,start_time:args.start_time,end_time:args.end_time,
   effective_from:args.effective_from,effective_until:args.effective_until});
  if(args.action==='create')return app.schedule.create(payload);
  return app.schedule.update(requireValue(args.entry_id,'update 需要 entry_id。'),payload);
 }));

 server.registerTool('learning_list_resources',{
  title:'List Learning Resources',
  description:'List immutable resource metadata already stored in Learning. Raw file upload/download is intentionally not exposed through MCP V0.',
  inputSchema:{},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async()=>safe(()=>app.library.list()));

 return server;
}

async function parseBody(req:IncomingMessage){
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){
  size+=Buffer.byteLength(chunk);
  if(size>1024*1024)throw new Error('MCP request body too large');
  chunks.push(Buffer.from(chunk));
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}') as unknown;
}
function protocolError(res:ServerResponse,status:number,message:string){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
 res.end(JSON.stringify({jsonrpc:'2.0',error:{code:-32000,message},id:null}));
}

export class LearningMcpEndpoint{
 private sessions=new Map<string,Session>();
 private cleanup:NodeJS.Timeout;
 readonly path:string;

 constructor(private app:LearningApplication,capability:string){
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(capability))throw new Error('Invalid Learning MCP capability');
  this.path='/mcp/'+capability;
  this.cleanup=setInterval(()=>{
   const cutoff=Date.now()-30*60_000;
   for(const [id,session] of this.sessions){
    if(session.lastActive<cutoff){
     this.sessions.delete(id);
     void session.transport.close();
     void session.server.close();
    }
   }
  },60_000);
  this.cleanup.unref();
 }

 matches(path:string){return path===this.path;}

 async handle(req:IncomingMessage,res:ServerResponse){
  if(req.method==='GET'){
   const sid=String(req.headers['mcp-session-id']??'');
   const session=sid?this.sessions.get(sid):undefined;
   if(!session)return protocolError(res,405,'SSE requires an active MCP session.');
   session.lastActive=Date.now();
   await session.transport.handleRequest(req,res);
   return;
  }
  if(req.method==='DELETE'){
   const sid=String(req.headers['mcp-session-id']??'');
   const session=sid?this.sessions.get(sid):undefined;
   if(!session)return protocolError(res,404,'MCP session not found.');
   session.lastActive=Date.now();
   await session.transport.handleRequest(req,res);
   return;
  }
  if(req.method!=='POST')return protocolError(res,405,'Method not allowed.');
  if(!String(req.headers['content-type']??'').toLowerCase().startsWith('application/json'))
   return protocolError(res,415,'MCP POST requires application/json.');

  let body:unknown;
  try{body=await parseBody(req);}catch{return protocolError(res,400,'Invalid JSON-RPC request.');}
  const sid=String(req.headers['mcp-session-id']??'');
  let session=sid?this.sessions.get(sid):undefined;
  if(session){
   session.lastActive=Date.now();
   await session.transport.handleRequest(req,res,body);
   return;
  }
  if(sid)return protocolError(res,404,'MCP session not found.');
  if(!isInitializeRequest(body))return protocolError(res,400,'Initialize the MCP session first.');
  if(this.sessions.size>=32)return protocolError(res,503,'Too many MCP sessions.');

  let transport!:StreamableHTTPServerTransport;
  const server=createLearningMcpServer(this.app);
  transport=new StreamableHTTPServerTransport({
   sessionIdGenerator:()=>randomUUID(),
   enableJsonResponse:true,
   onsessioninitialized:id=>{
    this.sessions.set(id,{transport,server,lastActive:Date.now()});
   }
  });
  transport.onclose=()=>{
   const id=transport.sessionId;
   if(id)this.sessions.delete(id);
  };
  await server.connect(transport);
  await transport.handleRequest(req,res,body);
 }

 async close(){
  clearInterval(this.cleanup);
  const sessions=[...this.sessions.values()];
  this.sessions.clear();
  await Promise.allSettled(sessions.flatMap(s=>[s.transport.close(),s.server.close()]));
 }
}

[executed on device: cove-prod-01 (996ee891-1352-4542-8974-83a3c70e71d0)]