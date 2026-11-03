// 離線快取。版本號與資源清單由 vite.config.ts 在建置時填入。
const CACHE = 'shogi-__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // Firebase 等跨網域請求不攔截

  // 頁面走網路優先，部署後能拿到新版；離線才用快取
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./', { ignoreVary: true })));
    return;
  }
  // 帶雜湊的資源永遠不變，快取優先。
  // ignoreVary：帶 crossorigin 的 script 請求有 Origin 標頭，伺服器回應若有 Vary: Origin 會比對不到
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((hit) => hit ?? fetch(request)),
  );
});
