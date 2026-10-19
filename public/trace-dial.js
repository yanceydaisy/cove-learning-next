const svg=document.querySelector('#traceDial');
const stage=document.querySelector('#dialStage');
const NS='http://www.w3.org/2000/svg';
const cx=58,cy=470;
const layers={
 orbit:document.querySelector('#orbitLayer'),
 lace:document.querySelector('#laceLayer'),
 ornament:document.querySelector('#ornamentLayer'),
 monthTicks:document.querySelector('#monthTicks'),
 monthLabels:document.querySelector('#monthLabels'),
 dayTicks:document.querySelector('#dayTicks'),
 eventNodes:document.querySelector('#eventNodes'),
 feedback:document.querySelector('#feedbackLayer')
};
const hands={month:document.querySelector('#monthHand'),day:document.querySelector('#dayHand'),event:document.querySelector('#eventHand')};
const hub=document.querySelector('.dial-hub');
const editorial=document.querySelector('#eventEditorial');
const ui={
 year:document.querySelector('#readoutYear'),month:document.querySelector('#readoutMonth'),day:document.querySelector('#readoutDay'),
 weekday:document.querySelector('#readoutWeekday'),kind:document.querySelector('#eventKind'),title:document.querySelector('#eventTitle'),
 object:document.querySelector('#eventObject'),time:document.querySelector('#detailTime'),type:document.querySelector('#detailType'),
 close:document.querySelector('#closeEditorial'),toast:document.querySelector('#dialToast')
};
const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)');
const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
const handRange={month:[-76,76],day:[-76,76],event:[-76,76]};
const handRadius={month:368,day:307,event:246};
const physics={
 month:{tau:.03,wn:18,zeta:.76,projection:.1,maxSteps:2},
 day:{tau:.023,wn:21,zeta:.72,projection:.12,maxSteps:3},
 event:{tau:.017,wn:25,zeta:.68,projection:.09,maxSteps:2}
};
const motion=Object.fromEntries(Object.keys(hands).map(kind=>[kind,{
 angle:0,target:0,desired:0,velocity:0,mode:'idle',pointerId:null,dragOffset:0,lastPointerAngle:0,lastPointerTime:0,preview:null,onSettle:null
}]));

let objects=new Map();
let events=[];
let eventsByDay=new Map();
let expanded=false;
let activeHand='event';
let raf=0,lastFrame=0;
let selected={year:new Date().getFullYear(),month:new Date().getMonth()+1,day:new Date().getDate(),event:0};

