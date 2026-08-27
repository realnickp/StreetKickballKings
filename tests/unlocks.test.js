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
  careerAdd(s, { hr: 2, wins: 1 });
  const fresh = checkUnlocks(s).map((g) => g.id);
  expect(fresh).toContain('taunt-cry');          // first win
  expect(fresh).not.toContain('kick-hurricane'); // needs 3 HR
  expect(checkUnlocks(s)).toEqual([]); // no re-fire
  careerAdd(s, { hr: 1 });
  expect(checkUnlocks(s).map((g) => g.id)).toContain('kick-hurricane');
  expect(isUnlocked(s, 'kick-hurricane')).toBe(true);
});

it('equip requires ownership + matching category; null resets the slot', () => {
  const s = mem();
  expect(equipGear(s, 'kick', 'kick-hurricane')).toBe(false); // locked
  careerAdd(s, { hr: 3 });
  checkUnlocks(s);
  expect(equipGear(s, 'cleats', 'kick-hurricane')).toBe(false); // wrong slot
  expect(equipGear(s, 'kick', 'kick-hurricane')).toBe(true);
  expect(equippedGear(s).kick.id).toBe('kick-hurricane');
  expect(equippedGear(s).cleats.id).toBe('cleats-fire');
  expect(equipGear(s, 'kick', null)).toBe(true);
  expect(equippedGear(s).kick.id).toBe('kick-flair'); // stock fallback
});

it('no gear rides the road-win counter (every game is played away — roadWins ≡ wins)', () => {
  expect(GEAR.some((g) => g.unlock?.stat === 'roadWins')).toBe(false);
});

it('special kicks never hit softer than the stock crown kick (powerMult ≥ 1.35)', () => {
  for (const g of GEAR) {
    if (g.cat === 'kick') expect(g.mods.powerMult).toBeGreaterThanOrEqual(1.35);
  }
});

it('catalog integrity: unique ids, valid categories, kicks carry clips+mods', () => {
  const ids = new Set(GEAR.map((g) => g.id));
  expect(ids.size).toBe(GEAR.length);
  for (const g of GEAR) {
    expect(['kick', 'taunt', 'cleats', 'uniform']).toContain(g.cat);
    expect(g.hint.length).toBeGreaterThan(3);
    if (g.stock) {
      expect(g.unlock).toBe(null); // owned from day one — no threshold
    } else {
      expect(g.unlock.n).toBeGreaterThan(0);
    }
    if (g.cat === 'kick') {
      expect(g.clip).toMatch(/^kick[A-Z]/);
      expect(g.mods.powerMult).toBeGreaterThan(1);
    } else if (g.cat === 'taunt') {
      expect(g.clip).toMatch(/^taunt[A-Z]/);
    } else {
      expect(g.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  }
  expect(gearById('kick-flair').cat).toBe('kick');
  expect(gearById('nope')).toBe(null);
});

it('every cleat carries a real speed multiplier', () => {
  const cleats = GEAR.filter((g) => g.cat === 'cleats');
  expect(cleats.map((g) => g.speedMult)).toEqual([1.06, 1.06, 1.08, 1.08, 1.10, 1.12]);
  expect(gearById('cleats-ice').stealMult).toBe(1.1);
});

it('stock items are owned from day one, never toast, and fill an empty slot', () => {
  const s = mem();
  expect(isUnlocked(s, 'taunt-point')).toBe(true);
  expect(checkUnlocks(s).map((g) => g.id)).not.toContain('taunt-point');
  expect(equippedGear(s).taunt?.id).toBe('taunt-point');
  expect(equipGear(s, 'taunt', 'taunt-cry')).toBe(false);          // not earned
  careerAdd(s, { wins: 1 }); checkUnlocks(s);
  expect(equipGear(s, 'taunt', 'taunt-cry')).toBe(true);
  expect(equippedGear(s).taunt.id).toBe('taunt-cry');
});

it('the new kicks and taunts unlock on realistic career marks', () => {
  const s = mem();
  careerAdd(s, { games: 5, runs: 20 });
  expect(checkUnlocks(s).map((g) => g.id).sort()).toEqual(['kick-armada', 'kick-martelo']);
  careerAdd(s, { perfects: 10, hr: 25, blowouts: 3, wins: 10, runs: 30, games: 5 });
  const ids = checkUnlocks(s).map((g) => g.id);
  // kick-bicycle stays out of the catalog (0.67s fragment clip — see unlocks.js);
  // its trigger (runs >= 50) is still reached here, but no such GEAR entry exists.
  for (const id of ['kick-punt', 'kick-kipup', 'kick-flip', 'kick-scissor', 'taunt-gesture', 'taunt-chest', 'taunt-cry']) expect(ids).toContain(id);
  expect(careerGet(s).games).toBe(10);
});

it('THE FLAIR and FIRE REDS are free from day one and fielded by default', () => {
  const s = mem();
  expect(isUnlocked(s, 'kick-flair')).toBe(true);
  expect(isUnlocked(s, 'cleats-fire')).toBe(true);
  expect(equippedGear(s).kick.id).toBe('kick-flair');
  expect(equippedGear(s).cleats.id).toBe('cleats-fire');
  expect(checkUnlocks(s).map((g) => g.id)).not.toContain('kick-flair');
  expect(GEAR.filter((g) => g.stock).map((g) => g.id).sort()).toEqual(['cleats-fire', 'kick-flair', 'taunt-point']);
});
