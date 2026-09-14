import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// public/sw.js runs as a classic worker script. Load it into a sandbox with a
// fake `self` / `caches` / `fetch` so its fetch and activate handlers can be
// driven directly. Behaviours under test (2026-09-12 Phase 0):
//  - big media (video, models, mocap packs, music) is served network-first but
//    NEVER copied into the cache — Safari evicts an origin's storage wholesale
//    once it crosses quota, and the localStorage save goes with it;
//  - the cache is versioned and old versions are deleted on activate, so a
//    deploy does not stack every previous build's hashed chunks forever.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, '../public/sw.js'), 'utf8');

function loadWorker() {
  const handlers = {};
  const stores = new Map(); // cacheName -> Map(url -> response)
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { async put(req, res) { store.set(req.url, res); }, async match(req) { return store.get(req.url) ?? undefined; } };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(req) { for (const s of stores.values()) if (s.has(req.url)) return s.get(req.url); return undefined; },
  };
  const self = {
    addEventListener(ev, fn) { handlers[ev] = fn; },
    skipWaiting() {}, clients: { claim() { return Promise.resolve(); } },
  };
  const okResponse = (url) => ({ status: 200, type: 'basic', url, clone() { return { ...this }; } });
  const fetch = async (req) => okResponse(req.url);
  new Function('self', 'caches', 'fetch', src)(self, caches, fetch);
  return { handlers, stores, caches };
}

function runFetch(w, url, method = 'GET') {
  let promise = null;
  w.handlers.fetch({ request: { url, method }, respondWith(p) { promise = p; } });
  return promise;
}

it('leaves a video to the network (natively, or served through) and never copies it into the cache', async () => {
  const w = loadWorker();
  const res = await runFetch(w, 'https://skk.app/assets/video/backdrop-block-party.mp4');
  await new Promise((r) => setTimeout(r, 0));
  // either the worker stays out of the way (no respondWith → the browser's own
  // network path, which is what iOS Range requests want) or it passes a 200 through
  expect(res === null || res?.status === 200).toBe(true);
  const cached = [...w.stores.values()].some((s) => s.has('https://skk.app/assets/video/backdrop-block-party.mp4'));
  expect(cached).toBe(false);
});

it('leaves character models, mocap packs and music out of the cache too', async () => {
  const w = loadWorker();
  for (const u of ['https://skk.app/assets/models/archetypes/arch-locs.glb', 'https://skk.app/assets/anims/mocap-locs.glb', 'https://skk.app/assets/audio/music/city/new-york.m4a']) {
    await runFetch(w, u);
  }
  await new Promise((r) => setTimeout(r, 0));
  expect([...w.stores.values()].reduce((n, s) => n + s.size, 0)).toBe(0);
});

it('still caches the app shell (hashed JS/CSS) for offline launches', async () => {
  const w = loadWorker();
  await runFetch(w, 'https://skk.app/assets/index-abc123.js');
  await new Promise((r) => setTimeout(r, 0));
  expect([...w.stores.values()].some((s) => s.has('https://skk.app/assets/index-abc123.js'))).toBe(true);
});

it('activate deletes caches from previous versions', async () => {
  const w = loadWorker();
  await w.caches.open('skk-v1');
  await w.caches.open('skk-old-build');
  let done = null;
  w.handlers.activate({ waitUntil(p) { done = p; } });
  await done;
  const left = await w.caches.keys();
  expect(left.some((n) => n === 'skk-v1' || n === 'skk-old-build')).toBe(false);
});
