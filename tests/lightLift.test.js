import { it, expect } from 'vitest';
import { LIGHT_LIFT, SKY_PRESETS } from '../src/game/field.js';

it('the lift is one global table applied to every sky preset', () => {
  expect(LIGHT_LIFT).toEqual({ amb: 1.65, hemi: 1.4, rim: 0.5 });
  for (const [name, p] of Object.entries(SKY_PRESETS)) {
    expect(p.ambI * LIGHT_LIFT.amb, name).toBeGreaterThanOrEqual(0.4);
    expect(p.hemiI * LIGHT_LIFT.hemi, name).toBeGreaterThanOrEqual(1.8);
  }
});
