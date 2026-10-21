import { describe, it, expect } from 'vitest';
import { cleanCrewName, makeBlockRoster, crewTeam } from '../src/meta/yourCrew.js';
import { castSlotFor } from '../src/game/glbCharacters.js';
import crewKit from '../src/data/story/crewKit.json';

const STATS = ['power', 'speed', 'arm', 'glove'];

describe('crew name', () => {
  it('cleans to one short street name', () => {
    expect(cleanCrewName('  eastside  kings ')).toBe('EASTSIDE KINGS');
    expect(cleanCrewName('east side kings')).toBeNull(); // 15 — over the cap
    expect(cleanCrewName("Dre's & Co.")).toBe("DRE'S & CO.");
    expect(cleanCrewName('block<script>')).toBe('BLOCKSCRIPT');
  });
  it('rejects too short, too long, and the blocklist', () => {
    expect(cleanCrewName('a')).toBeNull();
    expect(cleanCrewName('abcdefghijklmno')).toBeNull(); // 15
    expect(cleanCrewName('abcdefghijklmn')).toBe('ABCDEFGHIJKLMN'); // 14
    expect(cleanCrewName('   ')).toBeNull();
    expect(cleanCrewName('fuck crew')).toBeNull();
  });
});

describe('the block roster', () => {
  it('is deterministic per seed', () => {
    expect(makeBlockRoster(7)).toEqual(makeBlockRoster(7));
    expect(makeBlockRoster(7)).not.toEqual(makeBlockRoster(8));
  });
  it('fields 8 low-rated block players, each with one standout, eight different bodies', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = makeBlockRoster(seed);
      expect(r.length).toBe(8);
      expect(r.map((p) => p.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
      expect(new Set(r.map((p) => p.nick)).size).toBe(8);
      expect(r.map((p) => p.pos)).toEqual(crewKit.positions);
      const all = r.flatMap((p) => STATS.map((s) => p.stats[s]));
      for (const v of all) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(6); }
      const mean = all.reduce((a, b) => a + b, 0) / all.length;
      expect(mean).toBeGreaterThanOrEqual(3.6);
      expect(mean).toBeLessThanOrEqual(4.4);
      for (const p of r) expect(STATS.filter((s) => p.stats[s] >= 6).length).toBe(1);
      const arch = r.map((p) => p.cast.archetype);
      expect(new Set(arch).size).toBe(8);
      expect(arch).not.toContain(17);
      for (const p of r) expect(['deep', 'tan', 'brown', 'light']).toContain(p.cast.skin);
    }
  });
});

describe('your crew as a team', () => {
  const story = {
    crew: { name: 'EAST SIDE', primary: '#e63322', secondary: '#111114', mark: 'mark-05' },
    roster: makeBlockRoster(3),
  };
  it('is shaped like every other crew', () => {
    const t = crewTeam(story);
    expect(t).toMatchObject({ id: 'yours', city: 'THE BLOCK', name: 'EAST SIDE', introVideo: null, homeField: 'blacktop', status: 'story' });
    expect(t.colors).toEqual({ primary: '#e63322', secondary: '#111114', accent: '#111114' });
    expect(t.roster).toBe(story.roster);
    for (const tone of ['dark', 'light']) {
      expect(t.kits[tone].hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.kits[tone].ink).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.kits[tone].logo).toBe('stock/mark-05');
    }
    expect(t.kits.light.hex).toBe('#e63322');
    expect(t.special.label).toBe('BLOCK BOOT');
    expect(t.logo).toBe('assets/logos/stock/mark-05.png');
  });
  it('a roster player carries their own body (recruits keep theirs)', () => {
    expect(castSlotFor({ id: 'yours', roster: [{ cast: { archetype: 3 } }] }, 0).archetype).toBe(3);
    expect(castSlotFor({ id: 'monarchs', roster: [{}] }, 0)).toBeTruthy(); // casts.json still answers for crews
  });
});
