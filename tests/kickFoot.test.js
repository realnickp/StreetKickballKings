import { it, expect } from 'vitest';
import { footBoneRegex } from '../src/game/kickTiming.js';
import manifest from '../src/data/anims.manifest.json';
import { GEAR } from '../src/meta/unlocks.js';

it('picks the striking foot bone by manifest meta, right by default', () => {
  expect(footBoneRegex('L').test('mixamorigLeftFoot')).toBe(true);
  expect(footBoneRegex('L').test('mixamorigRightToeBase')).toBe(false);
  expect(footBoneRegex('R').test('RightToe_End')).toBe(true);
  expect(footBoneRegex(undefined).test('RightFoot')).toBe(true);
});

it('every kick clip in the manifest declares its striking foot', () => {
  const kicks = [manifest.find((m) => m.name === 'kick'), ...GEAR.filter((g) => g.cat === 'kick').map((g) => manifest.find((m) => m.name === g.clip))];
  for (const m of kicks) expect(['L', 'R'], `${m?.name} needs foot`).toContain(m?.foot);
});
