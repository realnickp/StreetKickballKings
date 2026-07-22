# Fun Overhaul Pillar C — PLAY IT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Every element periodically creates a telegraphed PROC WINDOW with a real player decision, using ONLY existing verbs (kick timing, GO!/steal call, one-lit-button call). Fields play different, not just look different.

**Architecture:** Extend the proc clock in `cityElements.js` beyond 'proc'-kind elements (gust windows for wind/carry kinds). matchScene hooks the existing `element:proc` transitions to per-element telegraphs + gameplay bonuses at existing anchor points. Branch `feat/overhaul-c-play-it` stacked on B (#72).

## Moments (all reuse existing paths)

| Element | Window + decision | Anchor |
|---|---|---|
| el-train | Rumble live: PERFECT kick through it = powerMult ×1.15 + heat +10, 'THROUGH THE RUMBLE!' | attemptKick, procActive + judged PERFECT |
| sea-breeze / the-hawk | GUST window (proc for wind kinds): wind/carry doubled; telegraph 'GUST — KICK NOW!' | windAccel ×2 while procActive; proc start callout |
| motorcade | Sirens live: steals get hot-jump grade + 'SIRENS — RUN ON EM!' | startSteal: treat stealHot=true while procActive |
| heat-wave | Innings ≥3: steal chips pulse + 'THEY'RE GASSED — TAKE OFF!' once per half | setStealHot pulse + one callout per half-inning |
| steam-vents | Kick lands in steam: 'STRETCH IT!' — the existing held-runner GO! offer window is extended ×1.6 | goOffer creation site, if landing pos inSteam |
| extra-bounce | Monster hop (restitution roll high): 'BIG HOP!' callout as it happens | ball bounce event / exitedOverFence path already pays GRD |
| heavy-air | Fence-rob call window ×1.5 on this field (defense showcase) | street-call rob window open site |
| dj-drop | (already pays via B: ON THE BEAT! + beat pulse) | — |
| night-hustle | (already pays: hot jumps + MONSTER LEAD) | — |

## Tasks
1. cityElements: gust procs for `wind`/`carry` kinds (same PROC clock; `windAccel`/`carryScale` ×1.8 while procActive). Unit tests: proc transitions fire for sea-breeze; gust multiplies wind.
2. matchScene proc telegraphs: on `element:proc` start → per-element `hud.call` line + vo + badge flash (exists); wire the per-element bonuses at the table's anchors.
3. Steal-window moments: motorcade proc => stealHot forced true (with chip pulse via existing setStealHot); heat-wave late-innings chip pulse + one-shot callout.
4. Steam stretch: extend goOffer duration when the ball landed in steam + 'STRETCH IT!' callout.
5. Heavy-air rob showcase: rob window duration ×1.5 on heavy-air field.
6. Sweep: vitest exit 0, staged browser probes (gust window bends a kick harder; motorcade steal is hot), popup-e2e. PR stacked on B.
