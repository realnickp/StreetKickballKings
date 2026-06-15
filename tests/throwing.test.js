import { it, expect } from 'vitest';
import { resolveBaseThrow, resolvePeg } from '../src/game/throwing.js';
import tuning from '../src/data/tuning.json';

it('out when the ball beats the runner to the base', () => {
  // ball: 15m / 22 m/s = 0.68s; runner: 8m / 5 m/s = 1.6s
  const r = resolveBaseThrow({ throwDistM: 15, runnerRemainingM: 8, runnerSpeedMs: 5 }, tuning);
  expect(r.out).toBe(true);
  expect(r.marginS).toBeGreaterThan(0);
});

it('safe when the runner beats the ball', () => {
  const r = resolveBaseThrow({ throwDistM: 30, runnerRemainingM: 2, runnerSpeedMs: 8 }, tuning);
  expect(r.out).toBe(false);
});

it('tie goes to the runner', () => {
  const r = resolveBaseThrow({ throwDistM: 22, runnerRemainingM: 5, runnerSpeedMs: 5 }, tuning);
  expect(r.out).toBe(false);
});

it('peg hits a runner who is not juking', () => {
  expect(resolvePeg({ throwDistM: 10, runnerLateralM: 0 }, tuning).hit).toBe(true);
});

it('a juke dodges the peg', () => {
  expect(resolvePeg({ throwDistM: 10, runnerLateralM: 1.2 }, tuning).hit).toBe(false);
});
