import { describe, it, expect } from 'vitest';
import { powerFromError, launchParams, judgeKick, isHrEligible } from '../src/game/kickTiming.js';
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

describe('isHrEligible', () => {
  it('true only when both the meter is in the sweet zone AND the kicker is aligned', () => {
    expect(isHrEligible({ power01: 0.95, alignErrM: 0.3 }, tuning)).toBe(true);
  });
  it('false when power is below the sweet zone', () => {
    expect(isHrEligible({ power01: 0.85, alignErrM: 0.1 }, tuning)).toBe(false);
  });
  it('false when the kicker is not lined up', () => {
    expect(isHrEligible({ power01: 1.0, alignErrM: 1.2 }, tuning)).toBe(false);
  });
});
