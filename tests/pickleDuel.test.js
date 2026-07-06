import { describe, it, expect } from 'vitest';
import { PickleDuel, shuttleDir } from '../src/game/pickleDuel.js';
import tuning from '../src/data/tuning.json';

const mk = (over = {}) => new PickleDuel({ mine: true, difficulty: 'Street', tuning, rng: () => 0.5, ...over });

describe('shuttleDir', () => {
  it('drifts away from the ball', () => {
    expect(shuttleDir({ runnerT: 0.5, ballT: 0.9 })).toBe(-1); // ball ahead -> retreat
    expect(shuttleDir({ runnerT: 0.5, ballT: 0.1 })).toBe(1);  // ball behind -> press on
  });
});

describe('GO', () => {
  it('is only legal while the ball is flying', () => {
    const d = mk();
    expect(d.canGo(false)).toBe(false);
    expect(d.canGo(true)).toBe(true);
  });
  it('commits AWAY from the throw target and grades earlier breaks higher', () => {
    const d = mk();
    expect(d.go({ flightFrac: 0.2, throwToEnd: 1 })).toBe(true);
    expect(d.committed).toBe(true);
    expect(d.commitDir).toBe(-1);            // ball heading forward -> break back
    expect(d.goGrade).toBeCloseTo(0.8);
    const d2 = mk();
    d2.go({ flightFrac: 0.9, throwToEnd: 0 });
    expect(d2.commitDir).toBe(1);            // ball heading back -> break forward
    expect(d2.goGrade).toBeCloseTo(0.1);
  });
  it('cannot double-commit', () => {
    const d = mk();
    d.go({ flightFrac: 0.5, throwToEnd: 1 });
    expect(d.go({ flightFrac: 0.5, throwToEnd: 0 })).toBe(false);
  });
  it('runRate: shuttle when uncommitted, graded burst when committed', () => {
    const d = mk();
    expect(d.runRate()).toBe(tuning.duel.shuttleRate);
    d.go({ flightFrac: 0, throwToEnd: 1 });
    expect(d.runRate()).toBeCloseTo(tuning.duel.goRateBase + tuning.duel.goRateGradeBonus);
  });
});

describe('SPIN', () => {
  it('grants i-frames that dodge a tag once, then cooldown gates it', () => {
    const d = mk();
    expect(d.spin()).toBe(true);
    expect(d.tagAttempt()).toBe('dodged');
    expect(d.tagAttempt()).toBe('tagged');   // i-frames consumed by the dodge
    expect(d.spin()).toBe(false);            // cooldown
  });
  it('an unused spin ends in recovery frames that block GO', () => {
    const d = mk();
    d.spin();
    d.tick(tuning.duel.spinIframeS + 0.01);  // spin expires, nothing dodged
    expect(d.recoverT).toBeGreaterThan(0);
    expect(d.canGo(true)).toBe(false);
    d.tick(tuning.duel.spinRecoverS);
    expect(d.canGo(true)).toBe(true);
  });
});

describe('PEG resolution', () => {
  it('spin i-frames dodge a peg', () => {
    const d = mk();
    d.spin();
    expect(d.pegImpact({ lateralM: 0 })).toBe('dodged');
  });
  it('a big juke offset dodges a peg', () => {
    const d = mk();
    expect(d.pegImpact({ lateralM: tuning.duel.pegJukeDodgeM + 0.1 })).toBe('dodged');
  });
  it('flat-footed runner is hit', () => {
    const d = mk();
    expect(d.pegImpact({ lateralM: 0 })).toBe('hit');
  });
});
