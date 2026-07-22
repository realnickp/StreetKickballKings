import { it, expect } from 'vitest';
import { SaveManager } from '../src/meta/save.js';
import { claimTrophy, hasTrophy, equipCrew, equippedCrew } from '../src/meta/trophies.js';

const mem = () => new SaveManager({ backend: 'memory' });

it('claims a trophy once and only once', () => {
  const s = mem();
  expect(claimTrophy(s, 'bullies')).toEqual({ claimed: true, count: 1, king: false });
  expect(claimTrophy(s, 'bullies').claimed).toBe(false);
  expect(hasTrophy(s, 'bullies')).toBe(true);
  expect(hasTrophy(s, 'funk')).toBe(false);
});

it('the 9th rival crowns you KING exactly once', () => {
  const s = mem();
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (const id of ids) expect(claimTrophy(s, id).king).toBe(false);
  expect(claimTrophy(s, 'i').king).toBe(true);
  expect(claimTrophy(s, 'j').king).toBe(false); // 10th: already king
  expect(s.get('kingOfStreets')).toBe(true);
});

it('equip requires the trophy; null resets to classic', () => {
  const s = mem();
  expect(equipCrew(s, 'funk')).toBe(false);
  claimTrophy(s, 'funk');
  expect(equipCrew(s, 'funk')).toBe(true);
  expect(equippedCrew(s)).toBe('funk');
  expect(equipCrew(s, null)).toBe(true);
  expect(equippedCrew(s)).toBe(null);
});
