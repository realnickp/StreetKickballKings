// E2E for the Phase 1 diet + device-tier round (2026-09-22). Drives the REAL
// game in Playwright WebKit (default, iPhone 14 profile) or Chromium
// (BROWSER=chromium, the Android stand-in).
// Run: node scripts/with-dev.mjs scripts/phase1-e2e.mjs
//   SHOTS=<dir> also saves screenshots of the live match per tier + team select.
//
// Scenarios:
//   1. TIER LOW    — ?tier=low: no MSAA, no bloom pass, DPR ≤ 1.5, 1024²
//                    shadows, PCFShadowMap, NO backdrop video elements, and the
//                    poster still lands on the front ring.
//   2. TIER HIGH   — ?tier=high: 4× MSAA, bloom in the chain, both loops.
//   3. TIER DEFAULT— the profile's own answer (WebKit iPhone 14 → mid → one
//                    loop; Chromium desktop UA → high → two).
//   4. RENDER GATE — on the menu the composer stops drawing (render.frame
//                    holds) while frame callbacks keep ticking; in a live
//                    match it draws.
//   5. TEXTURE BUDGET — a live match's textures sum ≤ 190 MB (was 242-267).
//   6. SHADOW BUDGET — ≤ tier.casters characters cast shadows.
//   7. FONTS       — no request leaves for fonts.googleapis.com / gstatic.
//   8. PORTRAITS   — team select shows .webp portraits that decoded.
//   9. BUILD STALL (Chromium only) — longest long task during the match
//                    build is printed; none ≥ 1000 ms.
import { webkit, chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const which = process.env.BROWSER ?? 'webkit';
const url = (q) => `${BASE}/?${q}`;
const SHOTS = process.env.SHOTS ?? '';
// ONLY=tiers,gate,budget,fonts,stall runs a subset (a long WebKit run can be split)
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (name) => !ONLY.length || ONLY.includes(name);
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`PASS  ${label}`); } else { fail++; console.log(`FAIL  ${label}`); } return !!cond; };

