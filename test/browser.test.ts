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
  const context=await browser.newContext({viewport:{width:393,height:852},screen:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true,timezoneId:'Asia/Taipei'});
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
  assert.equal(await page.locator('.feature-today').count(),0,'Today V3 removes the oversized hero');
  assert.equal(await page.locator('.today-brief').count(),1,'Today follows the approved daily brief layout');
  assert.equal(await page.locator('.today-agenda').count(),1);
  assert.equal(await page.locator('.today-review').count(),1);
  assert.equal(await page.locator('.today-view-switch button').count(),2,'backlog switches only between list and matrix');
  assert.equal(await page.locator('.today-start-action').innerText().then(v=>v.includes('开始学习')),true);
  await page.locator('.today-view-switch button[data-task-view=matrix]').click();
  await page.locator('.today-matrix').waitFor();
  assert.equal(await page.locator('.matrix-axis').count(),2,'matrix frame is visible without invented task points');
  assert.match(await page.locator('.today-matrix-note').innerText(),/不伪造任务位置/);
  await page.locator('.today-view-switch button[data-task-view=list]').click();
  await page.waitForFunction(()=>document.querySelector('.today-start-action')?.classList.contains('learning-liquid'));
  assert.equal(await page.locator('.today-start-action canvas.learning-liquid-optics').count(),1,'start action uses the real liquid-glass shader');
  const titleMask=await page.locator('.today-head').evaluate(el=>getComputedStyle(el,'::before').content);
  assert.equal(titleMask,'none','Today no longer draws a local title-card mask');
  const wallpaperMask=await page.locator('.wallpaper').evaluate(el=>{
   const s=getComputedStyle(el,'::after');
   return {content:s.content,background:s.backgroundColor,filter:s.backdropFilter};
  });
  assert.notEqual(wallpaperMask.content,'none','the wallpaper owns a full-screen theme mask');
  assert.notEqual(wallpaperMask.background,'rgba(0, 0, 0, 0)');
  assert.match(wallpaperMask.filter,/saturate/i);

  await page.evaluate(()=>localStorage.setItem('cove.home.themeMode','light'));
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('#appearance').innerText(),'日');
  const lightTheme=await page.evaluate(()=>({
   bg:getComputedStyle(document.body).backgroundColor,
   title:getComputedStyle(document.querySelector('.head h1')!).color,
   muted:getComputedStyle(document.querySelector('.today-disclaimer')!).color,
   divider:getComputedStyle(document.querySelector('.today-brief')!).borderTopColor,
   dock:getComputedStyle(document.querySelector('.dock')!).backgroundColor,
   button:getComputedStyle(document.querySelector('.today-start-action')!).color,
   overlay:getComputedStyle(document.querySelector('.wallpaper')!,'::after').backgroundColor
  }));
  assert.equal(lightTheme.title,'rgb(0, 0, 0)','day headings are pure black');
  assert.equal(lightTheme.muted,'rgb(0, 0, 0)','day secondary copy is pure black');
  assert.equal(lightTheme.divider,'rgb(0, 0, 0)','day dividers are pure black');
  assert.equal(lightTheme.button,'rgb(0, 0, 0)','day primary action text is pure black');
  await page.screenshot({path:join(dir,'mobile-today-light.png'),fullPage:true});
  await page.locator('#appearance').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await page.locator('#appearance').innerText(),'夜');
  const darkTheme=await page.evaluate(()=>({
   title:getComputedStyle(document.querySelector('.head h1')!).color,
   dock:getComputedStyle(document.querySelector('.dock')!).backgroundColor,
   overlay:getComputedStyle(document.querySelector('.wallpaper')!,'::after').backgroundColor
  }));
  assert.notEqual(darkTheme.title,lightTheme.title,'day and night have distinct foreground colors');
  assert.notEqual(darkTheme.dock,lightTheme.dock,'day and night have distinct glass surfaces');
  assert.notEqual(darkTheme.overlay,lightTheme.overlay,'day brightens and night darkens the entire wallpaper');
  await page.screenshot({path:join(dir,'mobile-today-dark.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','manual night choice survives reload');
  assert.equal(await page.locator('#appearance').innerText(),'夜');
  await page.locator('#appearance').click();
  assert.equal(await page.locator('#appearance').innerText(),'自动','third mode follows the system');

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
  assert.match(await page.locator('meta[name=viewport]').getAttribute('content')??'',/interactive-widget=overlays-content/,'software keyboard overlays instead of resizing layout');
  const wallpaperInput=page.locator('.top-actions input[type=file][accept="image/*"]');
  await wallpaperInput.setInputFiles({
   name:'wallpaper.svg',mimeType:'image/svg+xml',
   buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="#24304b"/></svg>')
  });
  await page.waitForFunction(()=>Boolean((window as any).__coveLearningGlass?.isUsingPhoto()));
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean((window as any).__coveLearningGlass?.isUsingPhoto()),null,{timeout:5000});
  assert.equal(await page.locator('.head h1').innerText(),'Learning','saved wallpaper survives a full reload');
  await page.screenshot({path:join(dir,'mobile-learning.png'),fullPage:true});
  const planDate=await page.evaluate(()=>{const d=new Date();return {day:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),weekday:d.getDay()===0?7:d.getDay()};});
  app.schedule.create({title:'固定课表回归',weekday:planDate.weekday,start_time:'08:00',end_time:'09:35',effective_from:planDate.day});
  app.schedule.create({title:'当前时间轴回归',weekday:planDate.weekday,start_time:'00:00',end_time:'23:59',effective_from:planDate.day});
  await page.locator('a[data-nav=plan]').click();
  await page.locator('.plan-calendar').waitFor();
  assert.equal(await page.locator('#connectDialog').count(),0);
  assert.equal(await page.getByRole('button',{name:'连接',exact:true}).count(),0);
  assert.equal(await page.locator('.composer-pane').count(),0,'large task composer no longer occupies the Plan page');
  assert.equal(await page.locator('.head').count(),0,'Plan does not repeat the generic COVE / LEARNING hero header');
  assert.equal(await page.locator('.plan-top-row').count(),1,'Plan uses one compact title/action row');
  assert.equal(await page.locator('.plan-top-row h1').innerText(),'Plan');
  assert.equal(await page.locator('.plan-top-row #addPlan').innerText().then(text=>text.includes('添加计划')),true);
  const planHeaderGeometry=await page.locator('.plan-top-row').evaluate(el=>{const box=el.getBoundingClientRect();const title=el.querySelector('h1')!.getBoundingClientRect();const action=el.querySelector('#addPlan')!.getBoundingClientRect();return {height:box.height,titleTop:title.top,actionTop:action.top,titleBottom:title.bottom,actionBottom:action.bottom};});
  assert.ok(planHeaderGeometry.height<60,'Plan title/action row stays compact on iPhone');
  assert.ok(Math.abs((planHeaderGeometry.titleTop+planHeaderGeometry.titleBottom)/2-(planHeaderGeometry.actionTop+planHeaderGeometry.actionBottom)/2)<4,'Plan and add action share one visual row');
  assert.equal(await page.locator('.plan-day-button').count(),7,'Plan exposes a compact seven-day calendar strip');
  await page.getByText('固定课表回归',{exact:true}).waitFor();
  await page.getByText('当前时间轴回归',{exact:true}).waitFor();
  assert.equal(await page.locator('.plan-now-marker.in-event').count(),1,'current-time marker is positioned inside the real active interval');
  assert.equal(await page.locator('.plan-now-marker.in-event').evaluate(el=>el.parentElement?.classList.contains('current')),true);
  await page.locator('#addPlan').click();
  await page.locator('#planDialog[open]').waitFor();
  await page.locator('#taskForm').waitFor();
  assert.equal(await page.locator('#taskForm button .micro-arrow').count(),1);
  const keyboardLayout=await page.evaluate(()=>{
   const viewport=(window as any).__coveLearningViewport;
   const shell=document.querySelector('.shell')!.getBoundingClientRect().height;
   viewport.simulateKeyboard(420);
   const frozen=document.querySelector('.shell')!.getBoundingClientRect().height;
   const marked=viewport.isKeyboardOpen();
   viewport.adjust();
   return {shell,frozen,marked};
  });
  assert.equal(keyboardLayout.marked,true,'keyboard state is detected');
  assert.equal(Math.round(keyboardLayout.frozen),Math.round(keyboardLayout.shell),'keyboard does not squash the app shell');

  const dueDay=await page.evaluate(()=>{
   const d=new Date(Date.now()+5*86_400_000);
   return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  });
  await page.locator('#taskForm input[name=title]').fill('极点配置');
  await page.locator('#taskForm input[name=due_local]').fill(dueDay+'T20:00');
  await page.locator('#taskForm button[type=submit]').click();
  await page.getByText('极点配置',{exact:true}).first().waitFor();
  await page.locator('[data-edit]').first().click();
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

  await page.locator('a[data-nav=plan]').click();
  await page.locator('#addPlan').click();
  await page.locator('#taskForm').waitFor();
  await page.locator('#taskForm input[name=title]').fill('状态空间复习');
  await page.locator('#taskForm select[name=object_id]').selectOption({label:'现代控制'});
  await page.locator('#taskForm input[name=due_local]').fill(dueDay+'T21:00');
  await page.locator('#taskForm button[type=submit]').click();
  const evidenceTaskRow=page.locator('.plan-task').filter({hasText:'状态空间复习'});
  await evidenceTaskRow.waitFor();
  await evidenceTaskRow.locator('[data-evidence]').click();
  const evidencePanel=evidenceTaskRow.locator('.task-evidence-editor');
  await evidencePanel.getByText('课程证据',{exact:true}).waitFor();
  assert.match(await evidencePanel.innerText(),/这里只建立事实关联/);
  assert.equal(await evidencePanel.locator('.evidence-link-toggle').count(),2,'course task sees only confirmed course evidence');
  const objectiveLink=evidencePanel.locator('.evidence-link-toggle').filter({hasText:'掌握状态空间模型分析'});
  assert.equal(await objectiveLink.getAttribute('aria-pressed'),'false');
  await objectiveLink.click();
  await evidencePanel.locator('.evidence-link-toggle.active').filter({hasText:'掌握状态空间模型分析'}).waitFor();
  assert.match(await evidencePanel.innerText(),/1 已关联/);
  const importanceForm=evidencePanel.locator('[data-importance-form]');
  await importanceForm.waitFor();
  await importanceForm.locator('.contribution-switch label').filter({hasText:'高'}).click();
  await importanceForm.locator('button[type=submit]').click();
  await evidencePanel.locator('[data-importance-clear]').waitFor();
  assert.equal(await evidencePanel.locator('input[name=contribution][value=high]').isChecked(),true,'high contribution persists after save');
  assert.equal(await evidencePanel.locator('[data-importance-clear]').count(),1,'confirmed importance can be cleared explicitly');

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
  await page.getByText('状态空间复习',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.today-task-card').count(),2,'both open tasks appear in the ranked backlog');
  const deadlineCard=page.locator('.today-task-card').filter({hasText:'极点配置'});
  const evidenceCard=page.locator('.today-task-card').filter({hasText:'状态空间复习'});
  assert.match(await deadlineCard.innerText(),/距截止/,'deadline distance is visible in the approved compact layout');
  assert.match(await evidenceCard.innerText(),/重要度 高/,'Today shows the user-confirmed ordinal importance');
  assert.match(await evidenceCard.innerText(),/证据 掌握状态空间模型分析/,'Today explains linked course evidence');
  assert.equal(await deadlineCard.locator('.today-priority-button').innerText(),'今天先做');
  await deadlineCard.locator('.today-priority-button').click();
  await deadlineCard.locator('.today-priority-button').getByText('已优先').waitFor();
  await page.locator('.today-view-switch button[data-task-view=matrix]').click();
  await page.locator('.today-matrix').waitFor();
  assert.equal(await page.locator('.matrix-point').count(),1,'only tasks with confirmed importance receive a coordinate point');
  assert.match(await page.locator('.matrix-legend').innerText(),/状态空间复习/);
  assert.match(await page.locator('.matrix-legend').innerText(),/高重要/);
  assert.match(await page.locator('.today-matrix-note').innerText(),/未确认任务不会被伪造位置/);
  await page.locator('.today-view-switch button[data-task-view=list]').click();
  await page.getByText('极点配置',{exact:true}).first().waitFor();
  await page.screenshot({path:join(dir,'mobile-today.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const exportDir=join(process.cwd(),'.visual');
  const fs=await import('node:fs');
  fs.mkdirSync(exportDir,{recursive:true});
  for(const name of ['mobile-learning.png','mobile-plan.png','mobile-today.png','mobile-library.png','mobile-today-light.png','mobile-today-dark.png'])fs.copyFileSync(join(dir,name),join(exportDir,name));
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
  await recoveryPage.locator('.today-brief').waitFor({timeout:8000});
  assert.equal(readAttempts,3,'two failed GETs recover via safe retries');
  await recoveryPage.unroute('**/api/today*');
  await recoveryPage.route('**/api/today*',route=>route.abort('failed'));
  await recoveryPage.reload({waitUntil:'domcontentloaded'});
  await recoveryPage.locator('#retry').waitFor({timeout:8000});
  assert.match(await recoveryPage.locator('.screen').innerText(),/网络连接暂时中断/,'network errors use clear Chinese guidance');
  await recoveryPage.unroute('**/api/today*');
  await recoveryPage.evaluate(()=>window.dispatchEvent(new Event('online')));
  await recoveryPage.locator('.today-brief').waitFor({timeout:8000});
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
