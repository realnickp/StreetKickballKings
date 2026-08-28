// CASTING (spec §4). Every crew is cast off its own intro video — who's in it,
// what their hair is, how tall and how heavy they are, what they wear. The
// rules below are what stops that turning back into "ten teams of the same
// eight people": eight different archetypes inside a crew, and no crew fielding
// the same archetype in the same slot as another crew, so two squads never walk
// out as each other's twins.
import { describe, it, expect } from 'vitest';
import casts from '../src/data/casts.json';
import teams from '../src/data/teams.json';
import { SKIN_TONES } from '../src/game/skinTint.js';
import { ACCESSORY_KINDS } from '../src/game/accessories.js';

/** The pool in glbCharacters.js: 20 slots, 17 BENCHED (its GLB never got
 *  skinned, so it renders as a statue and remaps to 5 at build time). */
const POOL = 20;
const BENCHED = 17;
const FEMALE = new Set([2, 5, 7, 9, 11, 13, 15, 17]);
const SLOTS = 8;

const ids = teams.teams.map((t) => t.id);
const entries = Object.entries(casts.casts);

describe('shape', () => {
  it('casts every crew in teams.json, and nobody else', () => {
    expect(Object.keys(casts.casts).sort()).toEqual([...ids].sort());
  });

  it('is 8 slots per crew, one per roster place', () => {
    for (const [id, cast] of entries) {
      expect(cast.length, id).toBe(SLOTS);
      expect(teams.teams.find((t) => t.id === id).roster.length, id).toBe(SLOTS);
    }
  });

  it('every slot is a complete look', () => {
    for (const [id, cast] of entries) {
      cast.forEach((c, i) => {
        const where = `${id}[${i}]`;
        expect(Object.keys(c).sort(), where).toEqual(['accessory', 'archetype', 'build', 'height', 'skin']);
        expect(Number.isInteger(c.archetype), where).toBe(true);
        expect(c.archetype, where).toBeGreaterThanOrEqual(0);
        expect(c.archetype, where).toBeLessThan(POOL);
        expect(c.archetype, `${where} is the benched archetype`).not.toBe(BENCHED);
        expect(c.height, where).toBeGreaterThanOrEqual(0.92);
        expect(c.height, where).toBeLessThanOrEqual(1.08);
        expect(c.build, where).toBeGreaterThanOrEqual(0.92);
        expect(c.build, where).toBeLessThanOrEqual(1.10);
        expect(Object.keys(SKIN_TONES), where).toContain(c.skin);
        expect(ACCESSORY_KINDS, where).toContain(c.accessory);
      });
    }
  });
});

describe('nobody is anybody else', () => {
  it('gives each crew 8 DIFFERENT archetypes', () => {
    for (const [id, cast] of entries) {
      expect(new Set(cast.map((c) => c.archetype)).size, id).toBe(SLOTS);
    }
  });

  it('never repeats an archetype across crews in the SAME slot', () => {
    for (let s = 0; s < SLOTS; s++) {
      const col = entries.map(([, cast]) => cast[s].archetype);
      expect(new Set(col).size, `slot ${s}: ${col}`).toBe(entries.length);
    }
  });

  it('gives every crew its own captain', () => {
    const caps = entries.map(([, cast]) => cast[0].archetype);
    expect(new Set(caps).size).toBe(entries.length);
  });

  it('spreads the pool — no archetype carries the whole league', () => {
    const seen = new Map();
    for (const [, cast] of entries) for (const c of cast) seen.set(c.archetype, (seen.get(c.archetype) ?? 0) + 1);
    expect(seen.size).toBeGreaterThanOrEqual(18); // 19 usable, 17 benched out
    for (const [arch, n] of seen) expect(n, `archetype ${arch}`).toBeLessThanOrEqual(8);
  });
});

describe('the crews look like their intros', () => {
  it('mixes heights and builds inside every crew — nobody fields 8 clones', () => {
    for (const [id, cast] of entries) {
      const h = cast.map((c) => c.height);
      const b = cast.map((c) => c.build);
      expect(Math.max(...h) - Math.min(...h), `${id} heights`).toBeGreaterThanOrEqual(0.08);
      expect(Math.max(...b) - Math.min(...b), `${id} builds`).toBeGreaterThanOrEqual(0.10);
    }
  });

  it('mixes skin tones inside every crew, and uses all four across the league', () => {
    const league = new Set();
    for (const [id, cast] of entries) {
      const tones = new Set(cast.map((c) => c.skin));
      expect(tones.size, `${id} tones`).toBeGreaterThanOrEqual(2);
      for (const t of tones) league.add(t);
    }
    expect([...league].sort()).toEqual(Object.keys(SKIN_TONES).sort());
  });

  it('fields women — some crews are all-male in their intro, the league is not', () => {
    const women = entries.map(([, cast]) => cast.filter((c) => FEMALE.has(c.archetype)).length);
    const total = women.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(15);
    expect(total).toBeLessThanOrEqual(45);
    expect(women.filter((n) => n >= 3).length).toBeGreaterThanOrEqual(4);
  });

  it('accessorises 2-5 players a crew, and uses every kind somewhere', () => {
    const kinds = new Set();
    for (const [id, cast] of entries) {
      const worn = cast.filter((c) => c.accessory !== 'none');
      expect(worn.length, `${id} accessories`).toBeGreaterThanOrEqual(2);
      expect(worn.length, `${id} accessories`).toBeLessThanOrEqual(5);
      for (const c of worn) kinds.add(c.accessory);
    }
    expect([...kinds].sort()).toEqual(['headband', 'shades', 'wristbands']);
  });

  it('keeps the big bodies out of the leadoff spot and the small ones out of the 4-hole', () => {
    for (const [id, cast] of entries) {
      const roster = teams.teams.find((t) => t.id === id).roster;
      cast.forEach((c, i) => {
        const pos = roster[i].pos;
        if (/Leadoff/.test(pos)) expect(c.build, `${id} leadoff`).toBeLessThanOrEqual(1.04);
        if (/Slugger/.test(pos)) expect(c.build, `${id} slugger`).toBeGreaterThanOrEqual(1.00);
      });
    }
  });
});
