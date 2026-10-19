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
const handRange={month:[-90,90],day:[-90,90],event:[-90,90]};
const handRadius={month:246,day:307,event:398};
const physics={
 month:{wn:20,zeta:.6,dragWn:48,dragZeta:1,releaseSpeed:45},
 day:{wn:24,zeta:.52,dragWn:64,dragZeta:.95,releaseSpeed:75},
 event:{wn:26,zeta:.48,dragWn:72,dragZeta:.95,releaseSpeed:95}
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
let selected={year:new Date().getFullYear(),month:new Date().getMonth()+1,day:new Date().getDate(),event:-1,minute:new Date().getHours()*60+new Date().getMinutes()};

function el(name,attrs={}){
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 return node;
}
function polar(radius,angle){const radians=angle*Math.PI/180;return{x:cx+Math.cos(radians)*radius,y:cy+Math.sin(radians)*radius}}
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
// Each value owns an equal sector; station and label sit at its centre.
function rangeAngle(index,count,min=-90,max=90){return count<=1?(min+max)/2:min+((index+.5)/count)*(max-min)}
function localDay(iso){const date=new Date(iso);return{year:date.getFullYear(),month:date.getMonth()+1,day:date.getDate()}}
function daysInMonth(year,month){return new Date(year,month,0).getDate()}
function dateKey(year,month,day){return [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-')}
function weekday(year,month,day){const date=new Date(year,month-1,day);return date.toLocaleDateString('zh-CN',{weekday:'short'})+' · '+date.toLocaleDateString('en-US',{weekday:'long'}).toUpperCase()}
function dayEvents(){return eventsByDay.get(dateKey(selected.year,selected.month,selected.day))||[]}
function hasEventsForDay(day){return eventsByDay.has(dateKey(selected.year,selected.month,day))}
function currentEvent(){return dayEvents()[selected.event]||null}
function minuteOfDay(iso){const d=new Date(iso);return d.getHours()*60+d.getMinutes()+d.getSeconds()/60}
function timeAngle(minute){return -90+clamp(minute,0,1440)/8}
function clockTime(minute){const value=clamp(Math.round(minute),0,1440);return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0')}
function eventAtMinute(minute){
 let best=-1,distance=Infinity;
 dayEvents().forEach((event,index)=>{
  const inside=event.endMinute>event.startMinute&&minute>=event.startMinute&&minute<=event.endMinute;
  const delta=inside?0:Math.abs(minute-event.startMinute);
  if((inside||delta<=8)&&(delta<distance||delta===distance&&index===selected.event)){best=index;distance=delta}
 });
 return best;
}
function syncTimeSelection(){selected.event=eventAtMinute(selected.minute)}
function arcPath(radius,start,end){
 const a=polar(radius,timeAngle(start)),b=polar(radius,timeAngle(end));
 return 'M'+a.x+' '+a.y+' A'+radius+' '+radius+' 0 0 1 '+b.x+' '+b.y;
}

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
 if(meta)meta.content=dark?'#070707':'#f5f5f5';
}


function drawHub(){
 hub.replaceChildren();
 const ring=(r,cls)=>el('circle',{cx,cy,r,class:cls});
 // Cut-out rosette, concentric rings and eight fine radial registration marks.
 for(let i=0;i<8;i++){
  const petal=el('path',{d:`M${cx-5} ${cy-33} Q${cx} ${cy-49} ${cx+5} ${cy-33} Q${cx} ${cy-37} ${cx-5} ${cy-33}Z`,
   class:'hub-lace',transform:`rotate(${i*45} ${cx} ${cy})`});hub.append(petal);
 }
 hub.append(ring(37,'hub-orbit outer'),ring(29,'hub-orbit middle'),ring(20,'hub-orbit inner'));
 for(let i=0;i<8;i++){
  const a=polar(30,i*45),b=polar(36,i*45);
  hub.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'hub-spoke'}));
 }
 let d='';
 for(let i=0;i<16;i++){const p=polar(i%2?7.5:17,-90+i*22.5);d+=(i?' L':'M')+p.x+' '+p.y}
 hub.append(el('path',{d:d+'Z',class:'hub-rose'}),ring(6,'hub-cut'),ring(2.5,'hub-core'));
}

