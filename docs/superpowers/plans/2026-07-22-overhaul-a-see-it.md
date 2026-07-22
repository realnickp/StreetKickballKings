# Fun Overhaul Pillar A — SEE IT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game bright, and make every popup/HUD element legible and fully on-screen on a phone — the presentation floor the rest of the round builds on.

**Architecture:** Small, surgical edits to the existing render grade (`src/engine/renderer.js`), field light presets (`src/game/field.js`), HUD (`src/ui/screens/hud.js` + `src/ui/ui.css`). One new e2e guard script following the `scripts/pickle-e2e.mjs` Playwright-WebKit pattern. No new subsystems.

**Tech Stack:** Three.js (ACES tone mapping, EffectComposer), vanilla DOM HUD, Playwright WebKit e2e probes, vitest (engines only — no DOM env, so UI verification is e2e + real play).

## Global Constraints

- Every feature must pass the phone-player test: how do I LEARN it, SEE it, FEEL it (spec design law).
- All popup text must fit fully inside a 360×780 viewport (dev complaint: text cut off at screen edges).
- No persistent per-frame allocations in FX/HUD paths (mobile frame-rate guard).
- Gate on `npx vitest run` EXIT CODE, never on grep of output.
- Real-play verification per the verify-by-real-play rule (claude-in-chrome on the dev server; occluded-window rAF throttle → pump `window.__skk`).
- Deploys are gated: merge only after verification; the dev authorizes prod deploy with "push".

---

### Task 1: Brightness grade — exposure, saturation, bloom guard

**Files:**
- Modify: `src/engine/renderer.js` (GradeShader block lines ~14-43, createEngine lines ~45-51, bloom line ~75)

**Interfaces:**
- Produces: brighter default grade; `GradeShader.uniforms.sat` (float, 1.0 = neutral) available to the cinematic director like `vignette`/`caAmount` already are.

- [ ] **Step 1: Set tone-mapping exposure**

In `createEngine`, directly under `renderer.toneMapping = THREE.ACESFilmicToneMapping;` add:

```js
  // ACES at default exposure reads muddy on phones — lift the whole image.
  // Dev directive 2026-07-21: "the graphics need to be brighter."
  renderer.toneMappingExposure = 1.22;
```

- [ ] **Step 2: Add saturation to the grade pass**

In `GradeShader.uniforms` add:

```js
    sat: { value: 1.12 },
```

In the fragment shader, declare `uniform float sat;` beside the other uniforms, and after `vec3 col = vec3(r, gb);` insert (before the vignette line):

```glsl
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, sat);
```

- [ ] **Step 3: Guard the bloom threshold**

Exposure lift pushes more pixels past the bloom threshold (see the env-map comment in this file — "everything glowed"). Change the UnrealBloomPass construction from threshold `0.95` to `1.0`:

```js
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.4, 1.0);
```

- [ ] **Step 4: Run existing tests (no regression)**

Run: `npx vitest run` — expect exit code 0 (renderer isn't unit-covered; this catches accidental import breakage).

- [ ] **Step 5: Visual check on dev server**

Start `npm run dev`; via claude-in-chrome load `http://localhost:5173/?match` and screenshot. Expect a visibly brighter field vs prod; no all-over glow (if surfaces bloom, raise threshold to 1.05, not lower exposure).

- [ ] **Step 6: Commit**

```bash
git add src/engine/renderer.js
git commit -m "feat(see-it): brighter grade - exposure 1.22, +12% saturation, bloom threshold guard"
```

### Task 2: Punch up the dim field light presets

**Files:**
- Modify: `src/game/field.js` (SKY preset table, lines ~20-29)

**Interfaces:**
- Consumes: Task 1's global exposure (do this AFTER Task 1 so you're not compensating twice).

- [ ] **Step 1: Raise the night/dim presets**

In the preset table change ONLY these values (day/overcast/winter/golden-hour/desert-sunset get enough from global exposure):

| preset | hemiI | ambI |
|---|---|---|
| `sodium-night` | 1.3 → 1.5 | 0.4 → 0.46 |
| `dusk` | 1.35 → 1.45 | unchanged |
| `neon-night` | 1.3 → 1.5 | 0.4 → 0.46 |
| `shaft-light` | 1.25 → 1.45 | 0.3 → 0.36 |
| `stadium-night` | 1.35 → 1.5 | 0.4 → 0.46 |