async function poll(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(100);
  }
  console.log(`TIMEOUT  ${label}`);
  return null;
}
async function bootMatch(page, q) {
  await page.goto(url(q), { waitUntil: 'domcontentloaded' });
  if (!(await poll(page, () => !!window.__skk, 150000, 'scene boot'))) throw new Error('scene never booted');
  await page.evaluate(() => { window.__skk.engine.paused = false; });
  await poll(page, () => !window.__skk.walkoutActive && ['SETUP', 'PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 60000, 'first at-bat');
}
const tierState = () => ({
  name: window.__engine.tier.name, samples: window.__engine.samples, tierMsaa: window.__engine.tier.msaa,
  passes: window.__engine.composer.passes.map((p) => p.constructor.name),
  // identity, not the class name: the production bundle is minified (pg/e/_g)
  bloomIn: window.__engine.composer.passes.includes(window.__engine.fx.bloomPass),
  dpr: window.__engine.renderer.getPixelRatio(),
  shadowType: window.__engine.renderer.shadowMap.type,
  shadowMap: window.__skk.field.sun.shadow.mapSize.x,
  videoMode: window.__skk.field.videoMode,
  videos: window.__skk.field._videoHooks.length,
  frontMap: (() => { const b = window.__skk.field.backdrop; const m = (b.children?.[0] ?? b).material; return !!m.map; })(),
});

async function tierScenario(page, tier, expect) {
  console.log(`\n--- TIER ${tier ?? 'DEFAULT'} ---`);
  await bootMatch(page, `match&mute&nosplash${tier ? `&tier=${tier}` : ''}`);
  await page.waitForTimeout(2500); // poster/video swap window
  const s = await page.evaluate(tierState);
  console.log('  ', JSON.stringify(s));
  if (tier) ok(s.name === tier, `tier is ${tier}`);
  else ok(s.name === expect.name, `default tier in this profile is ${expect.name} (${s.name})`);
  // the TIER's answer is under test; the PerfWatchdog (its own unit tests) only ever
  // steps DOWN from it, and under WebKit's software renderer it does so during the boot
  ok(s.tierMsaa === expect.msaa && s.samples <= expect.msaa, `tier MSAA ${expect.msaa}, composer at or below it (tier ${s.tierMsaa}, samples ${s.samples})`);
  ok(s.bloomIn === expect.bloom, `bloom ${expect.bloom ? 'in' : 'out of'} the chain (${s.passes.length} passes: ${s.passes.join(',')})`);
  ok(s.dpr <= expect.dpr + 1e-6, `pixel ratio ≤ ${expect.dpr} (${s.dpr})`);
  ok(s.shadowMap === expect.shadowMap, `shadow map ${expect.shadowMap} (${s.shadowMap})`);
  ok(s.shadowType === 1, `PCFShadowMap (${s.shadowType})`);
  ok(s.videos === expect.videos, `${expect.videos} backdrop video element(s) (${s.videos}, mode ${s.videoMode})`);
  ok(s.frontMap, 'the front ring has a texture (poster or video) after load');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phase1-${which}-tier-${s.name}.png` });
}

async function renderGateScenario(page) {
  console.log('\n--- RENDER GATE ---');
  await page.goto(url('nosplash&go=menu&mute'), { waitUntil: 'domcontentloaded' });
  if (!ok(!!(await poll(page, () => !!window.__engine?.composer, 20000, 'engine')), 'engine up on the menu')) return;
  // past the gate's two settle frames — under WebKit's software renderer a frame
  // is ~250 ms, and `info.render.frame` counts every internal pass (~16 per
  // composer frame), so sampling inside the settle window reads as "still drawing"
  await page.waitForTimeout(2500);
  const a = await page.evaluate(() => ({ covered: window.__engine.covered, frame: window.__engine.renderer.info.render.frame }));
  await page.waitForTimeout(1000);
  const b = await page.evaluate(async () => {
    let cbs = 0; const off = window.__engine.onFrame(() => { cbs += 1; });
    await new Promise((r) => setTimeout(r, 500)); off();
    return { covered: window.__engine.covered, frame: window.__engine.renderer.info.render.frame, cbs };
  });
  ok(a.covered && b.covered, 'the menu covers the canvas');
  ok(b.frame === a.frame, `composer frames hold on the menu (${a.frame} -> ${b.frame})`);
  ok(b.cbs > 5, `frame callbacks keep ticking under the cover (${b.cbs} in 0.5 s)`);
  await bootMatch(page, 'match&mute&nosplash');
  const c = await page.evaluate(() => window.__engine.renderer.info.render.frame);
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => ({ covered: window.__engine.covered, frame: window.__engine.renderer.info.render.frame }));
  ok(!d.covered && d.frame > c, `a live match draws (${c} -> ${d.frame})`);
}

async function budgetScenario(page) {
  console.log('\n--- TEXTURE + SHADOW BUDGET ---');
  await bootMatch(page, 'match&mute&nosplash');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const seen = new Map();
    window.__engine.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) for (const k of Object.keys(m)) { const t = m[k]; if (t?.isTexture && t.image && !seen.has(t.uuid)) seen.set(t.uuid, t); }
    });
    let bytes = 0, count = 0, big = 0;
    for (const t of seen.values()) {
      const im = t.image; const w = im.videoWidth || im.width || 0, h = im.videoHeight || im.height || 0;
      if (!w || !h) continue;
      count += 1; bytes += w * h * 4 * 1.33;
      // recolour canvases only — the two backdrop POSTERS are 1248×1664 JPEGs by design
      if (im.tagName === 'CANVAS' && Math.max(w, h) > 1024) big += 1;
    }
    const chars = [...window.__skk.chars.home, ...window.__skk.chars.away];
    let casting = 0; // CHARACTERS with any casting mesh (a body plus its bands is one character)
    for (const c of chars) { let any = false; c.group.traverse((o) => { if (o.isMesh && o.castShadow) any = true; }); if (any) casting += 1; }
    return { mb: bytes / 1048576, count, big, casting, casters: window.__engine.tier.casters, glTextures: window.__engine.renderer.info.memory.textures };
  });
  console.log('  ', JSON.stringify({ ...r, mb: +r.mb.toFixed(1) }));
  // was 242-267 MB measured live with seven 2048² atlases (audit §02 B); sixteen
  // 1024² atlases ≈ 90 MB + 32 decal canvases ≈ 45 MB + two posters ≈ 22 MB + field
  ok(r.mb <= 190, `scene textures ≤ 190 MB (${r.mb.toFixed(1)} MB across ${r.count} textures, GL count ${r.glTextures})`);
  ok(r.big === 0, `no recolour canvas above 1024² (${r.big})`);
  ok(r.casting <= r.casters, `≤ ${r.casters} characters cast shadows (${r.casting})`);
}

async function fontsAndPortraitsScenario(page) {
  console.log('\n--- FONTS + PORTRAITS ---');
  const external = [];
  const onReq = (req) => { if (/fonts\.googleapis|fonts\.gstatic/.test(req.url())) external.push(req.url()); };
  page.on('request', onReq);
  await page.goto(url('nosplash&go=teamSelect&mute'), { waitUntil: 'domcontentloaded' });
  await poll(page, () => !!document.querySelector('.m-player.man')?.complete, 20000, 'portraits');
  await page.waitForTimeout(800);
  page.off('request', onReq);
  ok(external.length === 0, `no Google Fonts requests (${external.length})`);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('.m-player')].map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
  ok(imgs.length >= 2 && imgs.every((i) => /\.webp$/.test(i.src)), `portraits are .webp (${imgs.map((i) => i.src).join(', ')})`);
  ok(imgs.every((i) => i.w > 0), `portraits decoded (${imgs.map((i) => i.w).join(', ')})`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phase1-${which}-teamselect.png` });
}

