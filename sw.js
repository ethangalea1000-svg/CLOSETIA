const CACHE="closetia-v49";
const ASSETS=["./","./index.html","./style.css?v=9","./app.js?v=49","./manifest.json"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  let requestUrl;
  try { requestUrl=new URL(request.url); } catch (_) { return; }

  // Only intercept same-origin HTTP(S) GET requests. Ignore chrome-extension:// and other
  // non-web schemes, cross-origin resources, and API responses that must never be cached.
  if(request.method!=="GET") return;
  if(requestUrl.protocol!=="http:" && requestUrl.protocol!=="https:") return;
  if(requestUrl.origin!==self.location.origin) return;
  if(requestUrl.pathname.startsWith("/api/closetia/")) return;

  event.respondWith(
    fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
      }
      return response;
    }).catch(()=>caches.match(request).then(cached=>cached||caches.match("./index.html")))
  );
});
