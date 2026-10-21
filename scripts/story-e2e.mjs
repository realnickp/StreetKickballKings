// Story mode, end to end, on a phone-sized WebKit page (silent: ?mute).
// Run: node scripts/story-e2e.mjs   (dev server up; SKK_URL overrides :5173)
//   1. MENU     — STORY sits where RUN THE MAP was; NEW CREW with no save.
//   2. CREATE   — one name, a swatch, a mark → the story is saved, 8 block players.
//   3. INTRO    — the prologue + East opener play, then the hub: rung 1 vs the East's first crew.
//   4. TRAIN    — the crew room's + spends exactly trainCost and raises the stat.
//   5. WIN      — a forced win pays 60, climbs to rung 2, the recruit card puts a rival on your crew.
//   6. QUIT     — start the real rung-2 game, pause → MAIN MENU: the climb is untouched.
//   7. CLIMB    — force the rest (with a semi loss + a final loss): King, kingOfStreets, Gold Crowns.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const url = (q) => `${BASE}/?${q}&mute`;
let failures = 0;
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const missing = [];
page.on('response', (r) => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });

const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('skk-save-v1') || '{}'));
/** Tap through every story scene on screen until `until` shows up. */
async function drain(until, max = 400) {
  for (let i = 0; i < max; i++) {
    if (await page.$(until)) return true;
    const skip = await page.$('.story-scene:not(.ended) .ss-skip');
    if (skip) await skip.click().catch(() => {});
    else if (await page.$('.story-scene.ended')) await page.mouse.click(195, 420);
    else if (await page.$('.skip-hint')) await page.mouse.click(195, 420); // a crew's intro film
    else if (await page.$('[data-call="heads"]')) await page.click('[data-call="heads"]').catch(() => {}); // the coin toss
    else if (await page.$('[data-first]')) await page.click('[data-first]').catch(() => {});
    await page.waitForTimeout(120);
  }
  return !!(await page.$(until));
}

await page.goto(url('nosplash&storydev'));
await page.evaluate(() => localStorage.setItem('skk-save-v1', JSON.stringify({ tutorialPlayed: true, crowns: 500 })));
await page.goto(url('nosplash&storydev&go=menu'));
await page.waitForSelector('.story-card', { timeout: 15000 });

// 1. MENU
check((await page.textContent('.story-card small')) === 'NEW CREW', 'MENU: STORY card reads NEW CREW');
check(!(await page.textContent('.menu-screen')).includes('RUN THE MAP'), 'MENU: RUN THE MAP is gone');

// 2. CREATE
await page.click('.story-card');
await page.waitForSelector('.create-crew', { timeout: 5000 });
check(await page.$eval('.cc-go', (b) => b.disabled), 'CREATE: no name, no go');
await page.fill('.cc-input', 'eastside kings');
await page.click('.cc-sw:nth-child(3)');
await page.click('.cc-mk:nth-child(5)');
check((await page.textContent('.cc-name')) === 'EASTSIDE KINGS', 'CREATE: the badge shows the cleaned name');
await page.click('.cc-go');
await page.waitForTimeout(400);
let sv = await save();
check(sv.story?.crew?.name === 'EASTSIDE KINGS' && sv.story.crew.mark === 'mark-05' && sv.story.roster.length === 8,
  'CREATE: story saved with the crew and 8 block players', JSON.stringify(sv.story?.crew));

// 3. INTRO → HUB
check(await drain('.story-hub .sh-card'), 'INTRO: scenes play through to the hub');
sv = await save();
check(sv.story.seen.includes('prologue') && sv.story.seen.includes('east-open'), 'INTRO: prologue + east-open marked seen');
const stage = await page.textContent('.sh-card .sh-stage');
check(stage === 'RUNG 1 OF 5', 'HUB: rung 1 of 5', stage);
check((await page.textContent('.sh-card b')) === 'NEW YORK SNAPPERS', 'HUB: first up, the Snappers');

// 4. TRAIN
await page.click('[data-act="crew"]');
await page.waitForSelector('.crew-room .cr-up', { timeout: 5000 });
const before = await save();
const first = await page.$('.crew-room .cr-up:not([disabled])');
const cost = Number((await first.textContent()).replace(/\D/g, ''));
await first.click();
await page.waitForTimeout(200);
const after = await save();
const statsSum = (s) => s.story.roster.reduce((a, p) => a + p.stats.power + p.stats.speed + p.stats.arm + p.stats.glove, 0);
check(before.crowns - after.crowns === cost && statsSum(after) === statsSum(before) + 1, 'TRAIN: + costs trainCost, +1 stat', `cost ${cost}`);
await page.click('[data-act="back"]');
await page.waitForSelector('.story-hub', { timeout: 5000 });

