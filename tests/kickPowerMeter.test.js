import { describe, it, expect } from 'vitest';
import { powerFromError, launchParams, judgeKick } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';

describe('powerFromError', () => {
  it('peaks at 1.0 on perfect timing', () => {
    expect(powerFromError(0, tuning)).toBeCloseTo(1, 5);
  });
  it('falls off linearly with error and clamps at 0', () => {
    expect(powerFromError(160, tuning)).toBeCloseTo(0.5, 2); // half of 320ms window
    expect(powerFromError(400, tuning)).toBe(0);
    expect(powerFromError(-400, tuning)).toBe(0);
  });
});

describe('launchParams speed scales with power01', () => {
  const judged = judgeKick(0, tuning); // PERFECT band
  it('uses power01 when provided', () => {
    const hot = launchParams(judged, { aim: 'center', power01: 1 }, tuning);
    const weak = launchParams(judged, { aim: 'center', power01: 0 }, tuning);
    expect(hot.speed).toBeCloseTo(tuning.kick.maxBallSpeedMs, 5);
    expect(weak.speed).toBeCloseTo(tuning.kick.baseBallSpeedMs, 5);
    expect(hot.speed).toBeGreaterThan(weak.speed);
  });
  it('falls back to the band power map when power01 is absent (AI path)', () => {
    const ai = launchParams(judged, { aim: 'center' }, tuning);
    const k = tuning.kick;
    const expected = k.baseBallSpeedMs + k.power.PERFECT * (k.maxBallSpeedMs - k.baseBallSpeedMs);
    expect(ai.speed).toBeCloseTo(expected, 5);
  });
});
