// THE LIGHT FLOOR. Dev, 2026-08-25: "characters and surfaces brighter" — one
// global table, `LIGHT_LIFT`, so all ten skies move together, and a floor under
// every sky so no field can be shipped dim again.
//
// The floor has to be checked through `liftFor(p)`, not through `LIGHT_LIFT`:
// a preset may carry its own `lift` block and the builder takes it key by key
// (`src/game/field.js`), so a preset that quietly halved the fill would sail
// under a floor computed from the global table while the actual scene went
// dark. There is exactly one preset that does carry one, and it is on purpose.
import { it, expect } from 'vitest';
import { LIGHT_LIFT, SUN_LIFT, SKY_PRESETS, liftFor } from '../src/game/field.js';

// WINTER IS THE ONE EXCEPTION, and it is a fix, not an oversight. Dev, on his
// phone, 2026-08-28: "the white in Chicago makes it hard to see" — `winter` was
// the brightest row in the table AND the only near-white ground, so the global
// lift clipped the snow and every light kit with it. Its own lift cuts the fill
// to 1.00 effective and the key to 1.35, which is BELOW the league floor by
// design: the whole point was to take that sky down. Its floors are its own,
// and they are still floors — a winter afternoon does not go dim either.
const WINTER = { amb: 0.30, hemi: 0.9 };

it('the lift is one global table applied to every sky preset', () => {
  expect(LIGHT_LIFT).toEqual({ amb: 1.65, hemi: 1.4, rim: 0.5 });
  for (const [name, p] of Object.entries(SKY_PRESETS)) {
    const lift = liftFor(p);           // THE EFFECTIVE lift, per-preset override included
    const floor = name === 'winter' ? WINTER : { amb: 0.4, hemi: 1.8 };
    expect(p.ambI * lift.amb, name).toBeGreaterThanOrEqual(floor.amb);
    expect(p.hemiI * lift.hemi, name).toBeGreaterThanOrEqual(floor.hemi);
  }
});

it('winter is the ONLY sky excused — any other lift block trips the floor', () => {
  // the exception is data, so it is named here rather than inferred: a second
  // preset carrying a `lift` fails this line before anyone reaches the floors
  expect(Object.entries(SKY_PRESETS).filter(([, p]) => p.lift).map(([n]) => n)).toEqual(['winter']);
  // ...and the floors really do bite. The neon night court is the darkest sky
  // in the table; hand it winter's lift and it drops straight through 1.8.
  const night = { ...SKY_PRESETS['neon-night'], lift: { hemi: 0.588, sun: 0.643, amb: 1 } };
  expect(night.hemiI * liftFor(night).hemi).toBeLessThan(1.8);
  // (its ambient is high enough to survive winter's `amb: 1`, which is what a
  // FLOOR is for — the fill is the lever winter actually pulls, and it trips)
  expect(night.ambI * liftFor(night).amb).toBeLessThan(SKY_PRESETS['neon-night'].ambI * LIGHT_LIFT.amb);
  // and with no block of its own, every sky still resolves to the global table
  expect(liftFor(SKY_PRESETS['neon-night'])).toEqual({ ...LIGHT_LIFT, sun: SUN_LIFT });
});

it('the winter cut is the measured one — hemi 1.00, sun 1.35, amb 0.35', () => {
  // the numbers off `glare/tune-winter.mjs`: the snow goes from 0.892 of white
  // to 0.804, and the ball at the plate goes from a blob back to RED
  const w = SKY_PRESETS['winter'];
  const lift = liftFor(w);
  expect(w.hemiI * lift.hemi).toBeCloseTo(1.0, 2);
  expect(w.sunI * lift.sun).toBeCloseTo(1.35, 2);
  expect(w.ambI * lift.amb).toBeCloseTo(0.35, 2);
  expect(lift.rim).toBe(LIGHT_LIFT.rim);   // the rim separation is untouched
});
