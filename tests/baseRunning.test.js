import { it, expect } from 'vitest';
import { mashSpeed, RunnerSim } from '../src/game/baseRunning.js';
import tuning from '../src/data/tuning.json';

it('tap rate maps to speed, capped at max', () => {
  expect(mashSpeed(0, tuning)).toBe(tuning.running.baseSpeedMs);
  expect(mashSpeed(3, tuning)).toBeCloseTo(tuning.running.baseSpeedMs + 3 * tuning.running.speedPerTapHz);
  expect(mashSpeed(20, tuning)).toBe(tuning.running.maxSpeedMs);
});

it('runner advances along the base path and arrives', () => {
  const r = new RunnerSim({ tuning });
  for (let t = 0; t < 60; t++) r.tick(0.1, 6);
  expect(r.arrived).toBe(true);
  expect(r.progressM).toBe(tuning.running.basePathM);
});

it('slow mash takes longer than fast mash', () => {
  const slow = new RunnerSim({ tuning });
  const fast = new RunnerSim({ tuning });
  let slowTicks = 0;
  let fastTicks = 0;
  while (!slow.arrived) { slow.tick(0.05, 0); slowTicks++; }
  while (!fast.arrived) { fast.tick(0.05, 10); fastTicks++; }
  expect(fastTicks).toBeLessThan(slowTicks);
});

it('juke applies lateral offset then cooldown blocks the next one', () => {
  const r = new RunnerSim({ tuning });
  expect(r.juke('left')).toBe(true);
  expect(r.lateral).toBeCloseTo(-tuning.running.jukeOffsetM);
  expect(r.juke('right')).toBe(false);
});

it('juke cooldown expires with time and lateral decays', () => {
  const r = new RunnerSim({ tuning });
  r.juke('right');
  for (let i = 0; i < 20; i++) r.tick(0.05, 0); // 1s
  expect(r.juke('left')).toBe(true);
  for (let i = 0; i < 40; i++) r.tick(0.05, 0);
  expect(Math.abs(r.lateral)).toBeLessThan(0.05);
});
