// App-shell cache only. API calls and video streams are never touched.
const CACHE = 'resume-shell-v18';
const SHELL = ['./', 'index.html', 'app.js', 'hls.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages sends max-age=600),
  // so a new version never gets installed with stale copies of the files.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Network first (revalidated, not served from the HTTP cache) so updates show on the
  // next open; the cached copy is only used when offline.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        // Fetch by URL: a navigation Request can't be re-used with a RequestInit
        // (that throws), which made page loads always fall back to the cache.
        const res = await fetch(req.url, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
      }
    })
  );
});