function drawAtlasDecor(width,height){
 const decor=document.querySelector('#atlasDecor');decor.setAttribute('viewBox',`0 0 ${width} ${height}`);decor.replaceChildren();
 // Nested contour loops describe the empty corners, away from the numeral ring.
 const contour=(x,y,rx,ry,angle,count)=>{
  const group=el('g',{transform:`translate(${x} ${y}) rotate(${angle})`});
  for(let n=0;n<count;n++){
   const k=.25+n*.072;let d='';
   for(let i=0;i<=96;i++){
    const t=i/96*Math.PI*2;
    const warp=1+.075*Math.sin(t*3+.6)+.04*Math.cos(t*5);
    const px=Math.cos(t)*rx*k*warp,py=Math.sin(t)*ry*k*warp;
    d+=(i?' L':'M')+px.toFixed(2)+' '+py.toFixed(2);
   }
   group.append(el('path',{d:d+'Z',class:'atlas-contour'}));
  }
  decor.append(group);
 };
 contour(width*.98,height*.075,width*.31,36,24,17);
 contour(width*.035,height*.9,width*.26,27,-28,15);
 const cross=(x,y,size=3)=>{
  decor.append(el('path',{d:`M${x-size} ${y}h${size*2} M${x} ${y-size}v${size*2}`,class:'atlas-tech'}));
 };
 for(const [x,y] of [[width*.72,8],[width-12,height*.28],[width-12,height*.69],[10,height*.75],[width*.23,height-15]])cross(x,y);
 const checker=el('g',{transform:`translate(${width-23} ${height*.61})`,class:'atlas-solid'});
 for(let row=0;row<3;row++)for(let col=0;col<3;col++)if((row+col)%2===0)checker.append(el('rect',{x:col*4,y:row*4,width:4,height:4}));
 decor.append(checker);
 const dots=el('g',{class:'atlas-solid atlas-faint'});
 for(let row=0;row<4;row++)for(let col=0;col<5;col++)dots.append(el('circle',{cx:12+col*6,cy:height*.73+row*6,r:.65}));
 decor.append(dots);
 decor.append(el('path',{d:`M${width-24} ${height*.34}h12 m-12 5h7 M8 ${height-21}h30 m3 0h22`,class:'atlas-tech'}));
 for(let n=0;n<7;n++)decor.append(el('path',{d:`M${43+n*5} ${height-21}l3 -4`,class:'atlas-tech'}));
 const asterisk=el('g',{transform:`translate(${width-17} ${height*.73})`,class:'atlas-tech'});
 for(let i=0;i<3;i++)asterisk.append(el('path',{d:'M-5 0H5',transform:`rotate(${i*60})`}));
 decor.append(asterisk);
}

