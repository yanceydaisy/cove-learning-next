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
 const dir=mkdtempSync(join(tmpdir(),'ephemeris-'));
 let clock=new Date('2024-02-29T10:30:00+08:00');
 const app=new LearningApplication(dir,false,()=>clock);
 const server=createHttp(app,resolve(fileURLToPath(new URL('../public',import.meta.url))));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();if(!address||typeof address==='string')throw Error('No port');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:393,height:1100},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  const page=await context.newPage(),errors:string[]=[];
  // tsx/esbuild names nested functions passed across Playwright's serialization boundary.
  await page.addInitScript('globalThis.__name = (target) => target');
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2024-02-29T18:26:00+08:00'));
  const iso=(day:string,time:string)=>day+'T'+time+':00+08:00';
  const course=app.catalog.create({kind:'course',title:'现代控制理论'}) as {id:string};
  const records=[
   {id:'a',title:'一小时记录',summary:'复习状态空间模型。',next_action:'整理一道例题',note:'检查单位',tags:['复习'],started_at:iso('2024-02-29','09:00'),ended_at:iso('2024-02-29','10:00'),focused_minutes:45,activity_type:'study'},
   {id:'b',title:'两小时记录',summary:('这一段用于核对较长记录能否完整翻页展示，不能靠隐藏内容代替无滚动。\n').repeat(12),started_at:iso('2024-02-29','12:00'),ended_at:iso('2024-02-29','14:00'),focused_minutes:100,activity_type:'study'},
   {id:'c',title:'跨午夜记录',started_at:iso('2024-02-29','23:30'),ended_at:iso('2024-03-01','00:30'),focused_minutes:60,activity_type:'reading'}
  ];
  for(const item of records)app.records.create({...item,...(item.id==='a'?{object_id:course.id}:{}),local_date:'2024-02-29',time_zone:'Asia/Shanghai'});
  const task=app.planning.create({title:'完成节点'}) as any;
  clock=new Date('2024-02-29T15:00:00+08:00');app.planning.complete(task.id);
  clock=new Date('2024-02-29T10:30:00+08:00');const focus=app.activity.start({}) as any;
  clock=new Date('2024-02-29T10:30:30+08:00');app.activity.finish(focus.id);
  await page.goto('http://127.0.0.1:'+address.port+'/trace-dial',{waitUntil:'networkidle'});
  assert.match(await page.title(),/刻序 \/ EPHEMERIS/);
  const ornamentResponse=await context.request.get('http://127.0.0.1:'+address.port+'/assets/trace/ephemeris-tarot.svg');assert.equal(ornamentResponse.status(),200);assert.match(ornamentResponse.headers()['content-type']||'',/image\/svg\+xml/);
  await page.locator('#dialStage[data-font-state=ready]').waitFor();
  assert.ok(await page.evaluate(()=>{let loaded=false;document.fonts.forEach(font=>{if(font.family.replaceAll('"','')==='Ephemeris Song'&&font.status==='loaded')loaded=true});return loaded}),'real Chinese serif face is loaded');
  const fontResponse=await context.request.get('http://127.0.0.1:'+address.port+'/assets/fonts/ephemeris-noto-serif-sc-400-600.woff2');assert.equal(fontResponse.status(),200);assert.equal(fontResponse.headers()['content-type'],'font/woff2');
  assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'1106','opens at current local time, not the latest 23:30 record');
  assert.equal(await page.locator('#readoutMonth').innerText(),'Feb');assert.equal(await page.locator('#readoutDay').innerText(),'29');assert.equal(await page.locator('#readoutClock').innerText(),'18:26');
  const aligned=await page.locator('.dial-key').evaluate(key=>['.key-index','.key-label'].every(selector=>{
   const centres=Array.from(key.querySelectorAll(selector)).map(node=>{const r=node.getBoundingClientRect();return r.y+r.height/2});
   return Math.max(...centres)-Math.min(...centres)<.5;
  }));
  assert.equal(aligned,true,'footer indexes and labels share one horizontal row');

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
  await page.locator('#dialStage[data-load-state=ready][data-font-state=ready]').waitFor();
  await page.locator('#dayHand').press('Home');
  assert.equal(await page.locator('#dayHand').getAttribute('aria-valuemax'),'31');
  assert.deepEqual(await page.locator('.event-duration').evaluateAll(nodes=>nodes.map(n=>[(n as SVGElement).dataset.startMinute,(n as SVGElement).dataset.endMinute])),[['0','30']],'midnight continuation appears on the next day');
  await page.locator('#dayHand').press('ArrowRight');
  assert.equal(await page.locator('.event-node').count(),0);
  assert.equal(await page.locator('#eventHand').getAttribute('aria-disabled'),null,'time needle works on empty days');
  await page.locator('#eventHand').press('Home');assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'0');
  await page.locator('#eventHand').press('End');assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'1440');
  await page.locator('#resetDial').click();await page.locator('#dialStage[data-load-state=ready][data-font-state=ready]').waitFor();
  assert.equal(await page.locator('#readoutMonth').innerText(),'Feb');assert.equal(await page.locator('#readoutDay').innerText(),'29');
  assert.equal(await page.locator('#eventHand').getAttribute('aria-valuenow'),'1106','RESET returns to now instead of a saved event');


  // Put all three hands on the same angle; screen-space radius must disambiguate.
  await page.locator('.month-label-group[data-month="6"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.locator('#dialStage[data-load-state=ready][data-font-state=ready]').waitFor();
  await page.locator('#dayHand').press('Home');
  for(let i=1;i<16;i++)await page.locator('#dayHand').press('ArrowRight');
  await page.locator('#eventHand').press('Home');
  for(let i=0;i<12;i++)await page.locator('#eventHand').press('Shift+ArrowRight');
  const cdp=await context.newCDPSession(page);
  async function touchDrag(kind:string,radius:number,targetAngle:number){
   const fixedDateScale=await page.locator('#dayTicks').innerHTML();
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
    if(kind==='day'){
     assert.equal(await page.locator('#dayTicks').innerHTML(),fixedDateScale,'date scale stays fixed throughout dragging');
     assert.equal(await page.locator('.drag-echo.day').count(),0,'no moving arc can be mistaken for date scale');
    }
   }
   if(kind==='event')await page.evaluate(()=>{
    (window as any).releaseFrames=[];
    const sample=(now:number)=>{
     const hand=document.querySelector('#eventHand') as SVGGraphicsElement;
     const angle=Number(/rotate\(([-.0-9]+)/.exec(hand.getAttribute('transform')||'')?.[1]);
     (window as any).releaseFrames.push({now,angle,value:hand.getAttribute('aria-valuenow')});
     if((window as any).releaseFrames.length<60)requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
   });
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(kind==='event'?1100:400);
   if(kind==='event'){
    const frames=await page.evaluate(()=>(window as any).releaseFrames) as {angle:number,value:string}[];
    const minute=Number(await page.locator('#eventHand').getAttribute('aria-valuenow')),target=-90+minute/8;
    const direction=targetAngle>0?1:-1;
    assert.ok(frames.some(frame=>(frame.angle-target)*direction>.03),'release visibly crosses its target before rebounding');
    assert.ok(Math.abs(frames.at(-1)!.angle-target)<.08,'spring settles accurately');
    assert.ok(frames.every(frame=>Number(frame.value)===minute),'elastic motion never changes the selected time');
   }
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
  // Keyboard steps also use the same spring, for all three hands.
  for(const kind of ['month','day','event']){
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#'+kind+'Hand').press('Home');
   await page.emulateMedia({reducedMotion:'no-preference'});
   const samples=await page.evaluate(async(kind)=>{
    const hand=document.querySelector('#'+kind+'Hand') as SVGGraphicsElement;
    const read=()=>Number(/rotate\(([-.0-9]+)/.exec(hand.getAttribute('transform')||'')?.[1]);
    hand.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:kind==='event',bubbles:true}));
    const frames:number[]=[];await new Promise<void>(resolve=>{
     const start=performance.now();const sample=(now:number)=>{frames.push(read());if(now-start<1000)requestAnimationFrame(sample);else resolve()};
     requestAnimationFrame(sample);
    });
    const value=Number(hand.getAttribute('aria-valuenow')),max=Number(hand.getAttribute('aria-valuemax'));
    return {frames,target:kind==='event'?-90+value/8:-90+(value-.5)/max*180};
   },kind);
   assert.ok(Math.max(...samples.frames)>samples.target+.15,kind+' spring overshoots');
   assert.ok(Math.abs(samples.frames.at(-1)!-samples.target)<.08,kind+' spring settles');
  }
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
  // The real Learning route mounts the same dial without a frame or duplicate listeners.
  await page.goto('http://127.0.0.1:'+address.port+'/#/archive',{waitUntil:'networkidle'});
  await page.locator('#ephemerisHost #dialStage[data-load-state=ready][data-font-state=ready]').waitFor();
  assert.equal(await page.locator('iframe').count(),0);
  assert.equal(await page.locator('#dock a').count(),4);
  await page.locator('#ephemerisHost .event-node[data-minute="540"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await page.locator('#ephemerisHost #eventTitle').innerText(),'一小时记录');

  assert.ok((await page.locator('#ephemerisHost .event-brief').boundingBox())!.y<(await page.locator('#ephemerisHost #dialStage').boundingBox())!.y+10,'event brief is fixed at upper right');
  assert.equal(await page.locator('#ephemerisHost #eventTimeLabel').innerText(),'时段');
  assert.match(await page.locator('#ephemerisHost #detailTime').innerText(),/09:00.*10:00/s);
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false,'selecting a marker shows a brief without opening a card');
  assert.equal(await page.locator('#ephemerisHost #eventObject').innerText(),'关联 · 现代控制理论');
  const annotation=await page.locator('#ephemerisHost').evaluate(host=>{
   const root=host.shadowRoot!,brief=root.querySelector('.event-brief')!,anchor=root.querySelector('.brief-anchor')!.getBoundingClientRect();
   const path=root.querySelector('.selection-feedback path') as SVGGeometryElement;
   const end=path.getPointAtLength(path.getTotalLength()),screen=new DOMPoint(end.x,end.y).matrixTransform((path as SVGGraphicsElement).getScreenCTM()!);
   return {families:['#eventTitle','#eventKind','#eventObject','#eventTimeLabel','#detailTime'].map(selector=>getComputedStyle(root.querySelector(selector)!).fontFamily),blur:getComputedStyle(brief,'::before').backdropFilter,quiet:(root.querySelector('#atlasDecor') as HTMLElement).style.maskImage,anchorError:Math.hypot(screen.x-anchor.left-anchor.width/2,screen.y-anchor.top-anchor.height/2)};
  });
  assert.ok(annotation.families.every(font=>/serif/i.test(font)&&!/sans-serif|system-ui/i.test(font)),'the complete brief uses serif typography');
  assert.match(annotation.blur,/blur\(7px\)/);assert.match(annotation.quiet,/radial-gradient/);
  assert.ok(annotation.anchorError<1,'event leader terminates at the visible brief diamond');

  const briefBefore=await page.locator('#ephemerisHost .event-brief').boundingBox();
  await page.screenshot({path:'/tmp/ephemeris-event-brief-upper.png'});
  await page.locator('#ephemerisHost #expandEditorial').click();
  assert.equal(await page.locator('#ephemerisHost #expandEditorial').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),true);
  assert.equal(await page.locator('#ephemerisHost .event-brief').isVisible(),true,'upper event brief remains visible alongside its opened card');
  assert.deepEqual(await page.locator('#ephemerisHost .event-brief').boundingBox(),briefBefore,'opening details never moves the brief');
  await page.locator('#ephemerisHost #expandEditorial').click();
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false,'retained summary arrow can fold the card directly');
  await page.locator('#ephemerisHost #expandEditorial').click();
  const glass=await page.locator('#ephemerisHost #eventGlass').evaluate(node=>{
   const r=node.getBoundingClientRect(),style=getComputedStyle(node);
   return {right:r.right,width:r.width,left:r.left,filter:getComputedStyle(node,'::after').backdropFilter,border:style.borderWidth,shadow:style.boxShadow,ratio:r.height/r.width,ornament:getComputedStyle(node,'::before').maskImage,modal:node.getAttribute('aria-modal')};
  });
  assert.ok(glass.right<=393&&glass.left>393*.35&&glass.width<393*.6,'glass card stays on the right without a full-screen overlay');
  assert.match(glass.filter,/blur\(21px\)/);assert.equal(glass.modal,null);assert.equal(glass.border,'0px');assert.equal(glass.shadow,'none');assert.ok(glass.ratio>=1.9,'opened card is tall even with only one short note');assert.match(glass.ornament,/ephemeris-tarot\.svg/);
  await page.screenshot({path:'/tmp/ephemeris-event-glass-light.png'});
  await page.locator('#ephemerisHost #closeEditorial').click();
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false);
  assert.equal(await page.locator('#ephemerisHost #eventTitle').innerText(),'一小时记录','closing details keeps the event selected');
  await page.locator('#ephemerisHost #expandEditorial').click();
  await page.locator('#ephemerisHost #eventGlass').press('Escape');
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false,'Escape dismisses only the floating sheet');
  await page.locator('#ephemerisHost #expandEditorial').click();
  assert.equal(await page.locator('#ephemerisHost [data-record-detail=summary]').innerText(),'复习状态空间模型。');
  await page.locator('#ephemerisHost [data-detail-step="1"]').click();
  assert.equal(await page.locator('#ephemerisHost [data-record-detail=note]').innerText(),'检查单位');
  await page.locator('#ephemerisHost [data-detail-step="1"]').click();
  assert.match(await page.locator('#ephemerisHost [data-record-detail=next]').innerText(),/整理一道例题/);
  await page.locator('#ephemerisHost [data-detail-step="1"]').click();
  assert.match(await page.locator('#ephemerisHost [data-record-detail=tags]').innerText(),/#复习/);
  for(let i=0;i<3&&await page.locator('#ephemerisHost').getAttribute('data-theme')!=='dark';i++)await page.locator('#appearance').click();
  assert.equal(await page.locator('#ephemerisHost').getAttribute('data-theme'),'dark');
  const embeddedLayout=await page.locator('#ephemerisHost').evaluate(host=>{
   const svg=host.shadowRoot!.querySelector('#traceDial') as SVGSVGElement,m=svg.getScreenCTM()!;
   return 416*Math.hypot(m.a,m.b)/innerWidth;
  });
  assert.ok(embeddedLayout<=.752&&embeddedLayout>.5,'native dial fits available height and never exceeds approved width');
  await page.locator('#ephemerisHost .event-node[data-minute="720"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal((await page.locator('#ephemerisHost .event-brief').boundingBox())!.y,briefBefore!.y,'afternoon event keeps the same upper-right brief position');
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false,'switching events folds the previous card');
  await page.locator('#ephemerisHost #expandEditorial').click();
  await page.screenshot({path:'/tmp/ephemeris-event-glass-dark.png'});
  const totalPages=Number((await page.locator('#ephemerisHost #detailPageCount').innerText()).split('/')[1]);
  assert.ok(totalPages>3);
  let recovered='';
  for(let i=0;i<totalPages;i++){
   recovered+=await page.locator('#ephemerisHost [data-record-detail=summary]').innerText();
   if(i<totalPages-1)await page.locator('#ephemerisHost [data-detail-step="1"]').click();
  }
  assert.equal(recovered.replace(/\n/g,''),records[1]!.summary!.replace(/\n/g,''),'all long-summary text is reachable through paging');
  for(const size of [{width:320,height:568},{width:393,height:852},{width:414,height:896}]){
   await page.setViewportSize(size);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const fixed=await page.locator('#ephemerisHost').evaluate(host=>{
    const shadow=host.shadowRoot!,screen=document.querySelector('#screen') as HTMLElement;
    const measured=shadow.querySelector('.dial-shell') as HTMLElement;
    const stage=shadow.querySelector('#dialStage') as HTMLElement;
    const svg=shadow.querySelector('#traceDial') as SVGSVGElement,m=svg.getScreenCTM()!;
    const footer=shadow.querySelector('.dial-footer')!.getBoundingClientRect();
    const pager=shadow.querySelector('#detailPager')!.getBoundingClientRect(),caption=shadow.querySelector('#eventGlass')!.getBoundingClientRect();
    return {background:getComputedStyle(host).backgroundColor,rows:[screen.scrollHeight-screen.clientHeight,measured.scrollHeight-measured.clientHeight,stage.scrollHeight-stage.clientHeight],
     glassTop:shadow.querySelector('#eventGlass')!.getBoundingClientRect().top,stageTop:stage.getBoundingClientRect().top,footerBottom:footer.bottom,screenBottom:screen.getBoundingClientRect().bottom,pagerBottom:pager.bottom,captionBottom:caption.bottom,header:shadow.querySelector('.dial-header'),masks:shadow.querySelectorAll('mask').length,topbar:document.querySelector('.topbar')!.getBoundingClientRect().height,
     ratio:416*Math.hypot(m.a,m.b)/innerWidth};
   });
   assert.equal(fixed.background,'rgba(0, 0, 0, 0)','Learning wallpaper is visible through the archive');
   assert.deepEqual(fixed.rows,[0,0,0],'no nested page overflows or scrolls');
   assert.equal(fixed.header,null);assert.equal(fixed.masks,4,'needle and hub details use real negative space');
   assert.ok(fixed.glassTop>=fixed.stageTop,'floating card never extends above the fixed stage');assert.ok(fixed.captionBottom<=fixed.footerBottom-30,'card stays above the footer');
   assert.ok(fixed.footerBottom<=fixed.screenBottom+1);assert.ok(fixed.pagerBottom<=fixed.captionBottom+1,'detail paging controls stay visible');
   assert.ok(fixed.ratio<=.752&&fixed.ratio>.45);assert.ok(fixed.topbar<=28);
  }

  // The day pointer still works while a non-modal card is open; point events have one time.
  await page.locator('#ephemerisHost .event-node[data-minute="900"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await page.locator('#ephemerisHost #eventTimeLabel').innerText(),'时点');
  assert.equal(await page.locator('#ephemerisHost #detailTime').innerText(),'15:00');
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false);
  await page.locator('#ephemerisHost #expandEditorial').click();
  assert.match(await page.locator('#ephemerisHost #detailEmpty').innerText(),/暂未填写/);
  await page.locator('#ephemerisHost #dayHand').press('ArrowLeft');
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false);
  await page.locator('#ephemerisHost #dayHand').press('ArrowRight');
  // The brief and glass remain within the fixed viewport in both corners, even on small phones.
  for(const size of [{width:320,height:568},{width:393,height:852},{width:414,height:896}]){
   await page.setViewportSize(size);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const dateBefore=await page.locator('#ephemerisHost .editorial-top').boundingBox();
   for(const minute of ['540','720','900']){
    await page.locator('#ephemerisHost .event-node[data-minute="'+minute+'"]').evaluate(n=>(n as SVGElement).dispatchEvent(new MouseEvent('click',{bubbles:true})));
    await page.locator('#ephemerisHost #expandEditorial').click();
    assert.deepEqual(await page.locator('#ephemerisHost .editorial-top').boundingBox(),dateBefore,'date register never swaps corners or moves when an event/card changes');
    const boxes=await page.locator('#ephemerisHost').evaluate(host=>{
     const root=host.shadowRoot!,r=(selector:string)=>{const b=root.querySelector(selector)!.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height}};
     return {brief:r('.event-brief'),glass:r('#eventGlass'),stage:r('#dialStage'),date:r('.editorial-top'),page:r('.record-pages'),text:r('[data-record-detail]:not([hidden])')};
    });
    assert.ok(boxes.glass.top>=boxes.stage.top-1&&boxes.glass.bottom<=boxes.stage.bottom+1,'long tarot card fits the fixed stage');assert.ok(boxes.glass.height/(boxes.glass.right-boxes.glass.left)>=1.9,'long aspect ratio is retained on small phones');assert.ok(boxes.date.bottom<=boxes.glass.top+1,'fixed date remains readable above the expanded card');
    assert.ok(boxes.text.bottom<=boxes.page.bottom+1,'paged body never exceeds the usable long-card text area');
    const textBounds=await page.locator('#ephemerisHost #eventGlass').evaluate(card=>{const box=card.getBoundingClientRect(),copy=card.querySelector('.card-copy')!,safe={left:box.left+box.width*32/180,right:box.left+box.width*148/180,top:box.top+box.height*76/420,bottom:box.top+box.height*344/420};const walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT),rects: {left:number,right:number,top:number,bottom:number}[]=[];let node:Node|null;while(node=walker.nextNode()){if(!node.textContent?.trim()||node.parentElement?.closest('[hidden],#closeEditorial'))continue;const range=document.createRange();range.selectNodeContents(node);for(const r of Array.from(range.getClientRects()))if(r.width&&r.height)rects.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom})}return {safe,rects,align:getComputedStyle(copy).textAlign}});
    assert.equal(textBounds.align,'center','book-menu typography is centered');
    assert.ok(textBounds.rects.every(r=>r.left>=textBounds.safe.left-1&&r.right<=textBounds.safe.right+1&&r.top>=textBounds.safe.top-1&&r.bottom<=textBounds.safe.bottom+1),'all rendered text stays within the frame safe rectangle: '+JSON.stringify(textBounds));
    assert.ok(boxes.glass.left>size.width*.3&&boxes.glass.right<=size.width,'card remains a small right-side panel');
    assert.ok(boxes.brief.top<boxes.stage.top+10,'morning, afternoon and point events all retain the upper-right brief');
    assert.ok(boxes.brief.bottom<=boxes.glass.top+1,'retained summary stays clear of the lower-right card');
    await page.locator('#ephemerisHost #closeEditorial').click();
   }
  }
  await page.setViewportSize({width:393,height:852});
  // Selection through the long hand surfaces a brief without automatically opening details.
  await page.locator('#ephemerisHost #eventHand').press('Home');
  for(let i=0;i<9;i++)await page.locator('#ephemerisHost #eventHand').press('Shift+ArrowRight');
  assert.equal(await page.locator('#ephemerisHost #eventTitle').innerText(),'一小时记录');
  assert.equal(await page.locator('#ephemerisHost #eventGlass').isVisible(),false);

  // Floating card: touch/mouse drag is isolated from the dial and never selects text.
  await page.locator('#ephemerisHost #expandEditorial').click();
  const card=page.locator('#ephemerisHost #eventGlass'),cardStart=(await card.boundingBox())!;
  const fixedBrief=await page.locator('#ephemerisHost .event-brief').boundingBox(),fixedDate=await page.locator('#ephemerisHost .editorial-top').boundingBox();
  const beforeDrag=await page.locator('#ephemerisHost').evaluate(host=>['month','day','event'].map(kind=>host.shadowRoot!.querySelector('#'+kind+'Hand')!.getAttribute('aria-valuenow')));
  const dragText=page.locator('#ephemerisHost .record-pages p:not([hidden])'),textStart=(await dragText.boundingBox())!;
  const grip={x:textStart.x+textStart.width/2,y:textStart.y+textStart.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...grip,id:1}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:grip.x-72*i/8,y:grip.y-88*i/8,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const dragged=(await card.boundingBox())!;
  assert.ok(Math.abs(dragged.x-cardStart.x+72)<1&&Math.abs(dragged.y-cardStart.y+88)<1,'touch can move the full card from its text surface');
  assert.deepEqual(await page.locator('#ephemerisHost .event-brief').boundingBox(),fixedBrief);
  assert.deepEqual(await page.locator('#ephemerisHost .editorial-top').boundingBox(),fixedDate);
  assert.deepEqual(await page.locator('#ephemerisHost').evaluate(host=>['month','day','event'].map(kind=>host.shadowRoot!.querySelector('#'+kind+'Hand')!.getAttribute('aria-valuenow'))),beforeDrag,'card dragging does not move any needle');
  const selection=await card.evaluate(node=>({text:getSelection()?.toString(),select:getComputedStyle(node).userSelect,webkit:getComputedStyle(node).getPropertyValue('-webkit-user-select'),tap:getComputedStyle(node).getPropertyValue('-webkit-tap-highlight-color'),outline:getComputedStyle(node).outlineStyle,dragging:node.classList.contains('is-dragging')}));
  assert.equal(selection.text,'');assert.equal(selection.select,'none');assert.equal(selection.webkit,'none');assert.match(selection.tap,/rgba\(0, 0, 0, 0\)/);assert.equal(selection.outline,'none');assert.equal(selection.dragging,false);
  await page.screenshot({path:'/tmp/ephemeris-floating-drag.png'});
  await page.locator('#ephemerisHost #closeEditorial').click();
  await page.locator('#ephemerisHost #expandEditorial').click();
  assert.deepEqual(await card.boundingBox(),dragged,'closing and reopening preserves a chosen floating position');
  const header=page.locator('#ephemerisHost .event-glass-head');await header.focus();await header.press('ArrowLeft');
  assert.ok(Math.abs((await card.boundingBox())!.x-dragged.x+12)<1,'keyboard can also move the floating card');
  await header.press('Home');
  assert.deepEqual(await card.boundingBox(),cardStart,'Home returns the card to its default corner');
  const handle=(await dragText.boundingBox())!,start={x:handle.x+handle.width/2,y:handle.y+handle.height/2};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x-40,start.y-40);await page.mouse.up();
  assert.ok(Math.abs((await card.boundingBox())!.x-cardStart.x+40)<1,'mouse dragging is supported');
  const movedText=(await dragText.boundingBox())!,cancelGrip={x:movedText.x+movedText.width/2,y:movedText.y+movedText.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...cancelGrip,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cancelGrip.x-10,y:cancelGrip.y-10,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await card.evaluate(n=>n.classList.contains('is-dragging')),false,'cancelled touch releases pointer capture');
  await header.focus();await header.press('Home');
  const boundedGrip=(await dragText.boundingBox())!;
  await page.mouse.move(boundedGrip.x+boundedGrip.width/2,boundedGrip.y+boundedGrip.height/2);await page.mouse.down();await page.mouse.move(-300,-300);await page.mouse.up();
  const edge=(await card.boundingBox())!,area=(await page.locator('#ephemerisHost #dialStage').boundingBox())!;
  assert.ok(edge.x>=area.x+7&&edge.y>=area.y+7,'the card cannot be lost outside the fixed viewport');
  await header.focus();await header.press('Home');await page.locator('#ephemerisHost #closeEditorial').click();
  await page.setViewportSize({width:393,height:852});
  await page.evaluate(()=>document.documentElement.style.setProperty('--safe-top','59px'));await page.waitForTimeout(50);
  const safeArea=await page.locator('#ephemerisHost').evaluate(host=>{
   const shell=host.shadowRoot!.querySelector('.dial-shell') as HTMLElement,screen=document.querySelector('#screen') as HTMLElement;
   return {scroll:screen.scrollHeight-screen.clientHeight,content:shell.scrollHeight-shell.clientHeight,top:document.querySelector('.topbar')!.getBoundingClientRect().top};
  });
  assert.deepEqual(safeArea,{scroll:0,content:0,top:59},'iPhone safe-area padding keeps all content fixed and in bounds');
  await page.evaluate(()=>document.documentElement.style.removeProperty('--safe-top'));await page.waitForTimeout(50);
  await page.mouse.wheel(150,300);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:375,y:500,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:375,y:500-i*25,id:1}]});await page.waitForTimeout(16)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await page.evaluate(()=>({window:[scrollX,scrollY],screen:[document.querySelector('#screen')!.scrollLeft,document.querySelector('#screen')!.scrollTop]})),{window:[0,0],screen:[0,0]},'wheel and touch never pan the native page');

  // Touch the visible long-hand grip inside Shadow DOM; the fixed page must still permit needle motion.
  const nativePoints=await page.locator('#ephemerisHost').evaluate(host=>{
   const shadow=host.shadowRoot!,hand=shadow.querySelector('#eventHand') as SVGGraphicsElement,svg=shadow.querySelector('#traceDial') as SVGSVGElement;
   const from=new DOMPoint(332,0).matrixTransform(hand.getScreenCTM()!);
   const to=new DOMPoint(58+332*Math.cos(.35),470+332*Math.sin(.35)).matrixTransform(svg.getScreenCTM()!);
   return {from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}};
  });
  const fixedMonth=await page.locator('#ephemerisHost #monthHand').getAttribute('aria-valuenow');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...nativePoints.from,id:1}]});
  assert.equal(await page.locator('#ephemerisHost #dialStage').getAttribute('data-active-hand'),'event');
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:nativePoints.from.x+(nativePoints.to.x-nativePoints.from.x)*i/12,y:nativePoints.from.y+(nativePoints.to.y-nativePoints.from.y)*i/12,id:1}]});await page.waitForTimeout(16)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(800);
  assert.equal(await page.locator('#ephemerisHost #monthHand').getAttribute('aria-valuenow'),fixedMonth);
  assert.ok(Number(await page.locator('#ephemerisHost #eventHand').getAttribute('aria-valuenow'))>850,'real long-hand touch drag works on the fixed transparent page');
  await page.locator('#ephemerisHost #eventHand').press('Shift+ArrowRight');
  const browsingMinute=await page.locator('#ephemerisHost #eventHand').getAttribute('aria-valuenow');
  await page.clock.setFixedTime(new Date('2025-03-01T00:02:00+08:00'));await page.waitForTimeout(30);
  assert.equal(await page.locator('#ephemerisHost #eventHand').getAttribute('aria-valuenow'),browsingMinute,'browsing a chosen time is not overridden by the clock');
  await page.locator('#dock a[data-nav=today]').click();
  await page.locator('.today-brief').waitFor();
  assert.equal(await page.locator('#ephemerisHost').count(),0);
  assert.equal(await page.locator('html').getAttribute('data-page'),'today');
  await page.locator('.today-review-trace').click();
  await page.locator('#ephemerisHost #dialStage[data-load-state=ready][data-font-state=ready]').waitFor();
  assert.equal(await page.locator('#ephemerisHost #readoutYear').innerText(),'2025');
  assert.equal(await page.locator('#ephemerisHost #readoutMonth').innerText(),'Mar');
  assert.equal(await page.locator('#ephemerisHost #readoutDay').innerText(),'1');
  assert.equal(await page.locator('#ephemerisHost #eventHand').getAttribute('aria-valuenow'),'2','reopening uses the new current date/time even without records');
  const beforeMinute=Number(await page.locator('#ephemerisHost #eventHand').getAttribute('aria-valuenow'));
  await page.locator('#ephemerisHost #eventHand').press('ArrowRight');
  assert.equal(Number(await page.locator('#ephemerisHost #eventHand').getAttribute('aria-valuenow')),Math.min(1440,beforeMinute+5),'remount installs exactly one keyboard listener');
  assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));app.close();rmSync(dir,{recursive:true,force:true})}
});
