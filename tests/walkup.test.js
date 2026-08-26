import { it, expect } from 'vitest';
import { WALKUP, walkS, pickTaunt, TAUNTS } from '../src/game/walkup.js';

it('the walk covers start -> plate at the walk speed', () => {
  expect(walkS()).toBeCloseTo((WALKUP.plateX - WALKUP.startX) / WALKUP.mps);
  expect(walkS()).toBeLessThan(1.7);
});

it('your kicker uses the equipped taunt (stock by default); the CPU draws from all five', () => {
  expect(pickTaunt({ isPlayer: true, equipped: { clip: 'tauntCry' } })).toBe('tauntCry');
  expect(pickTaunt({ isPlayer: true, equipped: null })).toBe('tauntPoint');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickTaunt({ isPlayer: false, equipped: { clip: 'tauntCry' } }));
  expect([...seen].sort()).toEqual([...TAUNTS].sort());
});
