import { it, expect } from 'vitest';
import { judgeKick, launchParams } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';

it('classifies timing error into quality bands', () => {
  expect(judgeKick(0, tuning).quality).toBe('PERFECT');
  expect(judgeKick(-(tuning.kick.perfectWindowMs - 5), tuning).quality).toBe('PERFECT');
  expect(judgeKick(tuning.kick.perfectWindowMs + 20, tuning).quality).toBe('GOOD');
  expect(judgeKick(-150, tuning).quality).toBe('OK');
  expect(judgeKick(300, tuning).quality).toBe('FOUL');
});

it('perfect kick gets the top power band and the cinematic flag', () => {
  const k = judgeKick(10, tuning);
  expect(k.power).toBe(tuning.kick.power.PERFECT);
  expect(k.cinematic).toBe(true);
  expect(judgeKick(90, tuning).cinematic).toBe(false);
});

it('launchParams maps quality + aim to a velocity spec', () => {
  const v = launchParams(judgeKick(0, tuning), { aim: 'center' }, tuning);
  const k = tuning.kick;
  expect(v.speed).toBeCloseTo(k.baseBallSpeedMs + k.power.PERFECT * (k.maxBallSpeedMs - k.baseBallSpeedMs));
  expect(v.loftDeg).toBe(tuning.kick.loftDeg.PERFECT);
  expect(Math.abs(v.directionDeg)).toBeLessThan(5);
});

it('aim left/right spreads direction, bunt is soft', () => {
  const judged = judgeKick(0, tuning);
  expect(launchParams(judged, { aim: 'left' }, tuning).directionDeg).toBeLessThan(-20);
  expect(launchParams(judged, { aim: 'right' }, tuning).directionDeg).toBeGreaterThan(20);
  const bunt = launchParams(judged, { aim: 'bunt' }, tuning);
  expect(bunt.speed).toBeLessThan(tuning.kick.maxBallSpeedMs * 0.4);
});

it('late timing pushes direction, early pulls it', () => {
  const late = launchParams(judgeKick(90, tuning), { aim: 'center' }, tuning);
  const early = launchParams(judgeKick(-90, tuning), { aim: 'center' }, tuning);
  expect(late.directionDeg).toBeGreaterThan(0);
  expect(early.directionDeg).toBeLessThan(0);
});

it('special move multiplies power', () => {
  const v = launchParams(judgeKick(0, tuning), { aim: 'center', powerMult: 1.35 }, tuning);
  const k = tuning.kick;
  expect(v.speed).toBeCloseTo((k.baseBallSpeedMs + k.power.PERFECT * (k.maxBallSpeedMs - k.baseBallSpeedMs)) * 1.35);
});