function layoutDial(){
 const width=stage.getBoundingClientRect().width;
 // The visible semicircle radius occupies 75% of the viewport width.
 const axisX=0,scale=Math.min(width*.75/416,width>=640?1.1:Infinity);
 const outerRadius=428*scale,height=outerRadius*2+152;
 stage.style.height=`${height}px`;
 const axisY=outerRadius+12;
 Object.assign(svg.style,{width:`${760*scale}px`,height:`${940*scale}px`,
  insetInlineStart:`${axisX-cx*scale}px`,insetBlockStart:`${axisY-cy*scale}px`});
 drawAtlasDecor(width,height);drawFeedback();
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


function selectMonth(index){
 setActiveHand('month');commitSelection('month',index,{animateOthers:true});
 springTo('month',angleForKindIndex('month',index));
}
function monthKey(index,event){
 if(event.key==='Enter'||event.key===' '){event.preventDefault();selectMonth(index)}
}
function drawStaticDial(){
 layers.monthTicks.replaceChildren();layers.monthLabels.replaceChildren();drawOrnaments();drawHub();
 // Twelve large divisions; each spans two hours on the 24h rail.
 for(let hour=0;hour<=24;hour++){
  const angle=timeAngle(hour*60),a=polar(416,angle),b=polar(hour%2===0?400:408,angle);
  layers.monthTicks.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'tick '+(hour%2===0?'major':'minor')+' time-tick','data-hour':hour,'data-angle':angle}));
  if(hour%6===0){
   const point=polar(440,angle),label=el('text',{x:point.x+(hour===0||hour===24?9:0),y:point.y,class:'hour-label'});
   label.textContent=String(hour).padStart(2,'0');layers.monthTicks.append(label);
  }
 }
 roman.forEach((label,index)=>{
  const angle=rangeAngle(index,12,...handRange.month),point=polar(357,angle);
  const a=polar(416,angle),b=polar(390,angle);
  layers.monthTicks.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'tick minor month-major','data-month':index+1,'data-angle':angle}));
  const stationPoint=polar(handRadius.month,angle);
  const station=el('g',{class:'month-station','data-month':index+1,'data-angle':angle,
   transform:`translate(${stationPoint.x} ${stationPoint.y})`,role:'button',tabindex:'0','aria-label':`${index+1}月`});
  station.append(el('circle',{r:28,class:'month-hit'}),el('path',{d:'M-5 0H5M0 -5V5',class:'month-station-cross'}),el('circle',{r:3,class:'month-station-dot'}));
  station.addEventListener('click',()=>selectMonth(index));station.addEventListener('keydown',event=>monthKey(index,event));
  layers.monthTicks.append(station);
  const group=el('g',{class:'month-label-group','data-month':index+1,'data-angle':angle,
   transform:`translate(${point.x} ${point.y}) rotate(${angle+90})`,role:'button',tabindex:'0','aria-label':`${index+1}月`});
  group.append(el('rect',{x:-42,y:-35,width:84,height:70,class:'month-hit'}));
  const text=el('text',{x:0,y:0,class:'month-label',transform:'scale(.62 1)'});text.textContent=label;group.append(text);
  group.addEventListener('click',()=>selectMonth(index));group.addEventListener('keydown',event=>monthKey(index,event));
  layers.monthLabels.append(group);
 });
 updateMonthScale();
}
function updateMonthScale(){
 for(const node of document.querySelectorAll('.month-station,.month-label-group')){
  const active=Number(node.dataset.month)===selected.month;
  node.classList.toggle('is-active',active);node.setAttribute('aria-pressed',String(active));
 }
 layers.feedback.querySelector('.month-projection')?.remove();
 const angle=rangeAngle(selected.month-1,12,...handRange.month),a=polar(handRadius.month+7,angle),b=polar(330,angle);
 layers.feedback.prepend(el('path',{d:`M${a.x} ${a.y}L${b.x} ${b.y}`,class:'month-projection'}));
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
 const list=dayEvents(),lanes=[];
 // Separate overlapping intervals on narrow tracks within the outer rail.
 list.forEach((event,index)=>{
  if(event.endMinute<=event.startMinute)return;
  let lane=lanes.findIndex(end=>end<=event.startMinute);if(lane<0)lane=lanes.length;lanes[lane]=event.endMinute;
  const radius=398+(lane%4)*4;
  const arc=el('path',{d:arcPath(radius,event.startMinute,event.endMinute),class:'event-duration'+(index===selected.event?' is-active':''),tabindex:'0',role:'button',
   'data-event-index':index,'data-start-minute':event.startMinute,'data-end-minute':event.endMinute,'data-angle-span':(event.endMinute-event.startMinute)/8,'aria-label':event.title+' '+clockTime(event.startMinute)+'至'+clockTime(event.endMinute)});
  const open=()=>openEvent(index,true);arc.addEventListener('click',open);
  arc.addEventListener('keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();open()}});
  layers.eventNodes.append(arc);
 });
 list.forEach((event,index)=>{
  const angle=timeAngle(event.startMinute),point=polar(handRadius.event,angle);
  const group=el('g',{class:'event-node'+(index===selected.event?' is-active':''),tabindex:'0',role:'button','data-event-index':index,'data-event-kind':event.kind,'data-minute':event.startMinute,'aria-label':event.title+' '+clockTime(event.startMinute),transform:'translate('+point.x+' '+point.y+')'});
  group.append(el('circle',{cx:0,cy:0,r:18,class:'node-hit'}),el('circle',{cx:0,cy:0,r:7,class:'node-orbit'}),nodeSymbol(event.kind));
  group.append(el('path',{d:'M0 -15 V-10 M0 10 V15 M-15 0 H-10 M10 0 H15',class:'node-crosshair'}));
  const ordinal=el('text',{x:12,y:-10,class:'node-index'});ordinal.textContent=String(index+1).padStart(2,'0');group.append(ordinal);
  group.addEventListener('click',()=>openEvent(index,true));
  group.addEventListener('keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();openEvent(index,true)}});
  layers.eventNodes.append(group);
 });drawFeedback();
}

function updateEventNodeClasses(tickedIndex=null){
 for(const node of layers.eventNodes.querySelectorAll('.event-node,.event-duration')){
  const index=Number(node.dataset.eventIndex);
  node.classList.toggle('is-active',index===selected.event);
  if(index===tickedIndex){node.classList.remove('is-ticked');void node.getBBox();node.classList.add('is-ticked')}
 }
 drawFeedback();
}

function drawFeedback(){
 updateMonthScale();
 for(const child of [...layers.feedback.children])if(child.classList.contains('selection-feedback'))child.remove();
 if(!expanded||!currentEvent())return;
 const angle=timeAngle(currentEvent().startMinute),point=polar(handRadius.event,angle);
 const group=el('g',{class:'selection-feedback'});
 const caption=document.querySelector('.editorial-bottom').getBoundingClientRect(),matrix=svg.getScreenCTM();
 if(!matrix)return;
 const anchor=svg.createSVGPoint();anchor.x=caption.left-7;anchor.y=caption.top+5;
 const end=anchor.matrixTransform(matrix.inverse());
 group.append(el('path',{d:`M${point.x} ${point.y} L${point.x+22} ${point.y} L${end.x} ${end.y}`,class:'feedback-path'}));
 group.append(el('rect',{x:end.x-2.5,y:end.y-2.5,width:5,height:5,transform:`rotate(45 ${end.x} ${end.y})`,class:'feedback-terminal'}));
 layers.feedback.prepend(group);
}

function pulseDetent(kind,angle){
 if(reduceMotion.matches)return;
 const point=polar(handRadius[kind],angle),ring=el('circle',{cx:point.x,cy:point.y,r:13,class:'detent-ring'});
 layers.feedback.append(ring);setTimeout(()=>ring.remove(),220);
 hub.classList.remove('is-active');void hub.getBBox();hub.classList.add('is-active');setTimeout(()=>hub.classList.remove('is-active'),450);
}

function showDragEcho(kind,angle){
 // Date markings must read as a fixed measuring scale, without nearby moving arcs.
 if(kind==='day'){layers.feedback.querySelector('.drag-feedback')?.remove();return}
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

function handAngles(){return{month:rangeAngle(selected.month-1,12),day:rangeAngle(selected.day-1,daysInMonth(selected.year,selected.month)),event:timeAngle(selected.minute)}}

function setActiveHand(kind){
 activeHand=kind;stage.dataset.activeHand=kind;
 for(const button of document.querySelectorAll('[data-focus-hand]'))button.setAttribute('aria-pressed',String(button.dataset.focusHand===kind));
}

function setHandAngle(kind,angle){
 hands[kind].setAttribute('transform','translate('+cx+' '+cy+') rotate('+angle+')');
 const value=kind==='month'?selected.month:kind==='day'?selected.day:selected.minute;
 hands[kind].setAttribute('aria-valuenow',String(value));
 hands[kind].setAttribute('aria-valuetext',kind==='month'?value+'月':kind==='day'?value+'日':clockTime(value)+(currentEvent()?' '+currentEvent().title:''));
 hands[kind].setAttribute('aria-valuemin',kind==='event'?'0':'1');
 hands[kind].setAttribute('aria-valuemax',String(kind==='month'?12:kind==='day'?daysInMonth(selected.year,selected.month):1440));
 hands[kind].removeAttribute('aria-disabled');
}

function snapAll(){
 const angles=handAngles();
 for(const kind of Object.keys(hands)){Object.assign(motion[kind],{angle:angles[kind],target:angles[kind],desired:angles[kind],velocity:0,mode:'idle',preview:null});setHandAngle(kind,angles[kind])}
}

function collapsedCopy(){
 const count=dayEvents().length;ui.kind.textContent='EPHEMERIS / '+clockTime(selected.minute);
 ui.title.textContent=count?'拨动长针，沿时间读取事件':'这一天还没有轨迹记录';
 ui.object.textContent=count?'点按事件节点或弧线，也可展开记录。':'拨动中针选择日期，短针选择月份。';
 ui.time.textContent=dateKey(selected.year,selected.month,selected.day)+' · '+clockTime(selected.minute);
 ui.type.textContent=count?count+' EVENTS':'EMPTY DAY';ui.close.hidden=true;editorial.classList.add('collapsed');
}

function renderReadout(){
 ui.year.textContent=selected.year;ui.month.textContent=String(selected.month).padStart(2,'0');ui.day.textContent=String(selected.day).padStart(2,'0');ui.weekday.textContent=weekday(selected.year,selected.month,selected.day);
 const event=currentEvent();if(!expanded||!event){collapsedCopy();return}
 editorial.classList.remove('collapsed');ui.kind.textContent=event.kind==='task'?'EPHEMERIS / DONE':event.kind==='focus'?'EPHEMERIS / FOCUS':'EPHEMERIS / EVENT';
 ui.title.textContent=event.title;ui.object.textContent=event.object||'Cove Learning';ui.time.textContent=dateKey(selected.year,selected.month,selected.day)+' · '+(event.endMinute>event.startMinute?clockTime(event.startMinute)+'—'+clockTime(event.endMinute):clockTime(event.startMinute));
 ui.type.textContent=event.kind==='task'?'DONE TASK':event.kind==='focus'?event.duration+' MIN FOCUS':(event.duration?event.duration+' MIN · '+event.kind.toUpperCase():event.kind.toUpperCase());ui.close.hidden=false;
}

function retargetOthers(exceptKind,animate=true){
 const angles=handAngles();
 for(const kind of Object.keys(hands)){
  if(kind===exceptKind||motion[kind].mode==='drag')continue;
  if(animate&&Math.abs(motion[kind].target-angles[kind])<.0001)continue;
  if(animate)springTo(kind,angles[kind]);else{Object.assign(motion[kind],{angle:angles[kind],target:angles[kind],desired:angles[kind],velocity:0,mode:'idle'});setHandAngle(kind,angles[kind])}
 }
}

function commitSelection(kind,index,{preview=false,animateOthers=true}={}){
 if(kind==='month'){
  const next=clamp(index+1,1,12);if(next===selected.month&&preview)return;
  selected.month=next;selected.day=clamp(selected.day,1,daysInMonth(selected.year,selected.month));syncTimeSelection();expanded=false;drawDayRing();drawEventRing();
 }else if(kind==='day'){
  const next=clamp(index+1,1,daysInMonth(selected.year,selected.month));if(next===selected.day&&preview)return;
  selected.day=next;syncTimeSelection();expanded=false;drawEventRing();
 }else{
  const next=clamp(Math.round(index),0,1440);if(next===selected.minute&&preview)return;
  selected.minute=next;syncTimeSelection();expanded=false;updateEventNodeClasses();
 }
 renderReadout();retargetOthers(kind,animateOthers);drawFeedback();
}

function indexForAngle(kind,angle){
 if(kind==='event')return clamp(Math.round((clamp(angle,-90,90)+90)*8),0,1440);
 const count=kind==='month'?12:daysInMonth(selected.year,selected.month);
 return clamp(Math.floor((clamp(angle,-90,90)+90)/180*count),0,count-1);
}

function angleForKindIndex(kind,index){
 if(kind==='event')return timeAngle(index);
 return rangeAngle(index,kind==='month'?12:daysInMonth(selected.year,selected.month));
}

function springTo(kind,target,onSettle=null,initialVelocity=null){
 const state=motion[kind],sameTarget=Math.abs(state.target-target)<.0001;
 state.target=target;state.desired=target;
 if(reduceMotion.matches){state.angle=target;state.velocity=0;state.mode='idle';state.onSettle=null;setHandAngle(kind,target);onSettle?.();return}
 // Repeated readout updates must not restart another hand's spring or discard momentum.
 if(state.mode==='spring'&&sameTarget&&initialVelocity===null){if(onSettle)state.onSettle=onSettle;return}
 state.onSettle=onSettle;
 state.velocity=clamp(initialVelocity??state.velocity,-180,180);
 if(Math.abs(state.angle-target)<.001&&Math.abs(state.velocity)<.7){
  state.angle=target;state.velocity=0;state.mode='idle';state.onSettle=null;setHandAngle(kind,target);onSettle?.();return;
 }
 state.mode='spring';ensureFrame();
}

function maybePreview(kind){
 const state=motion[kind],index=indexForAngle(kind,state.desired);
 if(index===state.preview)return;
 state.preview=index;commitSelection(kind,index,{preview:true,animateOthers:true});
 const angle=angleForKindIndex(kind,index);if(kind!=='event'||index%15===0)pulseDetent(kind,angle);
 if(kind==='event')updateEventNodeClasses();
}

function stepSpring(state,config,dt,target=state.target){
 // Unit mass, k = wn², c = 2*zeta*wn. Semi-implicit Euler with <= 1/240s substeps.
 const iterations=Math.max(1,Math.ceil(dt*240)),step=dt/iterations;
 for(let i=0;i<iterations;i++){
  const acceleration=-config.wn*config.wn*(state.angle-target)-2*config.zeta*config.wn*state.velocity;
  state.velocity+=acceleration*step;state.angle+=state.velocity*step;
 }
}
function frame(now){
 const dt=lastFrame?Math.min((now-lastFrame)/1000,1/20):1/60;lastFrame=now;let running=false;
 for(const kind of Object.keys(hands)){
  const state=motion[kind],config=physics[kind];
  if(state.mode==='drag'){
   if(reduceMotion.matches){state.angle=state.desired;state.velocity=0}
   else stepSpring(state,{wn:config.dragWn,zeta:config.dragZeta},dt,state.desired);
   maybePreview(kind);showDragEcho(kind,state.angle);running=true;
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

// Resolve a gesture once in screen pixels, before SVG labels/nodes can claim it.
let gesture=null,suppressClickUntil=0,preferredHand=null;
function pickHand(event){
 const matrix=svg.getScreenCTM();if(!matrix)return null;
 const local=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
 const scale=Math.hypot(matrix.a,matrix.b),dx=local.x-cx,dy=local.y-cy;
 const candidates=[];
 for(const kind of ['event','day','month']){
  const a=motion[kind].angle*Math.PI/180,u=dx*Math.cos(a)+dy*Math.sin(a),v=-dx*Math.sin(a)+dy*Math.cos(a);
  const min=kind==='month'?160:110,max=handRadius[kind]+8;
  const distance=Math.hypot(v,Math.max(min-u,0,u-max))*scale;
  const touch=event.pointerType!=='mouse',limit=kind==='month'?(touch?15:11):(touch?25:17);
  if(distance>limit)continue;
  const tipDistance=Math.abs(u-handRadius[kind])*scale;
  // The outer portion identifies long/day needles even if their angles coincide.
  const score=distance+(kind==='month'?5:0)+Math.min(tipDistance,80)*.09-(preferredHand===kind?9:0);
  candidates.push({kind,score});
 }
 candidates.sort((a,b)=>a.score-b.score);
 return candidates[0]?.kind||null;
}
function beginDrag(kind,event){
 if(event.isPrimary===false||gesture)return;
 const angle=rawPointerAngle(event);if(angle===null)return;
 const button=event.target.closest?.('.month-label-group,.month-station,.event-node,.event-duration');
 gesture={kind,pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,button,original:motion[kind].angle,angle};
 const state=motion[kind];setActiveHand(kind);state.mode='drag';state.pointerId=event.pointerId;
 state.dragOffset=angle-state.angle;state.lastPointerAngle=state.angle;state.lastPointerTime=event.timeStamp;state.velocity=0;state.pointerVelocity=0;state.preview=indexForAngle(kind,state.angle);state.onSettle=null;
 hands[kind].classList.add('is-dragging');svg.setPointerCapture(event.pointerId);event.preventDefault();ensureFrame();
}
function moveDrag(kind,event){
 const state=motion[kind];if(!gesture||state.mode!=='drag'||gesture.pointerId!==event.pointerId)return;
 const threshold=kind==='month'?9:3;
 if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<threshold)return;
 gesture.moved=true;const raw=rawPointerAngle(event);if(raw===null)return;
 // Selection follows the absolute pointer angle; spring momentum only affects the drawing.
 const desired=rubberAngle(raw-state.dragOffset,kind);
 const dt=clamp((event.timeStamp-state.lastPointerTime)/1000,.008,.08);
 const speed=clamp((desired-state.lastPointerAngle)/dt,-720,720);
 state.pointerVelocity+=(speed-state.pointerVelocity)*(1-Math.exp(-dt/.04));
 state.desired=desired;state.lastPointerAngle=desired;state.lastPointerTime=event.timeStamp;event.preventDefault();ensureFrame();
}
function endDrag(kind,event,cancelled=false){
 const state=motion[kind];if(!gesture||gesture.pointerId!==event.pointerId)return;
 const finished=gesture;gesture=null;state.pointerId=null;state.mode='idle';
 hands[kind].classList.remove('is-dragging');if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
 hideDragEcho();suppressClickUntil=performance.now()+450;
 if(!finished.moved&&finished.button&&!cancelled){
  springTo(kind,finished.original);
  if(finished.button.matches('.month-label-group,.month-station'))selectMonth(Number(finished.button.dataset.month)-1);
  else openEvent(Number(finished.button.dataset.eventIndex),true);
  return;
 }
 const value=cancelled?finished.original:finished.moved?state.desired:finished.original;
 const index=indexForAngle(kind,value),target=angleForKindIndex(kind,index);
 const speedLimit=physics[kind].releaseSpeed;
 const releaseAge=Math.max(0,((event.timeStamp??state.lastPointerTime)-state.lastPointerTime)/1000);
 const momentum=state.velocity*.25+state.pointerVelocity*Math.exp(-releaseAge/.07)*.75;
 const releaseVelocity=!cancelled&&finished.moved?clamp(momentum,-speedLimit,speedLimit):0;
 commitSelection(kind,index,{animateOthers:true});
 springTo(kind,target,()=>{if(kind==='event'&&currentEvent()&&!cancelled){expanded=true;updateEventNodeClasses();renderReadout();drawFeedback()}},releaseVelocity);
}
function cancelAllDrags(){
 if(gesture)endDrag(gesture.kind,{pointerId:gesture.pointerId},true);
 hideDragEcho();
}
svg.addEventListener('pointerdown',event=>{
 suppressClickUntil=0;
 const kind=pickHand(event);if(!kind)return;
 beginDrag(kind,event);event.stopPropagation();
},{capture:true});
svg.addEventListener('pointermove',event=>{if(gesture)moveDrag(gesture.kind,event)});
svg.addEventListener('pointerup',event=>{if(gesture)endDrag(gesture.kind,event)});
svg.addEventListener('pointercancel',event=>{if(gesture)endDrag(gesture.kind,event,true)});
svg.addEventListener('lostpointercapture',event=>{if(gesture?.pointerId===event.pointerId)endDrag(gesture.kind,event,true)});
svg.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);

for(const [kind,hand] of Object.entries(hands)){
 hand.addEventListener('keydown',event=>{
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Home','End'].includes(event.key))return;
  setActiveHand(kind);event.preventDefault();
  if(event.key==='Enter'){if(kind==='event'&&currentEvent()){expanded=true;renderReadout();drawFeedback()}return}
  const direction=event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1;
  const current=kind==='month'?selected.month-1:kind==='day'?selected.day-1:selected.minute;
  const max=kind==='month'?11:kind==='day'?daysInMonth(selected.year,selected.month)-1:1440;
  const next=event.key==='Home'?0:event.key==='End'?max:clamp(current+direction*(kind==='event'?(event.shiftKey?60:5):1),0,max);
  commitSelection(kind,next,{animateOthers:true});springTo(kind,angleForKindIndex(kind,next));
 });
}

function openEvent(index,animate=true){
 const list=dayEvents();if(!list.length)return;
 setActiveHand('event');selected.event=clamp(index,0,list.length-1);selected.minute=Math.round(currentEvent().startMinute);expanded=true;
 updateEventNodeClasses(index);renderReadout();drawFeedback();
 const target=timeAngle(selected.minute);if(animate)springTo('event',target);else{motion.event.angle=target;setHandAngle('event',target)}
}
for(const button of document.querySelectorAll('[data-focus-hand]'))button.addEventListener('click',()=>{
 preferredHand=button.dataset.focusHand;setActiveHand(preferredHand);
});
ui.close.addEventListener('click',()=>{expanded=false;renderReadout();drawFeedback()});
document.querySelector('#resetDial').addEventListener('click',()=>{
 const latest=events[0];if(latest){Object.assign(selected,localDay(latest.at),{minute:Math.round(minuteOfDay(latest.at))});syncTimeSelection()}
 expanded=false;drawDayRing();drawEventRing();renderReadout();retargetOthers('',true);toast('已回到最近一条轨迹');
});
window.addEventListener('blur',cancelAllDrags);

async function get(path){const response=await fetch('./api'+path,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return response.json()}
function indexEvents(){
 eventsByDay=new Map();
 const push=(day,event,startMinute,endMinute)=>{
  const key=dateKey(day.getFullYear(),day.getMonth()+1,day.getDate()),list=eventsByDay.get(key)||[];
  list.push({...event,startMinute,endMinute});eventsByDay.set(key,list);
 };
 for(const event of events){
  const start=new Date(event.start||event.at),end=new Date(event.end||event.at);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))continue;
  if(end<=start){push(start,event,minuteOfDay(start),minuteOfDay(start));continue}
  let cursor=new Date(start.getFullYear(),start.getMonth(),start.getDate());
  while(cursor<end){
   const next=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1);
   const from=Math.max(start.getTime(),cursor.getTime()),to=Math.min(end.getTime(),next.getTime());
   if(to>from)push(cursor,event,from===cursor.getTime()?0:minuteOfDay(from),to===next.getTime()?1440:minuteOfDay(to));
   cursor=next;
  }
 }
 for(const list of eventsByDay.values())list.sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute);
}

async function load(){
 try{
  const [tasks,history,objectList,records]=await Promise.all([get('/tasks'),get('/focus/history'),get('/objects'),get('/learning-records')]);
  objects=new Map(objectList.map(object=>[object.id,object]));
  const taskEvents=tasks.filter(task=>task.status==='done'&&(task.updated_at||task.created_at)).map(task=>({id:'task:'+task.id,kind:'task',at:task.updated_at||task.created_at,title:task.title,object:objects.get(task.object_id)?.title||''}));
  const recordEvents=records.map(record=>({id:'record:'+record.id,kind:record.activity_type||'study',at:record.started_at,start:record.started_at,end:record.ended_at,title:record.title,object:objects.get(record.object_id)?.title||'',duration:record.focused_minutes,objectId:record.object_id,source:record.source}));
  const focusEvents=(history.sessions||[]).flatMap(session=>{
   const running=session.state==='running'&&session.current_started_at?Math.max(0,Date.now()-Date.parse(session.current_started_at)):0;
   const accumulated=Math.max(0,Number(session.accumulated_ms)||0)+running;
   if(accumulated<=0||!session.started_at)return [];
   const minutes=Math.max(1,Math.floor(accumulated/60000));
   const end=session.ended_at||(session.state==='running'?new Date().toISOString():session.updated_at);
   if(!end||recordEvents.some(record=>record.source==='focus'&&record.objectId===session.object_id&&Date.parse(record.start)===Date.parse(session.started_at)&&Date.parse(record.end)===Date.parse(end)))return [];
   return [{id:'focus:'+session.id,kind:'focus',at:session.started_at,start:session.started_at,end,title:'专注 '+minutes+' 分钟',object:objects.get(session.object_id)?.title||'',duration:minutes}];
  });
  events=[...taskEvents,...focusEvents,...recordEvents].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));indexEvents();
  if(events.length){Object.assign(selected,localDay(events[0].at),{minute:Math.round(minuteOfDay(events[0].at))});syncTimeSelection()}
  drawDayRing();drawEventRing();renderReadout();snapAll();
 }catch(error){console.error(error);drawDayRing();drawEventRing();renderReadout();snapAll();toast('数据读取失败，请刷新重试')}
}

new ResizeObserver(layoutDial).observe(stage);layoutDial();
applyAppearance();setActiveHand('event');drawStaticDial();drawDayRing();drawEventRing();renderReadout();snapAll();load();
