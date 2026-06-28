import { describe, it, expect } from 'vitest';
import { PITCH_PATTERNS, PITCH_FAMILIES, PITCH_FAMILY_MENU, pickVariant } from '../src/game/pitchPattern.js';
import { aiThrowsFire } from '../src/game/ai.js';
import tuning from '../src/data/tuning.json';

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
