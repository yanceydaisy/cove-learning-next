export function mountEphemeris(scope=document,{embedded=false}={}){
let disposed=false;
const lifetime=new AbortController(),timers=new Set();
const listen=(target,type,callback,options={})=>target.addEventListener(type,callback,{...(typeof options==='boolean'?{capture:options}:options),signal:lifetime.signal});
const setTimeout=(callback,delay)=>{const id=window.setTimeout(()=>{timers.delete(id);if(!disposed)callback()},delay);timers.add(id);return id};
const clearTimeout=id=>{window.clearTimeout(id);timers.delete(id)};
const svg=scope.querySelector('#traceDial');
const stage=scope.querySelector('#dialStage');
const NS='http://www.w3.org/2000/svg';
const cx=58,cy=470;
const layers={
 orbit:scope.querySelector('#orbitLayer'),
 lace:scope.querySelector('#laceLayer'),
 ornament:scope.querySelector('#ornamentLayer'),
 monthTicks:scope.querySelector('#monthTicks'),
 monthLabels:scope.querySelector('#monthLabels'),
 dayTicks:scope.querySelector('#dayTicks'),
 eventNodes:scope.querySelector('#eventNodes'),
 feedback:scope.querySelector('#feedbackLayer')
};
const hands={month:scope.querySelector('#monthHand'),day:scope.querySelector('#dayHand'),event:scope.querySelector('#eventHand')};
const hub=scope.querySelector('.dial-hub');
const editorial=scope.querySelector('#eventEditorial');
const ui={
 year:scope.querySelector('#readoutYear'),month:scope.querySelector('#readoutMonth'),day:scope.querySelector('#readoutDay'),
 clock:scope.querySelector('#readoutClock'),weekday:scope.querySelector('#readoutWeekday'),kind:scope.querySelector('#eventKind'),title:scope.querySelector('#eventTitle'),
 object:scope.querySelector('#eventObject'),time:scope.querySelector('#detailTime'),type:scope.querySelector('#detailType'),
 close:scope.querySelector('#closeEditorial'),expand:scope.querySelector('#expandEditorial'),glass:scope.querySelector('#eventGlass'),toast:scope.querySelector('#dialToast')
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
let detailsOpen=false,briefEventId=null;
let activeHand='event';
let raf=0,lastFrame=0;
function currentSelection(){const now=new Date();return {year:now.getFullYear(),month:now.getMonth()+1,day:now.getDate(),event:-1,minute:now.getHours()*60+now.getMinutes()}}
let selected=currentSelection();

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
  const inside=(event.segments||[]).some(segment=>minute>=segment.startMinute&&minute<=segment.endMinute);
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
 if(embedded)return;
 const mode=localStorage.getItem('cove.home.themeMode')||'system';
 const prefers=matchMedia('(prefers-color-scheme:dark)').matches;
 const dark=mode==='dark'||mode==='system'&&prefers;
 document.documentElement.dataset.theme=dark?'dark':'light';
 const background=localStorage.getItem('cove.home.background')||'';
 const layer=scope.querySelector('#wallpaper');
 if(background&&/^(data:image\/|blob:)/.test(background)){layer.style.backgroundImage='url('+JSON.stringify(background)+')';layer.classList.add('custom')}
 const meta=scope.querySelector('meta[name="theme-color"]');
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
 const decor=scope.querySelector('#atlasDecor');decor.setAttribute('viewBox',`0 0 ${width} ${height}`);decor.replaceChildren();
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
 if(embedded)stage.style.removeProperty('height');
 const availableHeight=embedded?stage.getBoundingClientRect().height:Infinity;
 // Keep the approved 75% radius wherever the fixed viewport allows it.
 const scale=Math.min(width*.75/416,width>=640?1.1:Infinity,embedded?Math.max(.1,(availableHeight-60)/856):Infinity);
 const outerRadius=428*scale,height=embedded?availableHeight:outerRadius*2+152;
 if(!embedded)stage.style.height=height+'px';
 const axisY=outerRadius+10;
 Object.assign(svg.style,{width:760*scale+'px',height:940*scale+'px',
  insetInlineStart:-cx*scale+'px',insetBlockStart:axisY-cy*scale+'px'});
 const cardHeight=Math.min(460,Math.floor(height*.60));
 stage.style.setProperty('--tarot-height',cardHeight+'px');
 stage.style.setProperty('--tarot-width',Math.min(width*.50,cardHeight/1.95)+'px');
 const dateHeight=scope.querySelector('.editorial-top').offsetHeight;
 stage.style.setProperty('--date-center',Math.min(height*(height<460?.27:.32),height-cardHeight-18-dateHeight/2)+'px');
 drawAtlasDecor(width,height);
 if(currentEvent())renderReadout();
 drawFeedback();
}

function applyTransparency(){
 if(!embedded)return;
 const defs=svg.querySelector('defs');
 for(const [kind,hand] of Object.entries(hands)){
  const art=hand.querySelector('.hand-art'),id='ephemeris-cutout-'+kind;
  const mask=el('mask',{id,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:-64,y:-80,width:540,height:160});
  mask.append(el('rect',{x:-64,y:-80,width:540,height:160,fill:'white'}));
  const scaleX=art.transform.baseVal.consolidate().matrix.a;
  mask.append(el('ellipse',{cx:0,cy:0,rx:37/scaleX,ry:37,fill:'black'}));
  for(const ring of art.querySelectorAll('.hand-grip,.day-hole')){
   mask.append(el('circle',{cx:ring.getAttribute('cx'),cy:ring.getAttribute('cy'),r:Math.max(1,Number(ring.getAttribute('r'))-1.7),fill:'black'}));
  }
  if(kind==='event'){
   for(const detail of art.querySelectorAll('.month-filigree,.month-window,.hand-sigil')){
    const cut=detail.cloneNode(true);cut.removeAttribute('class');
    cut.setAttribute('fill',detail.classList.contains('hand-sigil')?'black':'none');
    cut.setAttribute('stroke','black');cut.setAttribute('stroke-width','1.25');mask.append(cut);
   }
  }
  defs.append(mask);
  for(const shape of art.children)if(!shape.classList.contains('hand-hit'))shape.setAttribute('mask','url(#'+id+')');
 }
 const center=el('mask',{id:'ephemeris-hub-cutout',maskUnits:'userSpaceOnUse',x:cx-25,y:cy-25,width:50,height:50});
 center.append(el('rect',{x:cx-25,y:cy-25,width:50,height:50,fill:'white'}),el('circle',{cx,cy,r:6,fill:'black'}));
 defs.append(center);hub.querySelector('.hub-rose').setAttribute('mask','url(#ephemeris-hub-cutout)');
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
  listen(station,'click',()=>selectMonth(index));listen(station,'keydown',event=>monthKey(index,event));
  layers.monthTicks.append(station);
  const group=el('g',{class:'month-label-group','data-month':index+1,'data-angle':angle,
   transform:`translate(${point.x} ${point.y}) rotate(${angle+90})`,role:'button',tabindex:'0','aria-label':`${index+1}月`});
  group.append(el('rect',{x:-42,y:-35,width:84,height:70,class:'month-hit'}));
  const text=el('text',{x:0,y:0,class:'month-label',transform:'scale(.62 1)'});text.textContent=label;group.append(text);
  listen(group,'click',()=>selectMonth(index));listen(group,'keydown',event=>monthKey(index,event));
  layers.monthLabels.append(group);
 });
 updateMonthScale();
}
function updateMonthScale(){
 for(const node of scope.querySelectorAll('.month-station,.month-label-group')){
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
  for(const segment of event.segments||[]){
  const {startMinute,endMinute}=segment;
  if(endMinute<=startMinute)continue;
  let lane=lanes.findIndex(end=>end<=startMinute);if(lane<0)lane=lanes.length;lanes[lane]=endMinute;
  const radius=398+(lane%4)*4;
  const arc=el('path',{d:arcPath(radius,startMinute,endMinute),class:'event-duration'+(index===selected.event?' is-active':''),tabindex:'0',role:'button',
   'data-event-index':index,'data-start-minute':startMinute,'data-end-minute':endMinute,'data-angle-span':(endMinute-startMinute)/8,'aria-label':event.title+' '+clockTime(event.startMinute)+'至'+clockTime(event.endMinute)});
  const open=()=>openEvent(index,true);listen(arc,'click',open);
  listen(arc,'keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();open()}});
  layers.eventNodes.append(arc);
  }
 });
 list.forEach((event,index)=>{
  const angle=timeAngle(event.startMinute),point=polar(handRadius.event,angle);
  const group=el('g',{class:'event-node'+(index===selected.event?' is-active':''),tabindex:'0',role:'button','data-event-index':index,'data-event-kind':event.kind,'data-minute':event.startMinute,'aria-label':event.title+' '+clockTime(event.startMinute),transform:'translate('+point.x+' '+point.y+')'});
  group.append(el('circle',{cx:0,cy:0,r:18,class:'node-hit'}),el('circle',{cx:0,cy:0,r:7,class:'node-orbit'}),nodeSymbol(event.kind));
  group.append(el('path',{d:'M0 -15 V-10 M0 10 V15 M-15 0 H-10 M10 0 H15',class:'node-crosshair'}));
  const ordinal=el('text',{x:12,y:-10,class:'node-index'});ordinal.textContent=String(index+1).padStart(2,'0');group.append(ordinal);
  listen(group,'click',()=>openEvent(index,true));
  listen(group,'keydown',key=>{if(key.key==='Enter'||key.key===' '){key.preventDefault();openEvent(index,true)}});
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

function quietBriefBackdrop(){
 const decor=scope.querySelector('#atlasDecor');
 if(!currentEvent()||!editorial.classList.contains('has-event')){decor.style.removeProperty('mask-image');decor.style.removeProperty('-webkit-mask-image');return}
 const brief=scope.querySelector('.event-brief').getBoundingClientRect(),area=decor.getBoundingClientRect();
 const mask='radial-gradient(ellipse '+(brief.width/2+24)+'px '+(brief.height/2+18)+'px at '+(brief.left-area.left+brief.width/2)+'px '+(brief.top-area.top+brief.height/2)+'px, rgba(0,0,0,.14) 68%, #000 100%)';
 decor.style.maskImage=mask;decor.style.webkitMaskImage=mask;
}

function drawFeedback(){
 quietBriefBackdrop();
 updateMonthScale();
 for(const child of [...layers.feedback.children])if(child.classList.contains('selection-feedback'))child.remove();
 if(!currentEvent())return;
 const angle=timeAngle(currentEvent().startMinute),point=polar(handRadius.event,angle);
 const group=el('g',{class:'selection-feedback'});
 const caption=scope.querySelector('.brief-anchor').getBoundingClientRect(),matrix=svg.getScreenCTM();
 if(!matrix)return;
 const anchor=svg.createSVGPoint();anchor.x=caption.left+caption.width/2;anchor.y=caption.top+caption.height/2;
 const end=anchor.matrixTransform(matrix.inverse());
 group.append(el('path',{d:`M${point.x} ${point.y} L${point.x+22} ${point.y} L${end.x} ${end.y}`,class:'feedback-path'}));
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
 for(const button of scope.querySelectorAll('[data-focus-hand]'))button.setAttribute('aria-pressed',String(button.dataset.focusHand===kind));
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
 clearRecordDetails();
 const count=dayEvents().length;ui.kind.textContent='EPHEMERIS / '+clockTime(selected.minute);
 ui.title.textContent=count?'拨动长针，沿时间读取事件':'这一天还没有轨迹记录';
 ui.object.textContent=count?'点按事件节点或弧线，也可展开记录。':'拨动中针选择日期，短针选择月份。';
 ui.time.textContent=dateKey(selected.year,selected.month,selected.day)+' · '+clockTime(selected.minute);
 ui.type.textContent=count?count+' EVENTS':'EMPTY DAY';if(stage.dataset.loadState==='error'){
  ui.title.textContent='记录暂时没有读取成功';ui.object.textContent='点按 RESET 重新读取。';ui.type.textContent='RETRY';
 }else if(stage.dataset.loadState==='loading'){
  ui.title.textContent='正在读取这段时间的记录';ui.object.textContent='';ui.type.textContent='LOADING';
 }
 detailsOpen=false;briefEventId=null;ui.glass.hidden=true;ui.expand.hidden=true;ui.expand.setAttribute('aria-expanded','false');editorial.classList.remove('has-event','details-open');scope.querySelector('#eventTimeLabel').textContent='时刻';editorial.classList.add('collapsed');quietBriefBackdrop();
}

function renderReadout(){
 ui.year.textContent=selected.year;ui.month.textContent=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][selected.month-1];ui.day.textContent=String(selected.day);ui.weekday.textContent=new Date(selected.year,selected.month-1,selected.day).toLocaleDateString('en-US',{weekday:'short'}).toUpperCase();ui.clock.textContent=clockTime(selected.minute);scope.querySelector('.editorial-top').setAttribute('aria-label',dateKey(selected.year,selected.month,selected.day)+' '+clockTime(selected.minute));
 const event=currentEvent();if(!event){collapsedCopy();return}
 if(briefEventId!==event.id){detailsOpen=false;briefEventId=event.id}
 editorial.classList.remove('collapsed');editorial.classList.add('has-event');
 ui.kind.textContent=(event.kind==='task'?'DONE':event.kind==='focus'?'FOCUS':'EVENT')+' / '+dateKey(selected.year,selected.month,selected.day);
 ui.title.textContent=event.title;
 ui.object.textContent='关联 · '+([...new Set([event.object,event.taskTitle].filter(Boolean))].join(' / ')||'未关联');
 const interval=event.endMinute>event.startMinute;
 scope.querySelector('#eventTimeLabel').textContent=interval?'时段':'时点';
 ui.time.replaceChildren();
 for(const [index,value] of (interval?[clockTime(event.startMinute),clockTime(event.endMinute)]:[clockTime(event.startMinute)]).entries()){
  if(index){const dash=document.createElement('i');dash.textContent='—';ui.time.append(dash)}
  const time=document.createElement(index?'span':'strong');time.textContent=value;ui.time.append(time);
 }
 ui.type.textContent=event.time_source==='legacy_updated_at'?'旧记录 · 完成时刻待补':event.kind==='task'?'完成任务':'专注 '+Math.floor((event.focused_ms||0)/60000)+' min · 经过 '+Math.round((event.elapsed_ms||0)/60000)+' min';
 if(event.time_source==='legacy_updated_at'){ui.time.textContent='完成时刻未记录';scope.querySelector('#eventTimeLabel').textContent='旧记录'}
 ui.expand.hidden=false;ui.expand.setAttribute('aria-expanded',String(detailsOpen));ui.expand.setAttribute('aria-label',detailsOpen?'收起事件详情':'展开事件详情');
 editorial.classList.toggle('details-open',detailsOpen);ui.glass.hidden=!detailsOpen;
 quietBriefBackdrop();
 if(detailsOpen){scope.querySelector('#cardEventTitle').textContent=event.title;scope.querySelector('#cardEventTitle').title=event.title;scope.querySelector('#cardEventObject').textContent=ui.object.textContent;scope.querySelector('#cardEventTime').textContent=ui.time.textContent;renderRecordDetails(event)}else clearRecordDetails();
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
  const changed=next!==selected.month;
  detailsOpen=false;selected.month=next;selected.day=clamp(selected.day,1,daysInMonth(selected.year,selected.month));syncTimeSelection();drawDayRing();drawEventRing();
  if(changed)load();
 }else if(kind==='day'){
  const next=clamp(index+1,1,daysInMonth(selected.year,selected.month));if(next===selected.day&&preview)return;
  detailsOpen=false;selected.day=next;syncTimeSelection();drawEventRing();
 }else{
  const next=clamp(Math.round(index),0,1440);if(next===selected.minute&&preview)return;
  selected.minute=next;syncTimeSelection();updateEventNodeClasses();
 }
 renderReadout();setHandAngle(kind,motion[kind].angle);retargetOthers(kind,animateOthers);drawFeedback();
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
 springTo(kind,target,()=>{if(kind==='event'&&currentEvent()&&!cancelled){updateEventNodeClasses();renderReadout();drawFeedback()}},releaseVelocity);
}
function cancelAllDrags(){
 if(gesture)endDrag(gesture.kind,{pointerId:gesture.pointerId},true);
 hideDragEcho();
}
listen(svg,'pointerdown',event=>{
 suppressClickUntil=0;
 const kind=pickHand(event);if(!kind)return;
 beginDrag(kind,event);event.stopPropagation();
},{capture:true});
listen(svg,'pointermove',event=>{if(gesture)moveDrag(gesture.kind,event)});
listen(svg,'pointerup',event=>{if(gesture)endDrag(gesture.kind,event)});
listen(svg,'pointercancel',event=>{if(gesture)endDrag(gesture.kind,event,true)});
listen(svg,'lostpointercapture',event=>{if(gesture?.pointerId===event.pointerId)endDrag(gesture.kind,event,true)});
listen(svg,'click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);

for(const [kind,hand] of Object.entries(hands)){
 listen(hand,'keydown',event=>{
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Home','End'].includes(event.key))return;
  setActiveHand(kind);event.preventDefault();
  if(event.key==='Enter'){if(kind==='event'&&currentEvent()){renderReadout();drawFeedback()}return}
  const direction=event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1;
  const current=kind==='month'?selected.month-1:kind==='day'?selected.day-1:selected.minute;
  const max=kind==='month'?11:kind==='day'?daysInMonth(selected.year,selected.month)-1:1440;
  const next=event.key==='Home'?0:event.key==='End'?max:clamp(current+direction*(kind==='event'?(event.shiftKey?60:5):1),0,max);
  commitSelection(kind,next,{animateOthers:true});springTo(kind,angleForKindIndex(kind,next));
 });
}

function openEvent(index,animate=true){
 const list=dayEvents();if(!list.length)return;
 setActiveHand('event');selected.event=clamp(index,0,list.length-1);selected.minute=Math.round(currentEvent().startMinute);
 updateEventNodeClasses(index);renderReadout();drawFeedback();
 const target=timeAngle(selected.minute);if(animate)springTo('event',target);else{motion.event.angle=target;setHandAngle('event',target)}
}
for(const button of scope.querySelectorAll('[data-focus-hand]'))listen(button,'click',()=>{
 preferredHand=button.dataset.focusHand;setActiveHand(preferredHand);
});
function closeDetails(){detailsOpen=false;renderReadout();drawFeedback();ui.expand.focus({preventScroll:true})}
listen(ui.expand,'click',()=>{detailsOpen=!detailsOpen;renderReadout();drawFeedback()});
listen(ui.close,'click',closeDetails);
listen(editorial,'keydown',event=>{if(event.key==='Escape'&&detailsOpen){event.preventDefault();event.stopPropagation();closeDetails()}});
listen(scope.querySelector('#resetDial'),'click',()=>{
 cancelAllDrags();detailsOpen=false;briefEventId=null;Object.assign(selected,currentSelection());syncTimeSelection();
 drawDayRing();drawEventRing();renderReadout();retargetOthers('',true);load();toast('已回到当前时间');
});
for(const button of scope.querySelectorAll('[data-year-step]'))listen(button,'click',()=>{
 detailsOpen=false;selected.year=clamp(selected.year+Number(button.dataset.yearStep),1970,9999);
 selected.day=clamp(selected.day,1,daysInMonth(selected.year,selected.month));
 drawDayRing();renderReadout();retargetOthers('',true);load();
});
listen(window,'blur',cancelAllDrags);

let detailPages=[],detailPage=0,detailEventId=null;
const detailNames={empty:'记录详情',summary:'学习内容与总结',note:'笔记 / 补充',next:'下一步',tags:'索引 / TAGS',task:'关联任务'};
function clearRecordDetails(){
 for(const node of scope.querySelectorAll('[data-record-detail]')){node.textContent='';node.hidden=true}
 scope.querySelector('#detailPager').hidden=true;scope.querySelector('#detailEmpty').hidden=true;
}
function setDetailHeading(kind){const heading=scope.querySelector('#detailHeading');heading.textContent=({summary:'Notes',note:'Memo',next:'Next',tags:'Index',task:'Related',empty:'Record'})[kind]||'Record';const subtitle=document.createElement('small');subtitle.textContent=detailNames[kind]||'记录详情';heading.append(subtitle)}
function showDetailPage(){
 for(const node of scope.querySelectorAll('[data-record-detail]'))node.hidden=true;
 const page=detailPages[detailPage],pager=scope.querySelector('#detailPager');
 scope.querySelector('#detailEmpty').hidden=!!page;
 setDetailHeading(page?.kind);
 if(page){const node=scope.querySelector('[data-record-detail="'+page.kind+'"]');node.textContent=page.text;node.hidden=false}
 pager.hidden=false;pager.classList.toggle('single-page',detailPages.length<=1);
 scope.querySelector('#detailPageCount').textContent=detailPages.length?(detailPage+1)+' / '+detailPages.length:'—';
 for(const button of pager.querySelectorAll('[data-detail-step]'))button.disabled=detailPage+Number(button.dataset.detailStep)<0||detailPage+Number(button.dataset.detailStep)>=detailPages.length;
}
function renderRecordDetails(event){
 clearRecordDetails();
 const values={summary:event.summary,note:event.note,next:event.next_action,tags:(event.tags||[]).map(tag=>'#'+tag).join(' '),task:event.taskTitle&&event.taskTitle!==event.title?event.taskTitle:''};
 if(!Object.values(values).some(Boolean))values.empty='这条记录暂未填写学习内容或总结。';
 if(detailEventId!==event.id)detailPage=0;detailEventId=event.id;detailPages=[];
 setDetailHeading(Object.keys(values).find(kind=>values[kind]));
 const paragraph=scope.querySelector('[data-record-detail="summary"]'),style=getComputedStyle(paragraph);
 const pageArea=scope.querySelector('.record-pages'),width=pageArea.clientWidth;
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=style.font||style.fontSize+' '+style.fontFamily;
 scope.querySelector('#detailPager').hidden=false;
 const lineHeight=parseFloat(style.lineHeight),heading=scope.querySelector('#detailHeading');
 const maxLines=Math.max(1,Math.floor((pageArea.clientHeight-heading.getBoundingClientRect().height-12)/lineHeight));
 for(const [kind,value] of Object.entries(values))if(value){
  let text='',line=0,lineText='';
  const finish=()=>{if(text)detailPages.push({kind,text});text='';line=0;lineText=''};
  for(const character of Array.from(value)){
   if(character==='\n'){if(line===maxLines-1)finish();else{text+='\n';line++;lineText=''};continue}
   if(lineText&&context.measureText(lineText+character).width>width-2){if(line===maxLines-1)finish();else{text+='\n';line++;lineText=''}}
   text+=character;lineText+=character;
  }
  finish();
 }
 detailPage=clamp(detailPage,0,Math.max(0,detailPages.length-1));showDetailPage();
}
for(const button of scope.querySelectorAll('[data-detail-step]'))listen(button,'click',()=>{
 detailPage=clamp(detailPage+Number(button.dataset.detailStep),0,Math.max(0,detailPages.length-1));showDetailPage();
});

async function get(path,signal){
 const response=await fetch(new URL('./api'+path,import.meta.url),{cache:'no-store',signal});
 if(!response.ok)throw Error('HTTP '+response.status);return response.json();
}
function indexEvents(){
 eventsByDay=new Map();
 const push=(day,event,startMinute,endMinute,interval)=>{
  const key=dateKey(day.getFullYear(),day.getMonth()+1,day.getDate()),list=eventsByDay.get(key)||[];
  let entry=list.find(item=>item.id===event.id);
  if(!entry){entry={...event,startMinute,endMinute,segments:[]};list.push(entry)}
  entry.startMinute=Math.min(entry.startMinute,startMinute);entry.endMinute=Math.max(entry.endMinute,endMinute);
  if(interval)entry.segments.push({startMinute,endMinute});
  eventsByDay.set(key,list);
 };
 for(const event of events){
  const periods=event.intervals||[];
  if(!periods.length){const at=new Date(event.at);if(Number.isFinite(at.getTime()))push(at,event,minuteOfDay(at),minuteOfDay(at),false);continue}
  for(const period of periods){
   const start=new Date(period.started_at),end=new Date(period.ended_at);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)continue;
   let cursor=new Date(start.getFullYear(),start.getMonth(),start.getDate());
   while(cursor<end){
    const next=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1);
    const from=Math.max(start.getTime(),cursor.getTime()),to=Math.min(end.getTime(),next.getTime());
    if(to>from)push(cursor,event,from===cursor.getTime()?0:minuteOfDay(from),to===next.getTime()?1440:minuteOfDay(to),true);
    cursor=next;
   }
  }
 }
 for(const list of eventsByDay.values())list.sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute);
}
let loadSequence=0,loadController=null;
async function load(){
 const sequence=++loadSequence;loadController?.abort();loadController=new AbortController();
 stage.dataset.loadState='loading';renderReadout();
 const from=new Date(selected.year,selected.month-1,1).toISOString(),to=new Date(selected.year,selected.month,1).toISOString();
 try{
  const response=await get('/trace?'+new URLSearchParams({from,to}),loadController.signal);
  if(disposed||sequence!==loadSequence)return;
  events=response.events.map(event=>({...event,kind:event.kind==='record'?event.activity_type:event.kind,at:event.occurred_at,
   object:event.object?.title||'',taskTitle:event.task?.title||'',duration:Math.floor((event.focused_ms||0)/60000)})).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  indexEvents();syncTimeSelection();stage.dataset.loadState='ready';
  drawDayRing();drawEventRing();renderReadout();
  // Fresh data may update details, but must not cancel a spring already in flight.
  retargetOthers('',true);
  stage.dataset.loadState='ready';
 }catch(error){
  if(disposed||sequence!==loadSequence||error.name==='AbortError')return;
  events=[];eventsByDay=new Map();stage.dataset.loadState='error';drawDayRing();drawEventRing();renderReadout();
  toast('记录读取失败，点 RESET 重试');
 }
}

const resizeObserver=new ResizeObserver(layoutDial);resizeObserver.observe(stage);layoutDial();
applyAppearance();setActiveHand('event');drawStaticDial();applyTransparency();drawDayRing();drawEventRing();renderReadout();snapAll();load();
return ()=>{
 disposed=true;loadController?.abort();lifetime.abort();resizeObserver.disconnect();
 if(raf)cancelAnimationFrame(raf);for(const timer of timers)window.clearTimeout(timer);timers.clear();
};
}
if(document.querySelector('#dialStage'))mountEphemeris(document);
