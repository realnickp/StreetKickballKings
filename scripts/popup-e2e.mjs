// E2E guard: every popup surface must render fully inside phone viewports
// (dev complaint 2026-07-21: popup text cut off by the screen edges).
// Drives the REAL game in Playwright WebKit (the repo's iOS-truthful harness).
// Run: node scripts/popup-e2e.mjs   (dev server must be up on :5173)
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures += 1; };

const inside = (r, w, h) => r && r.left >= -0.5 && r.top >= -0.5 && r.right <= w + 0.5 && r.bottom <= h + 0.5;

const browser = await webkit.launch();
for (const vp of [{ w: 390, h: 844 }, { w: 360, h: 780 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto(`${BASE}/?match`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.__skk && window.__skk.hud), null, { timeout: 20000 });

  const rect = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, sel);

  // longest banner string the game produces today
  await page.evaluate(() => window.__skk.hud.banner('GROUND RULE DOUBLE!', 'homer'));
  ok(inside(await rect('.cine-banner'), vp.w, vp.h), `${vp.w}w banner long-string`);

  // callouts anchored at the extreme screen edges
  for (const x of [4, vp.w - 4]) {
    await page.evaluate((px) => window.__skk.hud.callout('SEND HIM HOME RIGHT NOW', { x: px, y: 300, key: `probe${px}` }), x);
    ok(inside(await rect('.coach-callout'), vp.w, vp.h), `${vp.w}w callout at x=${x}`);
    await page.evaluate(() => window.__skk.hud.clearCallouts());
  }

  // center pop (tutorial goals) with a long tag
  await page.evaluate(() => window.__skk.hud.goalPop('PERFECT KICK ✓ 2/2'));
  ok(inside(await rect('.goal-pop span'), vp.w, vp.h), `${vp.w}w goalPop`);

  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
