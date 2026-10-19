const svg=document.querySelector('#traceDial');
const NS='http://www.w3.org/2000/svg';
const cx=58,cy=470;
const monthTicks=document.querySelector('#monthTicks');
const monthLabels=document.querySelector('#monthLabels');
const dayTicks=document.querySelector('#dayTicks');
const eventNodes=document.querySelector('#eventNodes');
const ornamentLayer=document.querySelector('#ornamentLayer');
const editorial=document.querySelector('#eventEditorial');
const hands={
 month:document.querySelector('#monthHand'),
 day:document.querySelector('#dayHand'),
 event:document.querySelector('#eventHand')
};
const ui={
 year:document.querySelector('#readoutYear'),
 month:document.querySelector('#readoutMonth'),
 day:document.querySelector('#readoutDay'),
 weekday:document.querySelector('#readoutWeekday'),
 kind:document.querySelector('#eventKind'),
 title:document.querySelector('#eventTitle'),
 object:document.querySelector('#eventObject'),
 time:document.querySelector('#detailTime'),
 type:document.querySelector('#detailType'),
 close:document.querySelector('#closeEditorial'),
 toast:document.querySelector('#dialToast')
};
let objects=new Map();
let events=[];
let dragKind=null;
let expanded=false;
let selected={year:new Date().getFullYear(),month:new Date().getMonth()+1,day:new Date().getDate(),event:0};
const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

