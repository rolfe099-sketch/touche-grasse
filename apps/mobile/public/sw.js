/* Local export only. The build script supplies a content-hashed manifest. */
let cacheName;
async function manifest() {
  const data = await (await fetch('/offline-manifest.json', { cache: 'no-store' })).json();
  cacheName = 'touche-grasse-' + data.version;
  return data;
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const data = await manifest(); const cache = await caches.open(cacheName);
  await cache.addAll(data.files); await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  if (!cacheName) await manifest();
  for (const name of await caches.keys()) if (name.startsWith('touche-grasse-') && name !== cacheName) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); } catch { return await caches.match('/index.html'); }
    }
    return await caches.match(event.request) || fetch(event.request);
  })());
});
