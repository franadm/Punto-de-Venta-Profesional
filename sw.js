/* Service worker - Sistema de Ventas
   Objetivo: que la app abra SIEMPRE, con o sin internet.
   - Al instalarse descarga la app completa (index.html es obligatorio).
   - Al abrir responde desde la copia local al instante y, si hay internet, la actualiza en segundo plano.
   - Limpia respuestas con redirección (Safari las rechaza cuando vienen del caché). */
const CACHE = 'sv-v2.3.0';
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
const EXTRA = ['manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'].map(u => new URL(u, SCOPE).href);

async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, {status: res.status, statusText: res.statusText, headers: res.headers});
}
async function fetchFresh(url) {
  const res = await fetch(new Request(url, {cache: 'reload'}));
  if (!res.ok) throw new Error(url + ' ' + res.status);
  return clean(res);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.put(INDEX, await fetchFresh(INDEX));                       // obligatorio: si falla, no se instala
    await Promise.all(EXTRA.map(u => fetchFresh(u).then(r => c.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function handleNav(e) {
  const c = await caches.open(CACHE);
  const cached = await c.match(INDEX);
  const update = fetchFresh(INDEX).then(r => c.put(INDEX, r)).catch(() => {});
  if (cached) { e.waitUntil(update); return cached; }
  try { return await fetch(e.request); }
  catch (_) { return new Response('Sin conexión. Abrí la app una vez con internet para activarla.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}); }
}
async function handleAsset(e) {
  const c = await caches.open(CACHE);
  const cached = await c.match(e.request, {ignoreSearch: true});
  const net = fetch(e.request).then(async r => { if (r && r.ok) await c.put(e.request, (await clean(r)).clone()); return r; }).catch(() => null);
  if (cached) { e.waitUntil(net); return cached; }
  return (await net) || new Response('', {status: 504});
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(req.mode === 'navigate' ? handleNav(e) : handleAsset(e));
});
