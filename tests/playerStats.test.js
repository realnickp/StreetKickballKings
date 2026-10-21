import { describe, it, expect } from 'vitest';
import tuning from '../src/data/tuning.json';
import { statMult, kickPowerFor, runSpeedFor, throwArmFor, gloveFor } from '../src/game/playerStats.js';

const ch = (stats) => ({ data: { stats } });

describe('stats that matter (story matches only)', () => {
  it('5 is neutral; every point is a few percent', () => {
    expect(statMult('power', 5, tuning)).toBe(1);
    expect(statMult('power', 10, tuning)).toBeCloseTo(1.15);
    expect(statMult('glove', 1, tuning)).toBeCloseTo(0.84);
    expect(statMult('speed', 9, tuning)).toBeCloseTo(1.1);
  });
  it('clamps to the 1–10 scale', () => {
    expect(statMult('power', 0, tuning)).toBe(statMult('power', 1, tuning));
    expect(statMult('power', 12, tuning)).toBe(statMult('power', 10, tuning));
  });
  it('off (Quick Play) is always exactly 1', () => {
    const big = ch({ power: 10, speed: 10, arm: 10, glove: 10 });
    expect(kickPowerFor(big, false, tuning)).toBe(1);
    expect(runSpeedFor(big, false, tuning)).toBe(1);
    expect(throwArmFor([big], false, tuning)).toBe(1);
    expect(gloveFor(big, false, tuning)).toBe(1);
  });
  it('on: kicker power, runner speed, the fielding side’s average arm, the catcher’s glove', () => {
    expect(kickPowerFor(ch({ power: 8 }), true, tuning)).toBeCloseTo(1.09);
    expect(runSpeedFor(ch({ speed: 3 }), true, tuning)).toBeCloseTo(0.95);
    expect(throwArmFor([ch({ arm: 9 }), ch({ arm: 3 })], true, tuning)).toBeCloseTo(1.03);
    expect(gloveFor(ch({ glove: 7 }), true, tuning)).toBeCloseTo(1.08);
  });
  it('missing chars or stats fall back to neutral', () => {
    expect(kickPowerFor(null, true, tuning)).toBe(1);
    expect(runSpeedFor({ data: {} }, true, tuning)).toBe(1);
    expect(throwArmFor([], true, tuning)).toBe(1);
  });
});
