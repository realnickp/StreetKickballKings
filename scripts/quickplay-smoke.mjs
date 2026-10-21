// Quick Play still starts a real match after the story round (silent: ?mute).
// Run: node scripts/quickplay-smoke.mjs   (dev server up; SKK_URL overrides :5173)
// PLAY 1v1 → SET THE MATCHUP → START → GEAR UP → PLAY → coin toss → the match is live.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const url = (q) => `${BASE}/?${q}&mute`;
let failures = 0;
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url('nosplash'));
await page.evaluate(() => localStorage.setItem('skk-save-v1', JSON.stringify({ tutorialPlayed: true, 'gearup.seen': true })));
await page.goto(url('nosplash&go=menu'));
await page.waitForSelector('.big-play', { timeout: 15000 });
await page.click('.big-play', { force: true });
await page.waitForSelector('.m-start', { timeout: 8000 });
await page.click('.m-start', { force: true });
await page.waitForSelector('.locker-play', { timeout: 15000 });
await page.click('.locker-play', { force: true });
// intro films (skippable) → logo clash → coin toss
let tossed = false;
for (let i = 0; i < 300 && !tossed; i++) {
  if (await page.$('.flow-error')) break;
  if (await page.$('.coin-buttons [data-call]')) { await page.click('[data-call="heads"]'); tossed = true; break; }
  const skip = await page.$('.skip-hint');
  if (skip) await page.mouse.click(195, 420);
  await page.waitForTimeout(200);
}
check(!(await page.$('.flow-error')), 'no COULDN\'T LOAD card');
check(tossed, 'the coin toss comes up');
for (let i = 0; i < 50; i++) {
  const first = await page.$('[data-first]');
  if (first) { await first.click(); break; }
  if (await page.$('.pause-btn[style*="flex"]')) break;
  await page.waitForTimeout(200);
}
await page.waitForSelector('.pause-btn[style*="flex"]', { timeout: 15000 }).catch(() => {});
check(!!(await page.$('.pause-btn[style*="flex"]')), 'the match is live (pause button up)');
check(await page.evaluate(() => window.__skk?.useStats === false), 'Quick Play: stats stay off');
check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
