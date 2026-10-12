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
  await page.locator('.door').first().waitFor();
  assert.equal(await page.locator('.door').count(),4);
  assert.match(await page.title(),/Learning/);
  const manifest=await page.locator('link[rel=manifest]').getAttribute('href');assert.equal(manifest,'./manifest.webmanifest');
  const sizes=await page.evaluate(()=>({
   viewport:innerWidth,doc:document.documentElement.scrollWidth,screen:document.querySelector('.screen')!.getBoundingClientRect().width,
   cards:Array.from(document.querySelectorAll('.door')).map(e=>Math.round(e.getBoundingClientRect().width)),
   dock:document.querySelector('.dock')!.getBoundingClientRect().bottom,
   height:innerHeight,
   serif:getComputedStyle(document.body).fontFamily
  }));
  assert.equal(sizes.viewport,393);
  assert.ok(sizes.doc<=393,'no horizontal page overflow');
  assert.ok(sizes.cards.every(width=>width<200),'doors fit two small columns');
  assert.ok(sizes.dock<=sizes.height,'dock fits viewport');
  assert.match(sizes.serif,/serif/i);
  await page.screenshot({path:join(dir,'mobile-home.png'),fullPage:true});
  await page.locator('a[data-nav=plan]').click();
  assert.equal(await page.locator('#connectDialog').count(),0);
  assert.equal(await page.getByRole('button',{name:'连接',exact:true}).count(),0);
  await page.locator('#taskForm').waitFor();
  await page.locator('#taskForm input[name=title]').fill('极点配置');
  await page.locator('#taskForm button').click();
  await page.getByText('极点配置',{exact:true}).waitFor();
  await page.screenshot({path:join(dir,'mobile-plan.png'),fullPage:true});
  await page.locator('a[data-nav=learn]').click();
  await page.locator('#focusForm').waitFor();
  await page.locator('#focusForm button').click();
  await page.locator('#elapsed').waitFor();
  await page.locator('button[data-action=finish]').click();
  await page.getByText('学习记录',{exact:true}).waitFor();
  await page.locator('a[data-nav=today]').click();
  await page.getByText('极点配置',{exact:true}).waitFor();
  await page.screenshot({path:join(dir,'mobile-today.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const exportDir='/home/ubuntu/projects/cove-learning-next/.visual';
  const fs=await import('node:fs');
  fs.mkdirSync(exportDir,{recursive:true});
  for(const name of ['mobile-home.png','mobile-plan.png','mobile-today.png'])fs.copyFileSync(join(dir,name),join(exportDir,name));
  await context.close();
  const desktop=await browser.newContext({viewport:{width:1440,height:900}});
  const p2=await desktop.newPage();await p2.goto('http://127.0.0.1:'+addr.port+'/');
  await p2.screenshot({path:join(exportDir,'desktop-home.png'),fullPage:true});
  assert.ok(await p2.locator('.hub-grid').isVisible());
  await desktop.close();
  // iPhone 15 standalone regression: iOS can report a shorter visual viewport than screen.
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
   return {shellHeight:shell.height,wallpaperHeight:wallpaper.height,dockBottom:dock.bottom,screenHeight:screen.height,bodyWidth:document.body.scrollWidth};
  });
  assert.equal(pwaDims.shellHeight,852,'PWA shell spans iPhone physical CSS screen');
  assert.equal(pwaDims.wallpaperHeight,852,'background paints full PWA height');
  assert.ok(pwaDims.dockBottom<=818,'dock stays clear of iPhone home indicator');
  assert.ok(pwaDims.bodyWidth<=393,'no horizontal overflow with safe areas');
  await pwa.close();
 }finally{
  await browser.close();
  await new Promise<void>(done=>server.close(()=>done()));
  app.close();rmSync(dir,{recursive:true,force:true});
 }
});
