
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas=$('glass-canvas'), stage=$('stage');
const keys=['size','refract','tint','blur','edge','shine','float','spring','speed','wobble'];
const vals=Object.fromEntries(keys.map(k=>[k,$(k)]));
const layers=['tint','blur','edge','shadow','distort','breath'];
const flags=Object.fromEntries(layers.map(k=>[k,$('layer-'+k)]));
const initial=Object.fromEntries(keys.map(k=>[k,vals[k].value]));
const themes={midnight:{bg:['#10182e','#253b63'],a:'#dd9abe',b:'#8fc5e7',c:'#f3d7c6',ink:'#eef1ff',dim:'#aec2d7',glass:[.81,.71,.94]},rose:{bg:['#282138','#73566d'],a:'#ffc3b5',b:'#adaddc',c:'#f8d9b1',ink:'#fff2f7',dim:'#d6bfcf',glass:[1.0,.77,.85]},milk:{bg:['#d9dbe1','#f5e6df'],a:'#daaab3',b:'#9aaacb',c:'#e7c9a1',ink:'#41475b',dim:'#737b90',glass:[.82,.89,.99]}};
let theme='midnight', count=1, W=1,H=1,dpr=1, prev=0, raf=0, bgCanvas=document.createElement('canvas');
let lastPreset=0;
const homes=[[.67,.43],[.28,.58],[.77,.73]];
const bubbles=homes.map((h,i)=>({homeX:0,homeY:0,x:0,y:0,vx:0,vy:0,drag:false,shape:0,shapeVel:0,seed:1.11+i*2.37}));
const get=k=>Number(vals[k].value);
function refreshLabels(){for(const k of keys){let v=get(k),out=$(k+'-v');if(!out)continue;out.textContent=['tint','edge','shine','spring','speed','wobble'].includes(k)?v+'%':String(v);}}
keys.forEach(k=>vals[k].addEventListener('input',refreshLabels));refreshLabels();
const renderContext={gl:null,ctx2d:null,program:null,bgTex:null,location:{},buffer:null};
function shader(gl,type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
const vert=`attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}`;
const frag=`precision highp float;
varying vec2 v_uv;
uniform sampler2D u_bg;
uniform vec2 u_res;
uniform vec2 u_centers[3];
uniform vec2 u_radii[3];
uniform float u_shape[3];
uniform float u_time;
uniform int u_count;
uniform float u_refract,u_tint,u_blur,u_edge,u_shine,u_lTint,u_lBlur,u_lEdge,u_lShadow,u_lDistort;
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
void main(){
  vec3 color=texture2D(u_bg,v_uv).rgb;
  vec2 px=vec2(v_uv.x*u_res.x,(1.0-v_uv.y)*u_res.y);
  for(int i=0;i<3;i++){
    if(i>=u_count)continue;
    vec2 p=(px-u_centers[i])/u_radii[i];
    float ang=atan(p.y,p.x);
    float wave=u_shape[i]*(0.40*sin(3.0*ang+u_time*1.7+float(i))+0.28*sin(5.0*ang-u_time*1.1));
    float radius=length(p)/(1.0+wave);
    float alpha=1.0-smoothstep(0.98,1.008,radius);
    float shadow=0.13*exp(-pow((radius-1.034)*12.0,2.0))*smoothstep(0.4,1.0,p.y);
    color*=1.0-u_lShadow*shadow;
    if(alpha<0.001)continue;
    float rr=clamp(radius,0.0,1.0);
    float edge=pow(rr,6.0);
    float rim=exp(-pow((rr-0.967)*24.0,2.0));
    float waveLens=0.4*sin(ang*5.0+u_time*.75)*pow(rr,2.0);
    float sh=(0.65*pow(max(0.0,1.0-rr*rr),0.75)-0.20*pow(rr,6.0)+waveLens*0.035)*u_refract*u_lDistort;
    vec2 shift=p*sh;
    vec2 refrUv=v_uv+vec2(shift.x/u_res.x,-shift.y/u_res.y);
    float blur=u_blur*u_lBlur;
    vec3 refr=backdrop(refrUv,blur);
    vec3 base=texture2D(u_bg,v_uv).rgb;
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
  }
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}`;
function initGL(){
 try{
  let gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:false});if(!gl)throw Error('WebGL unavailable');
  let pg=gl.createProgram();gl.attachShader(pg,shader(gl,gl.VERTEX_SHADER,vert));gl.attachShader(pg,shader(gl,gl.FRAGMENT_SHADER,frag));gl.linkProgram(pg);if(!gl.getProgramParameter(pg,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pg));
  gl.useProgram(pg);
  const loc={};['a_position','u_bg','u_res','u_centers','u_radii','u_shape','u_time','u_count','u_refract','u_tint','u_blur','u_edge','u_shine','u_lTint','u_lBlur','u_lEdge','u_lShadow','u_lDistort','u_color'].forEach(k=>loc[k]=k==='a_position'?gl.getAttribLocation(pg,k):gl.getUniformLocation(pg,['u_centers','u_radii','u_shape'].includes(k)?k+'[0]':k));
  let b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(loc.a_position);gl.vertexAttribPointer(loc.a_position,2,gl.FLOAT,false,0,0);
  let tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.uniform1i(loc.u_bg,0);
  Object.assign(renderContext,{gl,program:pg,location:loc,bgTex:tex,buffer:b});$('renderer-status').textContent='WEBGL · REALTIME';
 }catch(e){console.warn('Using 2D compatibility renderer:',e);renderContext.ctx2d=canvas.getContext('2d');$('renderer-status').textContent='CANVAS · COMPATIBLE';}
}
function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):(c.rect(x,y,w,h));}
function radial(c,x,y,r,color){const g=c.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
function background(){
 bgCanvas.width=Math.max(2,Math.round(W*dpr));bgCanvas.height=Math.max(2,Math.round(H*dpr));
 const c=bgCanvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 const t=themes[theme],g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,t.bg[0]);g.addColorStop(1,t.bg[1]);c.fillStyle=g;c.fillRect(0,0,W,H);
 c.save();c.globalAlpha=.26;radial(c,W*.89,H*.08,W*.64,t.a);c.globalAlpha=.24;radial(c,W*.19,H*.63,W*.62,t.b);c.globalAlpha=.22;radial(c,W*.72,H*.79,W*.50,t.c);c.restore();
 // Broad pastel bands and fine linen-like guides give the lens visible detail to bend.
 c.save();c.globalAlpha=.18;c.strokeStyle=t.b;c.lineWidth=Math.max(1,W*.04);c.beginPath();c.moveTo(-W*.12,H*.68);c.bezierCurveTo(W*.17,H*.55,W*.41,H*.75,W*.85,H*.40);c.stroke();c.globalAlpha=.13;c.lineWidth=Math.max(1,W*.06);c.strokeStyle=t.a;c.beginPath();c.moveTo(W*.38,-H*.1);c.bezierCurveTo(W*.63,H*.22,W*.51,H*.38,W*1.1,H*.57);c.stroke();c.restore();
 c.save();c.lineWidth=.55;c.strokeStyle=t.dim;c.globalAlpha=.12;for(let x=0;x<W;x+=22){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}for(let y=0;y<H;y+=26){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}c.restore();
 c.save();c.fillStyle=t.dim;c.font='500 10px -apple-system, sans-serif';c.fillText('COVE  /  LEARNING',24,36);c.textAlign='right';c.fillText('EXPERIMENT 01',W-24,36);c.textAlign='left';
 const headlineSize=Math.max(40,Math.min(72,W*.125));c.fillStyle=t.ink;c.font=`400 ${headlineSize}px Georgia, serif`;c.globalAlpha=.88;c.fillText('Slowly,',24,H*.35);c.fillText('we learn.',24,H*.35+headlineSize*.98);c.globalAlpha=.88;c.font='400 12px -apple-system, sans-serif';c.fillStyle=t.dim;c.fillText('A little space to begin again.',27,H*.35+headlineSize*1.42);
 // The right-side fine lettering runs beneath the largest bubble.
 c.globalAlpha=.55;c.font='italic '+Math.max(24,W*.067)+'px Georgia, serif';c.textAlign='right';c.fillStyle=t.c;c.fillText('Stay curious',W-23,H*.50);c.textAlign='left';c.globalAlpha=1;
 const cardY=H*.75,cardH=Math.min(90,H*.16),margin=19,gap=10,cardW=(W-margin*2-gap)/2;
 for(let i=0;i<2;i++){
   const x=margin+i*(cardW+gap);c.fillStyle=theme==='milk'?'rgba(255,255,255,.26)':'rgba(255,255,255,.065)';roundRect(c,x,cardY,cardW,cardH,14);c.fill();c.strokeStyle=theme==='milk'?'rgba(60,62,99,.17)':'rgba(255,255,255,.18)';c.lineWidth=1;c.stroke();
   c.fillStyle=t.dim;c.font='500 10px -apple-system,sans-serif';c.fillText(i===0?'TODAY / FOCUS':'CONTINUE / LEARN',x+13,cardY+24);
   c.fillStyle=t.ink;c.font=`400 ${Math.min(16,W*.036)}px -apple-system,sans-serif`;c.fillText(i===0?'现代控制':'Return to page 42',x+13,cardY+52);
 }
 c.restore();
 if(renderContext.gl){const gl=renderContext.gl;gl.bindTexture(gl.TEXTURE_2D,renderContext.bgTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bgCanvas);}
}
function sizeBubble(i){let s=get('size')/2;return s*(i===0?1:i===1?.70:.56);}
function resize(){
 const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;
 const oldW=W,oldH=H;W=r.width;H=r.height;dpr=Math.min(2,Math.max(1,devicePixelRatio||1));
 canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
 for(let i=0;i<3;i++){
  let b=bubbles[i];b.homeX=W*homes[i][0];b.homeY=H*homes[i][1];
  if(oldW<=1){b.x=b.homeX;b.y=b.homeY}else{b.x*=W/oldW;b.y*=H/oldH}
 }
 if(renderContext.gl)renderContext.gl.viewport(0,0,canvas.width,canvas.height);
 if(renderContext.ctx2d)renderContext.ctx2d.setTransform(dpr,0,0,dpr,0,0);
 background();
}
function renderGL(time){
 const {gl,location:l}=renderContext;gl.useProgram(renderContext.program);gl.bindBuffer(gl.ARRAY_BUFFER,renderContext.buffer);gl.uniform2f(l.u_res,W,H);gl.uniform1f(l.u_time,time);
 gl.uniform1i(l.u_count,count);
 const centers=[],radii=[],shape=[];
 for(let i=0;i<3;i++){let b=bubbles[i],r=sizeBubble(i), sx=Math.max(-.18,Math.min(.18,b.shape));centers.push(b.x,b.y);radii.push(r*(1+sx*.8),r*(1-sx*.4));shape.push(get('wobble')/100*.09*(.25+Math.abs(b.shape)*4));}
 gl.uniform2fv(l.u_centers,new Float32Array(centers));gl.uniform2fv(l.u_radii,new Float32Array(radii));gl.uniform1fv(l.u_shape,new Float32Array(shape));
 gl.uniform1f(l.u_refract,get('refract')*1.36);gl.uniform1f(l.u_blur,get('blur'));
 gl.uniform1f(l.u_tint,get('tint')/100);gl.uniform1f(l.u_edge,get('edge')/100);gl.uniform1f(l.u_shine,get('shine')/100);
 ['tint','blur','edge','shadow','distort'].forEach(k=>gl.uniform1f(l['u_l'+k[0].toUpperCase()+k.slice(1)],flags[k].checked?1:0));
 gl.uniform3fv(l.u_color,new Float32Array(themes[theme].glass));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
function renderFallback(){
 let c=renderContext.ctx2d;if(!c)return;
 c.clearRect(0,0,W,H);c.drawImage(bgCanvas,0,0,W,H);
 for(let i=0;i<count;i++){
  let b=bubbles[i],r=sizeBubble(i),rx=r*(1+b.shape*.4),ry=r*(1-b.shape*.25);c.save();
  if(flags.shadow.checked){c.beginPath();c.ellipse(b.x,b.y+8,rx*1.02,ry*1.01,0,0,Math.PI*2);c.shadowBlur=20;c.shadowColor='rgba(0,0,0,.35)';c.fillStyle='rgba(0,0,0,.04)';c.fill();c.shadowBlur=0;}
  c.beginPath();c.ellipse(b.x,b.y,rx,ry,0,0,Math.PI*2);c.clip();
  if(flags.distort.checked){let offset=get('refract')*.24;c.drawImage(bgCanvas,(b.x-rx+offset)*dpr,(b.y-ry+offset)*dpr,rx*2*dpr,ry*2*dpr,b.x-rx,b.y-ry,rx*2,ry*2);}
  if(flags.tint.checked){let grad=c.createRadialGradient(b.x-r*.3,b.y-r*.4,2,b.x,b.y,r*1.05);grad.addColorStop(0,`rgba(255,240,255,${get('tint')/100*.28})`);grad.addColorStop(1,`rgba(157,178,231,${get('tint')/100*.17})`);c.fillStyle=grad;c.fillRect(b.x-r,b.y-r,r*2,r*2);}
  c.restore();if(flags.edge.checked){c.save();c.beginPath();c.ellipse(b.x,b.y,rx,ry,0,0,Math.PI*2);c.strokeStyle=`rgba(245,245,255,${get('edge')/100*.68})`;c.lineWidth=2;c.stroke();c.fillStyle=`rgba(255,255,255,${get('shine')/100*.22})`;c.beginPath();c.ellipse(b.x-r*.35,b.y-r*.41,r*.23,r*.085,-.6,0,Math.PI*2);c.fill();c.restore();}
 }
}
function tick(ms){
 const dt=Math.max(.3,Math.min(1.8,prev?(ms-prev)/16.67:1));prev=ms;
 if(!document.hidden){
  const now=ms*.001;
  for(let i=0;i<count;i++){
   const b=bubbles[i];if(b.drag)continue;
   const amp=flags.breath.checked?get('float'):0;
   const speed=.28+get('speed')/100*1.1;
   let tx=b.homeX+amp*Math.sin(now*speed+b.seed),ty=b.homeY+amp*.8*Math.cos(now*speed*.79+b.seed);
   const stiffness=.012+get('spring')/100*.075;
   b.vx+=(tx-b.x)*stiffness*dt;b.vy+=(ty-b.y)*stiffness*dt;
   const damping=Math.pow(.85,dt);b.vx*=damping;b.vy*=damping;b.x+=b.vx*dt;b.y+=b.vy*dt;b.shape*=Math.pow(.86,dt);
  }
  renderContext.gl?renderGL(now):renderFallback();
 }
 raf=requestAnimationFrame(tick);
}
let activePointer=null,activeIndex=-1,lastPoint=null;
function point(e){const rect=stage.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top}}
canvas.addEventListener('pointerdown',e=>{
 if(activePointer!==null)return;const p=point(e);let found=-1;
 for(let i=count-1;i>=0;i--){let b=bubbles[i],r=sizeBubble(i);if(Math.hypot((p.x-b.x)/r,(p.y-b.y)/r)<1.1){found=i;break}}
 if(found<0)return;activePointer=e.pointerId;activeIndex=found;lastPoint=p;let b=bubbles[found];b.drag=true;b.vx=b.vy=0;b.dx=b.x-p.x;b.dy=b.y-p.y;canvas.classList.add('dragging');canvas.setPointerCapture(e.pointerId);e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
 if(e.pointerId!==activePointer||activeIndex<0)return;const p=point(e),b=bubbles[activeIndex];let nx=p.x+b.dx,ny=p.y+b.dy;
 const rx=nx-b.x,ry=ny-b.y;b.x=nx;b.y=ny;b.vx=rx*.6;b.vy=ry*.6;
 b.shape=Math.max(-.19,Math.min(.19,(rx-ry)*.009*get('wobble')/55));lastPoint=p;e.preventDefault();
});
function release(e){if(e.pointerId!==activePointer)return;if(activeIndex>=0)bubbles[activeIndex].drag=false;activeIndex=-1;activePointer=null;canvas.classList.remove('dragging')}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
function setTheme(t){theme=t;document.querySelectorAll('[data-theme]').forEach(el=>el.classList.toggle('active',el.dataset.theme===theme));background();}
document.querySelectorAll('[data-theme]').forEach(el=>el.addEventListener('click',()=>setTheme(el.dataset.theme)));
document.querySelectorAll('[data-count]').forEach(el=>el.addEventListener('click',()=>{count=Number(el.dataset.count);document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('active',b===el))}));
function reset(){keys.forEach(k=>vals[k].value=initial[k]);layers.forEach(k=>flags[k].checked=true);count=1;document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('active',b.dataset.count==='1'));setTheme('midnight');bubbles.forEach(b=>{b.x=b.homeX;b.y=b.homeY;b.vx=0;b.vy=0;b.shape=0});refreshLabels();}
$('reset').addEventListener('click',reset);
$('surprise').addEventListener('click',()=>{let n=++lastPreset;setTheme(['rose','milk','midnight'][n%3]);vals.size.value=100+Math.floor(Math.random()*100);vals.refract.value=18+Math.floor(Math.random()*45);vals.tint.value=5+Math.floor(Math.random()*42);vals.blur.value=Math.floor(Math.random()*8);vals.edge.value=52+Math.floor(Math.random()*45);vals.shine.value=43+Math.floor(Math.random()*55);vals.float.value=3+Math.floor(Math.random()*19);vals.wobble.value=28+Math.floor(Math.random()*67);refreshLabels();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);$('renderer-status').textContent='GLASS · PAUSED'});
canvas.addEventListener('webglcontextrestored',()=>{location.reload()});
initGL();resize();
if(window.ResizeObserver)new ResizeObserver(()=>resize()).observe(stage);else window.addEventListener('resize',resize);
raf=requestAnimationFrame(tick);
})();