// 5. WIN
const coins0 = (await save()).crowns;
await page.evaluate(() => window.__story.forceResult(true));
await page.waitForSelector('.postgame-screen', { timeout: 5000 });
await page.click('[data-act="go"]');
check(await drain('.recruit-card'), 'WIN: the recruit card comes up after the scenes');
const recruitName = await page.textContent('.rc-name');
await page.click('.rc-bench .cr-chip:nth-child(2)');
await drain('.story-hub .sh-card');
sv = await save();
check(sv.crowns - coins0 === 60, 'WIN: a ladder win pays 60', `${sv.crowns - coins0}`);
check(sv.story.rung === 1 && sv.story.beaten.includes('snappers'), 'WIN: on to rung 2');
check(sv.story.roster[1].nick === recruitName && sv.story.roster[1].from === 'snappers' && sv.story.bench.length === 1, 'WIN: the recruit took slot 2, one on the bench', recruitName);

// 6. QUIT mid-match
const story0 = JSON.stringify((await save()).story);
await page.click('.sh-play', { force: true }); // it bounces to the beat — never 'stable'
const inMatch = await drain('.pause-btn[style*="flex"]', 900);
check(inMatch, 'QUIT: the rung-2 match starts (before-scene, then the game)');
if (inMatch) {
  await page.waitForTimeout(1500);
  await page.click('.pause-btn');
  await page.click('.p-menu');
  await page.waitForSelector('.story-card', { timeout: 8000 });
  check(JSON.stringify((await save()).story) === story0, 'QUIT: the climb is untouched');
  check(await page.evaluate(() => window.__story.ctx.storyStop === null), 'QUIT: no story game left armed');
  check((await page.textContent('.story-card small')) === 'THE EAST · RUNG 2/5', 'QUIT: the menu card reads rung 2');
}

// 7. CLIMB — every remaining game, a semi loss and a final loss on the way
await page.goto(url('nosplash&storydev&go=storyHub'));
await page.waitForSelector('.story-hub .sh-card', { timeout: 15000 }).catch(() => {});
const results = [];
for (let r = 0; r < 5; r++) {
  results.push(...Array(r === 0 ? 4 : 5).fill(true)); // ladder (rung 1 already won)
  if (r === 0) results.push(false); // semi loss
  results.push(true);                // semi
  if (r === 0) results.push(false); // final loss → back to the semi
  if (r === 0) results.push(true);  // semi again
  results.push(true);                // final
}
results.push(...Array(5).fill(true)); // nationals
let stuck = false;
for (const won of results) {
  await drain('.story-hub', 600);
  await page.evaluate((w) => window.__story.forceResult(w), won);
  if (!(await page.waitForSelector('.postgame-screen', { timeout: 5000 }).catch(() => null))) { stuck = true; break; }
  await page.click('[data-act="go"]');
  for (let i = 0; i < 600; i++) {
    if (await page.$('.story-hub')) break;
    if (await page.$('.recruit-card')) { await page.click('[data-act="no"]'); continue; }
    const skip = await page.$('.story-scene:not(.ended) .ss-skip');
    if (skip) await skip.click().catch(() => {});
    else if (await page.$('.story-scene.ended')) await page.mouse.click(195, 420);
    else if (await page.$('.postgame-screen [data-act="go"]')) await page.click('.postgame-screen [data-act="go"]');
    await page.waitForTimeout(100);
  }
}
await drain('.story-hub', 600);
sv = await save();
check(!stuck, 'CLIMB: every result settled');
check(sv.story?.king === true, 'CLIMB: King of the Court', JSON.stringify({ region: sv.story?.region, rung: sv.story?.rung, phase: sv.story?.phase }));
check(sv.kingOfStreets === true && (sv['gear.unlocked'] ?? []).includes('cleats-gold'), 'CLIMB: the King gear unlocked');
check(Object.keys(sv.story?.finals ?? {}).length === 5, 'CLIMB: five regional finals on record');
check(sv.story?.seen?.includes('nationals-open'), 'CLIMB: Nationals opened on the hub');
const label = await page.textContent('.sh-card small').catch(() => '');
check(label === '👑 KING OF THE COURT', 'CLIMB: the hub crowns you', label);

const realMissing = [...new Set(missing)];
console.log('404s:', realMissing.length ? realMissing.join(', ') : 'none');
check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
