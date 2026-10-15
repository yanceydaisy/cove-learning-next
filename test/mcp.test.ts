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
   assert.ok(names.includes('learning_course_context'));
   assert.ok(!names.some(name=>/delete|remove|upload/i.test(name)),'V0 exposes no delete/remove/upload tool');

   const course=toolJson(await client.callTool({
    name:'learning_create_object',
    arguments:{kind:'course',title:'现代控制'}
   }));
   const objective=toolJson(await client.callTool({
    name:'learning_course_context',
    arguments:{action:'create',course_id:course.id,kind:'objective',title:'掌握状态空间模型分析'}
   }));
   const task=toolJson(await client.callTool({
    name:'learning_create_task',
    arguments:{title:'状态空间复习',object_id:course.id,planned_for:'2026-10-15'}
   }));
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
