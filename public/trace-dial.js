const svg=document.querySelector('#traceDial');
const NS='http://www.w3.org/2000/svg';
const cx=410,cy=470;
const monthTicks=document.querySelector('#monthTicks');
const monthLabels=document.querySelector('#monthLabels');
const dayTicks=document.querySelector('#dayTicks');
const eventNodes=document.querySelector('#eventNodes');
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
 status:document.querySelector('#eventStatus'),
 detailObject:document.querySelector('#detailObject'),
 detailTime:document.querySelector('#detailTime'),
 detailType:document.querySelector('#detailType'),
 toast:document.querySelector('#dialToast')
};
let dragKind=null;
let objects=new Map();
let events=[];
let selected={year:new Date().getFullYear(),month:new Date().getMonth()+1,day:new Date().getDate(),event:0};
const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

function el(name,attrs={}){
 const node=document.createElementNS(NS,name);
 for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
 return node;
}
function pt(radius,angle){
 const r=(180-angle)*Math.PI/180;
 return {x:cx+Math.cos(r)*radius,y:cy-Math.sin(r)*radius};
}
function rotation(angle){return angle-90}
function angleForIndex(index,count){
 if(count<=1)return 90;
 return index/(count-1)*180;
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function localDay(iso){
 const d=new Date(iso);
 return {year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate()};
}
function sameDay(a,b){return a.year===b.year&&a.month===b.month&&a.day===b.day}
function dateKey(y,m,d){return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function formatTime(iso){return iso?new Date(iso).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'—'}
function weekday(y,m,d){
 const zh=new Date(y,m-1,d).toLocaleDateString('zh-CN',{weekday:'short'});
 const en=new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'long'}).toUpperCase();
 return zh+' · '+en;
}
function toast(message){
 ui.toast.textContent=message;ui.toast.classList.add('on');
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('on'),1400);
}
function applyAppearance(){
 const mode=localStorage.getItem('cove.home.themeMode')||'system';
 const prefers=matchMedia('(prefers-color-scheme: dark)').matches;
 const dark=mode==='dark'||mode==='system'&&prefers;
 document.documentElement.dataset.theme=dark?'dark':'light';
 const bg=localStorage.getItem('cove.home.background')||'';
 const layer=document.querySelector('#wallpaper');
 if(bg&&/^(data:image\/|blob:)/.test(bg)){
  layer.style.backgroundImage='url('+JSON.stringify(bg)+')';layer.classList.add('custom');
 }
}
function drawStaticDial(){
 for(let i=0;i<=120;i++){
  const angle=i/120*180;
  const major=i%10===0;
  const p1=pt(major?315:319,angle),p2=pt(major?302:310,angle);
  const line=el('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,class:'tick '+(major?'major':'minor')});
  monthTicks.append(line);
 }
 roman.forEach((label,i)=>{
  const angle=i/11*180;
  const p=pt(275,angle);
  const t=el('text',{x:p.x,y:p.y,class:'month-label'});
  t.textContent=label;monthLabels.append(t);
 });
}
function drawDayRing(){
 dayTicks.replaceChildren();
 const count=daysInMonth(selected.year,selected.month);
 for(let d=1;d<=count;d++){
  const angle=angleForIndex(d-1,count);
  const isMajor=d===1||d===count||d%5===0;
  const a=pt(254,angle),b=pt(isMajor?243:248,angle);
  dayTicks.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'tick '+(isMajor?'major':'minor')}));
  if(isMajor){
   const p=pt(229,angle);const t=el('text',{x:p.x,y:p.y,class:'day-label'});t.textContent=d;dayTicks.append(t);
  }
 }
}
function dayEvents(){
 return events.filter(e=>sameDay(localDay(e.at),selected)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
function hasEventsForDay(day){
 return events.some(e=>{
  const d=localDay(e.at);
  return d.year===selected.year&&d.month===selected.month&&d.day===day;
 });
}
function drawEventRing(){
 eventNodes.replaceChildren();
 const dayCount=daysInMonth(selected.year,selected.month);
 for(let day=1;day<=dayCount;day++){
  const angle=angleForIndex(day-1,dayCount);
  const p=pt(188,angle);
  const c=el('circle',{cx:p.x,cy:p.y,r:hasEventsForDay(day)?4.2:2.7,class:'event-node'+(hasEventsForDay(day)?' has-event':'')});
  eventNodes.append(c);
 }
 const list=dayEvents();
 if(!list.length)return;
 list.forEach((event,i)=>{
  const angle=angleForIndex(i,list.length);
  const p=pt(166,angle);
  const active=i===selected.event;
  const c=el('circle',{cx:p.x,cy:p.y,r:active?7:4,class:'event-node has-event'+(active?' active':'')});
  c.dataset.eventIndex=String(i);
  eventNodes.append(c);
 });
}
function handAngles(){
 const monthAngle=angleForIndex(selected.month-1,12);
 const dayAngle=angleForIndex(selected.day-1,daysInMonth(selected.year,selected.month));
 const list=dayEvents();
 const eventAngle=angleForIndex(clamp(selected.event,0,Math.max(0,list.length-1)),Math.max(1,list.length));
 return {month:monthAngle,day:dayAngle,event:eventAngle};
}
function moveHands(animate=true){
 const angles=handAngles();
 for(const [kind,angle] of Object.entries(angles)){
  const hand=hands[kind];
  if(animate)hand.style.transition='transform .42s cubic-bezier(.2,.85,.24,1)';
  else hand.style.transition='none';
  hand.setAttribute('transform',`translate(${cx} ${cy}) rotate(${rotation(angle)})`);
 }
}
function selectBestDay(){
 const count=daysInMonth(selected.year,selected.month);
 selected.day=clamp(selected.day,1,count);
 if(hasEventsForDay(selected.day))return;
 const withEvents=[];
 for(let d=1;d<=count;d++)if(hasEventsForDay(d))withEvents.push(d);
 if(withEvents.length)selected.day=withEvents.reduce((best,d)=>Math.abs(d-selected.day)<Math.abs(best-selected.day)?d:best,withEvents[0]);
}
function currentEvent(){
 const list=dayEvents();
 return list[clamp(selected.event,0,Math.max(0,list.length-1))]||null;
}
function renderReadout(){
 const event=currentEvent();
 ui.year.textContent=selected.year;
 ui.month.textContent=String(selected.month).padStart(2,'0');
 ui.day.textContent=String(selected.day).padStart(2,'0');
 ui.weekday.textContent=weekday(selected.year,selected.month,selected.day);
 if(!event){
  ui.kind.textContent='EMPTY TRACE';
  ui.title.textContent='这一天还没有轨迹记录';
  ui.object.textContent='拨动日期指针继续寻找';
  ui.status.textContent='暂无记录';
  ui.detailObject.textContent='—';
  ui.detailTime.textContent=dateKey(selected.year,selected.month,selected.day);
  ui.detailType.textContent='空白日期';
  return;
 }
 ui.kind.textContent=event.kind==='task'?'DONE TASK':'FOCUS SESSION';
 ui.title.textContent=event.title;
 ui.object.textContent=event.object||'Cove Learning';
 ui.status.textContent=event.kind==='task'?'已完成':event.duration+' min';
 ui.detailObject.textContent=event.object||'未关联';
 ui.detailTime.textContent=dateKey(selected.year,selected.month,selected.day)+' · '+formatTime(event.at);
 ui.detailType.textContent=event.kind==='task'?'完成任务':'专注记录';
}
function renderAll(animate=true){
 drawDayRing();drawEventRing();moveHands(animate);renderReadout();
}
function selectFromAngle(kind,angle){
 if(kind==='month'){
  selected.month=clamp(Math.round(angle/180*11)+1,1,12);
  selectBestDay();selected.event=0;
 }else if(kind==='day'){
  const count=daysInMonth(selected.year,selected.month);
  selected.day=clamp(Math.round(angle/180*(count-1))+1,1,count);
  selected.event=0;
 }else{
  const list=dayEvents();
  selected.event=list.length<=1?0:clamp(Math.round(angle/180*(list.length-1)),0,list.length-1);
 }
 renderAll(false);
}
function pointerAngle(event){
 const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 const p=point.matrixTransform(svg.getScreenCTM().inverse());
 const dx=p.x-cx,dy=cy-p.y;
 const base=Math.atan2(dy,dx)*180/Math.PI;
 return clamp(180-base,0,180);
}
for(const [kind,hand] of Object.entries(hands)){
 hand.addEventListener('pointerdown',event=>{
  dragKind=kind;hand.classList.add('dragging');hand.style.transition='none';
  hand.setPointerCapture?.(event.pointerId);
  selectFromAngle(kind,pointerAngle(event));
 });
 hand.addEventListener('pointermove',event=>{if(dragKind===kind)selectFromAngle(kind,pointerAngle(event));});
 hand.addEventListener('pointerup',event=>{
  if(dragKind!==kind)return;
  dragKind=null;hand.classList.remove('dragging');hand.releasePointerCapture?.(event.pointerId);renderAll(true);
 });
 hand.addEventListener('pointercancel',()=>{dragKind=null;hand.classList.remove('dragging');renderAll(true);});
 hand.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();const delta=event.key==='ArrowRight'?1:-1;
  if(kind==='month'){selected.month=clamp(selected.month+delta,1,12);selectBestDay();selected.event=0;}
  if(kind==='day'){selected.day=clamp(selected.day+delta,1,daysInMonth(selected.year,selected.month));selected.event=0;}
  if(kind==='event'){selected.event=clamp(selected.event+delta,0,Math.max(0,dayEvents().length-1));}
  renderAll(true);
 });
}
document.querySelector('#resetDial').addEventListener('click',()=>{
 const latest=events[0];
 if(latest){Object.assign(selected,localDay(latest.at),{event:0});}
 renderAll(true);toast('已回到最近一条轨迹');
});
document.querySelector('#prevEvent').addEventListener('click',()=>{
 const list=dayEvents();if(!list.length)return toast('这一天没有轨迹记录');
 selected.event=clamp(selected.event-1,0,list.length-1);renderAll(true);
});
document.querySelector('#nextEvent').addEventListener('click',()=>{
 const list=dayEvents();if(!list.length)return toast('这一天没有轨迹记录');
 selected.event=clamp(selected.event+1,0,list.length-1);renderAll(true);
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
  if(events.length){
   const d=localDay(events[0].at);selected.year=d.year;selected.month=d.month;selected.day=d.day;selected.event=0;
  }
  renderAll(false);
 }catch(error){
  console.error(error);renderAll(false);toast('数据读取失败，轮盘仍可体验');
 }
}
applyAppearance();
drawStaticDial();
load();
