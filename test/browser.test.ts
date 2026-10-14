import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';
const root=resolve(fileURLToPath(new URL('../public',import.meta.url)));
test('visual contract: compact iPhone app, four internal pages, real writes, PWA metadata',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-visual-')),app=new LearningApplication(dir);
 const server=createHttp(app,root);
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const addr=server.address();if(!addr||typeof addr==='string')throw Error('No port');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},screen:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+addr.port+'/',{waitUntil:'networkidle'});
  await page.locator('.head h1').waitFor();
  assert.equal(await page.locator('.head h1').innerText(),'Learning');
  assert.equal(await page.locator('.dock a').count(),4);
  await page.evaluate(()=>{const brand=document.querySelector('.brand') as HTMLElement;brand.click();brand.click();brand.click();});
  await page.locator('#viewportDebug').waitFor();
  assert.match(await page.locator('#viewportDebug').innerText(),/CSS 100vh/,'diagnostic reports CSS viewport');
  await page.evaluate(()=>{const brand=document.querySelector('.brand') as HTMLElement;brand.click();brand.click();brand.click();});
  assert.equal(await page.locator('#viewportDebug').count(),0,'hidden diagnostic closes cleanly');

  assert.equal(await page.locator('.dock a[data-nav=today]').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.door').count(),0);
  assert.equal(await page.locator('.feature-today').count(),1,'Today has one dominant hero');
  assert.equal(await page.locator('.task-overview').count(),1,'tasks are open information, not a card');
  assert.equal(await page.locator('.history-block').count(),0,'Today V2 intentionally omits activity history');
  assert.equal(await page.locator('.today-switch button').count(),3,'Today uses internal sections');
  assert.equal(await page.locator('.deadline-peek').count(),1,'Today has a DDL preview');
  assert.equal(await page.locator('.feature-symbol svg.micro-sparkle').count(),1,'hero decoration is a vector, not emoji');
  assert.equal(await page.locator('.feature-action svg.micro-arrow').count(),1,'hero uses custom thin line arrow');
  const heroAlign=await page.locator('.feature-bottom').evaluate(el=>getComputedStyle(el).textAlign);
  assert.equal(heroAlign,'center','Hero headline and call-to-action form a centered resting point');
  assert.doesNotMatch(await page.locator('.feature-today').innerText(),/[↗✳◌✨📚🚀]/u);

  assert.match(await page.title(),/Learning/);
  const manifest=await page.locator('link[rel=manifest]').getAttribute('href');assert.equal(manifest,'./manifest.webmanifest');
  const sizes=await page.evaluate(()=>({
   viewport:innerWidth,doc:document.documentElement.scrollWidth,screen:document.querySelector('.screen')!.getBoundingClientRect().width,
   tabs:Array.from(document.querySelectorAll('.dock a')).map(e=>Math.round(e.getBoundingClientRect().width)),
   dock:document.querySelector('.dock')!.getBoundingClientRect().bottom,
   height:innerHeight,
   serif:getComputedStyle(document.body).fontFamily
  }));
  assert.equal(sizes.viewport,393);
  assert.ok(sizes.doc<=393,'no horizontal page overflow');
  assert.equal(sizes.tabs.length,4,'only four business navigation tabs');
  assert.ok(sizes.tabs.every(width=>width>=66),'mobile navigation tabs remain readable');
  assert.ok(sizes.dock<=sizes.height,'dock fits viewport');
  assert.match(sizes.serif,/serif/i);
  await page.screenshot({path:join(dir,'mobile-learning.png'),fullPage:true});
  await page.locator('a[data-nav=plan]').click();
  assert.equal(await page.locator('#connectDialog').count(),0);
  assert.equal(await page.getByRole('button',{name:'连接',exact:true}).count(),0);
  await page.locator('#taskForm').waitFor();
  assert.equal(await page.locator('.composer-pane h2').evaluate(el=>getComputedStyle(el).textAlign),'center');
  assert.equal(await page.locator('#taskForm button .micro-arrow').count(),1);

  await page.locator('#taskForm input[name=title]').fill('极点配置');
  await page.locator('#taskForm button').click();
  await page.getByText('极点配置',{exact:true}).first().waitFor();
  await page.locator('[data-edit]').first().click();
  const dueDay=await page.evaluate(()=>{
   const d=new Date(Date.now()+5*86_400_000);
   return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  });
  await page.locator('.task-inline-edit input[name=planned_for]').fill(dueDay);
  await page.locator('.task-inline-edit input[name=due_local]').fill(dueDay+'T20:00');
  await page.locator('.task-inline-edit input[name=estimated_minutes]').fill('75');
  await page.locator('.task-inline-edit button[type=submit]').click();
  await page.locator('.task-inline-edit[hidden]').waitFor({state:'attached'});
  await page.screenshot({path:join(dir,'mobile-plan.png'),fullPage:true});
  await page.locator('a[data-nav=library]').click();
  await page.locator('#objectForm').waitFor();
  assert.equal(await page.locator('.library-objects').count(),1);
  assert.equal(await page.locator('.library-materials').count(),1);
  assert.equal(await page.locator('.library-flow .panel').count(),0,'Library must not use twin dense cards');
  assert.equal(await page.locator('#objectForm button svg.micro-arrow').count(),1);
  assert.equal(await page.locator('#fileForm .upload-mark svg.micro-plus').count(),1);
  assert.equal(await page.locator('.object-overview>div').first().evaluate(el=>getComputedStyle(el).textAlign),'center');

  await page.locator('#objectForm input[name=title]').fill('现代控制');
  await page.locator('#objectForm button').click();
  await page.getByText('现代控制',{exact:true}).first().waitFor();
  await page.locator('.course-context-panel').waitFor();
  assert.match(await page.locator('.course-context-panel').innerText(),/确认前不会进入重要度判断/);
  const objectiveForm=page.locator('form[data-context-add=objective]');
  await objectiveForm.locator('input[name=title]').fill('掌握状态空间模型分析');
  await objectiveForm.locator('button[type=submit]').click();
  await page.getByText('掌握状态空间模型分析',{exact:true}).waitFor();
  const assessmentForm=page.locator('form[data-context-add=assessment]');
  await assessmentForm.locator('input[name=title]').fill('期末考试');
  await assessmentForm.locator('input[name=weight_percent]').fill('60');
  await assessmentForm.locator('button[type=submit]').click();
  await page.getByText('期末考试',{exact:true}).waitFor();
  assert.match(await page.locator('.context-evidence').innerText(),/已确认目标\s*1/);
  assert.match(await page.locator('.context-evidence').innerText(),/有权重考核\s*1/);
  await page.locator('#fileForm input[type=file]').setInputFiles({
   name:'study-note.txt',mimeType:'text/plain',buffer:Buffer.from('Learning browser regression note')
  });
  assert.equal(await page.locator('#fileName').innerText(),'study-note.txt','custom file picker reflects the selected filename');
  await page.locator('#fileForm button').click();
  await page.locator('.resource-list .row-title',{hasText:'study-note.txt'}).waitFor();
  await page.locator('[data-context-edit]').first().click();
  const objectiveEdit=page.locator('[data-context-edit-form]').first();
  await objectiveEdit.locator('select[name=source_resource_id]').selectOption({label:'study-note.txt'});
  await objectiveEdit.locator('input[name=source_locator]').fill('第 1 章 · 学习目标');
  await objectiveEdit.locator('button[type=submit]').click();
  await page.getByText(/来源 study-note\.txt/).first().waitFor();
  const libSize=await page.evaluate(()=>({
   viewport:innerWidth,scroll:document.documentElement.scrollWidth,
   sections:Array.from(document.querySelectorAll('.library-objects,.course-context-panel,.library-materials')).map(el=>({
    width:Math.round(el.getBoundingClientRect().width),left:Math.round(el.getBoundingClientRect().left)
   }))
  }));
  assert.ok(libSize.scroll<=libSize.viewport,'Library never scrolls horizontally');
  assert.ok(libSize.sections.every(s=>s.width>300 && s.left>=0),'Library sections have full mobile width');
  await page.locator('.workarea').evaluate(el=>el.scrollTo(0,el.scrollHeight));
  await page.waitForFunction(()=>{const el=document.querySelector('.workarea');return !!el&&el.scrollTop>=el.scrollHeight-el.clientHeight-2;});
  const fileLayout=await page.evaluate(()=>{
   const picker=document.querySelector('.file-picker')!.getBoundingClientRect();
   const submit=document.querySelector('#fileForm .button')!.getBoundingClientRect();
   const scrollArea=document.querySelector('.workarea')!.getBoundingClientRect();
   return {pickerBottom:picker.bottom,submitTop:submit.top,submitBottom:submit.bottom,scrollAreaBottom:scrollArea.bottom,scrollTop:document.querySelector('.workarea')!.scrollTop,scrollHeight:document.querySelector('.workarea')!.scrollHeight,clientHeight:document.querySelector('.workarea')!.clientHeight};
  });
  assert.ok(fileLayout.submitTop>=fileLayout.pickerBottom+8,'Library picker and upload action do not overlap');
  assert.ok(fileLayout.submitBottom<=fileLayout.scrollAreaBottom,'Library upload action remains reachable above the fixed dock: '+JSON.stringify(fileLayout));
  await page.screenshot({path:join(dir,'mobile-library.png'),fullPage:true});
  await page.locator('a[data-nav=learn]').click();
  await page.locator('#focusForm').waitFor();
  assert.equal(await page.locator('.focus-stage').evaluate(el=>getComputedStyle(el).textAlign),'center');
  assert.equal(await page.locator('.focus-decoration svg.micro-orbit').count(),1);
  assert.equal(await page.locator('#focusForm button .micro-arrow').count(),1);

  await page.locator('#focusForm button').click();
  await page.locator('#elapsed').waitFor();
  await page.locator('button[data-action=finish]').click();
  await page.getByText('学习记录',{exact:true}).waitFor();
  await page.locator('a[data-nav=today]').click();
  await page.getByText('极点配置',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.deadline-line>div').count(),1,'edited deadline appears in Today');
  assert.equal(await page.locator('.today-priority-button').first().innerText(),'今天先做');
  await page.locator('.today-priority-button').first().click();
  await page.locator('.today-priority-button').first().getByText('已优先').waitFor();
  await page.locator('.today-switch button[data-today-pane=all]').click();
  await page.getByText('全部待办',{exact:true}).waitFor();
  await page.locator('.today-switch button[data-today-pane=deadline]').click();
  await page.getByText('截止任务',{exact:true}).waitFor();
  await page.locator('.today-switch button[data-today-pane=day]').click();
  await page.screenshot({path:join(dir,'mobile-today.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const exportDir=join(process.cwd(),'.visual');
  const fs=await import('node:fs');
  fs.mkdirSync(exportDir,{recursive:true});
  for(const name of ['mobile-learning.png','mobile-plan.png','mobile-today.png','mobile-library.png'])fs.copyFileSync(join(dir,name),join(exportDir,name));
  await context.close();
  const desktop=await browser.newContext({viewport:{width:1440,height:900}});
  const p2=await desktop.newPage();await p2.goto('http://127.0.0.1:'+addr.port+'/');
  await p2.screenshot({path:join(exportDir,'desktop-learning.png'),fullPage:true});
  assert.equal(await p2.locator('.head h1').innerText(),'Learning');
  assert.equal(await p2.locator('.dock a').count(),4);
  await desktop.close();
  // iPhone network handoff regression: retry safe reads and self-heal on reconnection.
  const recoveryContext=await browser.newContext({viewport:{width:393,height:759},isMobile:true,hasTouch:true});
  const recoveryPage=await recoveryContext.newPage();
  let readAttempts=0;
  await recoveryPage.route('**/api/today*',async route=>{
   readAttempts++;
   if(readAttempts<=2)await route.abort('failed');
   else await route.continue();
  });
  await recoveryPage.goto('http://127.0.0.1:'+addr.port+'/',{waitUntil:'domcontentloaded'});
  await recoveryPage.locator('.feature-today').waitFor({timeout:8000});
  assert.equal(readAttempts,3,'two failed GETs recover via safe retries');
  await recoveryPage.unroute('**/api/today*');
  await recoveryPage.route('**/api/today*',route=>route.abort('failed'));
  await recoveryPage.reload({waitUntil:'domcontentloaded'});
  await recoveryPage.locator('#retry').waitFor({timeout:8000});
  assert.match(await recoveryPage.locator('.screen').innerText(),/网络连接暂时中断/,'network errors use clear Chinese guidance');
  await recoveryPage.unroute('**/api/today*');
  await recoveryPage.evaluate(()=>window.dispatchEvent(new Event('online')));
  await recoveryPage.locator('.feature-today').waitFor({timeout:8000});
  assert.equal(await recoveryPage.locator('#retry').count(),0,'online event restores Today automatically');
  await recoveryContext.close();
  // iPhone 15 PWA regression: the CSS layout viewport can be shorter than screen.height.
  // Never grow the app shell beyond the actually visible viewport; doing so hides the dock below a black band.
  const pwa=await browser.newContext({viewport:{width:393,height:759},screen:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await pwa.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true,configurable:true});});
  const pwaPage=await pwa.newPage();
  await pwaPage.goto('http://127.0.0.1:'+addr.port+'/');
  const pwaDims=await pwaPage.evaluate(()=>{
   document.documentElement.style.setProperty('--safe-top','59px');
   document.documentElement.style.setProperty('--safe-bottom','34px');
   dispatchEvent(new Event('resize'));
   const shell=document.querySelector('.shell')!.getBoundingClientRect();
   const wallpaper=document.querySelector('.wallpaper')!.getBoundingClientRect();
   const dock=document.querySelector('.dock')!.getBoundingClientRect();
   return {shellHeight:shell.height,wallpaperHeight:wallpaper.height,dockBottom:dock.bottom,
    dockTop:dock.top,screenHeight:screen.height,viewportHeight:innerHeight,
    visualHeight:visualViewport?.height,bodyWidth:document.body.scrollWidth};
  });
  assert.equal(pwaDims.viewportHeight,759,'PWA test simulates a truncated visible window');
  assert.equal(pwaDims.screenHeight,852,'device reports the taller physical screen');
  const rootUnit=await pwaPage.evaluate(()=>({
   html:getComputedStyle(document.documentElement).height,
   body:getComputedStyle(document.body).height,
   app:document.documentElement.style.getPropertyValue('--app-height')
  }));
  assert.equal(rootUnit.app,'100vh','standalone app is sized by CSS 100vh, not innerHeight or screen.height');
  assert.equal(rootUnit.html,'759px','Chromium CSS 100vh stays at the available viewport height');
  assert.equal(rootUnit.body,'759px','the body resolves 100vh without the 100%-root WebKit gap');
  assert.equal(pwaDims.shellHeight,759,'app shell fits visible PWA viewport, not screen.height');
  assert.equal(pwaDims.wallpaperHeight,759,'background paints the actual PWA viewport');
  assert.ok(pwaDims.dockTop>=0&&pwaDims.dockBottom>=749&&pwaDims.dockBottom<=751,
    'iPhone PWA dock sits 8–10px from viewport bottom after an additional 2px lift');
  assert.ok(pwaDims.bodyWidth<=393,'no horizontal overflow with safe areas');
  await pwaPage.setViewportSize({width:393,height:700});
  await pwaPage.waitForFunction(()=>Math.round(document.querySelector('.shell')!.getBoundingClientRect().height)===innerHeight);
  const resized=await pwaPage.evaluate(()=>({
   shell:document.querySelector('.shell')!.getBoundingClientRect().height,
   dock:document.querySelector('.dock')!.getBoundingClientRect().bottom,
   wallpaper:document.querySelector('.wallpaper')!.getBoundingClientRect().height,
   viewport:innerHeight
  }));
  assert.equal(resized.viewport,700,'viewport resize is reported');
  assert.equal(resized.shell,700,'PWA shell follows viewport resizing');
  assert.equal(resized.wallpaper,700,'background follows viewport resizing');
  assert.ok(resized.dock>=690&&resized.dock<=692,'dock remains 8–10px from bottom after resizing');
  await pwa.close();
 }finally{
  await browser.close();
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();rmSync(dir,{recursive:true,force:true});
 }
});
