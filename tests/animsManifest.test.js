import { describe, it, expect } from 'vitest';
import manifest from '../src/data/anims.manifest.json';
import { GEAR } from '../src/meta/unlocks.js';

// Every animation name the game asks for must exist in the manifest.
const REQUIRED = [
  'idle', 'plate', 'crouch', 'holdball', 'run', 'strafeL', 'strafeR',
  'kick', 'throw', 'pitch', 'catch', 'slide', 'juke', 'stumble',
  'walk', 'swagger', 'dance1', 'dance2', 'dance3', 'dance4', 'dejected',
  'dive', 'climb', 'climbDown', // Street Calls: dive call + fence rob
  // extras pack (mocap-x-*): walkout choreography, celebration pool, pickle spin
  'thriller1', 'thriller2', 'thriller3', 'thriller4',
  'danceLock', 'danceTut', 'danceWave', 'danceChicken', 'danceStep', 'danceSilly',
  'soccerSpin',
  // pack k: the taunt pool (the seven new kicks ride the LOCKER gear check)
  'tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser',
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
      if (m.foot != null) expect(['L', 'R']).toContain(m.foot);
    }
  });
  it('one-shots that drive gameplay have contact marks', () => {
    for (const n of ['kick', 'throw', 'pitch']) {
      const m = manifest.find((x) => x.name === n);
      expect(m.loop).toBe(false);
      expect(m.contactAt, `${n} needs contactAt`).toBeGreaterThan(0);
    }
  });
  it('every LOCKER special kick maps to a baked one-shot with a contact mark', () => {
    for (const g of GEAR.filter((x) => x.cat === 'kick')) {
      const m = manifest.find((x) => x.name === g.clip);
      expect(m, `${g.id} clip ${g.clip} missing from manifest`).toBeTruthy();
      expect(m.loop).toBe(false);
      expect(m.contactAt, `${g.clip} needs contactAt`).toBeGreaterThan(0);
      expect(['x', 'k']).toContain(m.pack);
    }
  });
  it('taunts are one-shot, in-place, short', () => {
    for (const n of ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser']) {
      const m = manifest.find((x) => x.name === n);
      expect(m.pack).toBe('k'); expect(m.loop).toBe(false); expect(m.inPlace).toBe(true);
      expect(m.trim[1] - m.trim[0]).toBeLessThanOrEqual(1.8);
    }
  });
  it('acrobatic kicks release the ball when the move lands, not mid-flip', () => {
    for (const [n, v] of [['kickFlair', 0.94], ['kickKipUp', 0.93], ['kickSpinFlip', 0.90]]) expect(manifest.find((m) => m.name === n).contactAt, n).toBe(v);
  });
  // Meia Lua is NOT a flip that lands on the ball — it is a crescent whose heel
  // sweeps THROUGH the strike and then follows through for another ~0.4 s. Held
  // at the old landing mark (0.86) the ball left the foot after the kick was
  // already over (dev, 2026-08-28). Both marks come from the frame-by-frame FK
  // probe (docs: task-C report): the striking foot's peak +z speed inside the
  // window where it rides above hip height, identical on arch-locs and
  // arch-sprint — kickMeia frame 52 of 87 (t 0.8667 / 1.43), kickMeiaBack frame
  // 72 of 97 (t 1.200 / 1.60). Both sit at 94–98% of the swing's max forward
  // reach, ~0.37 s before the plant.
  it('Meia Lua releases at the strike frame, not at the plant', () => {
    for (const [n, v] of [['kickMeia', 0.606], ['kickMeiaBack', 0.75]]) {
      const m = manifest.find((x) => x.name === n);
      expect(m.contactAt, n).toBe(v);
      // still inside the swing, never at the very end of the clip
      expect(m.contactAt, `${n} must not fire at the tail`).toBeLessThan(0.8);
      expect(m.contactAt, `${n} must not fire during the wind-up`).toBeGreaterThan(0.5);
    }
  });
  it('Meia keeps the striking foot the ball rides', () => {
    expect(manifest.find((m) => m.name === 'kickMeia').foot).toBe('R');
    expect(manifest.find((m) => m.name === 'kickMeiaBack').foot).toBe('L');
  });
});
