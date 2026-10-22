import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

test('task context UI: real writes, blocked filtering, responsive Today and Plan', {timeout:120_000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-task-context-ui-'));
 const app=new LearningApplication(dir);
 const root=resolve(fileURLToPath(new URL('../public',import.meta.url)));
 const server=createHttp(app,root);
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const addr=server.address();if(!addr||typeof addr==='string')throw Error('No port');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors:string[]=[];
 try{
  const legacy=app.planning.create({title:'原有任务不补造进度'}) as any;
  app.planning.create({title:'等待外部条件',workflow_state:'waiting'});
  app.planning.create({title:'尚未开放',available_from:new Date(Date.now()+86_400_000).toISOString()});
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  const scheduled=app.planning.create({title:'时间轴任务',planned_for:today,scheduled_start:new Date(Date.now()-300_000).toISOString(),scheduled_end:new Date(Date.now()+3_600_000).toISOString(),workflow_state:'in_progress',progress_percent:30,remaining_minutes:50}) as any;
  const page=await browser.newPage({viewport:{width:375,height:812},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  page.setDefaultTimeout(12_000);
  page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+addr.port;
  await page.goto(base+'/#/plan',{waitUntil:'networkidle'});
  await page.locator('#addPlan').click();
  await page.locator('#taskForm input[name=title]').fill('验证任务执行信息');
  await page.locator('#taskForm input[name=planned_for]').fill('');
  await page.locator('#taskForm .task-execution-fields summary').click();
  await page.locator('#taskForm textarea[name=description]').fill('保存、重载、阻塞和恢复都使用真实后端');
  await page.locator('#taskForm select[name=task_type]').selectOption('assignment');
  await page.locator('#taskForm select[name=workflow_state]').selectOption('in_progress');
  await page.locator('#taskForm input[name=progress_percent]').fill('20');
  await page.locator('#taskForm input[name=remaining_minutes]').fill('90');
  await page.locator('#taskForm input[name=available_local]').fill('2026-01-01T10:00');
  await page.locator('#taskForm button[type=submit]').click();
  const row=page.locator('.plan-task').filter({hasText:'验证任务执行信息'});
  await row.waitFor();
  assert.match(await row.innerText(),/作业 · 进行中 · 20% · 剩余 90 分钟/);
  const created=app.planning.list().find((t:any)=>t.title==='验证任务执行信息') as any;
  assert.equal(created.available_from,'2026-01-01T02:00:00.000Z');
  assert.equal(created.description,'保存、重载、阻塞和恢复都使用真实后端');
  await row.locator('[data-edit]').click();
  await row.locator('select[name=workflow_state]').selectOption('blocked');
  await row.locator('textarea[name=blocked_reason]').fill('等待实验数据');
  await row.locator('input[name=progress_percent]').fill('45');
  await row.locator('input[name=remaining_minutes]').fill('0');
  await row.locator('button[type=submit]').click();
  await row.locator('.task-inline-edit[hidden]').waitFor({state:'attached'});
  const blocked=app.planning.list().find((t:any)=>t.id===created.id) as any;
  assert.equal(blocked.workflow_state,'blocked');assert.equal(blocked.progress_percent,45);assert.equal(blocked.remaining_minutes,0);
  assert.equal(blocked.blocked_reason,'等待实验数据');
  await page.locator('a[data-nav=today]').click();
  await page.locator('.today-next').waitFor();
  assert.doesNotMatch(await page.locator('.today-next').innerText(),/等待实验数据|验证任务执行信息|等待外部条件|尚未开放/);
  await page.locator('a[data-nav=plan]').click();
  await row.locator('[data-edit]').click();
  await row.locator('select[name=workflow_state]').selectOption('in_progress');
  assert.equal(await row.locator('[data-blocked-field]').isVisible(),false);
  await row.locator('input[name=remaining_minutes]').fill('60');
  await row.locator('button[type=submit]').click();
  await row.locator('.task-inline-edit[hidden]').waitFor({state:'attached'});
  assert.equal((app.planning.list().find((t:any)=>t.id===created.id) as any).blocked_reason,null);
  await page.reload({waitUntil:'networkidle'});
  assert.match(await row.innerText(),/45% · 剩余 60 分钟/);
  assert.match(await page.locator('.plan-timeline-row[data-kind=task]').innerText(),/进行中 · 30% · 剩余 50 分钟/);
  await page.locator('a[data-nav=today]').click();
  await page.locator('.today-next-card').first().waitFor();
  const recommendation=page.locator('.today-next-card').filter({hasText:'验证任务执行信息'});
  assert.match(await recommendation.innerText(),/45% · 剩余 60 分钟/);
  await recommendation.locator('[data-preference]').click();
  await page.waitForFunction(()=>document.querySelector('.today-next-card .today-next-title strong')?.textContent==='验证任务执行信息');
  assert.equal(await recommendation.locator('[data-preference]').getAttribute('aria-pressed'),'true');
  for(const theme of ['light','dark']){
   await page.evaluate(value=>localStorage.setItem('cove.home.themeMode',value),theme);
   await page.reload({waitUntil:'networkidle'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   for(const width of [320,375,414,768]){
    await page.setViewportSize({width,height:852});
    for(const view of ['today','plan']){
     await page.locator('a[data-nav='+view+']').click();
     await page.locator(view==='today'?'.today-next-card':'.plan-calendar').first().waitFor();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' fits '+width+'px');
     if(view==='today')assert.ok(await page.evaluate(()=>{
      const brief=document.querySelector('.today-brief')!.getBoundingClientRect();
      const review=document.querySelector('.today-review')!.getBoundingClientRect();
      const next=document.querySelector('.today-next')!.getBoundingClientRect();
      return Math.max(brief.bottom,review.bottom)<=next.top;
     }),'course/review never overlap recommendations at '+width+'px');
     await page.screenshot({path:join(dir,theme+'-'+view+'-'+width+'.png')});
     if(view==='plan'&&width===375){
      await row.locator('[data-edit]').click();
      await row.locator('textarea[name=description]').scrollIntoViewIfNeeded();
      await page.screenshot({path:join(dir,theme+'-editor-'+width+'.png')});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'execution editor fits mobile');
      await row.locator('[data-edit]').click();
     }
    }
   }
  }
  const untouched=app.planning.list().find((t:any)=>t.id===legacy.id) as any;
  assert.equal(untouched.progress_percent,null);assert.equal(untouched.remaining_minutes,null);
  assert.equal((app.planning.list().find((t:any)=>t.id===scheduled.id) as any).progress_percent,30);
  assert.deepEqual(errors,[]);
  console.log('Task context screenshots: '+dir);
 }finally{
  await browser.close();
  await new Promise<void>(r=>server.close(()=>r()));
  app.close();
  // Preserve screenshots for visual review; remove only the isolated test database.
  for(const file of ['learning.sqlite','learning.sqlite-wal','learning.sqlite-shm'])rmSync(join(dir,file),{force:true});
 }
});