- [ ] **Step 2: Screenshot the night fields**

Via claude-in-chrome, load `?match&field=<id>` for one field per changed preset (find field→preset mapping in `src/data/fields.json` / `field.js`) and screenshot from the match camera. Expect: characters readable, court surface no longer murky, no blown highlights.

- [ ] **Step 3: Run tests + commit**

Run: `npx vitest run` → exit 0.

```bash
git add src/game/field.js
git commit -m "feat(see-it): lift night-preset light intensities"
```

### Task 3: Popup containment — nothing renders off-screen

**Files:**
- Modify: `src/ui/screens/hud.js` (`banner()` ~line 492, `callout()` ~line 322, `goalPop()` ~line 358)
- Modify: `src/ui/ui.css` (`.cine-banner` block ~line 523)

**Interfaces:**
- Produces: `hud._fitText(el, { minPx })` — shrinks an element's font until its box fits the HUD width. Used by every popup surface; later pillars (intro cards, payoff banners) MUST call it too.

- [ ] **Step 1: Add the fit helper to Hud**

The root cause of the dev's cut-off text: `.cine-banner` is `white-space: nowrap` at `clamp(34px, 12cqw, 72px)` — "GROUND RULE DOUBLE!"-length strings overflow both edges of a 390px phone. Add to `hud.js` beside `banner()`:

```js
  /** Shrink a popup's font until its box fits on screen (phones: long banner
   *  strings overflowed both edges). Keeps the one-line slam look intact. */
  _fitText(el, { minPx = 14, pad = 16 } = {}) {
    const max = this.el.getBoundingClientRect().width - pad;
    let size = parseFloat(getComputedStyle(el).fontSize);
    let guard = 24;
    while (guard-- > 0 && size > minPx && el.getBoundingClientRect().width > max) {
      size *= 0.92;
      el.style.fontSize = `${size}px`;
    }
  }
```

- [ ] **Step 2: Apply in banner()**

In `banner()`, after `b.textContent = text;` and the class assignment, add:

```js
    b.style.fontSize = ''; // re-measure from the CSS clamp each time
    this._fitText(b);
```

- [ ] **Step 3: Apply in callout() and goalPop()**

In `callout()` the horizontal clamp exists but can't help once the bubble is wider than the screen. Before the `const half = ...` measurement line add:

```js
    this._fitText(b, { minPx: 12, pad: 20 });
```

In `goalPop()` after appending the text span add:

```js
    this._fitText(s, { minPx: 18 });
```

- [ ] **Step 4: CSS belt-and-suspenders**

In `.cine-banner` add:

```css
  max-width: calc(100% - 10px);
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/hud.js src/ui/ui.css
git commit -m "fix(see-it): popup text always fits the phone screen - shared fitText on banner/callout/goalPop"
```

### Task 4: Popup containment e2e guard

