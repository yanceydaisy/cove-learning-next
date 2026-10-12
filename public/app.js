const main=document.querySelector('#main'),status=document.querySelector('#status');
let page='today';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=v=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'—';
const api=async(path,method='GET',body)=>{
 const res=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!res.ok){let error;try{error=(await res.json()).error?.message;}catch{}throw Error(error||'操作失败');}
 return res.json();
};
const muted='暂时没有记录，等我们第一次真正使用它。';
function notice(message){status.textContent=message;}
function card(title,body){return '<section class="card"><h3>'+esc(title)+'</h3>'+body+'</section>';}
function list(rows,item){
 return rows.length?'<ul class="items">'+rows.map(item).join('')+'</ul>':'<p class="empty">'+muted+'</p>';
}
function header(title,hint){return '<div class="sectiontitle"><h2>'+title+'</h2></div><p class="hint">'+hint+'</p>';}
async function showToday(){
 const d=await api('/today');
 const active=d.activeFocus;
 main.innerHTML=header('今天，慢慢来。','这里呈现真实任务与学习记录，不生成虚构的统计或留言。')+
 '<div class="grid">'+
 card('正在进行的学习',active?'<p><strong>专注中 · '+esc(active.state)+'</strong></p><p class="meta">开始于 '+when(active.started_at)+'</p><button class="action ghost" data-go="learn">进入 Learn →</button>':'<p class="empty">目前没有进行中的学习。</p><button class="action ghost" data-go="learn">去学习 →</button>')+
 card('待办 · '+d.openTasks.length+' 项',list(d.openTasks,x=>'<li><span>'+esc(x.title)+'</span><span class="meta">未完成</span></li>'))+
 card('最近学习',list(d.recentSessions,x=>'<li><span>'+when(x.started_at)+'</span><span class="meta">'+esc(x.state)+' · '+Math.round(x.accumulated_ms/60000)+' 分钟（已确认）</span></li>'))+
 card('最近入库',list(d.recentResources,x=>'<li><span>'+esc(x.title)+'</span><span class="meta">'+when(x.created_at)+'</span></li>'))+
 '</div><div class="quiet">♡ Cove 的留言会在连接真实 Chat / Bridge、并建立消息实体后出现。这里不会预置假纸条。</div>';
}
async function showPlan(){
 const [tasks,objects]=await Promise.all([api('/tasks'),api('/objects')]);
 main.innerHTML=header('计划','先把要做的事情记下来。真实 Calendar 同步暂不启用。')+
 card('创建任务','<form id="task-form" class="fieldrow"><input required maxlength="160" name="title" placeholder="例如：复习极点配置"><select name="object_id"><option value="">不关联学习对象</option>'+objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+' · '+esc(o.kind)+'</option>').join('')+'</select><button class="action">添加任务</button></form>')+
 card('任务清单',list(tasks,t=>'<li><span>'+esc(t.title)+'<br><small class="meta">'+esc(t.status)+'</small></span>'+(t.status==='open'?'<button class="smallbtn" data-done="'+esc(t.id)+'">标记完成</button>':'')+'</li>'))+
 '<div class="quiet">学习块、任务建议和外部日历将逐层实现；当前不会声称已修改 Calendar。</div>';
 document.querySelector('#task-form').addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  await run(async()=>{await api('/tasks','POST',{title:f.get('title'),object_id:f.get('object_id')||null});await showPlan();});
 });
 main.querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click',()=>run(async()=>{await api('/tasks/'+b.dataset.done+'/complete','POST');await showPlan();})));
}
async function showLearn(){
 const [current,recent,objects]=await Promise.all([api('/focus/active'),api('/focus/recent'),api('/objects')]);
 const controls=!current?'<form id="focus-form" class="fieldrow"><select name="object_id"><option value="">自由学习（不绑定课程）</option>'+objects.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.title)+'</option>').join('')+'</select><button class="action">开始专注</button></form>':
 '<p><strong>当前状态：'+esc(current.state)+'</strong></p><p class="meta">开始于 '+when(current.started_at)+'</p><div class="fieldrow">'+
 (current.state==='running'?'<button class="action secondary" data-action="pause">暂停</button>':'<button class="action secondary" data-action="resume">继续</button>')+
 '<button class="action ghost" data-action="finish">结束并记录</button></div>';
 main.innerHTML=header('学习工作台','可以不选课程、任务或时长，直接开始真实的专注记录。')+
 card('专注',controls)+
 card('学习记录',list(recent,s=>'<li><span>'+when(s.started_at)+'</span><span class="meta">'+esc(s.state)+' · '+Math.round(s.accumulated_ms/60000)+' 分钟</span></li>'))+
 '<div class="quiet">Reader Tabs、精确 Anchor、选区问 Cove 尚未接入。我们不会在这里另造阅读器；会复用现有 Reading 的能力。</div>';
 if(!current)document.querySelector('#focus-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{await api('/focus/start','POST',{object_id:f.get('object_id')||null});await showLearn();});});
 else main.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>run(async()=>{await api('/focus/'+current.id+'/'+b.dataset.action,'POST');await showLearn();})));
}
async function showLibrary(){
 const [objects,resources]=await Promise.all([api('/objects'),api('/resources')]);
 main.innerHTML=header('资料库','第一轮先保存真正的学习对象与原始文件，绝不伪造 AI 理解。')+
 '<div class="grid">'+
 card('学习对象','<form id="object-form" class="fieldrow"><select name="kind"><option value="course">课程</option><option value="project">项目</option><option value="track">学习路线</option></select><input name="title" required maxlength="160" placeholder="名称"><button class="action">创建</button></form>'+list(objects,o=>'<li><span>'+esc(o.title)+'</span><span class="meta">'+esc(o.kind)+'</span></li>'))+
 card('原始资料','<form id="file-form" class="fieldrow"><input type="file" required name="file" aria-label="选择文件"><button class="action">原件入库</button></form><p class="meta">8 MB 以内；保存 SHA-256 与不可变版本。尚未连接阅读器。</p>'+list(resources,r=>'<li><span>'+esc(r.title)+'<br><small class="meta">'+Math.round(r.size_bytes/1024)+' KB · SHA-256 已记录</small></span><a class="smallbtn" download href="/api/resources/'+esc(r.id)+'/content">取回原件</a></li>'))+
 '</div><div class="quiet">Original 与 Cove Interpretation 将分离存储。当前只有真实 Original，Worker、RAG 和 Interpretation 仍未实施。</div>';
 document.querySelector('#object-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{await api('/objects','POST',{kind:f.get('kind'),title:f.get('title')});await showLibrary();});});
 document.querySelector('#file-form').addEventListener('submit',e=>{e.preventDefault();const file=new FormData(e.currentTarget).get('file');if(!(file instanceof File)||!file.size)return;if(file.size>8*1024*1024)return notice('文件超过当前 8MB 限制。');run(async()=>{
  const buffer=await file.arrayBuffer();let base64='';
  const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192){base64+=String.fromCharCode(...bytes.subarray(i,i+8192));}
  base64=btoa(base64);
  await api('/resources','POST',{title:file.name,mime_type:file.type||'application/octet-stream',base64});await showLibrary();
 });});
}
async function run(fn){try{notice('正在保存真实数据…');await fn();notice('已保存');}catch(e){notice('失败：'+e.message);}}
async function render(){
 for(const b of document.querySelectorAll('.tab')){const selected=b.dataset.page===page;b.classList.toggle('active',selected);b.setAttribute('aria-current',selected?'page':'false');}
 try{notice('正在读取…');await({today:showToday,plan:showPlan,learn:showLearn,library:showLibrary}[page])();notice('已载入');}
 catch(e){main.textContent='加载失败：'+e.message;notice('读取失败');}
 main.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{page=b.dataset.go;render();}));
}
for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>{page=b.dataset.page;render();});
render();
