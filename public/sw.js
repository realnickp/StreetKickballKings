// Service worker so the game is installable / works from the home screen.
// Network-first (so a deploy update shows up), cache fallback (so the app
// shell still opens offline once fetched).
//
// WHAT IS NOT CACHED, ON PURPOSE (Phase 0, 2026-09-12): the big media. The
// first version copied every 200 GET into one cache with no cap — 227 MB of
// backdrop video, 73 MB of character models, 49 MB of mocap packs, 64 MB of
// portraits, the music — and Safari evicts an origin's storage WHOLESALE once
// it crosses quota, taking the localStorage save with it. Those requests are
// left to the browser entirely (no respondWith), which also keeps iOS's Range
// requests for <video> on the native path. The cache holds the app shell and
// the small stuff: index, hashed JS/CSS, icons, logos, SFX, booth lines.
//
// The cache name is VERSIONED and old versions are deleted on activate, so a
// deploy no longer stacks every previous build's hashed chunks forever.
const CACHE = 'skk-v2';
const NEVER_CACHE = /\/assets\/(video|models|anims|players|audio\/music)\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  if (NEVER_CACHE.test(req.url)) return; // straight to the network, never stored
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