**Files:**
- Create: `scripts/popup-e2e.mjs` (modeled on `scripts/pickle-e2e.mjs`)
- Modify: `src/game/matchScene.js` (only if `window.__skk` doesn't already expose `hud` — grep `__skk` there and add `hud` to the debug object if missing)

**Interfaces:**
- Consumes: `hud.banner(text, kind)`, `hud.callout(text, {x,y})`, `hud._fitText` from Task 3; `window.__skk` debug object.

- [ ] **Step 1: Write the probe**

```js
// E2E guard: every popup surface must render fully inside phone viewports.
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
  await page.waitForFunction(() => window.__skk && window.__skk.hud, null, { timeout: 20000 });

  const rect = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, sel);

  await page.evaluate(() => window.__skk.hud.banner('GROUND RULE DOUBLE!', 'homer'));
  ok(inside(await rect('.cine-banner'), vp.w, vp.h), `${vp.w}w banner long-string`);

  for (const x of [4, vp.w - 4]) {
    await page.evaluate((px) => window.__skk.hud.callout('SEND HIM HOME RIGHT NOW', { x: px, y: 300, key: `probe${px}` }), x);
    ok(inside(await rect('.coach-callout'), vp.w, vp.h), `${vp.w}w callout at x=${x}`);
    await page.evaluate(() => window.__skk.hud.clearCallouts());
  }
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run: `node scripts/popup-e2e.mjs` with the dev server up. Expected: `ALL PASS`, exit 0. If the banner check fails, the fitText loop or max-width from Task 3 is wrong — fix there, not in the probe.

- [ ] **Step 3: Commit**

```bash
git add scripts/popup-e2e.mjs src/game/matchScene.js
git commit -m "test(see-it): popup containment e2e guard at phone viewports"
```

### Task 5: Crew Heat meter you can actually see

**Files:**
- Modify: `src/ui/ui.css` (`.heat-bar` block ~line 1237)
- Modify: `src/ui/screens/hud.js` (`setHeat` ~line 280, new `heatFloat`)
- Modify: `src/game/matchScene.js` (heat call sites — grep `noteHeat` / `setHeat`)

**Interfaces:**
- Produces: `hud.heatFloat(side, delta)` — floats "+N" above the team's heat bar; `side` = `'home' | 'away'`. Pillar B payoff banners will reuse this pattern.

- [ ] **Step 1: CSS — 3px sliver becomes a real meter**

Replace the `.heat-bar` height/positioning and add flame + float styles:

```css
.heat-bar {
  position: absolute; left: 6%; right: 6%; bottom: 1px;
  height: 8px; border-radius: 4px;
  background: rgba(0,0,0,.45);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
  overflow: visible; /* the flame sits just past the end */
}
.heat-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #3ec6b5, #f5b312 60%, #ff5a2a); border-radius: 4px; transition: width .3s ease; }
.heat-flame {
  position: absolute; right: -15px; top: 50%; translate: 0 -50%;
  font-size: 12px; opacity: .22; filter: grayscale(1); transition: opacity .3s;
}
.heat-bar.hot .heat-flame { opacity: .9; filter: none; }
.heat-bar.on-fire .heat-flame { opacity: 1; filter: none; font-size: 15px; animation: flamePulse .35s ease-in-out infinite alternate; }
@keyframes flamePulse { from { scale: 1; } to { scale: 1.35; } }
.heat-float {
  position: absolute; z-index: 9; pointer-events: none;
  font-family: var(--marker); font-size: 18px; color: #ffb35e;
  -webkit-text-stroke: 1px #0b0d12; text-shadow: 0 2px 0 rgba(0,0,0,.6);
  translate: -50% 0; animation: heatFloat 1s ease-out forwards;
}
@keyframes heatFloat { from { opacity: 0; translate: -50% 6px; scale: .7; } 25% { opacity: 1; scale: 1.1; } to { opacity: 0; translate: -50% -26px; scale: 1; } }
```

If the taller bar collides with the score text, add `padding-bottom: 7px` to `.score-bug .team` — check visually, don't guess.

- [ ] **Step 2: Flame element + hot class in setHeat**

In `setHeat`'s inner `set()` helper: ensure the bar has a flame span once (`if (!f.parentElement.querySelector('.heat-flame')) { const fl = document.createElement('span'); fl.className = 'heat-flame'; fl.textContent = '🔥'; f.parentElement.appendChild(fl); }`) and toggle `f.parentElement.classList.toggle('hot', value >= 70 && !fire)`.

- [ ] **Step 3: heatFloat method**

```js
  /** Float a "+N" above a crew's heat bar so gains are FELT, not inferred. */
  heatFloat(side, delta) {
    if (!(delta > 0)) return;
    const fill = this.el.querySelector(side === 'home' ? '[data-heat-home]' : '[data-heat-away]');
    const bar = fill?.parentElement;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    const H = this.el.getBoundingClientRect();
    const f = document.createElement('span');
    f.className = 'heat-float';
    f.textContent = `+${Math.round(delta)}`;
    f.style.left = `${r.left - H.left + r.width / 2}px`;
    f.style.top = `${r.bottom - H.top + 2}px`;
    this.el.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
```

- [ ] **Step 4: Wire the call site**

In `matchScene.js`, find where heat gains reach the HUD (the forced `setHeat` on events per SESSION_LOG 24b — grep `noteHeat`). At the point where a gain amount is known, add `this.hud.heatFloat(side, gained)` with the same side mapping the forced update uses. One channel only — do NOT also hook the 4Hz throttled update.

- [ ] **Step 5: Verify + commit**

Dev server: stage a big play via `window.__skk` (e.g. the SESSION_LOG 24b recipe) and confirm the float appears over the correct bar, flame ignites at ≥70/on-fire. `npx vitest run` → exit 0.

```bash
git add src/ui/ui.css src/ui/screens/hud.js src/game/matchScene.js
git commit -m "feat(see-it): heat meter 8px + flame + floating +N gains"
```

### Task 6: Element badge sized for arm's length

**Files:**
- Modify: `src/ui/ui.css` (`.element-chip` block ~line 1218)
- Modify: `src/ui/screens/hud.js` (`setElement` ~line 299)

**Interfaces:**
- Consumes: element ids from `src/data/fields.json` (read the file for exact ids — do NOT guess; the icon map must key on real ids).
- Produces: the same `.element-chip` element, upgraded; Pillar B's intro card will reuse the icon map — export it as `ELEMENT_ICONS` from `hud.js`.

- [ ] **Step 1: Icon map keyed on REAL ids**

Read `src/data/fields.json`, list the 10 `element.id` values, then add to `hud.js` (module scope, exported):

```js
// keyed on fields.json element ids — verify against the file, never guess
export const ELEMENT_ICONS = {
  'el-train': '🚇', 'steam-vents': '💨', 'dj-drop': '🎧', 'night-hustle': '🌙',
  'sea-breeze': '🌊', 'motorcade': '🚨', 'extra-bounce': '⚡', 'the-hawk': '🦅',
  'heat-wave': '🔥', 'heavy-air': '🌫️',
};
```

(Adjust keys to the actual ids found.)

- [ ] **Step 2: Badge markup**

In `setElement`, build a two-row badge instead of the one-line chip:

```js
    const icon = ELEMENT_ICONS[id] ?? '⭐';
    this.elChip.innerHTML =
      `<span class="element-top"><span class="element-icon">${icon}</span>${wind}<span class="element-label">${label}</span></span>` +
      `<span class="element-pips">${pips}</span>`;
```

- [ ] **Step 3: Badge CSS**

```css
.element-chip {
  position: absolute; top: 64px; right: 8px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
  padding: 7px 12px; border-radius: 12px;
  background: rgba(0,0,0,.62); border: 1.5px solid rgba(255,215,94,.5);
  color: #ffd75e; font-weight: 700; font-size: 15px; line-height: 1;
  letter-spacing: .04em; text-transform: uppercase;
  pointer-events: none; z-index: 30;
}
.element-chip .element-top { display: flex; align-items: center; gap: 6px; }
.element-chip .element-icon { font-size: 18px; }
.element-chip .element-pips { color: #fff; letter-spacing: .18em; font-size: 12px; }
.element-chip .element-wind { display: inline-block; font-size: 14px; }
```

Keep the existing `.element-live` pulse rule.

- [ ] **Step 4: Verify + commit**

Dev server on a wind field (`?match&field=` the Hawk's field id) — badge readable at phone size, arrow rotates, doesn't collide with the score bug or pitch-grade badge. `npx vitest run` → exit 0.

```bash
git add src/ui/ui.css src/ui/screens/hud.js
git commit -m "feat(see-it): element badge - icon + label + pips readable at phone size"
```

### Task 7: PR + real-play verification

**Files:** none new — branch/PR mechanics.

- [ ] **Step 1:** All work happens on branch `feat/overhaul-a-see-it` (create it at Task 1 if not already).
- [ ] **Step 2:** Full sweep: `npx vitest run` (exit 0) + `node scripts/popup-e2e.mjs` (exit 0).
- [ ] **Step 3:** Real play per verify-by-real-play: claude-in-chrome, play a half-inning on a night field, screenshot kick + fielding + a banner moment at phone viewport. Compare against prod for the brightness delta (side-by-side screenshots for the dev).
- [ ] **Step 4:** `gh pr create` on the branch (body per repo convention), merge after checks, then report to the dev with the before/after shots — prod deploy waits for his "push".
