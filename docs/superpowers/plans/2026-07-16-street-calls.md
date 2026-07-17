# Street Calls Implementation Plan (Street Rules — Pillar 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three timed one-lit-button calls in normal innings — Dive Call, Fence Rob (defense), Steal Call timing (offense) — per spec pillar 3 and the mini-game UX bar (characters run, the player makes timed calls; ONE button, lit only when actionable; never steering).

**Architecture:** New mocap clips (`Diving Catch.fbx`, `Fence Climb Up.fbx`, `Fence Climb Down.fbx`, staged in `tools/anims-src/`) bake through the existing retarget harness into `public/assets/anims/mocap-<arch>.glb` + `src/data/anims.manifest.json` entries (`dive`, `climb`, `climbDown`). Gameplay reuses the duel-button pattern in `hud.js` (`duelBtn`) — a `callBtn` that lights during a window; matchScene owns the windows and resolutions. Heat + elements feed in (fence rob = `robbed` heat steal; Night Hustle already boosts steals).

**Tech Stack:** retarget.html bake harness + anim-upload-server.mjs (port 5199); vanilla JS + vitest.

## Global Constraints

- One button, lit only when actionable (mini-game UX bar). Never steering.
- A failed dive is WORSE than no dive (risk/reward) — fielder is down ~0.9s while the ball rolls on.
- Fence rob only offers on genuinely HR-bound balls (kickHrEligible + deep) — rarity is the drama.
- All resolutions flow through existing paths (catchOut, homer, steal) — no new rules-engine states.

## Tasks

### Task A: Bake the new clips
1. Add manifest entries: `{file:'Diving Catch.fbx', name:'dive', loop:false, inPlace:true}`, `{file:'Fence Climb Up.fbx', name:'climb', loop:false, inPlace:true}`, `{file:'Fence Climb Down.fbx', name:'climbDown', loop:false, inPlace:true}` (trims added after reading the harness's logged durations; Mixamo lead-ins are usually short — trim only if the log shows >2.5s).
2. `node scripts/anim-upload-server.mjs` (background) + vite dev server; open `/tools/retarget.html`; wait for `DONE: 6 archetypes baked` in `#log`; click all 6 EXPORT buttons via JS (`exportArch` fetch-POSTs — no user gesture needed); verify 6 `public/assets/anims/mocap-<arch>.glb` files got newer mtimes and contain the 3 new clips (probe `window.__rigs`).
3. `tests/animsManifest.test.js` guards manifest shape — update if it pins clip counts. Commit GLBs + manifest.

### Task B: Dive Call (defense)
- Window: during LIVE while defense is the player, when the predicted landing (`this.pred.point`) is 2.5–5m from the best fielder AND the ball is a low liner (`pred.apex < 2.8` — not a catchable fly) — the ball will skip past at normal speed.
- HUD: `showCall('DIVE!')` — new lit button (clone duelBtn pattern, `call-btn` class, gold). Window ≈ 0.5s before the ball passes the fielder.
- Tap inside window: fielder plays `dive` toward the lead point (`slide` fallback if clip missing), timing error → perfect (≤120ms) = clean snag → resolve via existing scoop/`catchOut`-style pickup + `robbed`-tier heat if the ball was gap-bound; late = fielder dives, ball continues, fielder stunned 0.9s (`stumble` → recover).
- No tap: nothing happens (ball plays out normally).
- AI defense (player kicking): CPU rolls a dive on `tuning.ai[difficulty]` reaction chance — keeps the mechanic visible both ways.

### Task C: Fence Rob (defense)
- Window: `kickHrEligible` ball with `pred.point` beyond `fenceM - 2`, defense is player: as the ball nears the wall (last ~0.8s of flight), `showCall('ROB IT!')` lights; nearest outfielder auto-runs to the wall (existing pursuit already does this).
- Perfect tap (≤130ms of the ball crossing the wall plane): outfielder plays `climb`, snaps to the fence top, catch → `catchOut`, impact-cam `cine:robbed`, heat `robbed` (already wired to steal 15), then `climbDown`. The homer never fires (`hrFired` stays false because the catch resolves first — gate `homer()` on the rob being active).
- Miss/no tap: homer proceeds as today.
- AI defense rob chance: small (`King` difficulty only) — a CPU wall-rob should be a rare scream moment.

### Task D: Steal Call timing (offense)
- Today `startSteal` fires on chip tap with a fixed `LEAD_M` jump (+ Night Hustle). Add timing: the steal chip LIGHTS during the pitcher wind-up (serve → ball leaves hand ≈ the `pitch` clip contact window); tapping while lit = hot jump (`LEAD_M * 1.6`), tapping after the ball is rolling = today's normal jump. HUD: pulse the steal chips during the lit window (reuse `element-live` pulse idiom).

### Task E: Verify + ship
- Unit-test the pure windows/judgments where extractable; suite exit code.
- In-engine: force each call via `__skk` (stage a liner/dive window, an HR ball/rob window, a steal), screenshot each; regression pass on a served pitch.
- SESSION_LOG 24c; PR "feat: Street Calls (Street Rules 3/4)"; merge gated on dev.
