// The hair/shoe fence is cached as a BITSET (round 4 re-review): the packing
// math and the "no fence → no flood" contract both need pinning, or a future
// refactor brings the white wig back with nothing in CI to catch it.
import { describe, it, expect } from 'vitest';
import { packBits, unpackBits, hairShoeFence } from '../src/game/glbCharacters.js';

describe('fence bitset', () => {
  it('round-trips an arbitrary 0/1 mask, odd lengths included', () => {
    for (const n of [1, 7, 8, 9, 1001, 4096]) {
      const m = new Uint8Array(n);
      let seed = 1234 + n;
      for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; m[i] = (seed >> 7) & 1; }
      const bits = packBits(m);
      expect(bits.length).toBe((n + 7) >> 3);
      expect(Array.from(unpackBits(bits, n))).toEqual(Array.from(m));
    }
  });
  it('packs eight texels to a byte, LSB first', () => {
    const bits = packBits(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1, 1]));
    expect(bits[0]).toBe(0b10000001);
    expect(bits[1]).toBe(0b00000001);
  });
});

describe('hairShoeFence — no fence means no flood', () => {
  const bone = (name) => ({ name });
  const attr = (count, comps, fill) => ({ count, itemSize: comps, getX: () => 0, getY: () => 0, getComponent: () => fill });
  it('returns null for a mesh that is not skinned (arch-band ships unskinned)', () => {
    expect(hairShoeFence({ isSkinnedMesh: false }, 64, 64)).toBe(null);
    expect(hairShoeFence({ isSkinnedMesh: true, geometry: null, skeleton: null }, 64, 64)).toBe(null);
  });
  it('returns null when the rig has no skin attributes or no head/foot bones', () => {
    const noSkin = { isSkinnedMesh: true, geometry: { uuid: 'a', getAttribute: (k) => (k === 'uv' ? attr(3, 2, 0) : null), index: null }, skeleton: { bones: [bone('Head')] } };
    expect(hairShoeFence(noSkin, 64, 64)).toBe(null);
    const noHead = { isSkinnedMesh: true, geometry: { uuid: 'b', getAttribute: () => attr(3, 4, 1), index: null }, skeleton: { bones: [bone('Hips'), bone('Spine')] } };
    expect(hairShoeFence(noHead, 64, 64)).toBe(null);
  });
  it('returns null (and does not cache) when the geometry throws', () => {
    const boom = { isSkinnedMesh: true, geometry: { uuid: 'c', getAttribute: () => { throw new Error('boom'); }, index: null }, skeleton: { bones: [bone('Head')] } };
    expect(hairShoeFence(boom, 64, 64)).toBe(null);
    expect(hairShoeFence(boom, 64, 64)).toBe(null); // still recomputed, still null — never cached
  });
});
