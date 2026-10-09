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
function notify(message){
 toast.textContent = message;
 toast.classList.add('on');
 clearTimeout(notify.timer);
 notify.timer=setTimeout(()=>toast.classList.remove('on'),2800);
}
function page(){const p=(location.hash||'#/today').replace(/^#\/?/,'').split('/')[0];return ['today','plan','learn','library'].includes(p)?p:'today';}
function currentNav(){
 const here=page();
 document.querySelectorAll('[data-nav]').forEach(a=>a.setAttribute('aria-current',a.dataset.nav===here?'page':'false'));
}
function adjustViewport(){
 // iOS standalone PWA may expose a physical screen.height taller than the usable web viewport.
 // Never size fixed UI by screen.height: it pushes the navigation under the native black bottom area.
 const vv=window.visualViewport;
 const layoutHeight=Math.max(1,window.innerHeight);
 const top=Math.max(0,Math.min(layoutHeight-1,vv?.offsetTop||0));
 const visibleHeight=vv?.height>0?vv.height:layoutHeight;
 const height=Math.max(1,Math.floor(Math.min(layoutHeight-top,visibleHeight)));
 document.documentElement.style.setProperty('--app-height',height+'px');
 document.documentElement.style.setProperty('--app-top',top+'px');
}
function appearance(){
 const mode=localStorage.getItem('cove.home.themeMode')||'system';
 const prefers=window.matchMedia('(prefers-color-scheme: dark)').matches;
 const dark=mode==='dark'||mode==='system'&&prefers;
 document.documentElement.dataset.theme=dark?'dark':'light';
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=dark?'#252936':'#dee1e8';
 const bg=localStorage.getItem('cove.home.background')||'';
 const layer=document.querySelector('.wallpaper');
 // Only honor images already stored by Cove Home; never use untrusted arbitrary page markup.
 if(bg&&(/^(data:image\/|blob:)/.test(bg))) {layer.style.backgroundImage='url('+JSON.stringify(bg)+')';layer.classList.add('custom');}
 else{layer.style.backgroundImage='';layer.classList.remove('custom');}
}
try{appearance();}catch{}
document.querySelector('#appearance').addEventListener('click',()=>{
 const current=localStorage.getItem('cove.home.themeMode')||'system';
 const next=current==='light'?'dark':current==='dark'?'system':'light';
 localStorage.setItem('cove.home.themeMode',next);appearance();
 notify(next==='system'?'已跟随系统外观':next==='dark'?'已切换深色':'已切换浅色');
});
window.addEventListener('storage',event=>{if(['cove.home.themeMode','cove.home.background'].includes(event.key))try{appearance();}catch{}});
window.addEventListener('pageshow',()=>{try{appearance();}catch{}adjustViewport();});
window.addEventListener('resize',adjustViewport);
window.visualViewport?.addEventListener('resize',adjustViewport);
adjustViewport();

async function api(path,method='GET',data){
 const res=await fetch(API+path,{
  method,
  cache:'no-store',
  headers:{...(method==='GET'?{}:{'Content-Type':'application/json'})},
  body:data===undefined?undefined:JSON.stringify(data)
 });
 if(!res.ok){
  let error;try{error=(await res.json()).error?.message;}catch{}
  if(res.status===401)dot.classList.remove('connected');
  throw Error(error||'请求未成功');
 }
 dot.classList.add('connected');
 if(res.headers.get('content-type')?.includes('application/octet-stream'))return res.blob();
 return res.json();
}
function list(items,cb){return items.length?items.map(cb).join(''):'<p class="empty">暂时没有记录</p>';}
function head(english,cn,kicker='COVE / LEARNING'){
 return '<header class="head"><div><p class="kicker">'+kicker+'</p><h1>'+english+'</h1></div><span class="quiet">'+cn+'</span></header>';
}
function row(label,sub,right=''){
 return '<div class="row"><div class="row-body"><div class="row-title">'+esc(label)+'</div>'+(sub?'<div class="row-sub">'+esc(sub)+'</div>':'')+'</div>'+right+'</div>';
}
function view(body){root.innerHTML='<div class="view">'+body+'</div>';}
function sectionTitle(eyebrow,title,aside=''){
 return '<div class="section-heading"><div><span class="section-eyebrow">'+eyebrow+'</span><h2>'+title+'</h2></div>'+aside+'</div>';
}
function historyList(sessions,max=5){
 return sessions.length?'<div class="activity-list">'+sessions.slice(0,max).map(s=>
  '<div class="activity-item"><span class="activity-mark" aria-hidden="true"></span><div class="activity-copy"><strong>'+esc(date(s.started_at))+' · '+esc(time(s.started_at))+'</strong><span>'+esc(s.state==='finished'?'已完成':s.state==='paused'?'已暂停':'进行中')+'</span></div><span class="activity-duration">'+minutes(s.accumulated_ms)+'<small> min</small></span></div>'
 ).join('')+'</div>':'<p class="muted-line">还没有学习记录，第一段专注从这里开始。</p>';
}
async function today(){
 const d=await api('/today');
 const activity=d.activeFocus;
 const pending=d.openTasks;
 const title=activity?(activity.state==='paused'?'继续未完成的专注':'回到正在进行的学习'):'留一点时间，给学习。';
 const hint=activity?'从 '+esc(date(activity.started_at))+' '+esc(time(activity.started_at))+' 开始的记录仍在这里。':'不必计划好一整天，先从一段专注开始。';
 view(head('Learning','今日','TODAY / OVERVIEW')+
 '<div class="workarea daily-flow">'+
 '<section class="feature feature-today" aria-label="继续学习"><div class="feature-top"><span class="feature-index">01 / FOCUS</span><span class="feature-symbol" aria-hidden="true">✳</span></div>'+
 '<div class="feature-bottom"><p class="feature-overline">'+(activity?'当前进度':'你的今日起点')+'</p><h2>'+title+'</h2><p>'+hint+'</p><a class="feature-action" href="#/learn">'+(activity?'继续学习':'开始学习')+' <span aria-hidden="true">↗</span></a></div></section>'+
 '<section class="task-overview" aria-label="待办任务">'+
 sectionTitle('02 / TO DO','待办任务','<a class="text-action" href="#/plan">打开计划 ↗</a>')+
 '<div class="task-countline"><strong>'+pending.length+'</strong><span>项待完成</span></div>'+
 (pending.length?'<div class="compact-list">'+pending.slice(0,3).map(t=>'<div class="compact-item"><span class="mini-indicator" aria-hidden="true"></span><span>'+esc(t.title)+'</span></div>').join('')+'</div>':'<p class="muted-line">今天还没有待办任务。</p>')+
 '</section>'+
 '<section class="history-block" aria-label="最近学习">'+sectionTitle('03 / ACTIVITY','最近学习','<a class="text-action" href="#/learn">学习记录 ↗</a>')+
 historyList(d.recentSessions,3)+'</section></div>');
}
async function plan(){
 const [tasks,objects]=await Promise.all([api('/tasks'),api('/objects')]);
 const open=tasks.filter(t=>t.status==='open').length;
 view(head('Plan','计划')+
 '<div class="workarea spacious-flow">'+
 '<section class="composer-pane" aria-label="创建任务"><p class="section-eyebrow">CAPTURE / 01</p><h2>下一步，写下来。</h2>'+
 '<p class="muted-line">一件具体的小事，就足够成为今天的开始。</p>'+
 '<form id="taskForm" class="form task-composer"><input name="title" placeholder="接下来要完成什么？" required maxlength="160" aria-label="任务名称">'+
 '<button class="button primary" type="submit">添加 ↗</button>'+
 '<select class="wide" name="object_id" aria-label="关联课程或项目"><option value="">不关联学习对象</option>'+objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+'</option>').join('')+'</select></form></section>'+
 '<section class="open-section">'+sectionTitle('02 / TASKS','我的任务','<span class="count-caption">'+open+' 待办 / '+tasks.length+' 全部</span>')+
 '<div class="simple-list">'+list(tasks,t=>'<div class="task-item"><span class="task-check '+(t.status==='done'?'complete':'')+'" aria-hidden="true">'+(t.status==='done'?'✓':'')+'</span><span class="task-description '+(t.status==='done'?'complete':'')+'">'+esc(t.title)+'</span>'+
 (t.status==='open'?'<button type="button" class="button sm quiet-button" data-done="'+esc(t.id)+'">完成</button>':'<span class="row-trailing">已完成</span>')+'</div>')+'</div></section></div>');
 root.querySelector('#taskForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{
  await api('/tasks','POST',{title:f.get('title'),object_id:f.get('object_id')||null});await plan();notify('已添加任务');
 });});
 root.querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{
  await api('/tasks/'+b.dataset.done+'/complete','POST');await plan();notify('已完成');
 })));
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
 '</select><button class="button focus-main">开始专注 <span aria-hidden="true">↗</span></button></form>';
 view(head('Learn','专注')+
 '<div class="workarea spacious-flow">'+
 '<section class="focus-stage"><p class="focus-eyebrow">FOCUS / NOW</p><span class="focus-decoration" aria-hidden="true">◌</span>'+action+'</section>'+
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
async function library(){
 const [objects,resources]=await Promise.all([api('/objects'),api('/resources')]);
 const kinds={course:'课程',project:'项目',track:'路线'};
 const counts={course:objects.filter(o=>o.kind==='course').length,project:objects.filter(o=>o.kind==='project').length,track:objects.filter(o=>o.kind==='track').length};
 const objectList=objects.length?objects.map(o=>row(o.title,kinds[o.kind]||o.kind)).join(''):'<p class="muted-line">还没有课程或项目，从上方创建一个。</p>';
 const resourceList=resources.length?resources.map(r=>row(r.title,Math.ceil(r.size_bytes/1024)+' KB · 原始资料',
  '<button type="button" class="button sm quiet-button" data-file="'+esc(r.id)+'" data-name="'+esc(r.title)+'">下载</button>')).join(''):'<p class="muted-line">还没有保存的资料。</p>';
 view(head('Library','资料库')+
 '<div class="workarea library-flow">'+
 '<section class="library-objects">'+sectionTitle('01 / COLLECTION','学习对象','<span class="count-caption">'+objects.length+' 个</span>')+
 '<div class="object-overview"><div><strong>'+counts.course+'</strong><span>课程</span></div><div><strong>'+counts.project+'</strong><span>项目</span></div><div><strong>'+counts.track+'</strong><span>路线</span></div></div>'+
 '<form id="objectForm" class="form object-composer"><input name="title" placeholder="新建课程或项目" aria-label="名称" required maxlength="160">'+
 '<button class="button primary">创建 ↗</button>'+
 '<select class="wide" name="kind" aria-label="学习对象类型"><option value="course">课程</option><option value="project">项目</option><option value="track">学习路线</option></select></form>'+
 '<div class="simple-list object-list">'+objectList+'</div></section>'+
 '<section class="library-materials">'+sectionTitle('02 / MATERIALS','我的资料','<span class="count-caption">'+resources.length+' 份</span>')+
 '<p class="muted-line">保存原始文件，随时回到学习资料。</p>'+
 '<form id="fileForm" class="upload-strip"><div class="upload-copy"><span class="upload-mark" aria-hidden="true">＋</span><label for="sourceFile">选择文件</label><small>支持 8MB 以内文件 · 公开测试版请勿上传隐私资料</small></div>'+
 '<input id="sourceFile" type="file" name="file" aria-label="选择资料" required><button class="button secondary">保存原件 ↗</button></form>'+
 '<div class="simple-list resource-list">'+resourceList+'</div></section></div>');
 root.querySelector('#objectForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{
  await api('/objects','POST',{title:f.get('title'),kind:f.get('kind')});await library();notify('已创建');
 });});
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
async function perform(action){
 try{await action();}catch(error){notify(error.message);}
}
async function render(){
 currentNav();const name=page();const seq=++viewId;
 if(timer){clearInterval(timer);timer=null;}
 try{
  root.innerHTML='<div class="view"><div class="kicker">LEARNING</div><div class="quiet">正在载入…</div></div>';
  await({today,plan,learn,library}[name])();
 }catch(error){
  if(seq!==viewId)return;
  root.innerHTML='<div class="view"><div class="head"><h1>连接失败</h1></div><p class="quiet">'+esc(error.message)+'</p><button class="button secondary" id="retry">重试</button></div>';root.querySelector('#retry').addEventListener('click',render);
 }
}
window.addEventListener('hashchange',render);
render();
api('/health').catch(()=>dot.classList.remove('connected'));
if('serviceWorker' in navigator && location.protocol==='https:'){
 window.addEventListener('load',()=>navigator.serviceWorker.register(base+'/sw.js',{scope:base+'/'}).catch(()=>{}));
}
