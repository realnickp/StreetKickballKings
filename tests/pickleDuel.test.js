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

describe('defense verbs', () => {
  it('startPeg opens a windup and blocks a second peg / relay until it lands', () => {
    const d = mk({ mine: false });
    expect(d.startPeg()).toBe(true);
    expect(d.pegWindupT).toBeCloseTo(tuning.duel.pegWindupS);
    expect(d.startPeg()).toBe(false);
    expect(d.canThrow()).toBe(false);
    d.tick(tuning.duel.pegWindupS + 0.01);
    expect(d.canThrow()).toBe(true);
  });
});

describe('AI defense (player offense)', () => {
  it('relays on its difficulty clock while the runner is uncommitted and far', () => {
    const d = mk({ mine: true });
    expect(d.aiDefense(0.1, { ballFlying: false, holderDist: 6, runnerCommitted: false })).toBe(null);
    expect(d.aiDefense(tuning.duel.aiRelayS.Street, { ballFlying: false, holderDist: 6, runnerCommitted: false })).toBe('relay');
  });
  it('pegs a committed runner (rng under aiPegChance)', () => {
    const d = mk({ mine: true, rng: () => 0.0 });
    expect(d.aiDefense(tuning.duel.aiRelayS.Street, { ballFlying: false, holderDist: 6, runnerCommitted: true })).toBe('peg');
  });
  it('never relays while a throw is already up', () => {
    const d = mk({ mine: true });
    expect(d.aiDefense(5, { ballFlying: true, holderDist: 6, runnerCommitted: false })).toBe(null);
  });
  it('stops relaying after maxRelays (forces a resolution)', () => {
    const d = mk({ mine: true, rng: () => 0.99 });
    let relays = 0;
    for (let i = 0; i < 20; i++) {
      if (d.aiDefense(2.0, { ballFlying: false, holderDist: 6, runnerCommitted: false }) === 'relay') { relays++; d.relays++; }
    }
    expect(relays).toBeLessThanOrEqual(tuning.duel.maxRelays);
  });
});

describe('AI offense (player defense)', () => {
  it('breaks (go) after its reaction time once a throw is in the air', () => {
    const d = mk({ mine: false });
    expect(d.aiOffense(0.05, { ballFlying: true, flightFrac: 0.1, throwToEnd: 1, holderDist: 6, pegIncoming: false })).toBe(null);
    const act = d.aiOffense(tuning.duel.aiGoReactS.Street, { ballFlying: true, flightFrac: 0.3, throwToEnd: 1, holderDist: 6, pegIncoming: false });
    expect(act?.type).toBe('go');
  });
  it('spins against an incoming peg when the roll passes', () => {
    const d = mk({ mine: false, rng: () => 0.0 });
    const act = d.aiOffense(0.1, { ballFlying: false, flightFrac: 0, throwToEnd: 0, holderDist: 2, pegIncoming: true });
    expect(act?.type).toBe('spin');
  });
  it('a failed spin roll never dodges within the same windup', () => {
    const d = mk({ mine: false, rng: () => 0.99 });
    expect(d.aiOffense(0.1, { ballFlying: false, flightFrac: 0, throwToEnd: 0, holderDist: 2, pegIncoming: true })).toBe(null);
    expect(d.aiOffense(0.4, { ballFlying: false, flightFrac: 0, throwToEnd: 0, holderDist: 2, pegIncoming: true })).toBe(null);
  });
});
