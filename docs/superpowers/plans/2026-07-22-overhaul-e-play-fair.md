# Fun Overhaul Pillar E — PLAY FAIR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three dev-goal gameplay rules: player-controlled direction reversal in pickles, badly-traced pitches counting as balls (4 = walk), and bad pitches getting punished by the kicker (kicked away from fielders + slight HR odds bump).

**Architecture:** Balls/walks live in the headless rules engine (`src/game/matchState.js`). REVERSE is a new verb on the headless duel brain (`src/game/pickleDuel.js`). Scene wiring in `matchScene.js` at the exact anchors below. Branch `feat/overhaul-e-play-fair`, stacked on `feat/overhaul-a-see-it` (PR #69, unmerged — dev gates merges).

**Tech Stack:** vitest for the two headless engines (TDD), existing e2e-script + claude-in-chrome pattern for scene verification.

## Global Constraints

- Phone-player test: every new rule must be SEEN (banner/count), UNDERSTOOD (label says what happened), FELT (payoff/consequence).
- All popup text through `hud.call`/`hud.callout`/`hud.banner` (they self-fit since Pillar A) — never raw absolutely-positioned text.
- Balls/walks apply to PLAYER-TRACED pitches only (CPU pitches have no quality knob — `pickPitch` returns none; the dev's ask was explicitly "if you don't trace well").
- One-lit-button UX bar (v5): REVERSE is a dedicated, always-visible button during YOUR offense duels — never a double-duty tap.
- Gate on `npx vitest run` exit code. Real-play verify per the standing rule.

## Discovered anchors (verified this session)

- `matchState.js` — clean engine; `applyBaseEvent` (~line 66) is the mid-at-bat pattern; `advanceKicker` (~112), `endHalf` (~116).
- `pickleDuel.js` — `shuttleDir` (line 8), brain verbs `go/spin` (~50-64), `aiOffense` (~117).
- `matchScene.js`:
  - `onStroke` line ~626: trace scored → `throwPlayerPitch(id, res.quality, fire)`.
  - `throwPlayerPitch` ~642: builds `this.pitch = { id, speedMph, curveM, ease, bounce, q, fire }`, `servePitch(pitch, /*aiKicks=*/true, wildX)`.
  - `servePitch` ~657: `launch()` closure schedules the AI swing `this.after(swing, () => this.attemptKick({ aim: aiAim(...), errMs }, this.elapsed))`.
  - Trace timeout meatball ~3020: `throwPlayerPitch(this.selectedPitch, 0.2, false)` — q 0.2 must read as BAD.
  - `strike(label)` ~788: count + call + `finalizePlay(1,'strikeout',{restoreRunners:true})` at 3.
  - Duel conductor ~1944-2007: `wantDir = brain.committed ? brain.commitDir : shuttleDir({runnerT, ballT})` (line ~1962) — REVERSE hooks here; offense branch sets `hud.setDuelLit(...)` ~1976; AI offense act switch ~2002.
  - `startSteal` ~982 / `makeRunner` — the no-live-ball runner-animation pattern for the walk jog.
  - `noteHeat` ~311 (heat calls), `hud.call` for banners.

---

### Task 1: MatchEngine — balls & walks (TDD)

**Files:**
- Modify: `src/game/matchState.js`
- Test: `tests/matchState.test.js` (append)

**Interfaces:**
- Produces: `state.balls` (0-3 live count), `noteBall() -> 'ball'|'walk'|null`, bus events `'ball' {balls, side}` and `'play' {type:'walk', side}`. Walk applies the forced carry-chain, scores forced-home runs, resets count, advances kicker.

- [ ] **Step 1: Failing tests**

```js
describe('balls and walks', () => {
  it('counts balls and walks the kicker on the 4th', () => {
    const m = new MatchEngine({ home: 'h', away: 'a' }, { innings: 3, outsPerHalf: 3 });
    expect(m.noteBall()).toBe('ball');
    expect(m.state.balls).toBe(1);
    m.noteBall(); m.noteBall();
    const k = m.currentKickerIdx();
    expect(m.noteBall()).toBe('walk');
    expect(m.state.balls).toBe(0);
    expect(m.state.bases[0]).toBe(k);
    expect(m.currentKickerIdx()).toBe(k + 1);
  });
  it('walk forces only forced runners (1st+3rd: 3rd holds)', () => {
    const m = new MatchEngine({ home: 'h', away: 'a' }, { innings: 3, outsPerHalf: 3 });
    m.state.bases = [5, null, 6];
    m.state.balls = 3;
    m.noteBall();
    expect(m.state.bases).toEqual([m.state.kickerIdx.away - 1 >= 0 ? expect.anything() : expect.anything(), 5, 6].map((v) => v)); // see impl test below
  });
  it('walk with bases loaded forces in a run', () => {
    const m = new MatchEngine({ home: 'h', away: 'a' }, { innings: 3, outsPerHalf: 3 });
    m.state.bases = [1, 2, 3];
    m.state.balls = 3;
    const before = m.state.score[m.kickingSide()];
    m.noteBall();
    expect(m.state.score[m.kickingSide()]).toBe(before + 1);
    expect(m.state.bases[1]).toBe(1);
    expect(m.state.bases[2]).toBe(2);
  });
  it('count resets when the at-bat ends any other way', () => {
    const m = new MatchEngine({ home: 'h', away: 'a' }, { innings: 3, outsPerHalf: 3 });
    m.noteBall();
    m.applyPlay({ type: 'single' });
    expect(m.state.balls).toBe(0);
  });
});
```

(Firm up the 1st+3rd expectation in-place: after the walk, `bases = [kicker, 5, 6]`.)

- [ ] **Step 2: Run — FAIL** (`noteBall is not a function`)

- [ ] **Step 3: Implement**

In the constructor state add `balls: 0`. Add methods:

```js
  /** A pitch too sloppy to be legal. 4 of them walk the kicker. */
  noteBall() {
    if (this.state.phase === 'GAME_END') return null;
    this.state.balls += 1;
    this.bus.emit('ball', { balls: this.state.balls, side: this.kickingSide() });
    if (this.state.balls >= 4) { this.applyWalk(); return 'walk'; }
    return 'ball';
  }

  /** Free pass: kicker to 1st, forced runners push, forced-home scores. */
  applyWalk() {
    const side = this.kickingSide();
    const bases = this.state.bases;
    let carry = this.currentKickerIdx();
    for (let i = 0; i < 3 && carry !== null; i++) {
      const tmp = bases[i];
      bases[i] = carry;
      carry = tmp; // displaced runner keeps pushing only while the chain is forced
    }
    if (carry !== null) {
      this.state.score[side] += 1;
      this.bus.emit('score', { side, runs: 1, score: { ...this.state.score } });
    }
    this.advanceKicker(side);
    this.bus.emit('play', { type: 'walk', side });
  }
```

In `advanceKicker` add `this.state.balls = 0;` (covers walk + every at-bat end). In `endHalf` add `this.state.balls = 0;`.

- [ ] **Step 4: Run — PASS.** `npx vitest run` exit 0.
- [ ] **Step 5: Commit** `feat(fair): balls + walks in the rules engine`

### Task 2: PickleDuel — REVERSE verb (TDD)

**Files:**
- Modify: `src/game/pickleDuel.js`
- Test: `tests/pickleDuel.test.js` (append)

**Interfaces:**
- Produces: `brain.manualDir` (0 = auto-shuttle), `brain.reverse(currentDir) -> boolean` (flips drift, cancels a committed GO = the juke), `aiOffense` may return `{type:'reverse'}`. Conductor uses `brain.manualDir || shuttleDir(...)`.

- [ ] **Step 1: Failing tests**

```js
describe('REVERSE (v5 dev override)', () => {
  it('flips the drift direction and keeps flipping on repeat taps', () => {
    const b = new PickleDuel({ mine: true, difficulty: 'street', tuning: TUNING });
    expect(b.reverse(1)).toBe(true);
    expect(b.manualDir).toBe(-1);
    b.reverse(-1);
    expect(b.manualDir).toBe(1);
  });
  it('cancels a committed GO (the juke) ', () => {
    const b = new PickleDuel({ mine: true, difficulty: 'street', tuning: TUNING });
    b.committed = true; b.commitDir = 1;
    b.reverse(1);
    expect(b.committed).toBe(false);
    expect(b.manualDir).toBe(-1);
  });
  it('is refused while stumble-recovering', () => {
    const b = new PickleDuel({ mine: true, difficulty: 'street', tuning: TUNING });
    b.recoverT = 0.5;
    expect(b.reverse(1)).toBe(false);
  });
  it('AI runner may juke when the chaser is on top of him', () => {
    const b = new PickleDuel({ mine: false, difficulty: 'king', tuning: TUNING, rng: () => 0 });
    b._aiRevCd = 0;
    const act = b.aiOffense(0.016, { ballFlying: false, flightFrac: 0, throwToEnd: 0, holderDist: 1.6, pegIncoming: false });
    expect(act).toEqual({ type: 'reverse' });
  });
});
```

(Match the existing test file's TUNING import/fixture pattern.)

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**

Constructor: `this.manualDir = 0; this._aiRevCd = 0;`

```js
  /** v5 dev override: the runner changes direction HIMSELF. Cancels a GO. */
  reverse(currentDir) {
    if (this.recoverT > 0) return false;
    this.manualDir = -(this.manualDir || currentDir || 1);
    if (this.committed) { this.committed = false; this.goGrade = 0; }
    return true;
  }
```

In `aiOffense`, before the go-reaction block:

```js
    // close-quarters juke: flip under the chaser's nose (difficulty-gated)
    this._aiRevCd = Math.max(0, this._aiRevCd - dt);
    if (!pegIncoming && holderDist < 2.1 && this._aiRevCd <= 0) {
      const chance = { rookie: 0.15, street: 0.35, king: 0.6 }[this.difficulty] ?? 0.3;
      this._aiRevCd = 1.1;
      if (this.rng() < chance) return { type: 'reverse' };
    }
```

Note: `reverse()` intentionally clears `manualDir` sign only — a committed AI GO burst that gets reversed returns to shuttle rate (runRate falls back automatically since `committed` is false).

- [ ] **Step 4: Run — PASS.** Full suite exit 0.
- [ ] **Step 5: Commit** `feat(fair): REVERSE verb on the duel brain + AI jukes`

### Task 3: Scene — REVERSE button + conductor wiring

**Files:**
- Modify: `src/game/matchScene.js` (duel conductor ~1962, offense branch ~1976, AI act switch ~2002)
- Modify: `src/ui/screens/hud.js`, `src/ui/ui.css` (REVERSE button beside the GO button)

**Interfaces:**
- Consumes: `brain.reverse`, `brain.manualDir` from Task 2.
- Produces: `hud.showReverse(show)`, `hud.onReverse` callback; `duelReverse()` on the scene.

- [ ] **Step 1:** Conductor line ~1962 becomes:

```js
    const wantDir = brain.committed ? brain.commitDir : (brain.manualDir || shuttleDir({ runnerT, ballT }));
```

- [ ] **Step 2:** HUD: find the duel/GO button creation (`setDuelLit` / `.go-btn`); add a sibling `.reverse-btn` (same blobby pill styling family, teal accent, label `REVERSE`), always lit while shown; `hud.showReverse(show)` toggles it only for YOUR offense duels (call beside the existing `setDuelLit` calls in the offense branch ~1976 and in duel start/end). `hud.onReverse` wired like `hud.onSteal` (~line 199 pattern).
- [ ] **Step 3:** Scene handler:

```js
  duelReverse() {
    const duel = this.duel;
    if (!duel || duel.r.state !== 'running' || !this.kickingIsPlayer()) return;
    const dirNow = duel.r.targetBase === duel.forwardBase ? 1 : -1;
    if (duel.brain.reverse(dirNow)) {
      this.bus.emit('sfx', 'juke');
      this.hud.callout('REVERSED!', { x: window.innerWidth / 2, y: window.innerHeight * 0.42, ttl: 700, key: 'rev' });
    }
  }
```

AI act switch ~2002 gains: `else if (act?.type === 'reverse') { duel.brain.reverse(duel.r.targetBase === duel.forwardBase ? 1 : -1); this.bus.emit('sfx','juke'); }`

- [ ] **Step 4:** Duel start/end: show the button when a your-offense duel opens, hide on `endDuel` (find both sites; `endDuel` exists ~2110s). Reset `brain.manualDir = 0` is implicit (fresh brain per duel).
- [ ] **Step 5:** Verify by staged duel (SESSION_LOG 24c pump recipe), tests exit 0, commit `feat(fair): pickle REVERSE - your runner, your juke`.

### Task 4: Scene — bad pitches are BALLS; AI lays off; walk plays out

**Files:**
- Modify: `src/game/matchScene.js` (`throwPlayerPitch` ~642, `servePitch` launch closure ~672-688, trace-timeout ~3020)
- Modify: `src/ui/screens/hud.js` (balls pips on the score bug mid column)
- Modify: tuning file where `pitch.*` knobs live (found via `this.tuning.pitch.fireQualityThreshold`)

**Interfaces:**
- Consumes: `match.noteBall()` from Task 1.
- Produces: `pitch.bad` flag; `hud.setCount({balls})`; `resolveBallTaken()` on the scene; walk sequence `playWalk(walkedIdx)`.

- [ ] **Step 1:** Tuning: add `badQuality: 0.32` and `layOff: { rookie: [0.15, 0.5], street: [0.3, 0.8], king: [0.5, 0.95] }` (chance normally / at 3 balls) beside the other `pitch` knobs.
- [ ] **Step 2:** `throwPlayerPitch`: `const bad = q < this.tuning.pitch.badQuality;` add `bad` to the pitch object; if bad, `this.hud.pitchGrade('BALL?', false)` replaces the WOBBLER label (the count-threat reads louder than "wobbler").
- [ ] **Step 3:** In `servePitch`'s `launch()` where the AI swing is scheduled: when `pitch.bad`, roll lay-off first:

```js
      if (aiKicks) {
        const [normal, protect] = this.tuning.pitch.layOff[this.difficulty] ?? [0.3, 0.8];
        const layChance = pitch.bad ? (this.match.state.balls >= 3 ? protect : normal) : 0;
        if (pitch.bad && Math.random() < layChance) {
          this.after(dur + 0.5, () => this.resolveBallTaken()); // he watches it roll by
        } else {
          /* existing errMs + swing scheduling, unchanged */
        }
      }
```

- [ ] **Step 4:** `resolveBallTaken()`:

```js
  /** The kicker laid off a sloppy pitch — it's a BALL (4 = walk). */
  resolveBallTaken() {
    if (this.playFinalized || this.phase !== 'PITCH') return;
    const res = this.match.noteBall();
    const n = this.match.state.balls;
    if (res === 'walk') return this.playWalk();
    this.hud.call(`BALL ${['', 'ONE', 'TWO', 'THREE'][n] ?? n}!`, 'robbed');
    this.hud.setCount({ balls: n });
    this.bus.emit('vo', 'ball');
    this.after(1.0, () => this.serve());
  }
```

(Anchor the reset path on how `strike()` re-serves — reuse exactly its phase/ball cleanup; read `strike()` + its aftermath first and mirror it, including `this.kicked`/ring/meter cleanup.)

- [ ] **Step 5:** `playWalk()`: banner `WALKED HIM!` (`'robbed'` accent), `hud.setCount({balls: 0})`; animate the batter with the `makeRunner`-to-1st pattern from `startSteal` (auto rate, `forced=true`, no steal flags), let forced base chars refresh through the same settle the steal path uses (`commitStealArrival` → base char bookkeeping is the model — the ENGINE already moved the bases in Task 1, so the scene only animates and re-syncs `baseChars`); `after(1.6, () => this.serve())`.
- [ ] **Step 6:** `hud.setCount({balls})`: pips row `B ●●●` in the score bug mid column under the outs pips (same `.outs i` styling family, teal fill); 0 hides the row.
- [ ] **Step 7:** Trace-timeout meatball ~3020 passes q=0.2 → already `bad` via Step 2 — verify no special-casing needed.
- [ ] **Step 8:** Tests exit 0; staged verify: force `Math.random` low via a seeded probe or feed 4 bad traces on the dev server and watch count → walk. Commit `feat(fair): bad traces are BALLS - lay-offs, count pips, 4 = walk`.

### Task 5: Scene — kicked bad pitch = punished pitcher

**Files:**
- Modify: `src/game/matchScene.js` (`attemptKick` AI path — where `aiAim` feeds the kick, and the launch-params site where element carry multiplies in; grep `aiAim` + `launchParams`)

**Interfaces:**
- Consumes: `pitch.bad`.
- Produces: on an AI kick of a bad pitch — aim snapped toward the widest fielder gap + `power01 += 0.06` (the DJ-drop-style bump that can tip HR eligibility).

- [ ] **Step 1:** Locate the AI kick resolution (`attemptKick` with the `aiAim(this.difficulty)` input) and the point where `power01`/launch speed is computed.
- [ ] **Step 2:** When `this.pitch.bad` and the kicker is AI: compute the widest angular gap between outfielders from `this.fieldingChars()` positions (angle from home plate, outfield arc only), aim the kick into it, and add `+0.06` to power01, clamped. One `hud.callout('MEATBALL — CRUSHED!', ...)` when the bumped kick is HR-eligible.
- [ ] **Step 3:** Tests exit 0 (no engine change — scene only). Staged verify on dev server: serve a q=0.1 pitch, confirm the AI kick sails into a gap with the bump. Commit `feat(fair): meatballs get punished - gap aim + HR bump`.

### Task 6: Sweep + PR

- [ ] `npx vitest run` exit 0; `node scripts/popup-e2e.mjs` ALL PASS (count pips/banners contained).
- [ ] Real play via claude-in-chrome: one your-pitch half-inning throwing deliberate wobblers (count climbs, AI lays off, walk animates), one duel with REVERSE jukes.
- [ ] PR `feat/overhaul-e-play-fair` → base `feat/overhaul-a-see-it` (stacked; dev merges in order with "push").
