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
function page(){const p=(location.hash||'#/').replace(/^#\/?/,'').split('/')[0];return ['today','plan','learn','library'].includes(p)?p:'home';}
function currentNav(){
 const here=page();
 document.querySelectorAll('[data-nav]').forEach(a=>a.setAttribute('aria-current',a.dataset.nav===here?'page':'false'));
}
function adjustViewport(){
 const vv=window.visualViewport;
 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const keyboard=vv&&window.innerHeight-vv.height>135;
 const height=(standalone&&!keyboard)?Math.max(window.innerHeight,screen.height):vv?.height||window.innerHeight;
 const top=standalone&&!keyboard?0:vv?.offsetTop||0;
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
function panel(title,body,tag=''){return '<section class="panel"><div class="panel-title"><h2>'+title+'</h2>'+(tag?'<span class="pill">'+tag+'</span>':'')+'</div>'+body+'</section>';}
function list(items,cb){return items.length?items.map(cb).join(''):'<p class="empty">暂无记录</p>';}
function head(english,cn){return '<div class="head"><div><p class="kicker">COVE / LEARNING</p><h1>'+english+'</h1></div><span class="quiet">'+cn+'</span></div>';}
function row(label,sub,right=''){return '<div class="row"><div class="row-body"><div class="row-title">'+esc(label)+'</div>'+(sub?'<div class="row-sub">'+esc(sub)+'</div>':'')+'</div>'+right+'</div>';}
function view(body){root.innerHTML='<div class="view">'+body+'</div>';}
function hub(){
 view('<div class="view hub"><header class="head"><p class="kicker">COVE / STUDY SPACE</p><h1>Learning<span style="color:var(--pink)">.</span></h1></header>'+
 '<div class="hub-grid">'+[
 ['01','Today','今日','today'],
 ['02','Plan','计划','plan'],
 ['03','Learn','学习','learn'],
 ['04','Library','资料库','library']
 ].map(([num,en,cn,id])=>'<a class="door" href="#/'+id+'"><span class="door-number">'+num+'</span><span class="door-name">'+en+'</span><span class="door-bottom"><span>'+cn+'</span><span class="arrow">↗</span></span></a>').join('')+'</div></div>');
}
async function today(){
 const d=await api('/today');
 const activity=d.activeFocus;
 const pending=d.openTasks;
 view(head('Today','今天')+
 '<div class="workarea compact">'+
 panel('继续学习',activity?'<div class="row">'+
 '<div class="row-body"><div class="row-title">'+(activity.state==='paused'?'已暂停':'正在学习')+'</div><div class="row-sub">'+date(activity.started_at)+' · '+time(activity.started_at)+'</div></div>'+
 '<a class="inner-link" href="#/learn">打开 ↗</a></div>':'<p class="empty">还没有进行中的学习</p><a class="inner-link" href="#/learn">开始学习 ↗</a>')+
 panel('待办任务',list(pending.slice(0,6),t=>row(t.title,'', '<span class="row-trailing">待完成</span>'))+'<div style="margin-top:10px"><a class="inner-link" href="#/plan">查看计划 ↗</a></div>',String(pending.length))+
 panel('最近学习',list(d.recentSessions.slice(0,3),s=>row(date(s.started_at)+' · '+time(s.started_at),s.state==='finished'?'已结束':s.state==='paused'?'已暂停':'进行中','<span class="row-trailing">'+minutes(s.accumulated_ms)+' min</span>')))+
 '</div>');
}
async function plan(){
 const [tasks,objects]=await Promise.all([api('/tasks'),api('/objects')]);
 view(head('Plan','计划')+
 '<div class="workarea compact">'+
 panel('新建任务','<form id="taskForm" class="form"><input name="title" placeholder="要完成的事情" required maxlength="160" aria-label="任务名称"><button class="button primary">添加</button><select class="wide" name="object_id" aria-label="关联课程或项目"><option value="">不关联学习对象</option>'+objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+'</option>').join('')+'</select></form>')+
 panel('任务',list(tasks,t=>row(t.title,t.status==='done'?'已完成':'待完成',t.status==='open'?'<button class="button sm secondary" data-done="'+esc(t.id)+'">完成</button>':'<span class="row-trailing">✓</span>')),String(tasks.length))+
 '</div>');
 root.querySelector('#taskForm').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);perform(async()=>{await api('/tasks','POST',{title:f.get('title'),object_id:f.get('object_id')||null});await plan();notify('已添加任务');});});
 root.querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{await api('/tasks/'+b.dataset.done+'/complete','POST');await plan();notify('已完成');})));
}
function liveTime(s){
 const since=s.current_started_at&&s.state==='running'?Math.max(0,Date.now()-Date.parse(s.current_started_at)):0;
 const seconds=Math.max(0,Math.floor((s.accumulated_ms+since)/1000));
 return String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
async function learn(){
 const [active,recent,objects]=await Promise.all([api('/focus/active'),api('/focus/recent'),api('/objects')]);
 const action=active?
 '<div class="session-state" id="elapsed">'+liveTime(active)+'</div><p class="session-meta">'+(active.state==='paused'?'已暂停':'专注进行中')+'</p><div class="actions">'+
 (active.state==='running'?'<button class="button secondary" data-action="pause">暂停</button>':'<button class="button primary" data-action="resume">继续</button>')+
 '<button class="button secondary" data-action="finish">结束</button></div>':
 '<form id="focusForm" class="form stacked"><select name="object_id" aria-label="选择学习对象"><option value="">自由学习 · 不关联任务</option>'+objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+'</option>').join('')+'</select><button class="button primary">开始学习 →</button></form>';
 view(head('Learn','学习')+'<div class="workarea compact">'+panel('专注',action)+
 panel('学习记录',list(recent.slice(0,6),s=>row(date(s.started_at)+' · '+time(s.started_at),s.state==='finished'?'已结束':s.state==='paused'?'已暂停':'进行中','<span class="row-trailing">'+minutes(s.accumulated_ms)+' min</span>')))+
 '<p class="notice">阅读器与 ChatGPT 尚未接入，本页只记录真实专注时间。</p></div>');
 if(timer){clearInterval(timer);timer=null;}
 if(active?.state==='running')timer=setInterval(()=>{const el=document.querySelector('#elapsed');if(el)el.textContent=liveTime(active);},1000);
 if(!active)root.querySelector('#focusForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{await api('/focus/start','POST',{object_id:f.get('object_id')||null});await learn();notify('学习开始');});});
 else root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>perform(async()=>{await api('/focus/'+active.id+'/'+b.dataset.action,'POST');await learn();notify('已保存');})));
}
async function library(){
 const [objects,resources]=await Promise.all([api('/objects'),api('/resources')]);
 const kinds={course:'课程',project:'项目',track:'路线'};
 view(head('Library','资料库')+
 '<div class="workarea"><div class="desktop-columns">'+
 panel('学习对象','<form id="objectForm" class="form"><input name="title" placeholder="课程 / 项目名称" aria-label="名称" required maxlength="160"><button class="button primary">创建</button><select class="wide" name="kind" aria-label="学习对象类型"><option value="course">课程</option><option value="project">项目</option><option value="track">学习路线</option></select></form>'+
 '<div style="margin-top:13px">'+list(objects,o=>row(o.title,kinds[o.kind]||o.kind))+'</div>',String(objects.length))+
 panel('我的资料','<p class="panel-sub">公开测试版，请勿上传私人文件。</p><form id="fileForm" class="form"><input class="wide" type="file" name="file" aria-label="选择资料" required><button class="button secondary wide">保存原件</button></form>'+
 '<div style="margin-top:13px">'+list(resources,r=>row(r.title,Math.ceil(r.size_bytes/1024)+' KB · 原始资料','<button type="button" class="button sm secondary" data-file="'+esc(r.id)+'" data-name="'+esc(r.title)+'">下载</button>'))+'</div>',String(resources.length))+
 '</div></div>');
 root.querySelector('#objectForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);perform(async()=>{await api('/objects','POST',{title:f.get('title'),kind:f.get('kind')});await library();notify('已创建');});});
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
 if(name==='home'){hub();return;}
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