function el(name,attrs={}){
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 return node;
}
function polar(radius,angle){const radians=angle*Math.PI/180;return{x:cx+Math.cos(radians)*radius,y:cy+Math.sin(radians)*radius}}
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function rangeAngle(index,count,min=-90,max=90){return count<=1?(min+max)/2:min+(index/(count-1))*(max-min)}
function localDay(iso){const date=new Date(iso);return{year:date.getFullYear(),month:date.getMonth()+1,day:date.getDate()}}
function sameDay(a,b){return a.year===b.year&&a.month===b.month&&a.day===b.day}
function daysInMonth(year,month){return new Date(year,month,0).getDate()}
function dateKey(year,month,day){return [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-')}
function formatTime(iso){return iso?new Date(iso).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'—'}
function weekday(year,month,day){const date=new Date(year,month-1,day);return date.toLocaleDateString('zh-CN',{weekday:'short'})+' · '+date.toLocaleDateString('en-US',{weekday:'long'}).toUpperCase()}
function dayEvents(){return eventsByDay.get(dateKey(selected.year,selected.month,selected.day))||[]}
function hasEventsForDay(day){return eventsByDay.has(dateKey(selected.year,selected.month,day))}
function currentEvent(){const list=dayEvents();return list[clamp(selected.event,0,Math.max(0,list.length-1))]||null}
function toast(message){ui.toast.textContent=message;ui.toast.classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('on'),1400)}

function applyAppearance(){
 const mode=localStorage.getItem('cove.home.themeMode')||'system';
 const prefers=matchMedia('(prefers-color-scheme:dark)').matches;
 const dark=mode==='dark'||mode==='system'&&prefers;
 document.documentElement.dataset.theme=dark?'dark':'light';
 const background=localStorage.getItem('cove.home.background')||'';
 const layer=document.querySelector('#wallpaper');
 if(background&&/^(data:image\/|blob:)/.test(background)){layer.style.backgroundImage='url('+JSON.stringify(background)+')';layer.classList.add('custom')}
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=dark?'#0d1122':'#f2f3f8';
}

function drawOrbits(){
 layers.orbit.replaceChildren();
 layers.orbit.append(
  el('path',{d:'M-25 330 C180 210 420 260 540 452 C620 580 510 733 286 742',class:'orbit-path'}),
  el('path',{d:'M-16 596 C159 750 418 721 519 525 C583 402 473 236 267 205',class:'orbit-path alt'}),
  el('rect',{x:430,y:274,width:33,height:7,class:'orbit-block'}),
  el('rect',{x:389,y:666,width:12,height:12,class:'orbit-block'})
 );
 const brackets=[
  ['M412 185 h42 v18 M454 185 v-14',false],['M360 732 h64 v-18 M424 732 v15',true],['M286 318 h38 v-12 M286 318 v14',false]
 ];
 for(const [d,cobalt] of brackets)layers.orbit.append(el('path',{d,class:'tech-bracket'+(cobalt?' cobalt':'')}));
 const labels=[['A/07',452,174,'tech-number'],['ORBIT 03—E',392,701,'tech-label'],['X.302',326,310,'tech-label'],['12:TRACE',463,510,'tech-number'],['∆ 1.34',400,647,'tech-label']];
 for(const [copy,x,y,className] of labels){const text=el('text',{x,y,class:className});text.textContent=copy;layers.orbit.append(text)}
}

function drawLace(){
 layers.lace.replaceChildren();
 const angles=[-61,-52,-43,-34,-25,-16];
 for(const angle of angles){
  const p=polar(207,angle);
  const group=el('g',{transform:`translate(${p.x} ${p.y}) rotate(${angle+90}) scale(.82)`,class:'lace-fill'});
  group.append(el('use',{href:'#laceUnit'}));layers.lace.append(group);
 }
 const start=polar(214,-65),end=polar(214,-11);
 layers.lace.append(el('path',{d:`M${start.x} ${start.y} A214 214 0 0 1 ${end.x} ${end.y}`,class:'lace-stroke'}));
 const start2=polar(197,-65),end2=polar(197,-11);
 layers.lace.append(el('path',{d:`M${start2.x} ${start2.y} A197 197 0 0 1 ${end2.x} ${end2.y}`,class:'lace-stroke'}));
}

function drawOrnaments(){
 layers.ornament.replaceChildren();drawOrbits();drawLace();
 const stars=[[374,-90,11,false],[374,90,11,true],[338,-58,8,false],[338,54,7,true],[290,-35,5,false],[265,42,6,false],[225,4,5,true]];
 for(const [radius,angle,size,cobalt] of stars){const point=polar(radius,angle);layers.ornament.append(el('use',{href:'#fourStar',transform:`translate(${point.x} ${point.y}) scale(${size/10})`,class:'ornament-star'+(cobalt?' cobalt':'')}))}
 for(const [radius,angle,size] of [[320,-18,.8],[352,22,.55],[274,66,.7]]){const point=polar(radius,angle);layers.ornament.append(el('use',{href:'#tinyCross',transform:`translate(${point.x} ${point.y}) scale(${size})`,class:'ornament-cross'}))}
}

function drawStaticDial(){
 layers.monthTicks.replaceChildren();layers.monthLabels.replaceChildren();drawOrnaments();
 for(let index=0;index<=144;index++){
  const angle=-90+index/144*180;
  const major=index%12===0,mid=!major&&index%6===0;
  const outer=major?416:mid?412:408,inner=major?389:mid?395:400;
  const a=polar(outer,angle),b=polar(inner,angle);
  layers.monthTicks.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'tick '+(major?'major':mid?'mid':'minor')}));
 }
 roman.forEach((label,index)=>{
  const angle=rangeAngle(index,12),point=polar(371,angle);
  const warped=index===2||index===8;
  const transform=warped?`rotate(${index===2?-6:5} ${point.x} ${point.y})`:'';
  const text=el('text',{x:point.x,y:point.y,class:'month-label','data-warp':warped,transform});text.textContent=label;layers.monthLabels.append(text);
 });
}

