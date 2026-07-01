import { describe, it, expect } from 'vitest';
import { PITCH_PATTERNS, PITCH_FAMILIES, PITCH_FAMILY_MENU, pickVariant, makePitch } from '../src/game/pitchPattern.js';
import { aiThrowsFire } from '../src/game/ai.js';
import tuning from '../src/data/tuning.json';

// Tiny seeded RNG (LCG) for deterministic variety checks.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('pitch families', () => {
  it('has three families of four variants each (12 total)', () => {
    expect(Object.keys(PITCH_FAMILIES)).toEqual(['HEAT', 'BREAK', 'JUNK']);
    const all = Object.values(PITCH_FAMILIES).flat();
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12); // no id appears in two families
  });

  it('the family menu lists exactly the three families', () => {
    expect(PITCH_FAMILY_MENU.map(f => f.id)).toEqual(['HEAT', 'BREAK', 'JUNK']);
  });

  it('pickVariant always returns an id from the requested family', () => {
    for (const family of Object.keys(PITCH_FAMILIES)) {
      for (let i = 0; i < 200; i++) {
        const id = pickVariant(family, Math.random);
        expect(PITCH_FAMILIES[family]).toContain(id);
      }
    }
  });

  it('pickVariant covers every variant given a sweeping rng', () => {
    for (const [family, ids] of Object.entries(PITCH_FAMILIES)) {
      const seen = new Set();
      for (let i = 0; i < ids.length; i++) {
        // rng lands deterministically in each bucket
        const id = pickVariant(family, () => (i + 0.5) / ids.length);
        seen.add(id);
      }
      expect([...seen].sort()).toEqual([...ids].sort());
    }
  });

  it('pickVariant returns null for an unknown family', () => {
    expect(pickVariant('NOPE')).toBeNull();
  });

  it('every family id has a pattern and a tuning entry', () => {
    for (const ids of Object.values(PITCH_FAMILIES)) {
      for (const id of ids) {
        expect(PITCH_PATTERNS[id], `pattern for ${id}`).toBeDefined();
        expect(PITCH_PATTERNS[id].length).toBeGreaterThanOrEqual(2);
        const t = tuning.pitch.types[id];
        expect(t, `tuning for ${id}`).toBeDefined();
        expect(t.speedMph).toHaveLength(2);
        expect(typeof t.durScale).toBe('number');
        expect(typeof t.curveM).toBe('number');
        expect(typeof t.ease).toBe('number');
        expect(typeof t.bounce).toBe('number');
      }
    }
  });
});

describe('makePitch (procedural pitch generator)', () => {
  it('returns a valid, traceable shape + physics for every family', () => {
    for (const family of Object.keys(PITCH_FAMILIES)) {
      const fam = tuning.pitch.families[family];
      const rng = lcg(42);
      for (let i = 0; i < 300; i++) {
        const p = makePitch(family, tuning, rng);
        expect(p.family).toBe(family);
        expect(typeof p.label).toBe('string');
        // points: at least a stroke, normalized, starts at the bottom, ends at the top
        expect(p.points.length).toBeGreaterThanOrEqual(2);
        expect(p.points[0].y).toBe(0);
        expect(p.points[p.points.length - 1].y).toBe(1);
        for (const pt of p.points) {
          expect(pt.x).toBeGreaterThanOrEqual(0.06);
          expect(pt.x).toBeLessThanOrEqual(0.94);
          expect(pt.y).toBeGreaterThanOrEqual(0);
          expect(pt.y).toBeLessThanOrEqual(1);
        }
        // physics in the family's configured ranges
        expect(p.speedMph).toBeGreaterThanOrEqual(fam.speedMph[0]);
        expect(p.speedMph).toBeLessThanOrEqual(fam.speedMph[1]);
        expect(p.durScale).toBeGreaterThanOrEqual(fam.durScale[0]);
        expect(p.durScale).toBeLessThanOrEqual(fam.durScale[1]);
      }
    }
  });

  it('breaks hook (big curveM) while heat barely tails and junk runs straight', () => {
    const rng = lcg(7);
    for (let i = 0; i < 100; i++) {
      expect(Math.abs(makePitch('HEAT', tuning, rng).curveM)).toBeLessThanOrEqual(1);
      expect(Math.abs(makePitch('BREAK', tuning, rng).curveM)).toBeGreaterThanOrEqual(1.7);
      expect(makePitch('JUNK', tuning, rng).curveM).toBe(0);
    }
  });

  it('almost never repeats the same shape (high variety)', () => {
    const rng = lcg(123);
    const seen = new Set();
    const N = 200;
    for (let i = 0; i < N; i++) {
      const p = makePitch('BREAK', tuning, rng);
      seen.add(p.points.map(pt => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join('|'));
    }
    expect(seen.size).toBeGreaterThan(N * 0.9); // >90% of generated shapes are unique
  });

  it('returns null for an unknown family', () => {
    expect(makePitch('NOPE', tuning)).toBeNull();
  });
});

describe('aiThrowsFire', () => {
  it('is deterministic against a seeded rng vs the configured chance', () => {
    const t = tuning;
    // King chance is 0.25: rng below fires, at/above does not.
    expect(aiThrowsFire('King', t, () => 0.1)).toBe(true);
    expect(aiThrowsFire('King', t, () => 0.9)).toBe(false);
    // Rookie chance is 0.0: never fires.
    expect(aiThrowsFire('Rookie', t, () => 0.0)).toBe(false);
    // Unknown difficulty falls back to 0 (never fires).
    expect(aiThrowsFire('Legend', t, () => 0.0)).toBe(false);
  });
});
