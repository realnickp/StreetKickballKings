import { it, expect } from 'vitest';
import { WALKUP, walkS, pickTaunt, tauntForSlot, tauntOrder, TAUNTS, WALKUP_SLOTS, stealAllowed }
  from '../src/game/walkup.js';
import teams from '../src/data/teams.json';

it('the walk covers start -> plate at the walk speed', () => {
  expect(walkS()).toBeCloseTo((WALKUP.plateX - WALKUP.startX) / WALKUP.mps);
  expect(walkS()).toBeLessThan(1.7);
});

// ---------- EVERY KICKER BRINGS HIS OWN (dev, 2026-08-28) ----------
const crews = teams.teams;

it('every crew deals its 8 kickers their own taunt: 5+ distinct, never twice in a row', () => {
  for (const team of crews) {
    const order = tauntOrder(team);
    expect(order).toHaveLength(WALKUP_SLOTS);
    expect(new Set(order).size).toBeGreaterThanOrEqual(5);
    for (const clip of order) expect(TAUNTS).toContain(clip);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    // the order LOOPS all game — the 8th kicker sits next to the leadoff
    expect(order[order.length - 1]).not.toBe(order[0]);
  }
});

it('the assignment is stable: same crew, same order, every call and every match', () => {
  const team = crews[0];
  expect(tauntOrder(team)).toEqual(tauntOrder(team));
  expect(tauntOrder({ id: team.id })).toEqual(tauntOrder(team)); // the id is the whole seed
  for (let i = 0; i < WALKUP_SLOTS; i++) {
    expect(tauntForSlot(team, i)).toBe(tauntOrder(team)[i]);
    expect(tauntForSlot(team, i)).toBe(tauntForSlot(team, i + WALKUP_SLOTS)); // the order wraps
  }
});

it('two crews taunt differently — the seed is the crew id', () => {
  const orders = crews.map((t) => tauntOrder(t).join(','));
  expect(new Set(orders).size).toBeGreaterThan(1);
  expect(tauntOrder(crews[0])).not.toEqual(tauntOrder(crews[1]));
});

it('your Locker taunt dresses YOUR CAPTAIN only — slot 0, and nobody else', () => {
  const team = crews[0];
  const equipped = { clip: 'tauntCry' };
  expect(pickTaunt({ isPlayer: true, slot: 0, team, equipped })).toBe('tauntCry');
  for (let slot = 1; slot < WALKUP_SLOTS; slot++) {
    expect(pickTaunt({ isPlayer: true, slot, team, equipped })).toBe(tauntForSlot(team, slot));
  }
  // the CPU never wears your chip, not even at the top of its order
  for (let slot = 0; slot < WALKUP_SLOTS; slot++) {
    expect(pickTaunt({ isPlayer: false, slot, team, equipped })).toBe(tauntForSlot(team, slot));
  }
  // nothing equipped -> your captain falls back to his dealt clip, not a blank
  expect(pickTaunt({ isPlayer: true, slot: 0, team, equipped: null })).toBe(tauntForSlot(team, 0));
  expect(TAUNTS).toContain(pickTaunt({}));
});

it('no steal is allowed while the kicker is still walking out', () => {
  const base = { walkup: null, stealing: null, lastStealCommit: null, phase: 'SETUP', playFinalized: false };
  expect(stealAllowed(base)).toBe(true);
  expect(stealAllowed({ ...base, walkup: { phase: 'walk' } })).toBe(false);
  expect(stealAllowed({ ...base, phase: 'LIVE' })).toBe(false);
  expect(stealAllowed({ ...base, stealing: {} })).toBe(false);
  expect(stealAllowed({ ...base, lastStealCommit: {} })).toBe(false);
  expect(stealAllowed({ ...base, playFinalized: true })).toBe(false);
});