function el(name,attrs={}){
 const node=document.createElementNS(NS,name);
 for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
 return node;
}
function polar(radius,angle){
 const r=angle*Math.PI/180;
 return {x:cx+Math.cos(r)*radius,y:cy+Math.sin(r)*radius};
}
function angleForIndex(index,count){return count<=1?0:-90+(index/(count-1))*180}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function localDay(iso){const d=new Date(iso);return {year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate()}}
function sameDay(a,b){return a.year===b.year&&a.month===b.month&&a.day===b.day}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function dateKey(y,m,d){return [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-')}
function formatTime(iso){return iso?new Date(iso).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'—'}
function weekday(y,m,d){
 const z=new Date(y,m-1,d);
 return z.toLocaleDateString('zh-CN',{weekday:'short'})+' · '+z.toLocaleDateString('en-US',{weekday:'long'}).toUpperCase();
}
function toast(message){
 ui.toast.textContent=message;ui.toast.classList.add('on');
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('on'),1400);
}
function applyAppearance(){
 const mode=localStorage.getItem('cove.home.themeMode')||'system';
 const prefers=matchMedia('(prefers-color-scheme:dark)').matches;
 const dark=mode==='dark'||mode==='system'&&prefers;
 document.documentElement.dataset.theme=dark?'dark':'light';
 const bg=localStorage.getItem('cove.home.background')||'';
 const layer=document.querySelector('#wallpaper');
 if(bg&&/^(data:image\/|blob:)/.test(bg)){
  layer.style.backgroundImage='url('+JSON.stringify(bg)+')';layer.classList.add('custom');
 }
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=dark?'#0c1425':'#edf1f5';
}
function drawOrnaments(){
 ornamentLayer.replaceChildren();
 for(const [radius,angle,size] of [[374,-90,10],[374,90,10],[332,-58,7],[332,58,7],[282,-40,5],[282,40,5],[224,0,5]]){
  const p=polar(radius,angle);
  const use=el('use',{href:'#smallStar',transform:`translate(${p.x} ${p.y}) scale(${size/10})`,class:'ornament-star'});
  ornamentLayer.append(use);
 }
 for(const radius of [370,336,299,259]){
  const a=polar(radius,-72),b=polar(radius,72);
  ornamentLayer.append(el('path',{d:`M${a.x} ${a.y} A${radius} ${radius} 0 0 1 ${b.x} ${b.y}`,class:'ornament-line'}));
 }
}
function drawStaticDial(){
 monthTicks.replaceChildren();monthLabels.replaceChildren();drawOrnaments();
 for(let i=0;i<=144;i++){
  const angle=-90+i/144*180;
  const major=i%12===0,mid=!major&&i%6===0;
  const r1=major?414:mid?410:406;
  const r2=major?390:mid?394:398;
  const a=polar(r1,angle),b=polar(r2,angle);
  monthTicks.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'tick '+(major?'major':mid?'mid':'minor')}));
 }
 roman.forEach((label,i)=>{
  const p=polar(368,angleForIndex(i,12));
  const t=el('text',{x:p.x,y:p.y,class:'month-label'});
  t.textContent=label;monthLabels.append(t);
 });
}
function drawDayRing(){
 dayTicks.replaceChildren();
 const count=daysInMonth(selected.year,selected.month);
 for(let d=1;d<=count;d++){
  const angle=angleForIndex(d-1,count);
  const major=d%5===0||d===1||d===count;
  const p1=polar(306,angle),p2=polar(major?291:297,angle);
  dayTicks.append(el('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,class:'tick '+(major?'major':'minor')}));
  if(major){
   const p=polar(276,angle);
   const t=el('text',{x:p.x,y:p.y,class:'day-label'});t.textContent=d;dayTicks.append(t);
  }
  if(hasEventsForDay(d)){
   const p=polar(319,angle);
   dayTicks.append(el('circle',{cx:p.x,cy:p.y,r:2.6,class:'day-event-mark'}));
  }
 }
}
function dayEvents(){
 return events.filter(e=>sameDay(localDay(e.at),selected)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
function hasEventsForDay(day){
 return events.some(e=>{const d=localDay(e.at);return d.year===selected.year&&d.month===selected.month&&d.day===day});
}
function drawEventRing(){
 eventNodes.replaceChildren();
 const list=dayEvents();
 if(!list.length)return;
 list.forEach((event,i)=>{
  const angle=angleForIndex(i,list.length);
  const p=polar(244,angle);
  const g=el('g',{class:'event-node'+(i===selected.event?' active':''),tabindex:'0','data-event-index':i,'aria-label':event.title,transform:`translate(${p.x} ${p.y})`});
  g.append(el('circle',{cx:0,cy:0,r:8.2,class:'node-orbit'}));
  g.append(el('circle',{cx:0,cy:0,r:2.8,class:'node-core'}));
  g.append(el('path',{d:'M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3 Z',class:'node-star'}));
  g.addEventListener('click',()=>openEvent(i,true));
  g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openEvent(i,true)}});
  eventNodes.append(g);
 });
}
function handAngles(){
 const list=dayEvents();
 return {
  month:angleForIndex(selected.month-1,12),
  day:angleForIndex(selected.day-1,daysInMonth(selected.year,selected.month)),
  event:angleForIndex(clamp(selected.event,0,Math.max(0,list.length-1)),Math.max(1,list.length))
 };
}
function moveHands(animate=true){
 for(const [kind,angle] of Object.entries(handAngles())){
  const hand=hands[kind];
  hand.style.transition=animate?'transform .42s cubic-bezier(.22,.8,.2,1)':'none';
  hand.setAttribute('transform',`translate(${cx} ${cy}) rotate(${angle})`);
 }
}
function selectBestDay(){
 const count=daysInMonth(selected.year,selected.month);
 selected.day=clamp(selected.day,1,count);
 if(hasEventsForDay(selected.day))return;
 const candidates=[];
 for(let d=1;d<=count;d++)if(hasEventsForDay(d))candidates.push(d);
 if(candidates.length)selected.day=candidates.reduce((best,d)=>Math.abs(d-selected.day)<Math.abs(best-selected.day)?d:best,candidates[0]);
}
function currentEvent(){const list=dayEvents();return list[clamp(selected.event,0,Math.max(0,list.length-1))]||null}
function collapsedCopy(){
 ui.kind.textContent='TRACE / SELECT';
 ui.title.textContent=dayEvents().length?'点按内圈的事件标记':'这一天还没有轨迹记录';
 ui.object.textContent=dayEvents().length?'选择一个节点后，在这里展开事件。':'继续拨动日期指针寻找记录。';
 ui.time.textContent=dateKey(selected.year,selected.month,selected.day);
 ui.type.textContent=dayEvents().length?dayEvents().length+' EVENTS':'EMPTY TRACE';
 ui.close.hidden=true;
 editorial.classList.add('collapsed');
}
function renderReadout(){
 ui.year.textContent=selected.year;
 ui.month.textContent=String(selected.month).padStart(2,'0');
 ui.day.textContent=String(selected.day).padStart(2,'0');
 ui.weekday.textContent=weekday(selected.year,selected.month,selected.day);
 const event=currentEvent();
 if(!expanded||!event){collapsedCopy();return}
 editorial.classList.remove('collapsed');
 ui.kind.textContent=event.kind==='task'?'TRACE / DONE':'TRACE / FOCUS';
 ui.title.textContent=event.title;
 ui.object.textContent=event.object||'Cove Learning';
 ui.time.textContent=dateKey(selected.year,selected.month,selected.day)+' · '+formatTime(event.at);
 ui.type.textContent=event.kind==='task'?'DONE TASK':event.duration+' MIN FOCUS';
 ui.close.hidden=false;
}
function renderAll(animate=true){drawDayRing();drawEventRing();moveHands(animate);renderReadout()}
function openEvent(index,animate=true){
 const list=dayEvents();if(!list.length)return;
 selected.event=clamp(index,0,list.length-1);expanded=true;renderAll(animate);
}
function pointerAngle(event){
 const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 const p=point.matrixTransform(svg.getScreenCTM().inverse());
 return clamp(Math.atan2(p.y-cy,p.x-cx)*180/Math.PI,-90,90);
}
function selectFromAngle(kind,angle){
 if(kind==='month'){
  selected.month=clamp(Math.round((angle+90)/180*11)+1,1,12);
  selectBestDay();selected.event=0;expanded=false;
 }else if(kind==='day'){
  const count=daysInMonth(selected.year,selected.month);
  selected.day=clamp(Math.round((angle+90)/180*(count-1))+1,1,count);
  selected.event=0;expanded=false;
 }else{
  const list=dayEvents();
  selected.event=list.length<=1?0:clamp(Math.round((angle+90)/180*(list.length-1)),0,list.length-1);
  expanded=false;
 }
 renderAll(false);
}
for(const [kind,hand] of Object.entries(hands)){
 hand.addEventListener('pointerdown',event=>{
  dragKind=kind;hand.classList.add('dragging');hand.style.transition='none';hand.setPointerCapture?.(event.pointerId);
  selectFromAngle(kind,pointerAngle(event));
 });
 hand.addEventListener('pointermove',event=>{if(dragKind===kind)selectFromAngle(kind,pointerAngle(event))});
 hand.addEventListener('pointerup',event=>{
  if(dragKind!==kind)return;
  dragKind=null;hand.classList.remove('dragging');hand.releasePointerCapture?.(event.pointerId);
  if(kind==='event'&&dayEvents().length)expanded=true;
  renderAll(true);
 });
 hand.addEventListener('pointercancel',()=>{dragKind=null;hand.classList.remove('dragging');renderAll(true)});
 hand.addEventListener('keydown',event=>{
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(event.key))return;
  if(event.key==='Enter'&&kind==='event'){expanded=true;renderAll(true);return}
  const plus=event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1;
  event.preventDefault();
  if(kind==='month'){selected.month=clamp(selected.month+plus,1,12);selectBestDay();selected.event=0;expanded=false}
  if(kind==='day'){selected.day=clamp(selected.day+plus,1,daysInMonth(selected.year,selected.month));selected.event=0;expanded=false}
  if(kind==='event'){selected.event=clamp(selected.event+plus,0,Math.max(0,dayEvents().length-1));expanded=false}
  renderAll(true);
 });
}
ui.close.addEventListener('click',()=>{expanded=false;renderReadout()});
document.querySelector('#resetDial').addEventListener('click',()=>{
 const latest=events[0];
 if(latest)Object.assign(selected,localDay(latest.at),{event:0});
 expanded=false;renderAll(true);toast('已回到最近一条轨迹');
});
async function get(path){
 const response=await fetch('./api'+path,{cache:'no-store'});
 if(!response.ok)throw Error('HTTP '+response.status);
 return response.json();
}
async function load(){
 try{
  const [tasks,history,objectList]=await Promise.all([get('/tasks'),get('/focus/history'),get('/objects')]);
  objects=new Map(objectList.map(o=>[o.id,o]));
  const taskEvents=tasks.filter(t=>t.status==='done'&&(t.updated_at||t.created_at)).map(t=>({
   kind:'task',at:t.updated_at||t.created_at,title:t.title,object:objects.get(t.object_id)?.title||''
  }));
  const focusEvents=(history.sessions||[]).filter(s=>Number(s.accumulated_ms)>0&&(s.ended_at||s.updated_at||s.started_at)).map(s=>({
   kind:'focus',at:s.ended_at||s.updated_at||s.started_at,title:'专注 '+Math.max(1,Math.floor(Number(s.accumulated_ms)/60000))+' 分钟',
   object:objects.get(s.object_id)?.title||'',duration:Math.max(1,Math.floor(Number(s.accumulated_ms)/60000))
  }));
  events=[...taskEvents,...focusEvents].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  if(events.length){const d=localDay(events[0].at);Object.assign(selected,d,{event:0})}
  renderAll(false);
 }catch(error){
  console.error(error);renderAll(false);toast('数据读取失败，轮盘仍可体验');
 }
}
applyAppearance();
drawStaticDial();
load();
