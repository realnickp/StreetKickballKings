import { describe, it, expect } from 'vitest';
import { PITCH_PATTERNS, PITCH_MENU, resample, scoreTrace } from '../src/game/pitchPattern.js';

// A "perfect" screen trace = the pattern with y flipped to screen space (y-down),
// since players draw bottom-to-top while patterns are stored y-up.
const asScreenTrace = (pattern) => pattern.map(p => ({ x: p.x, y: 1 - p.y }));

describe('pitch patterns', () => {
  it('exposes all 5 canonical pitches with patterns', () => {
    expect(PITCH_MENU.map(p => p.id)).toEqual(['fastball', 'curveLeft', 'curveRight', 'changeup', 'bouncy']);
    for (const { id } of PITCH_MENU) expect(PITCH_PATTERNS[id].length).toBeGreaterThanOrEqual(2);
  });

  it('resamples a polyline to exactly N points', () => {
    const pts = resample([{ x: 0, y: 0 }, { x: 1, y: 1 }], 24);
    expect(pts.length).toBe(24);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
  });

  it('grades a faithful trace as high quality', () => {
    for (const { id } of PITCH_MENU) {
      const r = scoreTrace(asScreenTrace(PITCH_PATTERNS[id]), PITCH_PATTERNS[id], { durMs: 900 });
      expect(r.quality).toBeGreaterThan(0.85);
      expect(r.accuracy).toBeGreaterThan(0.85);
    }
  });

  it('grades a wrong shape lower than the right one', () => {
    const right = scoreTrace(asScreenTrace(PITCH_PATTERNS.curveLeft), PITCH_PATTERNS.curveLeft, { durMs: 900 });
    const wrong = scoreTrace(asScreenTrace(PITCH_PATTERNS.bouncy), PITCH_PATTERNS.curveLeft, { durMs: 900 });
    expect(wrong.quality).toBeLessThan(right.quality);
  });

  it('returns zero for an empty or trivial stroke', () => {
    expect(scoreTrace([], PITCH_PATTERNS.fastball).quality).toBe(0);
    expect(scoreTrace([{ x: 5, y: 5 }], PITCH_PATTERNS.fastball).quality).toBe(0);
  });

  it('a brisk trace scores at least as well as a slow one', () => {
    const fast = scoreTrace(asScreenTrace(PITCH_PATTERNS.fastball), PITCH_PATTERNS.fastball, { durMs: 600 });
    const slow = scoreTrace(asScreenTrace(PITCH_PATTERNS.fastball), PITCH_PATTERNS.fastball, { durMs: 2600 });
    expect(fast.quality).toBeGreaterThanOrEqual(slow.quality);
  });
});
