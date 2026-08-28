// THE GROUND, AS DATA. Every field carries `groundL` — the CIE L* its lit court
// actually renders at, measured headless off the shipped scene (the camera 10 m
// over a patch of fair territory at (-6, -14), players hidden, same lights, same
// composer, same ACES exposure; see the round's `glare/shot-ground.mjs` and
// `glare/ground-<field>-after.png`).
//
// It is the RENDERED number, not the mean of the `ground-<field>.jpg` art, and
// that distinction is the whole point: the winter jpg averages L* 65, but the
// floodlit snow it becomes reads 82, and it is the 82 a white kit has to beat.
// The raw albedo would have told `dressTeams` that Memphis' #f1f4f8 stood 31
// clear of the snow when on the dev's phone it stood 6 clear and vanished.
import { describe, it, expect } from 'vitest';
import fields from '../src/data/fields.json';
import teams from '../src/data/teams.json';
import { SKY_PRESETS, LIGHT_LIFT, SUN_LIFT, liftFor } from '../src/game/field.js';
import { dressTeams, groundDeltaL, contrastDeltaL, CLASH_DELTA_L } from '../src/game/kits.js';

describe('fields carry the lightness of their own court', () => {
  it('all ten fields name a measured groundL', () => {
    expect(fields.fields).toHaveLength(10);
    for (const f of fields.fields) {
      expect(Number.isFinite(f.groundL), f.id).toBe(true);
      expect(f.groundL, f.id).toBeGreaterThan(0);
      expect(f.groundL, f.id).toBeLessThanOrEqual(100);
      // it is the ground ART that was measured, so a field without one would be
      // measuring the procedural asphalt placeholder instead
      expect(f.textures?.ground, f.id).toMatch(/ground-/);
    }
  });

  it('the numbers agree with the art: the neon court is the darkest, the two white slabs the brightest', () => {
    const byId = Object.fromEntries(fields.fields.map((f) => [f.id, f.groundL]));
    expect(byId['neon-night-court']).toBe(Math.min(...fields.fields.map((f) => f.groundL)));
    expect(byId['neon-night-court']).toBeLessThan(20);
    expect(byId['the-underpass']).toBeGreaterThan(85);   // the Mall's pale slab
    expect(byId['winter-classic']).toBeGreaterThan(75);  // snow, AFTER the lift cut
    // and the snow is no longer the ceiling it was: shot at L* 90.2 before this
    // round's `winter` lift override, 82.1 after
    expect(byId['winter-classic']).toBeLessThan(90);
  });
});

describe('the winter lift override', () => {
  it('is the ONLY preset that opts out of the global lift', () => {
    const withLift = Object.entries(SKY_PRESETS).filter(([, p]) => p.lift);
    expect(withLift.map(([name]) => name)).toEqual(['winter']);
  });

  it('leaves every other sky — the night courts included — exactly as it was', () => {
    for (const [name, p] of Object.entries(SKY_PRESETS)) {
      if (name === 'winter') continue;
      expect(liftFor(p), name).toEqual({ ...LIGHT_LIFT, sun: SUN_LIFT });
    }
    // `neon-night` is the one the dev's own crew plays on: untouched
    expect(liftFor(SKY_PRESETS['neon-night']).hemi).toBe(LIGHT_LIFT.hemi);
    expect(liftFor(SKY_PRESETS['neon-night']).sun).toBe(SUN_LIFT);
  });

  it('cuts the snow to the measured intensities and nothing else', () => {
    const w = SKY_PRESETS.winter;
    const lift = liftFor(w);
    expect(w.hemiI * lift.hemi).toBeCloseTo(1.0, 2);   // was 1.7 * 1.4 = 2.38
    expect(w.sunI * lift.sun).toBeCloseTo(1.35, 2);    // was 2.10
    expect(w.ambI * lift.amb).toBeCloseTo(0.35, 2);    // was 0.35 * 1.65 = 0.58
    expect(lift.rim).toBe(LIGHT_LIFT.rim);             // the rim separation stays
  });
});

