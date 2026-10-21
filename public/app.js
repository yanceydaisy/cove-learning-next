const root = document.querySelector('#screen');
const dot = document.querySelector('#connection');
const toast = document.querySelector('#toast');
const base = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const API = base + '/api';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v => v ? new Date(v).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}) : '—';
const time = v => v ? new Date(v).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}) : '—';
const minutes = ms => Math.floor(Math.max(0,Number(ms)||0)/60000);
let viewId = 0;
let timer = null;
let disposeArchive=null;
function notify(message){
 toast.textContent = message;
 toast.classList.add('on');
 clearTimeout(notify.timer);
 notify.timer=setTimeout(()=>toast.classList.remove('on'),2800);
}
function page(){const p=(location.hash||'#/today').replace(/^#\/?/,'').split('/')[0];return ['today','plan','learn','library','archive'].includes(p)?p:'today';}
function currentNav(){
 const here=page(),navHere=here==='archive'?'today':here;
 document.querySelectorAll('[data-nav]').forEach(a=>a.setAttribute('aria-current',a.dataset.nav===navHere?'page':'false'));
}
let stableLayoutHeight=Math.max(1,window.innerHeight);
let stableVisualHeight=Math.max(1,window.visualViewport?.height||stableLayoutHeight);
function isEditingControl(){
 const el=document.activeElement;
 return !!el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
}
function applyViewportMetrics(layoutHeight,visibleHeight,offsetTop,standalone,editing){
 const keyboard=editing&&(
  stableVisualHeight-visibleHeight>120||
  stableLayoutHeight-layoutHeight>120||
  layoutHeight-visibleHeight>120
 );
 // Keep the layout viewport frozen while the software keyboard is visible.
 // The keyboard may cover the lower part of the page, but it must not squash cards,
 // resize the dock, or rebuild the wallpaper around a temporary visual viewport.
 if(keyboard){
  document.documentElement.dataset.keyboard='open';
  return;
 }
 delete document.documentElement.dataset.keyboard;
 stableLayoutHeight=layoutHeight;
 stableVisualHeight=visibleHeight;
 // In affected iOS home-screen PWAs, innerHeight excludes the native bottom "chin",
 // while CSS 100vh on a 100vh root reaches the physical viewport.
 // Use CSS viewport units, not screen.height (which can overrun other iOS versions).
 if(standalone){
  document.documentElement.style.setProperty('--app-height','100vh');
  document.documentElement.style.setProperty('--app-top','0px');
  return;
 }
 const top=Math.max(0,Math.min(layoutHeight-1,offsetTop||0));
 const height=Math.max(1,Math.floor(Math.min(layoutHeight-top,visibleHeight)));
 document.documentElement.style.setProperty('--app-height',height+'px');
 document.documentElement.style.setProperty('--app-top',top+'px');
}
function adjustViewport(){
 const vv=window.visualViewport;
 const layoutHeight=Math.max(1,window.innerHeight);
 applyViewportMetrics(
  layoutHeight,
  Math.max(1,vv?.height||layoutHeight),
  vv?.offsetTop||0,
  window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
  isEditingControl()
 );
}
function appearance(){
 const mode=localStorage.getItem('cove.home.themeMode')||'system';
 const prefers=window.matchMedia('(prefers-color-scheme: dark)').matches;
 const dark=mode==='dark'||mode==='system'&&prefers;
 const resolved=dark?'dark':'light';
 document.documentElement.dataset.theme=resolved;
 document.documentElement.dataset.themeMode=mode;
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=dark?'#202330':'#e4eaf2';
 const appearanceButton=document.querySelector('#appearance');
 if(appearanceButton){
  appearanceButton.textContent=mode==='system'?'自动':dark?'夜':'日';
  appearanceButton.title=mode==='system'?'外观：跟随系统（点击切换）':dark?'外观：夜间（点击切换）':'外观：日间（点击切换）';
  appearanceButton.setAttribute('aria-label',appearanceButton.title);
 }
 const bg=localStorage.getItem('cove.home.background')||'';
 const layer=document.querySelector('.wallpaper');
 // Only honor images already stored by Cove Home; never use untrusted arbitrary page markup.
 if(bg&&(/^(data:image\/|blob:)/.test(bg))) {layer.style.backgroundImage='url('+JSON.stringify(bg)+')';layer.classList.add('custom');}
 else{layer.style.backgroundImage='';layer.classList.remove('custom');}
 window.dispatchEvent(new CustomEvent('cove-theme-change',{detail:{mode,resolved}}));
}
try{appearance();}catch{}
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
systemTheme.addEventListener?.('change',()=>{if((localStorage.getItem('cove.home.themeMode')||'system')==='system')appearance();});
document.querySelector('#appearance').addEventListener('click',()=>{
 const current=localStorage.getItem('cove.home.themeMode')||'system';
 const next=current==='light'?'dark':current==='dark'?'system':'light';
 localStorage.setItem('cove.home.themeMode',next);appearance();
 notify(next==='system'?'已跟随系统外观':next==='dark'?'已切换夜间':'已切换日间');
});
window.addEventListener('storage',event=>{if(['cove.home.themeMode','cove.home.background'].includes(event.key))try{appearance();}catch{}});
window.addEventListener('pageshow',()=>{try{appearance();}catch{}adjustViewport();});
window.addEventListener('resize',adjustViewport);
window.visualViewport?.addEventListener('resize',adjustViewport);
window.addEventListener('focusin',adjustViewport);
window.addEventListener('focusout',()=>setTimeout(adjustViewport,80));
window.__coveLearningViewport={adjust:adjustViewport,isKeyboardOpen:()=>document.documentElement.dataset.keyboard==='open',simulateKeyboard:visibleHeight=>applyViewportMetrics(stableLayoutHeight,Math.max(1,visibleHeight),0,false,true)};
adjustViewport();

// Read-only iPhone PWA diagnostic, hidden unless the header logo is tapped three times.
// It helps distinguish a CSS gap from a native WebKit home-indicator region.
let viewportDebugTaps=0,viewportDebugLast=0;
document.querySelector('.brand').addEventListener('click',()=>{
 const now=Date.now();
 viewportDebugTaps=now-viewportDebugLast<1200?viewportDebugTaps+1:1;
 viewportDebugLast=now;
 if(viewportDebugTaps<3)return;
 viewportDebugTaps=0;
 const existing=document.querySelector('#viewportDebug');
 if(existing){existing.remove();return;}
 const probe=document.createElement('div');
 probe.style.cssText='position:absolute;visibility:hidden;height:100vh;padding-bottom:env(safe-area-inset-bottom);pointer-events:none';
 document.body.append(probe);
 const vh=Math.round(probe.getBoundingClientRect().height);
 const inset=getComputedStyle(probe).paddingBottom;
 probe.remove();
 const vv=window.visualViewport;
 const info=[
  'iOS PWA · 视口检测',
  'standalone: '+(navigator.standalone===true||matchMedia('(display-mode: standalone)').matches),
  'screen: '+screen.width+' × '+screen.height,
  'inner: '+innerWidth+' × '+innerHeight,
  'CSS 100vh: '+vh,
  'visual: '+Math.round(vv?.height||0)+' / offset '+Math.round(vv?.offsetTop||0),
  'safe bottom: '+inset,
  'root: '+Math.round(document.body.getBoundingClientRect().height),
  'dock bottom: '+Math.round(document.querySelector('.dock').getBoundingClientRect().bottom),
  'app height: '+getComputedStyle(document.querySelector('.shell')).height
 ];
 const out=document.createElement('output');
 out.id='viewportDebug';out.className='viewport-debug';out.textContent=info.join('\n');
 out.title='再次连点顶部 COVE / LEARNING 三次可以关闭';
 document.body.append(out);
});

// Retry only safe GET requests. Never retry writes: a dropped response could follow
// a successful task creation, focus transition, or file upload.
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,method='GET',data){
 const isRead=method==='GET';
 const pauses=[350,1100];
 for(let attempt=0;;attempt++){
  let res;
  try{
   res=await fetch(API+path,{
    method,
    cache:'no-store',
    headers:{...(isRead?{}:{'Content-Type':'application/json'})},
    body:data===undefined?undefined:JSON.stringify(data)
   });
  }catch(error){
   dot.classList.remove('connected');
   if(isRead&&error instanceof TypeError&&attempt<pauses.length){
    await wait(pauses[attempt]);continue;
   }
   if(error instanceof TypeError)throw Error('网络连接暂时中断，请检查网络后重试。');
   throw error;
  }
  if(isRead&&[502,503,504].includes(res.status)&&attempt<pauses.length){
   await wait(pauses[attempt]);continue;
  }
  if(!res.ok){
   dot.classList.remove('connected');
   let error;try{error=(await res.json()).error?.message;}catch{}
   if([502,503,504].includes(res.status))throw Error('服务暂时不可用，请稍后重试。');
   throw Error(error||'请求未成功（HTTP '+res.status+'）');
  }
  dot.classList.add('connected');
  if(res.headers.get('content-type')?.includes('application/octet-stream'))return res.blob();
  return res.json();
 }
}
// All micro-ornaments are monochrome inline vectors. Never substitute emoji glyphs.
const ornamentPaths={
 arrow:'<path d="M5.5 18.5 18.5 5.5M9 5.5h9.5V15"/>',
 sparkle:'<path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7"/>',
 orbit:'<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2"/><path d="M18.4 5.8l3-3"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 up:'<path d="m6.5 13 5.5-5.5 5.5 5.5M12 7.5V19"/>',
 pin:'<path d="M9 3.5h6l-1 5 3 3v1.7H7v-1.7l3-3-1-5ZM12 13.2V21"/>',
 check:'<path d="m4.5 12.5 5 5 10-11"/>'
};
function ornament(name,extra=''){
 return '<svg class="micro-icon micro-'+name+(extra?' '+extra:'')+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">'+ornamentPaths[name]+'</svg>';
}
function actionLink(href,label){return '<a class="text-action" href="'+href+'">'+label+' '+ornament('arrow')+'</a>';}
function list(items,cb){return items.length?items.map(cb).join(''):'<p class="empty">暂时没有记录</p>';}
function head(english,cn,kicker='COVE / LEARNING'){
 return '<header class="head"><div>'+(kicker?'<p class="kicker">'+kicker+'</p>':'')+'<h1>'+english+'</h1></div><span class="quiet">'+cn+'</span></header>';
}
function row(label,sub,right=''){
 return '<div class="row"><div class="row-body"><div class="row-title">'+esc(label)+'</div>'+(sub?'<div class="row-sub">'+esc(sub)+'</div>':'')+'</div>'+right+'</div>';
}
function view(body,extra=''){root.innerHTML='<div class="view'+(extra?' '+extra:'')+'">'+body+'</div>';}
function sectionTitle(eyebrow,title,aside=''){
 return '<div class="section-heading"><div><span class="section-eyebrow">'+eyebrow+'</span><h2>'+title+'</h2></div>'+aside+'</div>';
}
function historyList(sessions,max=5){
 return sessions.length?'<div class="activity-list">'+sessions.slice(0,max).map(s=>
  '<div class="activity-item"><span class="activity-mark" aria-hidden="true"></span><div class="activity-copy"><strong>'+esc(date(s.started_at))+' · '+esc(time(s.started_at))+'</strong><span>'+esc(s.state==='finished'?'已完成':s.state==='paused'?'已暂停':'进行中')+'</span></div><span class="activity-duration">'+minutes(s.accumulated_ms)+'<small> min</small></span></div>'
 ).join('')+'</div>':'<p class="muted-line">还没有学习记录，第一段专注从这里开始。</p>';
}
let todayTaskView='list';
let todayTimedEvents=[];
let todayWeeklySchedule=[];
let todayNextCourse=null;
let todayRealityDate='';
let courseContextId=null;
let libraryObjectFilter='all';
let planSelectedDate=null;
function localDay(){
 const n=new Date(),pad=v=>String(v).padStart(2,'0');
 return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate());
}
function localMidnight(){
 const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate()+1).toISOString();
}
function deadlineDistance(iso){
 if(!iso)return '未设置截止';
 const delta=Date.parse(iso)-Date.now();
 if(delta<0)return '已超过截止';
 const mins=Math.max(1,Math.ceil(delta/60_000));
 if(mins<60)return '距截止 '+mins+'min';
 const hours=Math.ceil(mins/60);
 if(hours<48)return '距截止 '+hours+'h';
 return '距截止 '+Math.ceil(hours/24)+'d';
}
function todayAgendaRow(t){
 const detail=t.due_at?deadlineDistance(t.due_at):(t.estimated_minutes?t.estimated_minutes+' min':'今日安排');
 return '<div class="today-agenda-item"><span class="today-agenda-dot" aria-hidden="true"></span>'+
  '<div class="today-agenda-copy"><strong>'+esc(t.title)+'</strong><small>'+esc(t.reasons?.[0]||'今日安排')+'</small></div>'+
  '<span class="today-agenda-time">'+esc(detail)+'</span></div>';
}
function scheduleForDay(entries,day){
 const d=dayDate(day),jsDay=d.getDay(),weekday=jsDay===0?7:jsDay;
 return (entries||[]).filter(item=>Number(item.weekday)===weekday&&item.effective_from<=day&&(!item.effective_until||item.effective_until>=day))
  .sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.end_time.localeCompare(b.end_time)||a.title.localeCompare(b.title,'zh-CN'));
}
function todayTimedSchedule(schedule){
 return (schedule||[]).map(item=>({kind:'course',title:item.title,location:item.location||'',start:item.start_time,end:item.end_time,startMin:clockMinutes(item.start_time),endMin:clockMinutes(item.end_time)}))
  .filter(item=>Number.isFinite(item.startMin)&&Number.isFinite(item.endMin)&&item.endMin>item.startMin)
  .sort((a,b)=>a.startMin-b.startMin||a.endMin-b.endMin||a.title.localeCompare(b.title,'zh-CN'));
}
function nextCourseOccurrence(entries,now=new Date()){
 const today=localDay();let best=null;
 for(let offset=0;offset<56;offset++){
  const day=shiftDay(today,offset);
  for(const item of scheduleForDay(entries,day)){
   const startAt=Date.parse(localDateTimeIso(day,item.start_time));
   const endAt=Date.parse(localDateTimeIso(day,item.end_time));
   if(!Number.isFinite(startAt)||!Number.isFinite(endAt)||startAt<=now.getTime())continue;
   const candidate={kind:'course',title:item.title,location:item.location||'',start:item.start_time,end:item.end_time,date:day,startAt,endAt};
   if(!best||candidate.startAt<best.startAt)best=candidate;
  }
  if(best&&best.date===day)break;
 }
 return best;
}
function courseDistanceParts(ms){
 const mins=Math.max(1,Math.ceil(ms/60_000));
 if(mins<60)return [{value:mins,unit:'min',scale:'major'}];
 if(mins<1440){
  const hours=Math.floor(mins/60),minutes=mins%60,parts=[{value:hours,unit:'小时',scale:'major'}];
  if(minutes)parts.push({value:minutes,unit:'min',scale:'minor'});
  return parts;
 }
 const days=Math.floor(mins/1440),hours=Math.floor((mins%1440)/60),parts=[{value:days,unit:'天',scale:'major'}];
 if(hours)parts.push({value:hours,unit:'小时',scale:'minor'});
 return parts;
}
function courseDistanceMarkup(ms,caption){
 const parts=courseDistanceParts(ms).map(part=>
  '<span class="today-distance-part '+part.scale+'"><strong>'+part.value+'</strong><em>'+part.unit+'</em></span>'
 ).join('');
 return '<span class="today-distance-stack"><span class="today-distance-caption">'+esc(caption)+'</span><span class="today-distance-display">'+parts+'</span></span>';
}
function courseWhen(item){
 if(!item)return {date:'',start:'',end:''};
 const day=item.date||localDay();
 const label=dayDate(day).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric',weekday:'short'});
 return {date:label,start:item.start||'',end:item.end||'',location:item.location||''};
}
function todayRealityMarkup(events,nextCourse,now=new Date()){
 const nowMin=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
 const current=(events||[]).filter(item=>item.startMin<=nowMin&&item.endMin>nowMin).sort((a,b)=>b.startMin-a.startMin)[0];
 const nextToday=(events||[]).find(item=>item.startMin>nowMin);
 let item,title,state,eyebrow,distanceMarkup;
 if(current){
  item=current;title=current.title;state='current';eyebrow='NOW / COURSE';
  distanceMarkup=courseDistanceMarkup((current.endMin-nowMin)*60_000,'距离下课');
 }else if(nextToday){
  item=nextToday;title=nextToday.title;state='next';eyebrow='NEXT / COURSE';
  distanceMarkup=courseDistanceMarkup((nextToday.startMin-nowMin)*60_000,'距离开课');
 }else if(nextCourse){
  item=nextCourse;title=nextCourse.title;state='next';eyebrow='NEXT / COURSE';
  distanceMarkup=courseDistanceMarkup(nextCourse.startAt-now.getTime(),'距离开课');
 }else{
  item=null;title='暂时没有下一节课程';state='empty';eyebrow='COURSE';
  distanceMarkup='<span class="today-distance-empty">可以在 Plan 里补充固定课表</span>';
 }
 const when=courseWhen(item);
 const dateText=when.date?'<span class="today-reality-date">'+esc(when.date)+'</span>':'';
 const placeText=when.location?'<span class="today-reality-place">'+esc(when.location)+'</span>':'';
 const timeText=when.start?'<span class="today-reality-time">'+placeText+'<strong>'+esc(when.start)+'</strong>'+(when.end?'<i>—</i><span>'+esc(when.end)+'</span>':'')+'</span>':'';
 return '<div class="today-reality '+state+'" data-today-reality>'+  '<div class="today-reality-head"><span class="today-reality-eyebrow">'+eyebrow+'</span>'+dateText+'</div>'+  '<div class="today-reality-main"><strong>'+esc(title)+'</strong></div>'+  '<div class="today-reality-composition">'+distanceMarkup+timeText+'</div></div>';
}
function refreshTodayReality(){
 if(todayRealityDate!==localDay()){render();return;}
 todayNextCourse=nextCourseOccurrence(todayWeeklySchedule,new Date());
 const current=root.querySelector('[data-today-reality]');
 if(current)current.outerHTML=todayRealityMarkup(todayTimedEvents,todayNextCourse);
}
function decisionRow(t,index=0){
 const done=t.status==='done',id=esc(t.id);
 const importanceNote=t.importance?' · 重要度 '+({low:'低',medium:'中',high:'高'}[t.importance]||t.importance):'';
 const evidenceNote=t.evidence?.length?' · 证据 '+t.evidence.slice(0,2).map(item=>item.title).join(' / '):'';
 const note=done?('已完成 · '+date(t.updated_at)+' '+time(t.updated_at)):((t.reasons?.[0]||'由任务状态生成的建议')+importanceNote+evidenceNote);
 const preferred=Number(t.boost||0)>0;
 const priority=done?'':'<button type="button" class="today-priority-button'+(preferred?' active':'')+'" data-preference="'+id+'" aria-pressed="'+preferred+'" aria-label="'+(preferred?'撤销今天优先':'今天先做')+'" title="'+(preferred?'已优先':'今天先做')+'">'+ornament(preferred?'pin':'up')+'</button>';
 const check=done
  ?'<button type="button" class="today-task-check complete" data-today-reopen="'+id+'" aria-label="恢复 '+esc(t.title)+'" title="恢复为未完成">'+ornament('check')+'</button>'
  :'<button type="button" class="today-task-check" data-today-done="'+id+'" aria-label="完成 '+esc(t.title)+'" title="完成"> </button>';
 return '<article class="today-task-card'+(done?' complete':'')+'"><span class="today-task-index">'+String(index+1).padStart(2,'0')+'</span>'+
  '<div class="today-task-copy"><strong>'+esc(t.title)+'</strong><span>'+esc(done?note:(deadlineDistance(t.due_at)+' · '+note))+'</span></div>'+priority+check+'</article>';
}
function todayMatrix(model,tasks){
 const ready=Boolean(model?.importanceAvailable),linked=Boolean(model?.evidenceLinksAvailable);
 const importanceY={low:39,medium:58,high:78};
 const urgencyX={unknown:36,later:46,'within-week':59,'within-three-days':70,'within-day':80,'at-risk':87,overdue:91};
 const urgencyName={unknown:'未知',later:'较低','within-week':'一周内','within-three-days':'三天内','within-day':'24h 内','at-risk':'时间不足',overdue:'已逾期'};
 const importanceName={low:'低',medium:'中',high:'高'};
 const plotted=(tasks||[]).filter(task=>task.importance&&importanceY[task.importance]);
 const points=plotted.map((task,index)=>{
  const label=String(index+1).padStart(2,'0');
  const x=urgencyX[task.urgency]??36,y=importanceY[task.importance];
  return '<span class="matrix-point" style="--point-x:'+x+'%;--point-y:'+y+'%" title="'+esc(task.title+' · '+importanceName[task.importance]+'重要 · '+(urgencyName[task.urgency]||task.urgency))+'">'+label+'</span>';
 }).join('');
 const legend=plotted.length?'<div class="matrix-legend">'+plotted.map((task,index)=>
  '<div><span>'+String(index+1).padStart(2,'0')+'</span><strong>'+esc(task.title)+'</strong><small>'+importanceName[task.importance]+'重要 · '+esc(urgencyName[task.urgency]||task.urgency)+'</small></div>'
 ).join('')+'</div>':'';
 return '<div class="today-matrix-wrap"><div class="today-matrix" aria-label="重要度与紧急度坐标图">'+
  '<span class="matrix-y-label">重要</span><span class="matrix-x-label">紧急</span>'+
  '<span class="matrix-band-label matrix-band-high">高</span><span class="matrix-band-label matrix-band-medium">中</span><span class="matrix-band-label matrix-band-low">低</span>'+
  '<span class="matrix-axis matrix-axis-y" aria-hidden="true"></span><span class="matrix-axis matrix-axis-x" aria-hidden="true"></span>'+
  '<span class="matrix-origin" aria-hidden="true"></span>'+points+'</div>'+
  '<div><p class="today-matrix-note">'+(ready?'只显示你已确认低 / 中 / 高重要度的任务；未确认任务不会被伪造位置。':linked?'任务已经关联课程证据，但还没有确认主依据与贡献等级，所以暂不放点。':'课程证据与任务还没有建立足够关联，所以现在只保留坐标框架，不伪造任务位置。')+'</p>'+legend+'</div></div>';
}
async function today(){
 if(timer){clearInterval(timer);timer=null;}
 const day=localDay();
 const [d,weeklySchedule,focusHistory]=await Promise.all([
  api('/today?local_date='+encodeURIComponent(day)),api('/schedule'),api('/focus/history')
 ]);
 const todaySchedule=scheduleForDay(weeklySchedule,day);
 todayRealityDate=day;todayWeeklySchedule=weeklySchedule;todayTimedEvents=todayTimedSchedule(todaySchedule);todayNextCourse=nextCourseOccurrence(weeklySchedule);
 const activity=d.activeFocus;
 const plannedOpen=d.todayTasks;
 const plannedDone=d.completedTodayTasks||[];
 const planned=[...plannedOpen,...plannedDone];
 const startLabel=activity?'继续学习':'开始学习';
 const focusTotal=minutes(focusHistory.total_ms||0);
 const review='<div class="today-review-kicker">REVIEW</div>'+
  '<a class="today-review-trace" href="#/archive">轨迹 '+ornament('arrow')+'</a>'+
  '<div class="today-review-total"><span>累计专注时间</span><div><strong>'+focusTotal+'</strong><em>min</em></div></div>';
 const switcher='<div class="today-view-switch" role="group" aria-label="待办任务视图">'+
  [['list','列表'],['matrix','坐标图']].map(([id,label])=>
   '<button type="button" data-task-view="'+id+'" aria-pressed="'+(todayTaskView===id)+'">'+label+'</button>').join('')+'</div>';
 const taskBody=todayTaskView==='list'?
  (planned.length?'<div class="today-task-list">'+planned.map(decisionRow).join('')+'</div>':
   '<p class="today-empty">今天还没有安排任务。去 Plan 放一件真正想完成的事进来。</p>'):
  todayMatrix(d.priorityModel,plannedOpen);
 view(
  '<header class="head today-head"><div><p class="kicker">HOME / OVERVIEW</p><h1>Today</h1></div>'+
   '<a class="today-start-action" href="#/learn"><span>'+startLabel+'</span><span class="today-start-plus" aria-hidden="true">+</span></a></header>'+
  '<div class="workarea daily-flow today-v3">'+
   '<section class="today-brief" aria-label="首页课程与今日安排">'+
    '<div class="today-agenda">'+todayRealityMarkup(todayTimedEvents,todayNextCourse)+'</div>'+
    '<aside class="today-review">'+review+'</aside>'+
   '</section>'+
   '<section class="today-backlog" aria-label="今日安排">'+
    '<div class="today-backlog-head"><div><h2>今日安排</h2></div>'+switcher+'</div>'+
    '<p class="today-disclaimer">↑ 表示今天先做；图钉表示已优先。已完成任务会沉到底部保留记录。</p>'+
    taskBody+
   '</section>'+
  '</div>'
 );
 root.querySelectorAll('[data-task-view]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  const scroll=root.querySelector('.workarea')?.scrollTop||0;
  todayTaskView=button.dataset.taskView;await today();
  root.querySelector('.workarea').scrollTop=scroll;
  root.querySelector('.today-view-switch [data-task-view="'+todayTaskView+'"]')?.focus({preventScroll:true});
 })));
 root.querySelectorAll('[data-preference]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  const item=plannedOpen.find(t=>t.id===button.dataset.preference);
  if(!item)return;
  const boost=Number(item.boost||0)>0?0:2;
  const scroll=root.querySelector('.workarea')?.scrollTop||0;
  await api('/tasks/'+item.id+'/preference','POST',{boost,...(boost?{expires_at:localMidnight()}:{})});
  await today();root.querySelector('.workarea').scrollTop=scroll;
  notify(boost?'已优先':'已撤销今天优先');
 })));
 root.querySelectorAll('[data-today-done]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  const scroll=root.querySelector('.workarea')?.scrollTop||0;
  await api('/tasks/'+button.dataset.todayDone+'/complete','POST');await today();
  root.querySelector('.workarea').scrollTop=scroll;notify('已完成，保留在今日安排底部');
 })));
 root.querySelectorAll('[data-today-reopen]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  const scroll=root.querySelector('.workarea')?.scrollTop||0;
  await api('/tasks/'+button.dataset.todayReopen+'/reopen','POST');await today();
  root.querySelector('.workarea').scrollTop=scroll;notify('已恢复为未完成');
 })));
 timer=setInterval(refreshTodayReality,30_000);
}
function localDatetimeValue(iso){
 if(!iso)return '';
 const d=new Date(iso);
 return new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
function localDateFromIso(iso){
 if(!iso)return '';
 const d=new Date(iso),pad=v=>String(v).padStart(2,'0');
 return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function localTimeFromIso(iso){
 if(!iso)return '';
 const d=new Date(iso),pad=v=>String(v).padStart(2,'0');
 return pad(d.getHours())+':'+pad(d.getMinutes());
}
function dayDate(value){
 const [y,m,d]=String(value).split('-').map(Number);
 return new Date(y,m-1,d,12,0,0,0);
}
function dayString(d){
 const pad=v=>String(v).padStart(2,'0');
 return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function shiftDay(value,delta){
 const d=dayDate(value);d.setDate(d.getDate()+delta);return dayString(d);
}
function localDateTimeIso(day,clock){
 if(!day||!clock)return null;
 const [y,m,d]=day.split('-').map(Number),[h,min]=clock.split(':').map(Number);
 return new Date(y,m-1,d,h,min,0,0).toISOString();
}
function clockMinutes(value){
 if(!value)return 0;
 const [h,m]=String(value).split(':').map(Number);return h*60+m;
}
function minutesClock(value){
 const safe=Math.max(0,Math.min(1439,Math.round(Number(value)||0)));
 return String(Math.floor(safe/60)).padStart(2,'0')+':'+String(safe%60).padStart(2,'0');
}
function planWeekMarkup(selected){
 const center=dayDate(selected),dow=center.getDay(),start=new Date(center);
 start.setDate(center.getDate()-((dow+6)%7));
 const days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return dayString(d);});
 const month=center.toLocaleDateString('zh-CN',{year:'numeric',month:'long'});
 const weekNames=['一','二','三','四','五','六','日'],today=localDay();
 return '<div class="plan-calendar-head"><div><span class="section-eyebrow">CALENDAR / WEEK</span><h2>'+esc(month)+'</h2></div>'+
  '<div class="plan-calendar-controls"><button type="button" data-plan-week="-7" aria-label="上一周">‹</button><button type="button" data-plan-today>今天</button><button type="button" data-plan-week="7" aria-label="下一周">›</button></div></div>'+
  '<div class="plan-week-strip">'+days.map((value,index)=>
   '<button type="button" class="plan-day-button'+(value===selected?' selected':'')+(value===today?' today':'')+'" data-plan-date="'+value+'" aria-pressed="'+(value===selected)+'">'+
    '<span>周'+weekNames[index]+'</span><strong>'+Number(value.slice(-2))+'</strong></button>'
  ).join('')+'</div>';
}
function taskEditForm(t){
 const scheduleDay=t.scheduled_start?localDateFromIso(t.scheduled_start):(t.planned_for||'');
 return '<form class="task-inline-edit" data-edit-form="'+esc(t.id)+'" hidden>'+
  '<label>安排日期<input type="date" name="planned_for" value="'+esc(scheduleDay)+'"></label>'+
  '<label>开始<input type="time" name="schedule_start" value="'+esc(localTimeFromIso(t.scheduled_start))+'"></label>'+
  '<label>结束<input type="time" name="schedule_end" value="'+esc(localTimeFromIso(t.scheduled_end))+'"></label>'+
  '<label>截止时间<input type="datetime-local" name="due_local" value="'+esc(localDatetimeValue(t.due_at))+'"></label>'+
  '<label>预计分钟<input type="number" name="estimated_minutes" min="1" max="20160" value="'+esc(t.estimated_minutes||'')+'"></label>'+
  '<button class="button sm primary" type="submit">保存</button></form>';
}
function taskActionButtons(t,courseTask,includeDone=true){
 const id=esc(t.id);
 return (courseTask?'<button type="button" class="button sm quiet-button" data-evidence="'+id+'">证据</button>':'')+
  '<button type="button" class="button sm quiet-button" data-edit="'+id+'">设置</button>'+
  (includeDone?'<button type="button" class="button sm quiet-button" data-done="'+id+'">完成</button>':'');
}
function planTaskRow(t,courseIds){
 const done=t.status==='done',id=esc(t.id),courseTask=Boolean(t.object_id&&courseIds.has(t.object_id));
 const details=[
  t.planned_for?'计划 '+t.planned_for:'',
  t.due_at?'DDL '+date(t.due_at)+' '+time(t.due_at):'',
  t.estimated_minutes?t.estimated_minutes+' 分钟':''
 ].filter(Boolean).join(' · ');
 return '<div class="plan-task"><div class="task-item">'+(done
  ?'<span class="task-check complete" aria-label="已完成">'+ornament('check')+'</span>'
  :'<button type="button" class="task-check" data-done="'+id+'" aria-label="完成 '+esc(t.title)+'" title="完成"></button>')+
  '<div class="plan-task-copy"><span class="task-description '+(done?'complete':'')+'">'+esc(t.title)+'</span>'+
  (details?'<small>'+esc(details)+'</small>':'')+'</div>'+
  (done?'<span class="row-trailing">已完成</span>':taskActionButtons(t,courseTask,false))+'</div>'+
  (done?'':taskEditForm(t)+(courseTask?'<div class="task-evidence-editor" data-evidence-panel="'+id+'" hidden></div>':''))+'</div>';
}
function taskEvidenceMarkup(data){
 const linked=new Set((data.links||[]).map(item=>item.id));
 const rows=(data.available||[]).map(item=>{
  const on=linked.has(item.id);
  const meta=[item.kind==='objective'?'学习目标':'考核项',item.weight_percent!=null?item.weight_percent+'%':'',item.source_locator||''].filter(Boolean).join(' · ');
  return '<button type="button" class="evidence-link-toggle '+(on?'active':'')+'" data-evidence-toggle="'+esc(data.task.id)+'" data-context-id="'+esc(item.id)+'" aria-pressed="'+on+'">'+
   '<span class="evidence-link-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(meta)+'</small></span>'+
   '<span class="evidence-link-state">'+(on?'已关联':'关联')+'</span></button>';
 }).join('');
 const stale=(data.links||[]).filter(item=>item.status!=='confirmed').map(item=>
  '<div class="evidence-stale"><span>'+esc(item.title)+'</span><small>这条证据已不再确认；不会进入推荐解释。</small></div>'
 ).join('');
 const linkedConfirmed=(data.links||[]).filter(item=>item.status==='confirmed');
 const staleImportance=data.importance_input&&data.importance_input.status!=='confirmed'?data.importance_input:null;
 const current=data.importance_input?.status==='confirmed'?data.importance_input:null;
 const importance=linkedConfirmed.length
  ?'<div class="task-importance-box"><div class="task-importance-head"><strong>重要度依据</strong><small>只选 1 条主依据，再确认任务贡献等级。</small></div>'+
   '<form class="task-importance-form" data-importance-form="'+esc(data.task.id)+'">'+
    '<select name="context_item_id" aria-label="重要度主依据">'+linkedConfirmed.map(item=>
     '<option value="'+esc(item.id)+'" '+(current?.context_item_id===item.id?'selected':'')+'>'+esc(item.title)+'</option>'
    ).join('')+'</select>'+
    '<div class="contribution-switch" role="radiogroup" aria-label="任务贡献等级">'+
     [['low','低'],['medium','中'],['high','高']].map(([value,label])=>
      '<label><input type="radio" name="contribution" value="'+value+'" '+(current?.contribution===value?'checked':'')+' required><span>'+label+'</span></label>'
     ).join('')+'</div>'+
    '<button class="button sm primary" type="submit">确认重要度</button>'+
    (current?'<button class="button sm quiet-button" type="button" data-importance-clear="'+esc(data.task.id)+'">清除</button>':'')+
   '</form>'+
   '<p class="task-evidence-note">这是离散的低 / 中 / 高，不生成 0–100 假精度，也不会把课程考核权重直接复制给任务。</p></div>'
  :'<p class="task-evidence-empty">先关联至少一条已确认课程证据，才能设置重要度依据。</p>';
 return '<div class="task-evidence-head"><div><strong>课程证据</strong><small>'+esc(data.course?.title||'')+'</small></div><span>'+(linked.size)+' 已关联</span></div>'+
  '<p class="task-evidence-note">这里只建立事实关联，不会把考核权重直接冒充任务重要度。</p>'+
  (rows?'<div class="evidence-link-list">'+rows+'</div>':'<p class="task-evidence-empty">这门课还没有已确认的课程证据。先去 Library 完善课程档案。</p>')+stale+
  (staleImportance?'<div class="evidence-stale"><span>原重要度依据已失效：'+esc(staleImportance.title)+'</span><small>这条证据不再是 confirmed，Today 已停止使用旧重要度，请重新确认。</small></div>':'')+importance;
}
async function loadTaskEvidence(taskId){
 const panel=root.querySelector('[data-evidence-panel="'+taskId+'"]');
 if(!panel)return;
 panel.hidden=false;panel.innerHTML='<p class="task-evidence-empty">正在读取课程证据…</p>';
 const data=await api('/tasks/'+taskId+'/evidence');
 panel.innerHTML=taskEvidenceMarkup(data);
 panel.querySelectorAll('[data-evidence-toggle]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  const linked=button.getAttribute('aria-pressed')==='true';
  await api('/tasks/'+taskId+'/evidence','POST',{context_item_id:button.dataset.contextId,linked:!linked});
  await loadTaskEvidence(taskId);
  notify(linked?'已取消课程证据关联':'已关联课程证据');
 })));
 panel.querySelector('[data-importance-form]')?.addEventListener('submit',event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  perform(async()=>{
   await api('/tasks/'+taskId+'/importance','POST',{
    context_item_id:form.get('context_item_id'),contribution:form.get('contribution')
   });
   await loadTaskEvidence(taskId);notify('已确认任务重要度');
  });
 });
 panel.querySelector('[data-importance-clear]')?.addEventListener('click',()=>perform(async()=>{
  await api('/tasks/'+taskId+'/importance','POST',{clear:true});
  await loadTaskEvidence(taskId);notify('已清除任务重要度');
 }));
}
function planEventStatus(day,startMin,endMin,nowMin=null){
 const today=localDay();
 if(day<today)return 'past';
 if(day>today)return 'future';
 const current=nowMin??(()=>{const now=new Date();return now.getHours()*60+now.getMinutes();})();
 if(endMin<=current)return 'past';
 if(startMin<=current&&endMin>current)return 'current';
 return 'future';
}
const PLAN_EVENT_GAP=34;
const PLAN_EDGE_GAP=28;
const PLAN_EVENT_MIN_HEIGHT=76;
const PLAN_PAST_COURSE_HEIGHT=46;
function planNowMarkerMarkup(now,minute){
 const clock=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 return '<div class="plan-now-marker" data-now-minute="'+minute+'"><span>'+clock+'</span><i></i><b>现在</b></div>';
}
function applyPlanTimelineGeometry(timeline){
 if(!timeline)return;
 const rows=[...timeline.querySelectorAll('.plan-timeline-row')].sort((a,b)=>Number(a.dataset.startMin)-Number(b.dataset.startMin));
 let cursor=PLAN_EDGE_GAP;
 for(const [index,row] of rows.entries()){
  const startMin=Number(row.dataset.startMin),endMin=Number(row.dataset.endMin);
  const collapsed=row.dataset.kind==='course'&&row.classList.contains('past');
  row.classList.toggle('collapsed-past',collapsed);
  if(index>0)cursor+=PLAN_EVENT_GAP;
  const card=row.querySelector('.plan-event-card');
  const contentHeight=card?Math.ceil(card.scrollHeight)+2:0;
  const baseHeight=collapsed?PLAN_PAST_COURSE_HEIGHT:PLAN_EVENT_MIN_HEIGHT;
  const height=Math.max(baseHeight,contentHeight);
  row.style.top=cursor.toFixed(1)+'px';
  row.style.height=height.toFixed(1)+'px';
  cursor+=height;
 }
 const timelineHeight=Math.max(72,cursor+PLAN_EDGE_GAP);
 timeline.style.height=timelineHeight.toFixed(1)+'px';
 timeline.querySelectorAll('.plan-now-marker').forEach(marker=>{
  const minute=Number(marker.dataset.nowMinute);
  const current=rows.find(row=>minute>=Number(row.dataset.startMin)&&minute<Number(row.dataset.endMin));
  let top=PLAN_EDGE_GAP/2;
  if(current){
   const startMin=Number(current.dataset.startMin),endMin=Number(current.dataset.endMin);
   const progress=Math.max(0,Math.min(1,(minute-startMin)/Math.max(1,endMin-startMin)));
   top=parseFloat(current.style.top||'0')+progress*parseFloat(current.style.height||'0');
  }else if(rows.length){
   const nextIndex=rows.findIndex(row=>Number(row.dataset.startMin)>minute);
   if(nextIndex===0){
    top=Math.max(0,parseFloat(rows[0].style.top||'0')-PLAN_EDGE_GAP/2);
   }else if(nextIndex>0){
    const previous=rows[nextIndex-1],next=rows[nextIndex];
    const previousBottom=parseFloat(previous.style.top||'0')+parseFloat(previous.style.height||'0');
    top=(previousBottom+parseFloat(next.style.top||'0'))/2;
   }else{
    const last=rows[rows.length-1];
    top=parseFloat(last.style.top||'0')+parseFloat(last.style.height||'0')+PLAN_EDGE_GAP/2;
   }
  }
  marker.style.top=Math.max(0,Math.min(timelineHeight,top)).toFixed(1)+'px';
 });
 timeline.classList.add('geometry-ready');
}
function refreshPlanNowMarker(){
 const timeline=root.querySelector('.plan-timeline');
 const day=planSelectedDate||localDay();
 if(!timeline||day!==localDay())return;
 const now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
 timeline.querySelectorAll('.plan-now-marker').forEach(marker=>marker.remove());
 for(const row of timeline.querySelectorAll('.plan-timeline-row')){
  const startMin=Number(row.dataset.startMin),endMin=Number(row.dataset.endMin);
  const status=planEventStatus(day,startMin,endMin,nowMin);
  row.classList.remove('past','current','future');row.classList.add(status);
  row.querySelectorAll('.plan-event-meta b').forEach(tag=>tag.remove());
  if(status==='current')row.querySelector('.plan-event-meta')?.insertAdjacentHTML('beforeend','<b>NOW</b>');
 }
 timeline.insertAdjacentHTML('beforeend',planNowMarkerMarkup(now,nowMin));
 applyPlanTimelineGeometry(timeline);
}
function planTimelineMarkup(schedule,tasks,objectsById,courseIds){
 const day=planSelectedDate||localDay();
 const classEvents=(schedule||[]).map(item=>({
  kind:'course',id:item.id,title:item.title,location:item.location||'',object_id:item.object_id,
  start:item.start_time,end:item.end_time,startMin:clockMinutes(item.start_time),endMin:clockMinutes(item.end_time)
 }));
 const taskEvents=tasks.filter(t=>t.status==='open'&&t.scheduled_start&&localDateFromIso(t.scheduled_start)===day).map(t=>{
  const start=localTimeFromIso(t.scheduled_start),end=t.scheduled_end?localTimeFromIso(t.scheduled_end):'';
  const startMin=clockMinutes(start),endMin=end?clockMinutes(end):Math.min(1439,startMin+Number(t.estimated_minutes||45));
  return {kind:'task',id:t.id,title:t.title,object_id:t.object_id,start,end,startMin,endMin,task:t};
 });
 const events=[...classEvents,...taskEvents].sort((a,b)=>a.startMin-b.startMin||a.endMin-b.endMin||a.title.localeCompare(b.title,'zh-CN'));
 if(!events.length)return '<div class="plan-empty-day"><span>—</span><p>这一天还没有课程或已排期任务。</p></div>';
 const today=localDay(),now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
 const axisValues=day===today?[events[0].startMin,...events.map(item=>item.endMin),nowMin]:[events[0].startMin,...events.map(item=>item.endMin)];
 const axisStart=Math.max(0,Math.floor(Math.min(...axisValues)/15)*15),axisEnd=Math.min(1440,Math.ceil(Math.max(...axisValues)/15)*15);
 let html='';
 for(const item of events){
  const status=planEventStatus(day,item.startMin,item.endMin,nowMin);
  const object=objectsById.get(item.object_id);
  const meta=item.kind==='course'?('课程'+(item.location?' · '+item.location:'')):(object?.title||'任务');
  const endLabel=item.end||minutesClock(item.endMin);
  const task=item.kind==='task'?item.task:null,courseTask=Boolean(task?.object_id&&courseIds.has(task.object_id));
  html+='<article class="plan-timeline-row '+status+'" data-kind="'+item.kind+'" data-start-min="'+item.startMin+'" data-end-min="'+item.endMin+'"><div class="plan-time-cell"><strong>'+esc(item.start)+'</strong><span>'+esc(endLabel)+'</span></div>'+
   '<div class="plan-time-rail"><span class="plan-duration-bar" aria-hidden="true"></span></div><div class="plan-event-card"><div class="plan-event-meta"><span>'+esc(meta)+'</span>'+(status==='current'?'<b>NOW</b>':'')+'</div>'+
   '<div class="plan-event-main"><strong>'+esc(item.title)+'</strong>'+
   (object&&item.kind==='task'?'<small>'+esc(object.title)+'</small>':'')+'</div>'+
   (task?'<div class="plan-event-actions">'+taskActionButtons(task,courseTask)+'</div>'+taskEditForm(task)+(courseTask?'<div class="task-evidence-editor" data-evidence-panel="'+esc(task.id)+'" hidden></div>':''):'')+
   '</div></article>';
 }
 if(day===today)html+=planNowMarkerMarkup(now,nowMin);
 return '<div class="plan-timeline" data-axis-start="'+axisStart+'" data-axis-end="'+axisEnd+'">'+html+'</div>';
}
function planDialogMarkup(objects){
 const selected=planSelectedDate||localDay();
 return '<dialog id="planDialog" class="plan-dialog"><div class="plan-dialog-card"><div class="plan-dialog-head"><div><span class="section-eyebrow">ADD / PLAN</span><h2>添加计划</h2></div>'+
  '<button type="button" class="plan-dialog-close" data-plan-close aria-label="关闭">×</button></div>'+
  '<form id="taskForm" class="plan-create-form"><label class="plan-create-title">任务<input name="title" placeholder="接下来要完成什么？" required maxlength="160"></label>'+
  '<label>关联<select name="object_id"><option value="">不关联学习对象</option>'+objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+'</option>').join('')+'</select></label>'+
  '<div class="plan-create-grid"><label>日期<input name="planned_for" type="date" value="'+esc(selected)+'"></label>'+
  '<label>开始<input name="schedule_start" type="time"></label><label>结束<input name="schedule_end" type="time"></label></div>'+
  '<div class="plan-create-grid two"><label>DDL<input name="due_local" type="datetime-local"></label><label>预计分钟<input name="estimated_minutes" type="number" min="1" max="20160" placeholder="可留空"></label></div>'+
  '<div class="plan-dialog-actions"><button type="button" class="button secondary" data-plan-close>取消</button><button class="button primary" type="submit">添加计划 '+ornament('arrow')+'</button></div></form></div></dialog>';
}
async function plan(){
 if(timer){clearInterval(timer);timer=null;}
 planSelectedDate=planSelectedDate||localDay();
 const [tasks,objects,schedule]=await Promise.all([
  api('/tasks'),api('/objects'),api('/schedule?local_date='+encodeURIComponent(planSelectedDate))
 ]);
 const courseIds=new Set(objects.filter(o=>o.kind==='course').map(o=>o.id));
 const objectsById=new Map(objects.map(o=>[o.id,o]));
 const openTasks=tasks.filter(t=>t.status==='open');
 const looseDdl=openTasks.filter(t=>!t.scheduled_start&&t.due_at).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at));
 const looseOther=openTasks.filter(t=>!t.scheduled_start&&!t.due_at).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const looseTasks=[...looseDdl,...looseOther];
 const selected=dayDate(planSelectedDate);
 const fullDate=selected.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
 view('<header class="plan-top-row"><h1>Plan</h1><button type="button" class="button sm plan-add-button" id="addPlan">'+ornament('plus')+' 添加计划</button></header>'+
  '<div class="workarea plan-flow"><div class="plan-schedule-shell"><section class="plan-calendar">'+
   planWeekMarkup(planSelectedDate)+'</section>'+
  '<section class="plan-day-section">'+sectionTitle('TIMELINE / DAY',esc(fullDate),'<span class="count-caption">'+(schedule.length+openTasks.filter(t=>t.scheduled_start&&localDateFromIso(t.scheduled_start)===planSelectedDate).length)+' 项</span>')+
   planTimelineMarkup(schedule,openTasks,objectsById,courseIds)+'</section></div>'+
  '<section class="plan-loose-section">'+sectionTitle('UNSCHEDULED / TASKS','未排期任务','<span class="count-caption">'+looseTasks.length+' 项</span>')+
   (looseTasks.length?'<div class="plan-loose-list">'+looseTasks.map(t=>planTaskRow(t,courseIds)).join('')+'</div>':'<p class="plan-empty-loose">所有任务都已经排进具体日程。</p>')+
  '</section></div>'+planDialogMarkup(objects),'plan-view');

 applyPlanTimelineGeometry(root.querySelector('.plan-timeline'));
 root.querySelector('#addPlan')?.addEventListener('click',()=>root.querySelector('#planDialog')?.showModal());
 root.querySelectorAll('[data-plan-close]').forEach(button=>button.addEventListener('click',()=>root.querySelector('#planDialog')?.close()));
 root.querySelectorAll('[data-plan-date]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  planSelectedDate=button.dataset.planDate;await plan();
 })));
 root.querySelectorAll('[data-plan-week]').forEach(button=>button.addEventListener('click',()=>perform(async()=>{
  planSelectedDate=shiftDay(planSelectedDate,Number(button.dataset.planWeek));await plan();
 })));
 root.querySelector('[data-plan-today]')?.addEventListener('click',()=>perform(async()=>{planSelectedDate=localDay();await plan();}));

 root.querySelector('#taskForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{
  const day=String(f.get('planned_for')||''),start=String(f.get('schedule_start')||''),end=String(f.get('schedule_end')||''),due=f.get('due_local');
  await api('/tasks','POST',{
   title:f.get('title'),object_id:f.get('object_id')||null,planned_for:day||null,
   scheduled_start:day&&start?localDateTimeIso(day,start):null,
   scheduled_end:day&&start&&end?localDateTimeIso(day,end):null,
   due_at:due?new Date(String(due)).toISOString():null,
   estimated_minutes:f.get('estimated_minutes')?Number(f.get('estimated_minutes')):null
  });
  if(day)planSelectedDate=day;
  await plan();notify('已添加计划');
 });});

 root.querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  const panel=root.querySelector('[data-evidence-panel="'+b.dataset.evidence+'"]');
  if(!panel)return;if(!panel.hidden){panel.hidden=true;return;}await loadTaskEvidence(b.dataset.evidence);
 })));
 root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
  const form=root.querySelector('[data-edit-form="'+b.dataset.edit+'"]');if(form)form.hidden=!form.hidden;
 }));
 root.querySelectorAll('[data-edit-form]').forEach(form=>form.addEventListener('submit',e=>{
  e.preventDefault();const f=new FormData(form),day=String(f.get('planned_for')||''),start=String(f.get('schedule_start')||''),end=String(f.get('schedule_end')||''),due=f.get('due_local');
  perform(async()=>{
   await api('/tasks/'+form.dataset.editForm+'/details','POST',{
    planned_for:day||null,scheduled_start:day&&start?localDateTimeIso(day,start):null,
    scheduled_end:day&&start&&end?localDateTimeIso(day,end):null,
    due_at:due?new Date(String(due)).toISOString():null,
    estimated_minutes:f.get('estimated_minutes')?Number(f.get('estimated_minutes')):null
   });
   await plan();notify('已更新任务信息');
  });
 }));
 root.querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  await api('/tasks/'+b.dataset.done+'/complete','POST');await plan();notify('已完成');
 })));
 if(planSelectedDate===localDay())timer=setInterval(refreshPlanNowMarker,30_000);
}
function liveTime(s){
 const since=s.current_started_at&&s.state==='running'?Math.max(0,Date.now()-Date.parse(s.current_started_at)):0;
 const seconds=Math.max(0,Math.floor((s.accumulated_ms+since)/1000));
 return String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
async function learn(){
 const [active,recent,objects]=await Promise.all([api('/focus/active'),api('/focus/recent'),api('/objects')]);
 const action=active?
 '<div class="focus-time" id="elapsed">'+liveTime(active)+'</div><p class="focus-caption">'+(active.state==='paused'?'当前已暂停':'专注进行中')+'</p>'+
 '<div class="focus-actions">'+
 (active.state==='running'?'<button type="button" class="button focus-main" data-action="pause">暂停专注</button>':'<button type="button" class="button focus-main" data-action="resume">继续专注</button>')+
 '<button type="button" class="button focus-outline" data-action="finish">结束</button></div>':
 '<p class="focus-prompt">现在，开始一段属于你的时间。</p>'+
 '<form id="focusForm" class="focus-form"><select name="object_id" aria-label="选择学习对象"><option value="">自由学习 · 不关联任务</option>'+
 objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+'</option>').join('')+
 '</select><button class="button focus-main">开始专注 '+ornament('arrow')+'</button></form>';
 view(head('Learning','专注','')+
 '<div class="workarea spacious-flow">'+
 '<section class="focus-stage"><p class="focus-eyebrow">FOCUS / NOW</p><span class="focus-decoration" aria-hidden="true">'+ornament('orbit')+'</span>'+action+'</section>'+
 '<section class="open-section">'+sectionTitle('ARCHIVE / RECENT','学习记录')+historyList(recent,6)+'</section>'+
 '<p class="notice">阅读器与 ChatGPT 尚未接入，当前仅记录真实的专注时间。</p></div>');
 if(timer){clearInterval(timer);timer=null;}
 if(active?.state==='running')timer=setInterval(()=>{const el=document.querySelector('#elapsed');if(el)el.textContent=liveTime(active);},1000);
 if(!active)root.querySelector('#focusForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{
  await api('/focus/start','POST',{object_id:f.get('object_id')||null});await learn();notify('学习开始');
 });});
 else root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  await api('/focus/'+active.id+'/'+b.dataset.action,'POST');await learn();notify('已保存');
 })));
}
function sourceOptions(resources,current=''){
 return '<option value="">无来源资料 · 手动录入</option>'+resources.map(r=>
  '<option value="'+esc(r.id)+'" '+(r.id===current?'selected':'')+'>'+esc(r.title)+'</option>'
 ).join('');
}
function contextItemRow(item,resources){
 const source=resources.find(r=>r.id===item.source_resource_id);
 const meta=[
  item.kind==='assessment'&&item.weight_percent!=null?'占比 '+item.weight_percent+'%':'',
  item.status==='suggested'?'待确认':'已确认',
  source?'来源 '+source.title:'',
  item.source_locator||''
 ].filter(Boolean).join(' · ');
 const id=esc(item.id);
 return '<div class="context-item"><div class="context-item-main"><span class="context-kind">'+(item.kind==='objective'?'目标':'考核')+'</span>'+
  '<div class="context-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(meta)+'</small></div>'+
  '<div class="context-actions">'+
   (item.status==='suggested'?'<button type="button" class="button sm quiet-button" data-context-confirm="'+id+'">确认</button>':'')+
   '<button type="button" class="button sm quiet-button" data-context-edit="'+id+'">修改</button>'+
   '<button type="button" class="button sm quiet-button danger-quiet" data-context-remove="'+id+'">删除</button></div></div>'+
  '<form class="context-edit-form" data-context-edit-form="'+id+'" data-kind="'+esc(item.kind)+'" hidden>'+
   '<label>内容<input name="title" value="'+esc(item.title)+'" required maxlength="160"></label>'+
   (item.kind==='assessment'?'<label>权重 %<input name="weight_percent" type="number" min="0" max="100" step="0.1" value="'+esc(item.weight_percent??'')+'"></label>':'')+
   '<label>来源资料<select name="source_resource_id">'+sourceOptions(resources,item.source_resource_id||'')+'</select></label>'+
   '<label>来源位置<input name="source_locator" maxlength="300" value="'+esc(item.source_locator||'')+'" placeholder="例如：第 2 页 / 第一章目标"></label>'+
   '<label>状态<select name="status"><option value="confirmed" '+(item.status==='confirmed'?'selected':'')+'>已确认</option><option value="suggested" '+(item.status==='suggested'?'selected':'')+'>待确认</option></select></label>'+
   '<button class="button sm primary" type="submit">保存</button></form></div>';
}
async function library(){
 const [objects,resources]=await Promise.all([api('/objects'),api('/resources')]);
 const kinds={course:'课程',project:'项目',track:'路线'};
 const courses=objects.filter(o=>o.kind==='course');
 if(courseContextId&&!courses.some(o=>o.id===courseContextId))courseContextId=null;
 const context=courseContextId?await api('/courses/'+courseContextId+'/context'):null;
 const counts={course:courses.length,project:objects.filter(o=>o.kind==='project').length,track:objects.filter(o=>o.kind==='track').length};
 const projectStatusNames={idea:'想法',active:'进行中',paused:'暂停',done:'已完成'};
 const objectsByKind={course:objects.filter(o=>o.kind==='course'),project:objects.filter(o=>o.kind==='project'),track:objects.filter(o=>o.kind==='track')};
 const objectRow=o=>{
  let sub=kinds[o.kind]||o.kind;
  if(o.kind==='project'){
   const meta=[projectStatusNames[o.project_status]||'想法',o.project_stage||'',o.progress_percent!=null?o.progress_percent+'%':''].filter(Boolean).join(' · ');
   const notes=[o.description||'',o.next_action?'下一步：'+o.next_action:'',o.blocker?'卡点：'+o.blocker:''].filter(Boolean).join(' · ');
   sub='项目'+(meta?' · '+meta:'')+(notes?' · '+notes:'');
  }else if(o.description){
   sub+=(o.description?' · '+o.description:'');
  }
  return row(o.title,sub,
   o.kind==='course'?'<button type="button" class="button sm quiet-button" data-context-course="'+esc(o.id)+'">'+(courseContextId===o.id?'收起档案':'课程档案')+'</button>':''
  );
 };
 const kindOrder=['course','project','track'];
 const kindEyebrow={course:'COURSES',project:'PROJECTS',track:'TRACKS'};
 const visibleKinds=libraryObjectFilter==='all'?kindOrder:[libraryObjectFilter];
 const objectGroups=visibleKinds.map(kind=>{
  const items=objectsByKind[kind]||[];
  return '<div class="object-kind-group" data-object-kind="'+kind+'"><div class="object-kind-head"><div><span>'+kindEyebrow[kind]+'</span><h3>'+kinds[kind]+'</h3></div><strong>'+items.length+'</strong></div>'+
   '<div class="simple-list object-list">'+(items.length?items.map(objectRow).join(''):'<p class="muted-line">这一类还没有内容。</p>')+'</div></div>';
 }).join('');
 const filterOptions=[['all','全部'],['course','课程'],['project','项目'],['track','路线']].map(([value,label])=>
  '<option value="'+value+'" '+(libraryObjectFilter===value?'selected':'')+'>'+label+'</option>').join('');
 const resourceList=resources.length?resources.map(r=>row(r.title,Math.ceil(r.size_bytes/1024)+' KB · 原始资料',
  '<button type="button" class="button sm quiet-button" data-file="'+esc(r.id)+'" data-name="'+esc(r.title)+'">下载</button>')).join(''):'<p class="muted-line">还没有保存的资料。</p>';
 const objectiveItems=context?context.items.filter(i=>i.kind==='objective'):[];
 const assessmentItems=context?context.items.filter(i=>i.kind==='assessment'):[];
 const contextPanel=context?'<section class="course-context-panel" aria-label="课程档案">'+
  sectionTitle('02 / CONTEXT','课程档案','<span class="count-caption">'+esc(context.course.title)+'</span>')+
  '<p class="context-intro">这里只保存可追溯的课程证据。PPT 或教学大纲以后可以生成“待确认”条目；确认前不会进入重要度判断。</p>'+
  '<div class="context-evidence"><span>已确认目标 <strong>'+context.evidence.confirmedObjectives+'</strong></span><span>已确认考核 <strong>'+context.evidence.confirmedAssessments+'</strong></span><span>有权重考核 <strong>'+context.evidence.weightedAssessments+'</strong></span></div>'+
  '<div class="context-columns"><div class="context-column">'+
   '<h3>学习目标</h3><p class="context-hint">课程要求真正学会什么。</p>'+
   '<form class="context-add-form" data-context-add="objective"><input name="title" placeholder="例如：掌握状态空间模型分析" required maxlength="160">'+
    '<select name="source_resource_id">'+sourceOptions(resources)+'</select><input name="source_locator" maxlength="300" placeholder="来源位置（可选）">'+
    '<button class="button sm primary" type="submit">添加目标</button></form>'+
   '<div class="context-list">'+(objectiveItems.length?objectiveItems.map(i=>contextItemRow(i,resources)).join(''):'<p class="muted-line">还没有已记录的学习目标。</p>')+'</div></div>'+
  '<div class="context-column"><h3>考核项</h3><p class="context-hint">课程最终如何评价学习结果。</p>'+
   '<form class="context-add-form context-assessment-form" data-context-add="assessment"><input name="title" placeholder="例如：期末考试" required maxlength="160">'+
    '<input name="weight_percent" type="number" min="0" max="100" step="0.1" placeholder="权重 %（可选）">'+
    '<select name="source_resource_id">'+sourceOptions(resources)+'</select><input name="source_locator" maxlength="300" placeholder="来源位置（可选）">'+
    '<button class="button sm primary" type="submit">添加考核</button></form>'+
   '<div class="context-list">'+(assessmentItems.length?assessmentItems.map(i=>contextItemRow(i,resources)).join(''):'<p class="muted-line">还没有已记录的考核信息。</p>')+'</div></div></div></section>':'';
 view(head('Library','资料库','')+
 '<div class="workarea library-flow">'+
 '<section class="library-objects">'+sectionTitle('01 / COLLECTION','学习对象','<label class="library-filter-wrap"><span>筛选</span><select id="libraryObjectFilter" class="library-filter" aria-label="筛选学习对象">'+filterOptions+'</select></label>')+
 '<div class="object-overview"><div><strong>'+counts.course+'</strong><span>课程</span></div><div><strong>'+counts.project+'</strong><span>项目</span></div><div><strong>'+counts.track+'</strong><span>路线</span></div></div>'+
 '<form id="objectForm" class="form object-composer"><input name="title" placeholder="新建课程或项目" aria-label="名称" required maxlength="160">'+
 '<button class="button primary">创建 '+ornament('arrow')+'</button>'+
 '<select class="wide" name="kind" aria-label="学习对象类型"><option value="course">课程</option><option value="project">项目</option><option value="track">学习路线</option></select></form>'+
 '<div class="object-kind-stack">'+objectGroups+'</div></section>'+
 contextPanel+
 '<section class="library-materials">'+sectionTitle(context?'03 / MATERIALS':'02 / MATERIALS','我的资料','<span class="count-caption">'+resources.length+' 份</span>')+
 '<p class="muted-line">保存原始文件，随时回到学习资料。课程档案可以把条目追溯到这里的原件。</p>'+
 '<form id="fileForm" class="upload-strip"><div class="upload-copy"><span class="upload-mark" aria-hidden="true">'+ornament('plus')+'</span><label for="sourceFile">选择文件</label><small>支持 8MB 以内文件 · 公开测试版请勿上传隐私资料</small></div>'+
 '<div class="file-picker"><span class="file-picker-label">浏览文件</span><span class="file-picker-name" id="fileName" aria-live="polite">尚未选择</span><input id="sourceFile" type="file" name="file" aria-label="选择资料" required></div><button class="button secondary">保存原件 '+ornament('arrow')+'</button></form>'+
 '<div class="simple-list resource-list">'+resourceList+'</div></section></div>');
 root.querySelector('#libraryObjectFilter')?.addEventListener('change',e=>perform(async()=>{
  libraryObjectFilter=e.currentTarget.value;await library();
 }));
 root.querySelector('#objectForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{
  const created=await api('/objects','POST',{title:f.get('title'),kind:f.get('kind')});
  if(created.kind==='course')courseContextId=created.id;
  await library();notify('已创建');
 });});
 root.querySelectorAll('[data-context-course]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  courseContextId=courseContextId===b.dataset.contextCourse?null:b.dataset.contextCourse;
  await library();
 })));
 root.querySelectorAll('[data-context-add]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(form);perform(async()=>{
  const kind=form.dataset.contextAdd;
  const body={kind,title:f.get('title'),source_resource_id:f.get('source_resource_id')||null,source_locator:f.get('source_locator')||null};
  if(kind==='assessment')body.weight_percent=f.get('weight_percent')?Number(f.get('weight_percent')):null;
  await api('/courses/'+courseContextId+'/context','POST',body);
  await library();notify(kind==='objective'?'已添加学习目标':'已添加考核信息');
 });}));
 root.querySelectorAll('[data-context-edit]').forEach(b=>b.addEventListener('click',()=>{
  const form=root.querySelector('[data-context-edit-form="'+b.dataset.contextEdit+'"]');
  if(form)form.hidden=!form.hidden;
 }));
 root.querySelectorAll('[data-context-edit-form]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(form);perform(async()=>{
  const body={title:f.get('title'),source_resource_id:f.get('source_resource_id')||null,source_locator:f.get('source_locator')||null,status:f.get('status')};
  if(form.dataset.kind==='assessment')body.weight_percent=f.get('weight_percent')?Number(f.get('weight_percent')):null;
  await api('/course-context/'+form.dataset.contextEditForm,'POST',body);
  await library();notify('课程档案已更新');
 });}));
 root.querySelectorAll('[data-context-confirm]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  await api('/course-context/'+b.dataset.contextConfirm,'POST',{status:'confirmed'});
  await library();notify('已确认这条课程证据');
 })));
 root.querySelectorAll('[data-context-remove]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  await api('/course-context/'+b.dataset.contextRemove+'/remove','POST',{});
  await library();notify('已删除课程档案条目');
 })));
 root.querySelector('#sourceFile').addEventListener('change',e=>{
  root.querySelector('#fileName').textContent=e.currentTarget.files?.[0]?.name||'尚未选择';
 });
 root.querySelector('#fileForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file');if(!(file instanceof File)||!file.size)return;perform(async()=>{
  if(file.size>8*1024*1024)throw Error('文件目前不能超过 8MB');
  const bytes=new Uint8Array(await file.arrayBuffer());let string='';
  for(let i=0;i<bytes.length;i+=8192)string+=String.fromCharCode(...bytes.subarray(i,i+8192));
  await api('/resources','POST',{title:file.name,mime_type:file.type||'application/octet-stream',base64:btoa(string)});
  await library();notify('原件已保存');
 });});
 root.querySelectorAll('[data-file]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  const blob=await api('/resources/'+b.dataset.file+'/content');
  const href=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=href;link.download=b.dataset.name||'learning-original';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),2000);
 })));
}

