import { it, expect } from 'vitest';
import { SaveManager } from '../src/meta/save.js';
import { GEAR, gearById, careerAdd, careerGet, checkUnlocks, isUnlocked, equipGear, equippedGear } from '../src/meta/unlocks.js';
import { claimTrophy } from '../src/meta/trophies.js';

const mem = () => new SaveManager({ backend: 'memory' });

it('career counters accumulate across matches', () => {
  const s = mem();
  careerAdd(s, { wins: 1, hr: 2, runs: 6 });
  careerAdd(s, { hr: 1, steals: 3 });
  const c = careerGet(s);
  expect(c.wins).toBe(1);
  expect(c.hr).toBe(3);
  expect(c.runs).toBe(6);
  expect(c.steals).toBe(3);
  expect(c.defOuts).toBe(0);
});

it('crews/king derive from the trophy save keys', () => {
  const s = mem();
  expect(careerGet(s).crews).toBe(0);
  claimTrophy(s, 'bullies');
  claimTrophy(s, 'funk');
  expect(careerGet(s).crews).toBe(2);
  expect(careerGet(s).king).toBe(0);
});

it('checkUnlocks fires each item once at its threshold', () => {
  const s = mem();
  expect(checkUnlocks(s)).toEqual([]);
  careerAdd(s, { hr: 1, wins: 1 });
  const fresh = checkUnlocks(s).map((g) => g.id);
  expect(fresh).toContain('kick-flair');   // first HR
  expect(fresh).toContain('cleats-fire');  // first win
  expect(fresh).not.toContain('kick-hurricane'); // needs 3 HR
  expect(checkUnlocks(s)).toEqual([]); // no re-fire
  careerAdd(s, { hr: 2 });
  expect(checkUnlocks(s).map((g) => g.id)).toContain('kick-hurricane');
  expect(isUnlocked(s, 'kick-flair')).toBe(true);
});

it('equip requires ownership + matching category; null resets the slot', () => {
  const s = mem();
  expect(equipGear(s, 'kick', 'kick-flair')).toBe(false); // locked
  careerAdd(s, { hr: 1 });
  checkUnlocks(s);
  expect(equipGear(s, 'cleats', 'kick-flair')).toBe(false); // wrong slot
  expect(equipGear(s, 'kick', 'kick-flair')).toBe(true);
  expect(equippedGear(s).kick.id).toBe('kick-flair');
  expect(equippedGear(s).cleats).toBe(null);
  expect(equipGear(s, 'kick', null)).toBe(true);
  expect(equippedGear(s).kick).toBe(null);
});

it('catalog integrity: unique ids, valid categories, kicks carry clips+mods', () => {
  const ids = new Set(GEAR.map((g) => g.id));
  expect(ids.size).toBe(GEAR.length);
  for (const g of GEAR) {
    expect(['kick', 'cleats', 'uniform']).toContain(g.cat);
    expect(g.unlock.n).toBeGreaterThan(0);
    expect(g.hint.length).toBeGreaterThan(3);
    if (g.cat === 'kick') {
      expect(g.clip).toMatch(/^kick[A-Z]/);
      expect(g.mods.powerMult).toBeGreaterThan(1);
    } else {
      expect(g.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  }
  expect(gearById('kick-flair').cat).toBe('kick');
  expect(gearById('nope')).toBe(null);
});
