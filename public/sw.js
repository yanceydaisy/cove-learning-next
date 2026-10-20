const NAME='cove-learning-v0.72-20261020-ephemeris-now';
const SHELL=['./','./style.css','./app.js','./trace-dial.html','./trace-dial.css?v=ephemeris-now-1','./trace-dial.js?v=ephemeris-now-1','./icon.svg','./icon-192.png','./icon-512.png','./assets/trace/trace-minute-dark.webp','./assets/trace/trace-hour-dark.webp','./assets/trace/trace-minute-light.webp','./assets/trace/trace-hour-light.webp'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(NAME).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cove-learning-')&&k!==NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('./')));return;}
 event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(NAME).then(c=>c.put(request,copy)));}return response;}).catch(()=>caches.match(request)));
});