async function archive(){
 const sequence=viewId;
 const response=await fetch(new URL('./trace-dial.html?v=ephemeris-brief-annotation-2',import.meta.url),{cache:'no-store'});
 if(!response.ok)throw Error('刻序读取失败');
 const template=new DOMParser().parseFromString(await response.text(),'text/html');
 const component=template.querySelector('.dial-shell'),feedback=template.querySelector('#dialToast');
 if(!component||!feedback)throw Error('刻序模板不完整');
 const {mountEphemeris}=await import('./trace-dial.js?v=ephemeris-brief-annotation-2');
 if(sequence!==viewId||page()!=='archive')return;
 view('<div class="ephemeris-host" id="ephemerisHost" aria-label="刻序 / EPHEMERIS"></div>','ephemeris-view');
 const host=root.querySelector('#ephemerisHost'),shadow=host.attachShadow({mode:'open'});
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./trace-dial.css?v=ephemeris-brief-annotation-2',import.meta.url).href;
 shadow.append(stylesheet,component,feedback);
 shadow.querySelector('.dial-header')?.remove();
 shadow.querySelector('.dial-footer p span').textContent='刻序 / EPHEMERIS';
 const close=shadow.querySelector('#closeEditorial');close.textContent='×';close.setAttribute('aria-label','收起记录详情');
 const syncTheme=()=>host.dataset.theme=document.documentElement.dataset.theme||'light';syncTheme();
 const observer=new MutationObserver(syncTheme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 // Wait for scoped styling before measuring the 75% radius.
 await new Promise((resolve,reject)=>{if(stylesheet.sheet)resolve();else{stylesheet.onload=resolve;stylesheet.onerror=()=>reject(Error('刻序样式读取失败'))}});
 if(sequence!==viewId||page()!=='archive'){observer.disconnect();return}
 const unmount=mountEphemeris(shadow,{embedded:true});
 disposeArchive=()=>{unmount();observer.disconnect();};
}

async function perform(action){
 try{await action();}catch(error){notify(error.message);}
}
async function render(){
 currentNav();const name=page();const seq=++viewId;
 disposeArchive?.();disposeArchive=null;document.documentElement.dataset.page=name;
 if(timer){clearInterval(timer);timer=null;}
 try{
  root.innerHTML='<div class="view"><div class="kicker">LEARNING</div><div class="quiet">正在载入…</div></div>';
  await({today,plan,learn,library,archive}[name])();
 }catch(error){
  if(seq!==viewId)return;
  root.innerHTML='<div class="view"><div class="head"><h1>连接失败</h1></div><p class="quiet">'+esc(error.message)+'</p><button class="button secondary" id="retry">重试</button></div>';root.querySelector('#retry').addEventListener('click',render);
 }
}
window.addEventListener('hashchange',render);
// A failed iPhone PWA view should recover when the connection returns.
window.addEventListener('online',()=>{if(root.querySelector('#retry'))render();});
window.addEventListener('pageshow',event=>{if(event.persisted&&root.querySelector('#retry'))render();});
render();
api('/health').catch(()=>dot.classList.remove('connected'));
if('serviceWorker' in navigator && location.protocol==='https:'){
 window.addEventListener('load',()=>navigator.serviceWorker.register(base+'/sw.js',{scope:base+'/'}).catch(()=>{}));
}
/* BEGIN OPT-IN LEARNING LIQUID GLASS UI */
/* Cove Learning Liquid Glass V5 — default UI for all four Learning pages.
   Uses the EXACT Home V5 GLSL material extracted by build-learning-glass.py.
   Emergency classic-mode fallback: ?ui=classic. Learning data and APIs unchanged. */
if (new URLSearchParams(location.search).get('ui') !== 'classic') {
  (() => {
    'use strict';
    const doc = document.documentElement;
    doc.dataset.learningUi = 'glass';
    const wallpaperLayer = document.querySelector('.wallpaper');
    const screen = document.querySelector('#screen');
    const shell = document.querySelector('.shell');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const preset = Object.freeze({refract:26,tint:0,blur:0,edge:25,shine:13,wobble:15});
    const bg = document.createElement('canvas');
    let chosenImage = null;
    const optics = new Map();
    let bgUrl = '';
    const WALLPAPER_DB='cove-learning-local-ui';
    const WALLPAPER_STORE='settings';
    const WALLPAPER_KEY='wallpaper-v1';
    function wallpaperDb(){
      return new Promise((resolve,reject)=>{
        const request=indexedDB.open(WALLPAPER_DB,1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(WALLPAPER_STORE))request.result.createObjectStore(WALLPAPER_STORE);};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
    }
    async function loadSavedWallpaper(){
      try{
        const db=await wallpaperDb();
        const value=await new Promise((resolve,reject)=>{
          const tx=db.transaction(WALLPAPER_STORE,'readonly');
          const req=tx.objectStore(WALLPAPER_STORE).get(WALLPAPER_KEY);
          req.onsuccess=()=>resolve(req.result||'');
          req.onerror=()=>reject(req.error);
        });
        db.close();
        return typeof value==='string'?value:'';
      }catch{return '';}
    }
    async function saveWallpaper(dataUrl){
      try{
        const db=await wallpaperDb();
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(WALLPAPER_STORE,'readwrite');
          tx.objectStore(WALLPAPER_STORE).put(dataUrl,WALLPAPER_KEY);
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
        });
        db.close();return true;
      }catch{return false;}
    }
    function useWallpaperData(dataUrl,notifyOnLoad=false){
      if(!dataUrl||!/^data:image\//.test(dataUrl))return;
      const image=new Image();
      image.onload=()=>{chosenImage=image;renderWallpaper();if(notifyOnLoad)notify('背景已保存到本机 · 未上传');};
      image.onerror=()=>notify('图片无法读取');
      image.src=dataUrl;
    }
    const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
    const screenW = () => Math.max(1,window.innerWidth);
    const screenH = () => Math.max(1,window.innerHeight,shell?.getBoundingClientRect().height||0);

      const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main(){v_uv=(a_position+1.)*.5;gl_Position=vec4(a_position,0.,1.);}`;
  const fragment = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_bg;
uniform vec2 u_res;
uniform float u_corner;
uniform float u_shape;
uniform float u_time;
uniform float u_refract,u_tint,u_blur,u_edge,u_shine,u_lTint,u_lBlur,u_lEdge,u_lShadow,u_lDistort;
uniform float u_softBlur;
uniform vec3 u_color;
vec3 backdrop(vec2 uv, float blur){
  vec2 d=vec2(blur)/u_res;
  vec3 s=texture2D(u_bg,clamp(uv,0.001,0.999)).rgb;
  if(blur<0.20)return s;
  s+=texture2D(u_bg,clamp(uv+vec2(d.x,0.0),0.001,0.999)).rgb;
  s+=texture2D(u_bg,clamp(uv-vec2(d.x,0.0),0.001,0.999)).rgb;
  s+=texture2D(u_bg,clamp(uv+vec2(0.0,d.y),0.001,0.999)).rgb;
  s+=texture2D(u_bg,clamp(uv-vec2(0.0,d.y),0.001,0.999)).rgb;
  return s*0.2;
}
// A genuine isotropic 3x3 Gaussian kernel: center 4, axes 2, corners 1.
// Only the love/anniversary card sets u_softBlur > 0. No directional ghosting.
vec3 gaussianBackdrop(vec2 uv, float radiusPx) {
  if(radiusPx<0.05)return texture2D(u_bg,clamp(uv,0.001,0.999)).rgb;
  vec2 d=vec2(radiusPx)/u_res;
  vec3 c=texture2D(u_bg,clamp(uv,0.001,0.999)).rgb*4.0;
  c+=texture2D(u_bg,clamp(uv+vec2(d.x,0.0),0.001,0.999)).rgb*2.0;
  c+=texture2D(u_bg,clamp(uv-vec2(d.x,0.0),0.001,0.999)).rgb*2.0;
  c+=texture2D(u_bg,clamp(uv+vec2(0.0,d.y),0.001,0.999)).rgb*2.0;
  c+=texture2D(u_bg,clamp(uv-vec2(0.0,d.y),0.001,0.999)).rgb*2.0;
  c+=texture2D(u_bg,clamp(uv+vec2(d.x,d.y),0.001,0.999)).rgb;
  c+=texture2D(u_bg,clamp(uv+vec2(-d.x,d.y),0.001,0.999)).rgb;
  c+=texture2D(u_bg,clamp(uv+vec2(d.x,-d.y),0.001,0.999)).rgb;
  c+=texture2D(u_bg,clamp(uv-vec2(d.x,d.y),0.001,0.999)).rgb;
  return c*(1.0/16.0);
}
// The only geometry change from Glass Lab: its circular lens becomes
// the ENTIRE Home rounded rectangle. The optical equations below stay intact.
float roundBox(vec2 point){
  vec2 q=abs(point-u_res*0.5)-(u_res*0.5-vec2(u_corner));
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-u_corner;
}
// Ray from center to the exact boundary of a rounded rectangle.
// Unlike a 32px SDF edge-band, this gives the Glass Lab its full
// center-to-edge normalized optical field across the entire card.
float radialBoundary(vec2 rel){
  vec2 halfSize=u_res*0.5;
  float corner=min(u_corner,min(halfSize.x,halfSize.y));
  vec2 d=abs(rel)/max(length(rel),0.0001);
  float tSide=min(halfSize.x/max(d.x,0.0001),halfSize.y/max(d.y,0.0001));
  vec2 hit=d*tSide;
  vec2 center=halfSize-vec2(corner);
  if(hit.x>center.x && hit.y>center.y){
    float q=dot(d,center);
    float disc=max(0.0,q*q-dot(center,center)+corner*corner);
    return max(1.0,q+sqrt(disc));
  }
  return max(1.0,tSide);
}
void main(){
  vec3 color=gaussianBackdrop(v_uv,u_softBlur);
  vec2 px=vec2(v_uv.x*u_res.x,(1.0-v_uv.y)*u_res.y);
  float cardMask=1.0-smoothstep(-0.8,0.8,roundBox(px));
  if(cardMask<0.001){gl_FragColor=vec4(0.0);return;}
  {
    vec2 p=(px-u_res*0.5)/radialBoundary(px-u_res*0.5);
    float ang=atan(p.y,p.x);
    float wave=u_shape*(0.40*sin(3.0*ang+u_time*1.7+0.0)+0.28*sin(5.0*ang-u_time*1.1));
    float radius=length(p)/(1.0+wave);
    float alpha=1.0-smoothstep(0.98,1.008,radius);
    float shadow=0.13*exp(-pow((radius-1.034)*12.0,2.0))*smoothstep(0.4,1.0,p.y);
    color*=1.0-u_lShadow*shadow;
    float rr=clamp(radius,0.0,1.0);
    float edge=pow(rr,6.0);
    float rim=exp(-pow((rr-0.967)*24.0,2.0));
    float waveLens=0.4*sin(ang*5.0+u_time*.75)*pow(rr,2.0);
    float sh=(0.65*pow(max(0.0,1.0-rr*rr),0.75)-0.20*pow(rr,6.0)+waveLens*0.035)*u_refract*u_lDistort;
    // V5: smoothly varying refraction INSIDE the whole card, not just the rim.
    // A low-frequency two-axis lens ripple remains faint at center and
    // gradually strengthens towards the edge; no discontinuous border band.
    float edgeGain=smoothstep(0.05,0.97,rr);
    float interiorStrength=(0.052+0.12*edgeGain)*u_refract*u_lDistort;
    vec2 interiorWave=vec2(
      sin(p.y*3.1+p.x*1.4+u_time*0.18)*cos(p.x*2.2),
      cos(p.x*3.4-p.y*1.3-u_time*0.15)*sin(p.y*2.1+0.8)
    );
    vec2 shift=p*sh+interiorWave*interiorStrength;
    vec2 refrUv=v_uv+vec2(shift.x/u_res.x,-shift.y/u_res.y);
    float blur=u_blur*u_lBlur;
    vec3 refr=u_softBlur>0.05?gaussianBackdrop(refrUv,u_softBlur):backdrop(refrUv,blur);
    vec3 base=gaussianBackdrop(v_uv,u_softBlur);
    color=mix(color,mix(base,refr,max(u_lBlur,u_lDistort)),alpha);
    float inside=(0.013+u_tint*0.19)*u_lTint;
    color=mix(color,u_color,alpha*inside);
    color+=alpha*u_lTint*0.013*vec3(.96,.95,1.0);
    float fren=(0.02+edge*0.20+rim*0.16)*u_edge*u_lEdge;
    color=mix(color,mix(vec3(1.0),u_color,0.21),alpha*fren);
    float arcA=exp(-pow((ang+2.40)*1.85,2.0))*rim;
    float arcB=exp(-pow((ang-.62)*2.2,2.0))*rim;
    float pear=exp(-(pow((p.x+.42)/.24,2.0)+pow((p.y+.49)/.14,2.0))*1.5);
    float soft=exp(-(pow((p.x+.32)/.48,2.0)+pow((p.y+.39)/.26,2.0))*1.3);
    float light=(arcA*.37+arcB*.16+pear*.36+soft*.045)*u_shine*u_lEdge;
    color=mix(color,vec3(1.0),alpha*light);
    float inner=exp(-pow((rr-.84)*23.0,2.0))*max(0.0,p.y)*.055*u_edge*u_lEdge;
    color+=alpha*inner*u_color;
    // Two hairline white accents on the *actual rounded-rectangle outline*.
    // Signed distance is measured in CSS pixels: ~0.7px crisp white,
    // fading along the perimeter, not a thick reflective frame.
    float borderDist=roundBox(px);
    float hairline=exp(-pow((borderDist+0.55)/0.62,2.0));
    float upperLeft=exp(-pow((ang+2.38)/0.60,2.0));
    float lowerRight=exp(-pow((ang-0.76)/0.62,2.0));
    float edgeGlint=hairline*(upperLeft*0.66+lowerRight*0.48);
    color=mix(color,vec3(1.0),clamp(edgeGlint,0.0,0.76));
  }
  gl_FragColor=vec4(clamp(color,0.0,1.0),cardMask);
}`;
  function compile(gl,type,source) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }

    function renderWallpaper() {
      const w=screenW(),h=screenH();
      const light=doc.dataset.theme==='light';
      bg.width=w;bg.height=h;
      const ctx=bg.getContext('2d');
      const grad=ctx.createLinearGradient(0,0,w*.78,h);
      grad.addColorStop(0,light?'#f5f8fb':'#080d18');
      grad.addColorStop(.46,light?'#e6edf5':'#11192c');
      grad.addColorStop(1,light?'#d7e1ec':'#19182c');
      ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
      function glow(x,y,r,c) {
        const g=ctx.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      }
      glow(w*.89,h*.16,Math.max(w,h)*.76,light?'rgba(255,255,255,.58)':'rgba(169,129,192,.23)');
      glow(w*.03,h*.72,Math.max(w,h)*.65,light?'rgba(157,181,218,.18)':'rgba(84,114,188,.20)');
      glow(w*.62,h*.98,Math.max(w,h)*.60,light?'rgba(232,190,218,.13)':'rgba(214,151,188,.10)');
      // Quiet, curved filaments give refraction something real to bend.
      // They are painted ONCE into the actual wallpaper, not over the glass.
      ctx.save();
      for(let i=0;i<6;i++) {
        const x=w*(.08+i*.18),offset=i*37;
        ctx.beginPath();
        ctx.moveTo(x-w*.44,-h*.18);
        ctx.bezierCurveTo(x+w*.18,h*.24+offset,x-w*.40,h*.56+offset,x+w*.34,h*1.12);
        ctx.strokeStyle=light
          ?(i%2?'rgba(167,151,183,.10)':'rgba(111,139,184,.10)')
          :(i%2?'rgba(236,202,233,.10)':'rgba(180,193,250,.11)');
        ctx.lineWidth=i%3===0?1.15:.68;ctx.stroke();
      }
      ctx.restore();
      // The same canvas is used by CSS and by the WebGL refraction shader.
      if(chosenImage) {
        const iw=chosenImage.naturalWidth,ih=chosenImage.naturalHeight;
        const scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
        ctx.drawImage(chosenImage,(w-dw)*.5,(h-dh)*.5,dw,dh);
        ctx.fillStyle=light?'rgba(246,249,252,.18)':'rgba(8,11,23,.29)';
        ctx.fillRect(0,0,w,h);
      }
      bgUrl=bg.toDataURL('image/png');
      wallpaperLayer.style.backgroundImage='url('+JSON.stringify(bgUrl)+')';
      for(const item of optics.values())item.refresh();
    }

    function addWallpaperPicker() {
      const actions=document.querySelector('.top-actions');
      if(!actions||actions.querySelector('.wallpaper-picker'))return;
      const button=document.createElement('button');
      button.type='button';button.className='wallpaper-picker';
      button.textContent='换背景';button.title='仅在本机预览照片，不上传服务器';
      const input=document.createElement('input');
      input.type='file';input.accept='image/*';
      input.hidden=true;input.tabIndex=-1;
      button.addEventListener('click',()=>input.click());
      input.addEventListener('change',()=>{
        const file=input.files?.[0];
        if(!file)return;
        if(file.size>8*1024*1024){notify('预览图片请小于 8MB');input.value='';return;}
        // CSP allows data: images but not blob: URLs. FileReader never uploads.
        const reader=new FileReader();
        reader.onload=async()=>{
          const dataUrl=String(reader.result||'');
          const stored=await saveWallpaper(dataUrl);
          useWallpaperData(dataUrl,stored);
          if(!stored)notify('背景已预览，但本机保存失败');
        };
        reader.onerror=()=>notify('文件无法读取');
        reader.readAsDataURL(file);
        input.value='';
      });
      actions.insertBefore(button,actions.firstChild);
      actions.append(input);
    }

    function createOptics(card) {
      const isHero=card.classList.contains('feature-today');
      const isStart=card.classList.contains('today-start-action');
      const canvas=document.createElement('canvas');
      canvas.className='learning-liquid-optics';
      canvas.setAttribute('aria-hidden','true');
      card.classList.add('learning-liquid');
      card.append(canvas);
      const gl=canvas.getContext('webgl',{
        alpha:true,antialias:true,premultipliedAlpha:false,
        preserveDrawingBuffer:false,powerPreference:'low-power'
      });
      if(!gl) {
        canvas.remove();card.classList.add('liquid-fallback');
        return {frame(){},refresh(){},dispose(){}};
      }
      let program,buffer,texture,loc;
      try {
        program=gl.createProgram();
        const vs=compile(gl,gl.VERTEX_SHADER,vertex);
        const fs=compile(gl,gl.FRAGMENT_SHADER,fragment);
        gl.attachShader(program,vs);gl.attachShader(program,fs);
        gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))
          throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        loc={};
        ['a_position','u_bg','u_res','u_corner','u_time','u_shape',
         'u_refract','u_tint','u_blur','u_edge','u_shine',
         'u_lTint','u_lBlur','u_lEdge','u_lShadow','u_lDistort',
         'u_color','u_softBlur'].forEach(k=>{
          loc[k]=k==='a_position'?gl.getAttribLocation(program,k):gl.getUniformLocation(program,k);
        });
        buffer=gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc.a_position);
        gl.vertexAttribPointer(loc.a_position,2,gl.FLOAT,false,0,0);
        texture=gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.uniform1i(loc.u_bg,0);
      }catch(err){
        console.warn('Learning Glass: WebGL fallback',err);
        canvas.remove();card.classList.add('liquid-fallback');
        return {frame(){},refresh(){},dispose(){}};
      }
      let w=0,h=0,corner=24,visible=true,last=0,dirty=true;
      const backdrop=document.createElement('canvas');
      const resizeObserver='ResizeObserver' in window?new ResizeObserver(resize):null;
      const intersectionObserver='IntersectionObserver' in window?
        new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;},{rootMargin:'60px'}):null;
      function redrawTexture(){
        if(w<5||h<5)return;
        const dpr=Math.min(1.5,Math.max(1,devicePixelRatio||1));
        backdrop.width=Math.round(w*dpr);backdrop.height=Math.round(h*dpr);
        const ctx=backdrop.getContext('2d');
        ctx.setTransform(dpr,0,0,dpr,0,0);
        const rect=card.getBoundingClientRect();
        ctx.drawImage(bg,-rect.left,-rect.top,screenW(),screenH());
        // Match Home: refractive cards sample the same day/night page overlay
        // that the user sees over the full-screen wallpaper.
        const overlay=getComputedStyle(doc).getPropertyValue('--theme-page-overlay').trim();
        if(overlay){ctx.fillStyle=overlay;ctx.fillRect(0,0,w,h);}
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,backdrop);
        dirty=false;
      }
      function draw(time){
        if(w<5||h<5)return;
        if(dirty)redrawTexture();
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.u_res,w,h);
        gl.uniform1f(loc.u_corner,corner);
        gl.uniform1f(loc.u_time,time);
        const light=doc.dataset.theme==='light';
        gl.uniform1f(loc.u_shape,preset.wobble/100*.09*.25);
        gl.uniform1f(loc.u_refract,preset.refract*(isStart?1.52:1.36));
        gl.uniform1f(loc.u_tint,isStart?(light?1.42:1.52):preset.tint/100);
        gl.uniform1f(loc.u_blur,preset.blur);
        gl.uniform1f(loc.u_edge,preset.edge/100);
        gl.uniform1f(loc.u_shine,isStart ? 0.0 : preset.shine/100);
        gl.uniform1f(loc.u_lTint,isStart ? 1.34 : 1);
        gl.uniform1f(loc.u_lBlur,1);
        gl.uniform1f(loc.u_lEdge,1);
        gl.uniform1f(loc.u_lShadow,isStart ? .72 : 1);
        gl.uniform1f(loc.u_lDistort,isStart ? 0.0 : 1);
        gl.uniform1f(loc.u_softBlur,isHero?1.7:isStart?0.35:0.0);
        if(isStart)gl.uniform3f(loc.u_color,.99,.965,.91);
        else if(light)gl.uniform3f(loc.u_color,.84,.89,.96);
        else gl.uniform3f(loc.u_color,.81,.71,.94);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }
      function resize(){
        if(!card.isConnected)return;
        const rect=card.getBoundingClientRect();
        if(rect.width<5||rect.height<5)return;
        w=rect.width;h=rect.height;
        const dpr=Math.min(1.5,Math.max(1,devicePixelRatio||1));
        canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
        gl.viewport(0,0,canvas.width,canvas.height);
        corner=parseFloat(getComputedStyle(card).borderTopLeftRadius)||24;
        dirty=true;draw(0);
      }
      const refresh=()=>{dirty=true;if(reduced)draw(0);};
      resizeObserver?.observe(card);
      intersectionObserver?.observe(card);
      resize();
      return {
        frame(ms){
          if(!visible||document.hidden||w<5)return;
          if(reduced){if(dirty)draw(0);return;}
          if(ms-last<50)return;
          last=ms;draw(ms*.001);
        },
        refresh,
        dispose(){
          resizeObserver?.disconnect();intersectionObserver?.disconnect();
          gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);
          canvas.remove();
        }
      };
    }
    function syncCards(){
      const selected=new Set(document.querySelectorAll(
        '.feature-today,.composer-pane,.focus-stage,.object-overview,.today-task-card:not(.complete),.plan-add-button,.plan-day-button.selected,.plan-timeline-row.current .plan-event-card,.dock'
      ));
      for(const [card,optic] of optics){
        if(!selected.has(card)){optic.dispose();optics.delete(card);}
      }
      for(const card of selected)if(!optics.has(card)){
        optics.set(card,createOptics(card));
      }
    }
    addWallpaperPicker();
    renderWallpaper();
    loadSavedWallpaper().then(dataUrl=>{if(dataUrl)useWallpaperData(dataUrl);});
    new MutationObserver(syncCards).observe(screen,{childList:true});
    syncCards();
    document.addEventListener('scroll',()=>{for(const o of optics.values())o.refresh();},true);
    window.addEventListener('resize',()=>{if(doc.dataset.keyboard==='open')return;renderWallpaper();for(const o of optics.values())o.refresh();},{passive:true});
    window.addEventListener('cove-theme-change',()=>{renderWallpaper();for(const o of optics.values())o.refresh();});
    window.addEventListener('pageshow',()=>{renderWallpaper();});
    if(!reduced) {
      const frame=ms=>{
        for(const optic of optics.values())optic.frame(ms);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
    window.__coveLearningGlass={
      version:'V5',mode:'default',material:'Home-V5-full-surface',
      activeCards:()=>optics.size,
      isUsingPhoto:()=>Boolean(chosenImage),
      sampleSource:'same-canvas-wallpaper'
    };
  })();
}

/* END OPT-IN LEARNING LIQUID GLASS UI */