async function buildStallScenario(page) {
  if (which !== 'chromium') return;
  console.log('\n--- BUILD STALL (long tasks) ---');
  // Two phases. BUILD = everything before the scene exists: GLB fetch, the
  // sixteen recolours (the audit's 14 s stall, B15), the field. AFTER = the
  // prewarm's one synchronous compile + draw of all sixteen rigs and the first
  // frames — under Chromium's swiftshader that is CPU shader work a phone's GPU
  // driver does in tens of ms, so it is REPORTED, not asserted.
  await page.addInitScript(() => {
    window.__long = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ d: e.duration, at: e.startTime }); }).observe({ type: 'longtask', buffered: true }); } catch { /* fine */ }
    const t = setInterval(() => { if (window.__skk && !window.__skkAt) { window.__skkAt = performance.now(); clearInterval(t); } }, 20);
  });
  await bootMatch(page, 'match&mute&nosplash');
  const r = await page.evaluate(() => {
    const at = window.__skkAt ?? Infinity;
    const build = window.__long.filter((e) => e.at < at).map((e) => e.d), after = window.__long.filter((e) => e.at >= at).map((e) => e.d);
    return { build: Math.max(0, ...build), nBuild: build.length, after: Math.max(0, ...after), nAfter: after.length, warmMs: window.__engine.prewarmStats?.warmMs ?? null };
  });
  console.log(`   longest task during the BUILD: ${r.build.toFixed(0)} ms (${r.nBuild} long tasks); after the scene exists: ${r.after.toFixed(0)} ms (${r.nAfter}; the prewarm's staged warm took ${r.warmMs} ms)`);
  ok(r.build < 1000, `no single build task ≥ 1 s (${r.build.toFixed(0)} ms)`);
}

(async () => {
  const browser = await (which === 'chromium' ? chromium : webkit).launch({ headless: true, args: which === 'chromium' ? ['--mute-audio'] : [] });
  // iPhone 14, not 13: Playwright's iPhone 13 descriptor carries an "iPhone OS
  // 15_0" UA, which the tier rule (rightly) reads as an old phone → low. The
  // iPhone 14 descriptor says 16_0 at 390 CSS px → mid, the real-iPhone default.
  const ctx = await browser.newContext(which === 'webkit' ? { ...devices['iPhone 14'] } : { viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  try {
    if (want('tiers')) {
      await tierScenario(page, 'low', { msaa: 0, bloom: false, dpr: 1.5, shadowMap: 1024, videos: 0 });
      await tierScenario(page, 'high', { msaa: 4, bloom: true, dpr: 2, shadowMap: 2048, videos: 2 });
      await tierScenario(page, null, which === 'webkit'
        ? { name: 'mid', msaa: 2, bloom: true, dpr: 2, shadowMap: 1024, videos: 1 }
        : { name: 'high', msaa: 4, bloom: true, dpr: 2, shadowMap: 2048, videos: 2 });
    }
    if (want('gate')) await renderGateScenario(page);
    if (want('budget')) await budgetScenario(page);
    if (want('fonts')) await fontsAndPortraitsScenario(page);
    if (want('stall')) await buildStallScenario(page);
  } catch (e) { fail++; console.log('HARNESS ERROR', e); }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
