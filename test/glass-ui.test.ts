import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

const root=resolve(fileURLToPath(new URL('../public',import.meta.url)));
const shots=resolve(fileURLToPath(new URL('../.visual',import.meta.url)));

test('default V5 Learning UI keeps real study workflow and offers classic rollback',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-glass-'));
 const app=new LearningApplication(dir);
 const server=createHttp(app,root);
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();
 if(!address||typeof address==='string')throw Error('No port');
 const url='http://127.0.0.1:'+address.port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors:string[]=[];
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},screen:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('.feature-today canvas.learning-liquid-optics').waitFor({timeout:9000});
  await page.waitForFunction(()=>Boolean((window as any).__coveLearningGlass?.activeCards()===1));
  const details=await page.evaluate(()=>{
   const dock=document.querySelector('.dock')!.getBoundingClientRect();
   const feature=document.querySelector('.feature-today')!;
   return {
    mode:document.documentElement.dataset.learningUi,
    webgl:feature.querySelector('canvas')?.getContext('webgl')!==null,
    fallback:feature.classList.contains('liquid-fallback'),
    wallpaper:getComputedStyle(document.querySelector('.wallpaper')!).backgroundImage.slice(0,26),
    dockBottom:dock.bottom,height:innerHeight,
    width:document.documentElement.scrollWidth,
    cardBackground:getComputedStyle(feature).backgroundColor
   };
  });
  assert.equal(details.mode,'glass');
  assert.equal(await page.evaluate(()=>(window as any).__coveLearningGlass?.mode),'default');
  assert.equal(await page.locator('.wallpaper-picker').count(),1,'wallpaper picker is available on the real Learning homepage');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#0b1020');
  assert.equal(details.webgl,true);
  assert.equal(details.fallback,false);
  assert.match(details.wallpaper,/data:image\/png/);
  assert.ok(details.dockBottom<=details.height);
  assert.ok(details.width<=393);
  assert.equal(details.cardBackground,'rgba(0, 0, 0, 0)');
  mkdirSync(shots,{recursive:true});
  await page.screenshot({path:join(shots,'glass-today.png')});
  await page.locator('a[data-nav=plan]').click();
  await page.locator('.composer-pane canvas.learning-liquid-optics').waitFor();
  await page.locator('#taskForm input[name=title]').fill('现代控制 · 极点配置');
  await page.locator('#taskForm button').click();
  await page.getByText('现代控制 · 极点配置',{exact:true}).waitFor();
  await page.screenshot({path:join(shots,'glass-plan.png')});
  await page.locator('a[data-nav=learn]').click();
  await page.locator('.focus-stage canvas.learning-liquid-optics').waitFor();
  const focusLayout=await page.evaluate(()=>{
   const card=document.querySelector('.focus-stage')!.getBoundingClientRect();
   const button=document.querySelector('#focusForm button')!.getBoundingClientRect();
   const decoration=getComputedStyle(document.querySelector('.focus-decoration')!).position;
   return {cardBottom:card.bottom,buttonBottom:button.bottom,decoration};
  });
  assert.equal(focusLayout.decoration,'absolute','orbit decoration must not push the focus controls out of view');
  assert.ok(focusLayout.buttonBottom<=focusLayout.cardBottom-10,'focus start button stays inside the glass card');
  await page.screenshot({path:join(shots,'glass-learn.png')});
  await page.locator('#focusForm button').click();
  await page.locator('#elapsed').waitFor();
  await page.locator('button[data-action=finish]').click();
  await page.locator('a[data-nav=library]').click();
  await page.locator('.object-overview canvas.learning-liquid-optics').waitFor();
  await page.locator('#objectForm input[name=title]').fill('现代控制');
  await page.locator('#objectForm button').click();
  await page.getByText('现代控制',{exact:true}).waitFor();
  await page.screenshot({path:join(shots,'glass-library.png')});
  const cards=await page.evaluate(()=>(window as any).__coveLearningGlass?.activeCards());
  assert.equal(cards,1,'old WebGL contexts are disposed on navigation');
  // Photo stays entirely local: file picker reads via data URI, never API upload.
  await page.locator('.top-actions input[type=file]').setInputFiles({
   name:'test-photo.png',mimeType:'image/png',
   buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHn8AAAAASUVORK5CYII=','base64')
  });
  await page.waitForFunction(()=>(window as any).__coveLearningGlass?.isUsingPhoto(),undefined,{timeout:5000});
  await page.reload();
  await page.locator('.object-overview canvas.learning-liquid-optics').waitFor();
  assert.equal(await page.locator('.dock a').count(),4);
  await context.close();
  const baseline=await browser.newPage({viewport:{width:393,height:852}});
  await baseline.goto(url+'/?ui=classic');
  await baseline.locator('.feature-today').waitFor();
  assert.equal(await baseline.locator('.learning-liquid').count(),0);
  assert.equal(await baseline.evaluate(()=>document.documentElement.dataset.learningUi),undefined);
  assert.equal(await baseline.locator('.wallpaper-picker').count(),0);
  await baseline.close();
  // iPhone 15 PWA usable viewport can be shorter than physical screen.
  const pwa=await browser.newContext({viewport:{width:393,height:700},screen:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await pwa.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
  const pwaPage=await pwa.newPage();
  pwaPage.on('pageerror',e=>errors.push(e.message));
  await pwaPage.goto(url+'/?source=pwa#/learn');
  await pwaPage.locator('.focus-stage canvas.learning-liquid-optics').waitFor();
  const pwaSize=await pwaPage.evaluate(()=>({
   dock:document.querySelector('.dock')!.getBoundingClientRect().bottom,
   viewport:innerHeight,body:document.body.scrollWidth,root:document.documentElement.scrollWidth
  }));
  assert.ok(pwaSize.dock<=pwaSize.viewport,'glass dock fits short PWA viewport');
  assert.ok(pwaSize.body<=393&&pwaSize.root<=393,'glass PWA never overflows horizontally');
  await pwa.close();
  const legacyLink=await browser.newPage();
  await legacyLink.goto(url+'/?ui=glass');
  await legacyLink.locator('.feature-today canvas.learning-liquid-optics').waitFor();
  assert.equal(await legacyLink.locator('.wallpaper-picker').count(),1,'old glass link remains compatible');
  await legacyLink.close();
  const sw=readFileSync(join(root,'sw.js'),'utf8');
  assert.match(sw,/cove-learning-v0\.12-20261011-glass/,'PWA shell cache must be refreshed');
  const manifest=JSON.parse(readFileSync(join(root,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.theme_color,'#0b1020');
  assert.equal(manifest.background_color,'#0b1020');
  assert.deepEqual(errors,[],'no uncaught browser errors');
 }finally{
  await browser.close();
  await new Promise<void>((r,j)=>server.close(err=>err?j(err):r()));
  rmSync(dir,{recursive:true,force:true});
 }
});
