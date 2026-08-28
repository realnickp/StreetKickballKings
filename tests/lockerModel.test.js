import { it, expect } from 'vitest';
import { lockerTabs, TABS } from '../src/ui/lockerModel.js';
import { SaveManager } from '../src/meta/save.js';
import * as unlocks from '../src/meta/unlocks.js';

const mem = () => new SaveManager({ backend: 'memory' });
it('four tabs, owned chips first, stock marked, counts honest', () => {
  const s = mem();
  const tabs = lockerTabs({ GEAR: unlocks.GEAR, isUnlocked: (id) => unlocks.isUnlocked(s, id), eq: unlocks.equippedGear(s) });
  expect(tabs.map((t) => t.cat)).toEqual(TABS.map((t) => t.cat));
  const kicks = tabs.find((t) => t.cat === 'kick');
  expect(kicks.chips[0].id).toBe('kick-flair');           // stock + equipped floats to the top
  expect(kicks.chips[0].on && kicks.chips[0].stock).toBe(true);
  expect(kicks.chips.findIndex((c) => !c.owned)).toBeGreaterThan(0);
  expect(kicks.chips.slice(kicks.chips.findIndex((c) => !c.owned)).every((c) => !c.owned)).toBe(true);
  expect(kicks.owned).toBe(1); expect(kicks.total).toBe(14);
  const kits = tabs.find((t) => t.cat === 'uniform');
  // AUTO leads the KITS row and is what a fresh save wears: bare = "let the
  // match dress me", a choice no LIGHT/DARK chip can express
  expect(kits.chips[0]).toMatchObject({ id: null, name: 'AUTO', on: true, owned: true });
  expect(tabs.find((t) => t.cat === 'taunt').chips.some((c) => c.id === null)).toBe(false);
});
