// Story mode — the phone scene player, on a phone-sized WebKit page.
// Run: node scripts/story-scene-check.mjs   (dev server up; SKK_URL overrides :5173)
//   1. ORDER   — texts land in script order, placeholders filled, thread flips to the DM.
//   2. FIT     — no bubble wider than the phone at 390 px, none spills outside it.
//   3. TAP     — taps hurry the scene to its end; one more tap resolves it.
//   4. SKIP    — SKIP ▸ puts the last thread up at once and ends the scene.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const url = (q) => `${BASE}/?${q}&mute`; // silent runs — see round-e2e.mjs
let failures = 0;
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// 1–3: tap through
await page.goto(url('nosplash&go=storyDev'));
await page.waitForSelector('.story-scene .ss-b.show', { timeout: 15000 });
const seen = [];
for (let i = 0; i < 60; i++) {
  const ended = await page.$('.story-scene.ended');
  const texts = await page.$$eval('.story-scene .ss-b', (bs) => bs.map((b) => b.textContent));
  for (const t of texts) if (!seen.includes(t)) seen.push(t);
  if (ended) break;
  await page.mouse.click(195, 300);
  await page.waitForTimeout(150);
}
check(await page.$('.story-scene.ended') !== null, 'TAP: the scene reaches its end');
const want = [
  "yo y'all seen what the Brooklyn Bullies posted?? talmbout we only won cause it rained 😂😂",
  'they wildin',
  'a'.repeat(86),
  "we'll see saturday",
  'Brooklyn tomorrow. Bring your whole block.',
  'say less',
];
check(JSON.stringify(seen) === JSON.stringify(want), 'ORDER: every text, in order, filled', JSON.stringify(seen));
check((await page.textContent('.ss-nm')) === 'Big Mo (Brooklyn Bullies)', 'ORDER: the thread flipped to the rival DM');
check((await page.textContent('.ss-slam')) === 'GAME DAY', 'ORDER: the slam lands');
const fit = await page.$$eval('.story-scene .ss-b', (bs) => {
  const phone = document.querySelector('.ss-phone').getBoundingClientRect();
  return bs.map((b) => { const r = b.getBoundingClientRect(); return b.scrollWidth <= b.clientWidth + 1 && r.left >= phone.left - 1 && r.right <= phone.right + 1; });
});
check(fit.length > 0 && fit.every(Boolean), 'FIT: every bubble inside the phone at 390 px', JSON.stringify(fit));
await page.mouse.click(195, 300);
await page.waitForFunction(() => window.__storyScene?.done === true, null, { timeout: 3000 }).catch(() => {});
check(await page.evaluate(() => window.__storyScene?.done === true), 'TAP: one more tap resolves the scene');

// 4: skip
await page.goto(url('nosplash&go=storyDev'));
await page.waitForSelector('.story-scene .ss-skip', { timeout: 15000 });
const t0 = Date.now();
await page.click('.story-scene .ss-skip');
await page.waitForSelector('.story-scene.ended', { timeout: 4000 }).catch(() => {});
check(await page.$('.story-scene.ended') !== null && Date.now() - t0 < 4000, 'SKIP: the scene ends at once', `${Date.now() - t0} ms`);
const last = await page.$$eval('.story-scene .ss-b', (bs) => bs.map((b) => b.textContent));
check(last.includes('say less'), 'SKIP: the last thread is on screen');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
