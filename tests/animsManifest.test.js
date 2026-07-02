import { describe, it, expect } from 'vitest';
import manifest from '../src/data/anims.manifest.json';

// Every animation name the game asks for must exist in the manifest.
const REQUIRED = [
  'idle', 'plate', 'crouch', 'holdball', 'run', 'strafeL', 'strafeR',
  'kick', 'throw', 'pitch', 'catch', 'slide', 'juke', 'stumble',
  'walk', 'swagger', 'dance1', 'dance2', 'dance3', 'dance4', 'dejected',
];

describe('anims manifest', () => {
  it('covers every game animation name', () => {
    const names = manifest.map((m) => m.name);
    for (const n of REQUIRED) expect(names, `missing ${n}`).toContain(n);
  });
  it('entries are well-formed', () => {
    for (const m of manifest) {
      expect(typeof m.file).toBe('string');
      expect(m.file.endsWith('.fbx')).toBe(true);
      expect(typeof m.name).toBe('string');
      expect(typeof m.loop).toBe('boolean');
      if (m.contactAt != null) { expect(m.contactAt).toBeGreaterThan(0); expect(m.contactAt).toBeLessThan(1); }
      if (m.trim != null) { expect(m.trim.length).toBe(2); expect(m.trim[0]).toBeLessThan(m.trim[1]); }
      if (m.rate != null) expect(m.rate).toBeGreaterThan(0);
    }
  });
  it('one-shots that drive gameplay have contact marks', () => {
    for (const n of ['kick', 'throw', 'pitch']) {
      const m = manifest.find((x) => x.name === n);
      expect(m.loop).toBe(false);
      expect(m.contactAt, `${n} needs contactAt`).toBeGreaterThan(0);
    }
  });
});
