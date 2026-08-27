import { it, expect } from 'vitest';
import { judgeKick, launchParams, speedFromPower, weakContactLaunch } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';

// Weak contact (a timing-FOUL kick) is a LIVE infield roller since 2026-08-27.
// It must roll the SAME for everyone: the player's launch speed comes from the
// RAW timing meter while the FOUL judge comes from timing + alignment, so
// scaling the incoming speed gave a perfectly-timed-but-misaligned player a
// 6 m roller and the CPU a 1.5 m dribbler off the identical judge.

it('speedFromPower is the speed mapping launchParams already uses', () => {
  for (const err of [0, 200]) {
    const judged = judgeKick(err, tuning);
    const spec = launchParams(judged, { aim: 'center' }, tuning);
    expect(spec.speed).toBeCloseTo(speedFromPower(tuning.kick.power[judged.quality], tuning), 10);
  }
  expect(speedFromPower(0, tuning)).toBe(tuning.kick.baseBallSpeedMs);
  expect(speedFromPower(1, tuning)).toBe(tuning.kick.maxBallSpeedMs);
});

it('weak contact ignores the incoming speed — one roller for player and CPU', () => {
  const foulSpeed = speedFromPower(tuning.kick.power.FOUL, tuning);
  const hot = weakContactLaunch({ speed: 24, loftDeg: 42, directionDeg: 0 }, tuning, () => 0.5);
  const cold = weakContactLaunch({ speed: 6, loftDeg: 55, directionDeg: 0 }, tuning, () => 0.5);
  expect(hot.speed).toBeCloseTo(foulSpeed, 10);
  expect(cold.speed).toBe(hot.speed);
});

it('weak contact is a low roller, never a pop-up', () => {
  const w = weakContactLaunch({ speed: 24, loftDeg: 55, directionDeg: 0 }, tuning, () => 0.5);
  expect(w.loftDeg).toBe(14);
});

it('weak contact squirts within ±25° of the aim line', () => {
  expect(weakContactLaunch({ speed: 12, loftDeg: 24, directionDeg: 10 }, tuning, () => 0.5).directionDeg).toBeCloseTo(10, 10);
  expect(weakContactLaunch({ speed: 12, loftDeg: 24, directionDeg: 10 }, tuning, () => 0).directionDeg).toBeCloseTo(-15, 10);
  expect(weakContactLaunch({ speed: 12, loftDeg: 24, directionDeg: 10 }, tuning, () => 1).directionDeg).toBeCloseTo(35, 10);
});

it('carries any other launch fields through untouched', () => {
  const w = weakContactLaunch({ speed: 12, loftDeg: 24, directionDeg: 0, tag: 'x' }, tuning, () => 0.5);
  expect(w.tag).toBe('x');
});
