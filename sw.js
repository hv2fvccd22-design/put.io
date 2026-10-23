// App-shell cache only. API calls and video streams are never touched.
// Bump CACHE on every release: that is what makes installed copies update.
const CACHE = 'resume-shell-v47';
// Artwork (podcast covers from put.io, IMDb posters) kept across app versions.
const IMG_CACHE = 'resume-img';
const IMG_MAX = 400;
const isArtwork = (u) => u.hostname === 'm.media-amazon.com' || u.hostname === 'static.tvmaze.com' || (u.hostname === 'api.put.io' && /^\/(screenshots|thumbnails)\//.test(u.pathname));
const SHELL = ['./', 'index.html', 'app.js', 'hls.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  // Download the whole new version at once, skipping the browser's HTTP cache (GitHub
  // Pages sends max-age=600), so a version is never a mix of old and new files.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && isArtwork(url)) { e.respondWith(artwork(req)); return; }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cache first: the app opens instantly, also offline or on a weak signal. Updates come
  // from the browser checking sw.js on each open; a new version installs in the
  // background and the page reloads into it (see controllerchange in app.js).
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req.url, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});

// Cache first for artwork; fetch and keep it the first time. Images are shown with plain
// <img>, so an opaque (no-cors) response is fine to store and serve back.
async function artwork(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    if (keys.length > IMG_MAX) await Promise.all(keys.slice(0, keys.length - IMG_MAX).map((k) => cache.delete(k)));
  }
  return res;
}