describe('every field, every matchup, against its own ground', () => {
  // The sweep the round asked for, told straight. The league's twenty palettes
  // cannot put both crews ΔL* 15 clear of every court — `the-underpass` renders
  // at L* 90 and eight of the ten LIGHT kits live between 77 and 96 — and the
  // only cure would be fabricating a hex, which costs a crew its colours and its
  // mark. So what is held is: the dressing takes the best ground contrast any
  // legal pairing offers, everywhere; the two crews always read apart; and the
  // ACHIEVED floor per field never slips below what it is today.
  const WORST = {                 // the worse kit's ΔL* off the court, per field
    'blacktop': 6.12,             // marauders v gilas
    'subway-yard': 5.74,          // bullies v hustlers
    'block-party': 8.74,          // bullies v hustlers
    'neon-night-court': 0.27,     // marauders' #1c1c1c IS the neon court's asphalt
    'boardwalk-kings': 2.36,      // kestrals v threshers
    'the-underpass': 1.02,        // the Mall's white slab against eight white kits
    'rubber-yard': 4.72,          // snappers v hustlers
    'winter-classic': 4.90,       // monarchs v kestrals
    'scorchyard': 9.88,           // monarchs v gilas
    'the-crown': 6.20,            // bullies v hustlers
  };

  it('never leaves ground contrast on the table, and never trades the crews for it', () => {
    let n = 0;
    const worst = {};
    for (const f of fields.fields) {
      for (const h of teams.teams) {
        for (const a of teams.teams) {
          if (h.id === a.id) continue;
          n++;
          const label = `${f.id}: ${h.id} v ${a.id}`;
          const kits = dressTeams({ home: h, away: a, groundL: f.groundL });
          expect(contrastDeltaL(kits.home.hex, kits.away.hex), label).toBeGreaterThanOrEqual(CLASH_DELTA_L);
          const got = Math.min(groundDeltaL(kits.home.hex, f.groundL), groundDeltaL(kits.away.hex, f.groundL));
          const best = Math.max(...[['dark', 'light'], ['light', 'dark']]
            .map(([ht, at]) => [h.kits[ht].hex, a.kits[at].hex])
            .filter(([hh, ah]) => contrastDeltaL(hh, ah) >= CLASH_DELTA_L)
            .map(([hh, ah]) => Math.min(groundDeltaL(hh, f.groundL), groundDeltaL(ah, f.groundL))));
          expect(got, label).toBeCloseTo(best, 6);
          worst[f.id] = Math.min(worst[f.id] ?? Infinity, got);
        }
      }
    }
    expect(n).toBe(900);
    for (const [id, floor] of Object.entries(WORST)) {
      expect(worst[id], id).toBeGreaterThanOrEqual(floor - 0.15);
      expect(worst[id], id).toBeLessThanOrEqual(floor + 0.15);
    }
  });

  it('on the SNOW, the dev\'s matchup puts nobody in a kit the court can eat', () => {
    // Chicago host Memphis on Winter Classic — the screenshot this round came
    // from. Chicago's pale blue (#a8d8ea, L* 84) is 1.5 off the lit snow; the
    // charcoal is 62 off it, and that is what they wear.
    const snow = fields.fields.find((f) => f.id === 'winter-classic').groundL;
    const kestrals = teams.teams.find((t) => t.id === 'kestrals');
    const kits = dressTeams({ home: kestrals, away: teams.teams.find((t) => t.id === 'hustlers'), playerSide: 'away', groundL: snow });
    expect(kits.home.hex).toBe(kestrals.kits.dark.hex);
    expect(groundDeltaL(kits.home.hex, snow)).toBeGreaterThan(50);
    // Memphis keep the white — it is the away kit and it now sits ABOVE the
    // snow rather than inside it, which is the lift override's half of the fix:
    // 5.9 off it before this round, 14.1 after
    expect(groundDeltaL(kits.away.hex, snow)).toBeGreaterThan(12);
    expect(groundDeltaL(kits.away.hex, 90)).toBeLessThan(7);   // what it used to be
  });
});
