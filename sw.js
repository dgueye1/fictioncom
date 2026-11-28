const CACHE='fictioncom-static-v3';
const PRECACHE=['/','/styles.css','/site.webmanifest','/favicon.svg','/icon-192.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/'))return;
  const staticAsset=/\.(?:css|js|svg|png|gif|webmanifest|xml|txt)$/.test(url.pathname);
  if(url.pathname==='/sw.js')return;
  event.respondWith((async()=>{
    try{
      const fresh=await fetch(request,{cache:'no-cache'});
      if(fresh.ok&&(staticAsset||url.pathname==='/'||url.pathname.endsWith('.html'))){
        const copy=fresh.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      }
      return fresh;
    }catch{
      const cached=await caches.match(request);
      if(cached)return cached;
      if(request.mode==='navigate')return caches.match('/')||caches.match('/index.html');
      throw new Error('offline');
    }
  })());
});
