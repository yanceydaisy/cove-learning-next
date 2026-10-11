/* Cove Learning Liquid Glass UI (opt-in preview: ?ui=glass).
   Uses the EXACT Home V5 GLSL material extracted by build-learning-glass.py.
   Does not modify API, Learning domain data, or standard UI mode. */
if (new URLSearchParams(location.search).get('ui') === 'glass') {
  (() => {
    'use strict';
    const doc = document.documentElement;
    doc.dataset.learningUi = 'glass';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#0b1020');
    const wallpaperLayer = document.querySelector('.wallpaper');
    const screen = document.querySelector('#screen');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const preset = Object.freeze({refract:26,tint:0,blur:0,edge:25,shine:13,wobble:15});
    const bg = document.createElement('canvas');
    let chosenImage = null;
    const optics = new Map();
    let bgUrl = '';
    const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
    const screenW = () => Math.max(1,window.innerWidth);
    const screenH = () => Math.max(1,window.innerHeight);

    /*__GLASS_SHADER__*/

    function renderWallpaper() {
      const w=screenW(),h=screenH();
      bg.width=w;bg.height=h;
      const ctx=bg.getContext('2d');
      const grad=ctx.createLinearGradient(0,0,w*.78,h);
      grad.addColorStop(0,'#080d18');
      grad.addColorStop(.46,'#11192c');
      grad.addColorStop(1,'#19182c');
      ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
      function glow(x,y,r,c) {
        const g=ctx.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      }
      glow(w*.89,h*.16,Math.max(w,h)*.76,'rgba(169,129,192,.23)');
      glow(w*.03,h*.72,Math.max(w,h)*.65,'rgba(84,114,188,.20)');
      glow(w*.62,h*.98,Math.max(w,h)*.60,'rgba(214,151,188,.10)');
      // Quiet, curved filaments give refraction something real to bend.
      // They are painted ONCE into the actual wallpaper, not over the glass.
      ctx.save();
      for(let i=0;i<6;i++) {
        const x=w*(.08+i*.18),offset=i*37;
        ctx.beginPath();
        ctx.moveTo(x-w*.44,-h*.18);
        ctx.bezierCurveTo(x+w*.18,h*.24+offset,x-w*.40,h*.56+offset,x+w*.34,h*1.12);
        ctx.strokeStyle=i%2?'rgba(236,202,233,.10)':'rgba(180,193,250,.11)';
        ctx.lineWidth=i%3===0?1.15:.68;ctx.stroke();
      }
      ctx.restore();
      // The same canvas is used by CSS and by the WebGL refraction shader.
      if(chosenImage) {
        const iw=chosenImage.naturalWidth,ih=chosenImage.naturalHeight;
        const scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
        ctx.drawImage(chosenImage,(w-dw)*.5,(h-dh)*.5,dw,dh);
        ctx.fillStyle='rgba(8,11,23,.29)';
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
        reader.onload=()=>{
          const image=new Image();
          image.onload=()=>{
            chosenImage=image;renderWallpaper();
            notify('已在本机预览背景 · 未上传');
          };
          image.onerror=()=>notify('图片无法读取');
          image.src=String(reader.result);
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
        gl.uniform1f(loc.u_shape,preset.wobble/100*.09*.25);
        gl.uniform1f(loc.u_refract,preset.refract*1.36);
        gl.uniform1f(loc.u_tint,preset.tint/100);
        gl.uniform1f(loc.u_blur,preset.blur);
        gl.uniform1f(loc.u_edge,preset.edge/100);
        gl.uniform1f(loc.u_shine,preset.shine/100);
        gl.uniform1f(loc.u_lTint,1);
        gl.uniform1f(loc.u_lBlur,1);
        gl.uniform1f(loc.u_lEdge,1);
        gl.uniform1f(loc.u_lShadow,1);
        gl.uniform1f(loc.u_lDistort,1);
        gl.uniform1f(loc.u_softBlur,isHero?1.7:0.0);
        gl.uniform3f(loc.u_color,.81,.71,.94);
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
      const selected=new Set(screen.querySelectorAll(
        '.feature-today,.composer-pane,.focus-stage,.object-overview'
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
    new MutationObserver(syncCards).observe(screen,{childList:true});
    syncCards();
    document.addEventListener('scroll',()=>{for(const o of optics.values())o.refresh();},true);
    window.addEventListener('resize',()=>{renderWallpaper();for(const o of optics.values())o.refresh();},{passive:true});
    window.addEventListener('pageshow',()=>{wallpaperLayer.style.backgroundImage='url('+JSON.stringify(bgUrl)+')';});
    if(!reduced) {
      const frame=ms=>{
        for(const optic of optics.values())optic.frame(ms);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
    window.__coveLearningGlass={
      version:'V5',mode:'opt-in',material:'Home-V5-full-surface',
      activeCards:()=>optics.size,
      isUsingPhoto:()=>Boolean(chosenImage),
      sampleSource:'same-canvas-wallpaper'
    };
  })();
}
