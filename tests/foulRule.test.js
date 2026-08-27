import { it, expect } from 'vitest';
import { isFoulLanding } from '../src/game/foulRule.js';

// Dev rule (2026-08-27): "foul balls should only be called foul if it goes
// outside the boundaries, short kicks should not be called fouls." Home plate
// is the origin, the outfield is -z, the 45° foul lines are |x| = -z.

it('a short dribbler that dies in front of the plate is FAIR', () => {
  expect(isFoulLanding({ x: 0.2, y: 0, z: -0.6 })).toBe(false);
});

it('a ball that lands behind the plate is FOUL', () => {
  expect(isFoulLanding({ x: 0, y: 0, z: 0.3 })).toBe(true);
});

it('a ball down the line inside the 45° wedge is FAIR', () => {
  expect(isFoulLanding({ x: 9, y: 0, z: -10 })).toBe(false);
});

it('a ball outside the 45° line is FOUL', () => {
  expect(isFoulLanding({ x: 12, y: 0, z: -10 })).toBe(true);
});

it('keeps the 1 m plate tolerance for near-plate contact', () => {
  expect(isFoulLanding({ x: 1.2, y: 0, z: -0.5 })).toBe(false);
  expect(isFoulLanding({ x: 1.6, y: 0, z: -0.5 })).toBe(true);
});

it('is symmetric across the left-field line', () => {
  expect(isFoulLanding({ x: -9, y: 0, z: -10 })).toBe(false);
  expect(isFoulLanding({ x: -12, y: 0, z: -10 })).toBe(true);
});
