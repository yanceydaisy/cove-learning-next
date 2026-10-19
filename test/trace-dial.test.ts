import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,type Page} from 'playwright';
import {LearningApplication} from '../src/core/application.js';
import {createHttp} from '../src/adapters/http.js';

test('Ephemeris: calendar, proportional intervals, and touch gestures do not switch needles',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ephemeris-')),app=new LearningApplication(dir);
 const server=createHttp(app,resolve(fileURLToPath(new URL('../public',import.meta.url))));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();if(!address||typeof address==='string')throw Error('No port');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:393,height:1100},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const iso=(day:string,time:string)=>day+'T'+time+':00+08:00';
  const records=[
   {id:'a',title:'一小时记录',started_at:iso('2024-02-29','09:00'),ended_at:iso('2024-02-29','10:00'),focused_minutes:45,activity_type:'study'},
   {id:'b',title:'两小时记录',started_at:iso('2024-02-29','12:00'),ended_at:iso('2024-02-29','14:00'),focused_minutes:100,activity_type:'study'},
   {id:'c',title:'跨午夜记录',started_at:iso('2024-02-29','23:30'),ended_at:iso('2024-03-01','00:30'),focused_minutes:60,activity_type:'reading'}
  ];
  await page.route('**/api/tasks',r=>r.fulfill({json:[{id:'t',status:'done',title:'完成节点',updated_at:iso('2024-02-29','15:00')}]}));
  await page.route('**/api/focus/history',r=>r.fulfill({json:{sessions:[{id:'f',started_at:iso('2024-02-29','10:30'),ended_at:'2024-02-29T10:30:30+08:00',accumulated_ms:30000,state:'finished'}]}}));
  await page.route('**/api/objects',r=>r.fulfill({json:[]}));
  await page.route('**/api/learning-records',r=>r.fulfill({json:records}));
  await page.goto('http://127.0.0.1:'+address.port+'/trace-dial',{waitUntil:'networkidle'});
  assert.match(await page.title(),/刻序 \/ EPHEMERIS/);
  assert.equal(await page.locator('#dayHand').getAttribute('aria-valuemax'),'29');
  const tickAngles=await page.locator('.time-tick.major').evaluateAll(nodes=>nodes.map(n=>Number((n as SVGElement).dataset.angle)));
  assert.deepEqual(tickAngles,Array.from({length:13},(_,i)=>-90+i*15),'twelve full, equal major divisions');
  assert.equal(await page.locator('.month-label-group').count(),12);
  assert.equal(await page.locator('.event-node').count(),5,'point task, a short focus session and three learning intervals');
  const arcs=await page.locator('.event-duration').evaluateAll(nodes=>nodes.map(n=>[Number((n as SVGElement).dataset.startMinute),Number((n as SVGElement).dataset.endMinute),Number((n as SVGElement).dataset.angleSpan)]));
  assert.deepEqual(arcs,[[540,600,7.5],[630,630.5,.0625],[720,840,15],[1410,1440,3.75]],'elapsed duration, not focused minutes, controls arc length');
  await page.locator('.event-node[data-minute="540"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'540');
  assert.match(await page.locator('#eventHand').getAttribute('transform')||'',/rotate\(-22.5\)/,'9am has fixed position independent of record count');
  await page.locator('.month-label-group[data-month="3"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.locator('#dayHand').press('Home');
  assert.equal(await page.locator('#dayHand').getAttribute('aria-valuemax'),'31');
  assert.deepEqual(await page.locator('.event-duration').evaluateAll(nodes=>nodes.map(n=>[(n as SVGElement).dataset.startMinute,(n as SVGElement).dataset.endMinute])),[['0','30']],'midnight continuation appears on the next day');
  await page.locator('#dayHand').press('ArrowRight');
  assert.equal(await page.locator('.event-node').count(),0);
  assert.equal(await page.locator('#eventHand').getAttribute('aria-disabled'),null,'time needle works on empty days');
  await page.locator('#eventHand').press('Home');assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'0');
  await page.locator('#eventHand').press('End');assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'1440');

  // Put all three hands on the same angle; screen-space radius must disambiguate.
  await page.locator('.month-label-group[data-month="6"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.locator('#dayHand').press('Home');
  for(let i=1;i<16;i++)await page.locator('#dayHand').press('ArrowRight');
  await page.locator('#eventHand').press('Home');
  for(let i=0;i<12;i++)await page.locator('#eventHand').press('Shift+ArrowRight');
  const cdp=await context.newCDPSession(page);
  async function touchDrag(kind:string,radius:number,targetAngle:number){
   const points=await page.evaluate(({kind,radius,targetAngle})=>{
    const hand=document.querySelector('#'+kind+'Hand') as SVGGraphicsElement,svg=document.querySelector('#traceDial') as SVGSVGElement;
    const from=new DOMPoint(radius,0).matrixTransform(hand.getScreenCTM()!);
    const radians=targetAngle*Math.PI/180;
    const to=new DOMPoint(58+Math.cos(radians)*radius,470+Math.sin(radians)*radius).matrixTransform(svg.getScreenCTM()!);
    return {from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}};
   },{kind,radius,targetAngle});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points.from,id:1}]});
   assert.equal(await page.locator('#dialStage').getAttribute('data-active-hand'),kind,'grab chooses '+kind);
   for(let i=1;i<=14;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:points.from.x+(points.to.x-points.from.x)*i/14,y:points.from.y+(points.to.y-points.from.y)*i/14,id:1}]});
    await page.waitForTimeout(16);
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  const month=await page.locator('#monthHand').getAttribute('aria-valuenow');
  const day=await page.locator('#dayHand').getAttribute('aria-valuenow');
  await touchDrag('event',332,35);
  assert.equal(await page.locator('#monthHand').getAttribute('aria-valuenow'),month);
  assert.equal(await page.locator('#dayHand').getAttribute('aria-valuenow'),day);
  assert.ok(Math.abs(Number(await page.locator('#eventHand').getAttribute('aria-valuenow'))-1000)<=1,'long hand follows touch and does not fling');
  const minute=await page.locator('#eventHand').getAttribute('aria-valuenow');
  await touchDrag('day',265,-30);
  assert.equal(await page.locator('#monthHand').getAttribute('aria-valuenow'),month,'middle hand never moves short hand');
  assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),minute);
  assert.equal(await page.locator('#dayHand').getAttribute('aria-valuenow'),'10');
  assert.equal(await page.locator('.is-dragging').count(),0);
  // A second fast gesture must not be lost to the previous drag's click suppression.
  await touchDrag('event',390,-60);
  assert.ok(Math.abs(Number(await page.locator('#eventHand').getAttribute('aria-valuenow'))-240)<=1);
  for(const width of [320,375,414]){
   await page.setViewportSize({width,height:1100});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.evaluate(()=>{
    const svg=document.querySelector('#traceDial') as SVGSVGElement,m=svg.getScreenCTM()!;
    return {ratio:416*Math.hypot(m.a,m.b)/innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.ok(Math.abs(layout.ratio-.75)<.002);assert.equal(layout.overflow,false);
  }
  // Empty right-side space still scrolls the document instead of swallowing gestures.
  await page.setViewportSize({width:393,height:700});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:375,y:560,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:375,y:560-i*28,id:1}]});await page.waitForTimeout(16)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.evaluate(()=>scrollY)>20,'blank area preserves page scrolling');
  assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));app.close();rmSync(dir,{recursive:true,force:true})}
});