function drawDayRing(){
 layers.dayTicks.replaceChildren();
 const count=daysInMonth(selected.year,selected.month);
 for(let day=1;day<=count;day++){
  const angle=rangeAngle(day-1,count),major=day%5===0||day===1||day===count;
  const p1=polar(307,angle),p2=polar(major?289:297,angle);
  layers.dayTicks.append(el('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,class:'tick '+(major?'major':'minor')}));
  if(major){const point=polar(275,angle),text=el('text',{x:point.x,y:point.y,class:'day-label'});text.textContent=day;layers.dayTicks.append(text)}
  if(hasEventsForDay(day)){const point=polar(320,angle);layers.dayTicks.append(el('circle',{cx:point.x,cy:point.y,r:3,class:'day-event-mark','data-day':day}))}
 }
}

function nodeSymbol(kind){
 if(kind==='task')return el('rect',{x:-4,y:-4,width:8,height:8,transform:'rotate(45)',class:'node-symbol'});
 if(kind==='class')return el('path',{d:'M0 -6 V6 M-6 0 H6',class:'node-symbol'});
 if(kind==='note')return el('path',{d:'M-6 0 H1 M4 0 H7',class:'node-symbol'});
 return el('circle',{cx:0,cy:0,r:4.5,class:'node-symbol'});
}

function drawEventRing(){
 layers.eventNodes.replaceChildren();
 const list=dayEvents();
 if(!list.length){drawFeedback();return}
 list.forEach((event,index)=>{
  const angle=rangeAngle(index,list.length,...handRange.event),point=polar(246,angle);
  const group=el('g',{class:'event-node'+(index===selected.event?' is-active':''),tabindex:'0',role:'button','data-event-index':index,'data-event-kind':event.kind,'aria-label':event.title,transform:`translate(${point.x} ${point.y})`});
  group.append(el('circle',{cx:0,cy:0,r:28,class:'node-hit'}));
  group.append(el('circle',{cx:0,cy:0,r:9,class:'node-orbit'}));
  group.append(nodeSymbol(event.kind));
  group.append(el('path',{d:'M0 -17 V-11 M0 11 V17 M-17 0 H-11 M11 0 H17',class:'node-crosshair'}));
  const ordinal=el('text',{x:15,y:-12,class:'node-index'});ordinal.textContent=String(index+1).padStart(2,'0');group.append(ordinal);
  group.addEventListener('click',()=>openEvent(index,true));
  group.addEventListener('keydown',eventKey=>{if(eventKey.key==='Enter'||eventKey.key===' '){eventKey.preventDefault();openEvent(index,true)}});
  layers.eventNodes.append(group);
 });
 drawFeedback();
}

function updateEventNodeClasses(tickedIndex=null){
 for(const node of layers.eventNodes.querySelectorAll('.event-node')){
  const index=Number(node.dataset.eventIndex);
  node.classList.toggle('is-active',index===selected.event);
  if(index===tickedIndex){node.classList.remove('is-ticked');void node.getBBox();node.classList.add('is-ticked')}
 }
 drawFeedback();
}

function drawFeedback(){
 for(const child of [...layers.feedback.children])if(child.classList.contains('selection-feedback'))child.remove();
 if(!expanded||!currentEvent())return;
 const list=dayEvents(),angle=rangeAngle(selected.event,list.length,...handRange.event),point=polar(246,angle);
 const group=el('g',{class:'selection-feedback'});
 group.append(el('path',{d:`M${point.x} ${point.y} L${point.x+24} ${point.y} L430 ${point.y}`,class:'feedback-path'}));
 group.append(el('rect',{x:426,y:point.y-3,width:6,height:6,transform:`rotate(45 429 ${point.y})`,class:'feedback-terminal'}));
 layers.feedback.prepend(group);
}

function pulseDetent(kind,angle){
 if(reduceMotion.matches)return;
 const point=polar(handRadius[kind],angle),ring=el('circle',{cx:point.x,cy:point.y,r:13,class:'detent-ring'});
 layers.feedback.append(ring);setTimeout(()=>ring.remove(),220);
 hub.classList.remove('is-active');void hub.getBBox();hub.classList.add('is-active');setTimeout(()=>hub.classList.remove('is-active'),450);
}

function showDragEcho(kind,angle){
 let group=layers.feedback.querySelector('.drag-feedback');
 if(!group){group=el('g',{class:'drag-feedback'});group.append(el('path',{class:'drag-echo first'}),el('path',{class:'drag-echo second'}));layers.feedback.append(group)}
 const radius=handRadius[kind]-28;
 const arc=(from,to)=>{const a=polar(radius,from),b=polar(radius,to);return`M${a.x} ${a.y} A${radius} ${radius} 0 0 1 ${b.x} ${b.y}`};
 const first=group.querySelector('.first'),second=group.querySelector('.second');
 first.setAttribute('d',arc(clamp(angle-8,-90,90),clamp(angle-2,-90,90)));first.setAttribute('class','drag-echo first '+kind);
 second.setAttribute('d',arc(clamp(angle-15,-90,90),clamp(angle-10,-90,90)));second.setAttribute('class','drag-echo second '+kind);
 group.style.opacity='1';
}
function hideDragEcho(){const group=layers.feedback.querySelector('.drag-feedback');if(!group)return;group.style.opacity='0';setTimeout(()=>group.remove(),180)}

function handAngles(){
 const list=dayEvents();
 return{
  month:rangeAngle(selected.month-1,12,...handRange.month),
  day:rangeAngle(selected.day-1,daysInMonth(selected.year,selected.month),...handRange.day),
  event:rangeAngle(clamp(selected.event,0,Math.max(0,list.length-1)),Math.max(1,list.length),...handRange.event)
 };
}

function setActiveHand(kind){
 activeHand=kind;stage.dataset.activeHand=kind;
 for(const button of document.querySelectorAll('[data-focus-hand]'))button.setAttribute('aria-pressed',String(button.dataset.focusHand===kind));
}

function setHandAngle(kind,angle){
 hands[kind].setAttribute('transform',`translate(${cx} ${cy}) rotate(${angle})`);
 const list=dayEvents();
 const values={month:selected.month,day:selected.day,event:list.length?selected.event+1:0};
 hands[kind].setAttribute('aria-valuenow',String(values[kind]));
 hands[kind].setAttribute('aria-valuetext',kind==='month'?selected.month+'月':kind==='day'?selected.day+'日':list.length?`${values.event}/${list.length} ${currentEvent()?.title||''}`:'无事件');
 if(kind==='day')hands[kind].setAttribute('aria-valuemax',String(daysInMonth(selected.year,selected.month)));
 if(kind==='event')hands[kind].setAttribute('aria-valuemax',String(Math.max(1,list.length)));
}

function snapAll(){
 const angles=handAngles();
 for(const kind of Object.keys(hands)){Object.assign(motion[kind],{angle:angles[kind],target:angles[kind],desired:angles[kind],velocity:0,mode:'idle',preview:null});setHandAngle(kind,angles[kind])}
}

function collapsedCopy(){
 const count=dayEvents().length;
 ui.kind.textContent='TRACE / SELECT';
 ui.title.textContent=count?'点按内圈的事件标记':'这一天还没有轨迹记录';
 ui.object.textContent=count?'选择一个节点后，在这里展开事件。':'继续拨动日期指针寻找记录。';
 ui.time.textContent=dateKey(selected.year,selected.month,selected.day);
 ui.type.textContent=count?count+' EVENTS':'EMPTY TRACE';
 ui.close.hidden=true;editorial.classList.add('collapsed');
}
function renderReadout(){
 ui.year.textContent=selected.year;ui.month.textContent=String(selected.month).padStart(2,'0');ui.day.textContent=String(selected.day).padStart(2,'0');ui.weekday.textContent=weekday(selected.year,selected.month,selected.day);
 const event=currentEvent();if(!expanded||!event){collapsedCopy();return}
 editorial.classList.remove('collapsed');ui.kind.textContent=event.kind==='task'?'TRACE / DONE':event.kind==='focus'?'TRACE / FOCUS':'TRACE / EVENT';
 ui.title.textContent=event.title;ui.object.textContent=event.object||'Cove Learning';ui.time.textContent=dateKey(selected.year,selected.month,selected.day)+' · '+formatTime(event.at);
 ui.type.textContent=event.kind==='task'?'DONE TASK':event.kind==='focus'?event.duration+' MIN FOCUS':event.kind.toUpperCase();ui.close.hidden=false;
}

function selectBestDay(){
 const count=daysInMonth(selected.year,selected.month);selected.day=clamp(selected.day,1,count);
 if(hasEventsForDay(selected.day))return;
 const candidates=[];for(let day=1;day<=count;day++)if(hasEventsForDay(day))candidates.push(day);
 if(candidates.length)selected.day=candidates.reduce((best,day)=>Math.abs(day-selected.day)<Math.abs(best-selected.day)?day:best,candidates[0]);
}

function retargetOthers(exceptKind,animate=true){
 const angles=handAngles();
 for(const kind of Object.keys(hands)){
  if(kind===exceptKind&&motion[kind].mode==='drag')continue;
  if(animate)springTo(kind,angles[kind]);else{Object.assign(motion[kind],{angle:angles[kind],target:angles[kind],desired:angles[kind],velocity:0,mode:'idle'});setHandAngle(kind,angles[kind])}
 }
}

function commitSelection(kind,index,{preview=false,animateOthers=true}={}){
 if(kind==='month'){
  const next=clamp(index+1,1,12);if(next===selected.month&&preview)return;
  selected.month=next;selectBestDay();selected.event=0;expanded=false;drawDayRing();drawEventRing();
 }else if(kind==='day'){
  const next=clamp(index+1,1,daysInMonth(selected.year,selected.month));if(next===selected.day&&preview)return;
  selected.day=next;selected.event=0;expanded=false;drawEventRing();
 }else{
  const list=dayEvents(),next=list.length?clamp(index,0,list.length-1):0;if(next===selected.event&&preview)return;
  selected.event=next;expanded=false;updateEventNodeClasses(next);
 }
 renderReadout();retargetOthers(kind,animateOthers);drawFeedback();
}

function indexForAngle(kind,angle){
 const [min,max]=handRange[kind];
 const count=kind==='month'?12:kind==='day'?daysInMonth(selected.year,selected.month):Math.max(1,dayEvents().length);
 return clamp(Math.round((clamp(angle,min,max)-min)/(max-min)*(count-1)),0,count-1);
}
function angleForKindIndex(kind,index){
 const count=kind==='month'?12:kind==='day'?daysInMonth(selected.year,selected.month):Math.max(1,dayEvents().length);
 return rangeAngle(index,count,...handRange[kind]);
}

function springTo(kind,target,onSettle=null,initialVelocity=0){
 const state=motion[kind];state.target=target;state.desired=target;state.onSettle=onSettle;
 if(reduceMotion.matches){state.angle=target;state.velocity=0;state.mode='idle';setHandAngle(kind,target);onSettle?.();return}
 state.velocity=clamp(initialVelocity,-450,450);state.mode='spring';ensureFrame();
}

function maybePreview(kind){
 const state=motion[kind],index=indexForAngle(kind,state.angle);
 if(index===state.preview)return;
 state.preview=index;commitSelection(kind,index,{preview:true,animateOthers:true});
 const angle=angleForKindIndex(kind,index);pulseDetent(kind,angle);
 if(kind==='event')updateEventNodeClasses(index);
}

function stepSpring(state,config,dt){
 const iterations=dt>1/50?2:1,step=dt/iterations;
 for(let i=0;i<iterations;i++){
  const acceleration=-config.wn*config.wn*(state.angle-state.target)-2*config.zeta*config.wn*state.velocity;
  state.velocity+=acceleration*step;state.angle+=state.velocity*step;
 }
}
function frame(now){
 const dt=lastFrame?Math.min((now-lastFrame)/1000,1/30):1/60;lastFrame=now;let running=false;
 for(const kind of Object.keys(hands)){
  const state=motion[kind],config=physics[kind];
  if(state.mode==='drag'){
   const alpha=1-Math.exp(-dt/config.tau);state.angle+= (state.desired-state.angle)*alpha;maybePreview(kind);showDragEcho(kind,state.angle);running=true;
  }else if(state.mode==='spring'){
   stepSpring(state,config,dt);running=true;
   if(Math.abs(state.angle-state.target)<.08&&Math.abs(state.velocity)<.7){
    state.angle=state.target;state.velocity=0;state.mode='idle';const done=state.onSettle;state.onSettle=null;done?.();
   }
  }
  setHandAngle(kind,state.angle);
 }
 if(running)raf=requestAnimationFrame(frame);else{raf=0;lastFrame=0}
}
function ensureFrame(){if(!raf)raf=requestAnimationFrame(frame)}

function rawPointerAngle(event){
 const matrix=svg.getScreenCTM();if(!matrix)return null;
 const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 const local=point.matrixTransform(matrix.inverse());return Math.atan2(local.y-cy,local.x-cx)*180/Math.PI;
}
function rubberAngle(value,kind){
 const [min,max]=handRange[kind];if(value>=min&&value<=max)return value;
 const boundary=value<min?min:max,overshoot=value-boundary;
 return boundary+Math.sign(overshoot)*12*Math.abs(overshoot)/(Math.abs(overshoot)+18);
}

function beginDrag(kind,event){
 if(!event.isPrimary)return;const angle=rawPointerAngle(event);if(angle===null)return;
 const state=motion[kind];setActiveHand(kind);state.mode='drag';state.pointerId=event.pointerId;state.dragOffset=angle-state.angle;state.lastPointerAngle=state.angle;state.lastPointerTime=event.timeStamp;state.velocity=0;state.preview=indexForAngle(kind,state.angle);
 hands[kind].classList.add('is-dragging');hands[kind].setPointerCapture?.(event.pointerId);event.preventDefault();ensureFrame();
}
function moveDrag(kind,event){
 const state=motion[kind];if(state.mode!=='drag'||state.pointerId!==event.pointerId)return;
 const raw=rawPointerAngle(event);if(raw===null)return;
 const desired=rubberAngle(raw-state.dragOffset,kind),dt=Math.max(8,event.timeStamp-state.lastPointerTime)/1000;
 const instant=(desired-state.lastPointerAngle)/dt,alpha=1-Math.exp(-dt/.045);state.velocity+= (clamp(instant,-520,520)-state.velocity)*alpha;state.desired=desired;state.lastPointerAngle=desired;state.lastPointerTime=event.timeStamp;event.preventDefault();ensureFrame();
}
function endDrag(kind,event,cancelled=false){
 const state=motion[kind];if(state.pointerId!==event.pointerId)return;
 hands[kind].classList.remove('is-dragging');state.pointerId=null;hands[kind].releasePointerCapture?.(event.pointerId);hideDragEcho();
 const projected=cancelled?state.angle:state.angle+state.velocity*physics[kind].projection;
 const currentIndex=state.preview??indexForAngle(kind,state.angle);
 const projectedIndex=indexForAngle(kind,projected);
 const index=cancelled?currentIndex:clamp(projectedIndex,currentIndex-physics[kind].maxSteps,currentIndex+physics[kind].maxSteps);
 const target=angleForKindIndex(kind,index),inherited=cancelled?0:state.velocity*.45;
 commitSelection(kind,index,{preview:false,animateOthers:true});
 springTo(kind,target,()=>{if(kind==='event'&&dayEvents().length&&!cancelled){expanded=true;updateEventNodeClasses();renderReadout();drawFeedback()}},inherited);
}
function cancelAllDrags(){for(const kind of Object.keys(hands)){const state=motion[kind];if(state.mode==='drag'){hands[kind].classList.remove('is-dragging');state.pointerId=null;springTo(kind,angleForKindIndex(kind,indexForAngle(kind,state.angle)))}}hideDragEcho()}

for(const [kind,hand] of Object.entries(hands)){
 hand.addEventListener('pointerdown',event=>beginDrag(kind,event));
 hand.addEventListener('pointermove',event=>moveDrag(kind,event));
 hand.addEventListener('pointerup',event=>endDrag(kind,event,false));
 hand.addEventListener('pointercancel',event=>endDrag(kind,event,true));
 hand.addEventListener('lostpointercapture',event=>{if(motion[kind].pointerId===event.pointerId)endDrag(kind,event,true)});
 hand.addEventListener('keydown',event=>{
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(event.key))return;
  setActiveHand(kind);
  if(event.key==='Enter'&&kind==='event'){expanded=true;renderReadout();drawFeedback();return}
  const direction=event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1;event.preventDefault();
  const current=kind==='month'?selected.month-1:kind==='day'?selected.day-1:selected.event;
  const next=indexForAngle(kind,angleForKindIndex(kind,current+direction));commitSelection(kind,next,{animateOthers:true});springTo(kind,angleForKindIndex(kind,next));
 });
}

function openEvent(index,animate=true){
 const list=dayEvents();if(!list.length)return;setActiveHand('event');selected.event=clamp(index,0,list.length-1);expanded=true;updateEventNodeClasses(index);renderReadout();drawFeedback();
 const target=angleForKindIndex('event',selected.event);if(animate)springTo('event',target);else{motion.event.angle=target;setHandAngle('event',target)}
}

for(const button of document.querySelectorAll('[data-focus-hand]'))button.addEventListener('click',()=>setActiveHand(button.dataset.focusHand));
ui.close.addEventListener('click',()=>{expanded=false;renderReadout();drawFeedback()});
document.querySelector('#resetDial').addEventListener('click',()=>{
 const latest=events[0];if(latest)Object.assign(selected,localDay(latest.at),{event:0});expanded=false;drawDayRing();drawEventRing();renderReadout();retargetOthers('',true);toast('已回到最近一条轨迹');
});
window.addEventListener('blur',cancelAllDrags);

async function get(path){const response=await fetch('./api'+path,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return response.json()}
function indexEvents(){
 eventsByDay=new Map();
 for(const event of events){const day=localDay(event.at),key=dateKey(day.year,day.month,day.day),list=eventsByDay.get(key)||[];list.push(event);eventsByDay.set(key,list)}
 for(const list of eventsByDay.values())list.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
async function load(){
 try{
  const [tasks,history,objectList]=await Promise.all([get('/tasks'),get('/focus/history'),get('/objects')]);objects=new Map(objectList.map(object=>[object.id,object]));
  const taskEvents=tasks.filter(task=>task.status==='done'&&(task.updated_at||task.created_at)).map(task=>({kind:'task',at:task.updated_at||task.created_at,title:task.title,object:objects.get(task.object_id)?.title||''}));
  const focusEvents=(history.sessions||[]).filter(session=>Number(session.accumulated_ms)>0&&(session.ended_at||session.updated_at||session.started_at)).map(session=>({kind:'focus',at:session.ended_at||session.updated_at||session.started_at,title:'专注 '+Math.max(1,Math.floor(Number(session.accumulated_ms)/60000))+' 分钟',object:objects.get(session.object_id)?.title||'',duration:Math.max(1,Math.floor(Number(session.accumulated_ms)/60000))}));
  events=[...taskEvents,...focusEvents].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));indexEvents();if(events.length){const day=localDay(events[0].at);Object.assign(selected,day,{event:0})}
  drawDayRing();drawEventRing();renderReadout();snapAll();
 }catch(error){console.error(error);drawDayRing();drawEventRing();renderReadout();snapAll();toast('数据读取失败，轮盘仍可体验')}
}

applyAppearance();setActiveHand('event');drawStaticDial();drawDayRing();drawEventRing();renderReadout();snapAll();load();
