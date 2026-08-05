# Crown Meter, HR Skip Chip, Foul Reset, Kit/Field Fixes, Quick Toss (2026-08-04)

Dev request via remote control 2026-08-04 (evening, with screenshots). Six
items, one round.

## 1. HR cutscene: deliberate skip only

Too easy to skip — any tap during `cinematicLock` eats the crowned dance.
Same medicine as the walkout: the SKIP ⏭ chip. `homer()` sets a
`chipSkip` flag (cleared on `cine:done`), `director.crowned()` shows the
chip, `director.finish()` hides it, and `onTap` swallows generic taps while
`chipSkip` is up. Caught-out (1.4 s) and victory lap stay tap-anywhere.

## 2. Crown meter: built by the OFFENSE, fills fast

Today the meter only feeds on PERFECT (35), catch/peg (defense), homerun
(40), pickleEscape (60) — base hits and runs give NOTHING, so the meter
reads dead. New offense feeds (tuning.special.gain):

| event | gain |
|---|---|
| hit (single/double/triple lands) | 18 |
| run scored (offense) | 22 |
| steal committed | 15 |
| PERFECT kick | 35 (unchanged) |
| homerun | 40 (unchanged), pickleEscape 60 (unchanged) |

A decent inning (two hits + a run + a PERFECT) arms the crown. Every gain
pulses the crown button (`hud.crownPulse()`, CSS pop) so the buildup is
SEEN. Armed state unchanged (existing lit ring + consume path + gear kicks).

## 3. Foul reset: the next pitch waits for you

After FOUL the plain-resume path re-serves in ~1.0 s — the next pitch is
mid-flight while the banner is still up. Fix: resume delay 1.0 → 2.0 s,
stamps cleared at resume, and a 'RESET — NEXT PITCH…' hint beat so the
player re-grips before the wind-up. (The scramble path already gates on the
throwdown race; untouched.)

## 4. Orange specks: cleat tint moves to GEOMETRY

Root cause: `recolorKitTexture` tints foot-mask TEXELS, but the archetype
atlases re-use texels across islands (shoe UVs share fabric texels with
jersey/shorts/skin) — tinting "shoe texels" splatters the cleat colour
across every part sampling them (dev's Fire Reds = orange specks
everywhere). Fix: drop the texel mask; tint by GEOMETRY. Foot-weighted
vertices (same ≥0.55 Foot/ToeBase rule) get a vertex-colour = cleat hex,
everything else white; cloned geometry per cleat-wearing character;
`material.vertexColors = true` multiplies over the baked texture so shading
survives. Texel-exact bodies, zero bleed. The footUvMask/texel path dies.

## 5. Chicago white columns: crop the baked border

`backdrop-winter-classic-3d.jpg` (and its -back/video variants) carry a
white FRAME baked into the image; tiled ×10 around the backdrop cylinder the
edges render as giant white pillars. Fix in assets: ffmpeg cropdetect →
crop the stills and re-encode the two backdrop videos (h264, silent,
faststart). Sweep cropdetect across ALL city backdrop stills and fix any
other bordered ones while in there.

## 6. Coin toss: one quick card

The current toss plays a full flip VIDEO over the 3D field. Replace with a
compact opaque card (also hides the field behind it): CALL IT → HEADS/TAILS
→ ~0.8 s CSS coin spin → result line + (winner) KICK/FIELD buttons in the
same card. No video, no scene dependency, three taps max, skippable-fast.

## Also (defensive)

- `squadOn` runs `animator.update(0.0001)` right after the play() burst — a
  phone hitch on the squad's first frame was flashing T-poses.

## Testing & verification

- vitest: meter gains for hit/run/steal (headless SpecialMeter), existing
  suites stay green.
- Harness playtest: HR chip-only skip (stray tap survives the dance), foul
  → readable reset beat before the next pitch, meter pulse on a hit, coin
  card flow, Chicago backdrop clean, no cleat specks (visual with gear).
- Merge by PR; deploy on the dev's explicit "push".

## Playtest results (2026-08-04 evening, harness)

- Chicago pillars: root cause was WHITE FRAMES baked into the winter-classic
  assets — BOTH the backdrop video (66 px bars) AND the still + sky textures
  (the poster renders whenever the video can't autoplay, so cropping the video
  alone didn't fix it). All cropped; full-city sweep confirmed no other field
  carries borders. Verified live at the same camera angle: pillars gone.
- Cleats: vertex tint verified on the away captain close-up — orange shoes,
  ZERO body specks. Found + fixed a shipped-invisible bug live: `vColor` is a
  vec4 in this three build; the emissive patch's type mismatch failed the
  whole material compile and cleat-wearers rendered INVISIBLE (`vColor.rgb`).
- Crown meter: PERFECT kick → value 35, ring fill visible, pulse class fires.
  Offense feeds (hit 20 / run 25 / steal 15) red-green unit tested; a
  two-hit + run + PERFECT inning arms it exactly.
- HR chip: organic homer → stray tap SURVIVED the dance; chip tap ended it
  clean. chipSkip clears on cine:done.
- Foul reset: `after(2.0, resume)` + clearStamps in place (code-verified;
  live timing was harness-noisy — dev feel-check on the phone).
- Coin card: markup/CSS shipped; visual check on the phone (screen mounts
  only in the real flow).
- New harness param: `?cleats=<hex>` previews any cleat colour on the away
  squad.

## Post-deploy bug round (2026-08-04 night, dev screenshots)

- **HR gate vetoing real bombs**: a ball clearing the wall ON THE FLY is now a
  homer for ANYONE (`exitedOverFence && bounces === 0` → `homer()`); the
  eligibility roll shapes the launch but never vetoes flown-out physics. CPU
  bombs were being stamped "ground rule double". Verified live (ineligible
  bomb → HOMER, run posted).
- **Thrower jogging in place at 1st**: after a relay lands, a chase-role
  fielder who is no longer `this.chaser` stands down to his spot, and the
  arrival-settle no longer excludes him. Verified live (no stuck 'run' clips
  post-play).
- **Pickled while ON the bag**: a throw at a runner whose progress is at the
  bag (send-decision window keeps him 'running') now settles him HELD with
  'HOLDS THE BAG!' instead of `startRundown` — a man who never left the base
  can never be trapped. Code-verified; dev screenshot was the repro.
