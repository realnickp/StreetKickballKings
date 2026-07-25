import { it, expect } from 'vitest';
import { judgeKick, launchParams, flickShape, FLICK } from '../src/game/kickTiming.js';
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

it('aim left/right spreads direction (with random 30-100% magnitude), bunt is soft', () => {
  const judged = judgeKick(0, tuning);
  const max = tuning.kick.aiAimDeg;
  // full pull (rng=1) and minimum pull (rng=0 -> 30%) both stay on the aim side
  expect(launchParams(judged, { aim: 'left', rng: () => 1 }, tuning).directionDeg).toBeCloseTo(-max);
  expect(launchParams(judged, { aim: 'left', rng: () => 0 }, tuning).directionDeg).toBeCloseTo(-max * 0.3);
  expect(launchParams(judged, { aim: 'right', rng: () => 1 }, tuning).directionDeg).toBeCloseTo(max);
  const bunt = launchParams(judged, { aim: 'bunt' }, tuning);
  expect(bunt.speed).toBeLessThan(tuning.kick.maxBallSpeedMs * 0.4);
});

it('late timing pushes direction, early pulls it', () => {
  const late = launchParams(judgeKick(90, tuning), { aim: 'center' }, tuning);
  const early = launchParams(judgeKick(-90, tuning), { aim: 'center' }, tuning);
  expect(late.directionDeg).toBeGreaterThan(0);
  expect(early.directionDeg).toBeLessThan(0);
});

it('windBiasDeg shifts the launch direction (city element wind awareness)', () => {
  const judged = judgeKick(0, tuning);
  const calm = launchParams(judged, { aim: 'center', rng: () => 0.5 }, tuning);
  const windy = launchParams(judged, { aim: 'center', rng: () => 0.5, windBiasDeg: 10 }, tuning);
  expect(windy.directionDeg - calm.directionDeg).toBeCloseTo(10);
});

it('special move multiplies power', () => {
  const v = launchParams(judgeKick(0, tuning), { aim: 'center', powerMult: 1.35 }, tuning);
  const k = tuning.kick;
  expect(v.speed).toBeCloseTo((k.baseBallSpeedMs + k.power.PERFECT * (k.maxBallSpeedMs - k.baseBallSpeedMs)) * 1.35);
});

it('flickShape: short flick = low liner, long flick = sky ball', () => {
  const short = flickShape({ risePx: FLICK.minRisePx, durMs: 80 });
  const long = flickShape({ risePx: FLICK.maxRisePx, durMs: 200 });
  expect(short.loftDeg).toBeCloseTo(FLICK.minLoftDeg);
  expect(long.loftDeg).toBeCloseTo(FLICK.maxLoftDeg);
  // liner intent stays below the HR loft gate; a full flick clears it
  expect(short.loftDeg).toBeLessThan(FLICK.hrMinLoftDeg);
  expect(long.loftDeg).toBeGreaterThan(FLICK.hrMinLoftDeg);
});

it('flickShape: snap speed scales distance inside the band, and clamps', () => {
  const lazy = flickShape({ risePx: 100, durMs: 100 / FLICK.lazyPxMs });
  const snap = flickShape({ risePx: 100, durMs: 100 / FLICK.snapPxMs });
  expect(lazy.speedScale).toBeCloseTo(FLICK.speedScale[0]);
  expect(snap.speedScale).toBeCloseTo(FLICK.speedScale[1]);
  const beyond = flickShape({ risePx: 900, durMs: 1 });
  expect(beyond.loftDeg).toBeCloseTo(FLICK.maxLoftDeg);
  expect(beyond.speedScale).toBeCloseTo(FLICK.speedScale[1]);
});

it('flickShape: no metrics -> null (AI path keeps the quality loft table)', () => {
  expect(flickShape(null)).toBeNull();
  expect(flickShape({ risePx: 0, durMs: 100 })).toBeNull();
  const ai = launchParams(judgeKick(0, tuning), { aim: 'center' }, tuning);
  expect(ai.loftDeg).toBe(tuning.kick.loftDeg.PERFECT);
});

it('launchParams: flick shape overrides loft and scales speed for the player', () => {
  const judged = judgeKick(0, tuning);
  const shape = flickShape({ risePx: FLICK.maxRisePx, durMs: 120 });
  const v = launchParams(judged, { aimDeg: 0, power01: 1, shape }, tuning);
  const k = tuning.kick;
  expect(v.loftDeg).toBeCloseTo(shape.loftDeg);
  expect(v.speed).toBeCloseTo(k.maxBallSpeedMs * shape.speedScale);
});
