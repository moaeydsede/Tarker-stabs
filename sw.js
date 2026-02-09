const CACHE = "med-tracker-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached=>{
      if (cached) return cached;
      return fetch(req).then(res=>{
        // Cache same-origin GET
        try{
          const url = new URL(req.url);
          if (req.method === "GET" && url.origin === location.origin){
            const clone = res.clone();
            caches.open(CACHE).then(cache=>cache.put(req, clone));
          }
        }catch(_){}
        return res;
      }).catch(()=>caches.match("./index.html"));
    })
  );
});

self.addEventListener("notificationclick", (event)=>{
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients)=>{
      for (const c of clients){
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
