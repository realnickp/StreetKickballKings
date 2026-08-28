// Light + dark kits per crew, as DATA (spec §3). Two crews must never take the
// field in colours a phone can't tell apart: home wears dark, away wears light,
// and if that pair doesn't separate the two sides flip. The Locker's LIGHT/DARK
// chips and the jersey numbers ride the same data.
import { describe, it, expect } from 'vitest';
import teams from '../src/data/teams.json';
import { contrastDeltaL, dressTeams, kitFor, resolveGearKit, CLASH_DELTA_L } from '../src/game/kits.js';
import { kitFor as kitForScreens } from '../src/ui/screens/screens.js';
import { lockerTabs } from '../src/ui/lockerModel.js';
import { GEAR, isUnlocked, equipGear, equippedGear } from '../src/meta/unlocks.js';
import { SaveManager } from '../src/meta/save.js';

const byId = (id) => teams.teams.find((t) => t.id === id);
const mem = () => new SaveManager({ backend: 'memory' });

describe('contrastDeltaL', () => {
  it('separates the blackout and whiteout kits by a mile', () => {
    expect(contrastDeltaL('#1b1b22', '#f2f2f4')).toBeGreaterThan(25);
  });
  it('reads 0 for a kit against itself and is symmetric', () => {
    expect(contrastDeltaL('#e0701a', '#e0701a')).toBe(0);
    expect(contrastDeltaL('#16161a', '#f5b312')).toBeCloseTo(contrastDeltaL('#f5b312', '#16161a'), 6);
  });
});

describe('dressTeams', () => {
  const home = byId('monarchs'), away = byId('bullies');

  it('dresses the home crew dark and the visitors light', () => {
    const kits = dressTeams({ home, away });
    expect(kits.home.tone).toBe('dark');
    expect(kits.away.tone).toBe('light');
    expect(kits.home.hex).toBe(home.kits.dark.hex);
    expect(kits.away.hex).toBe(away.kits.light.hex);
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  it('flips both sides when the dark/light pair would clash', () => {
    const h = { id: 'h', colors: { primary: '#404040' }, kits: { dark: { hex: '#404040' }, light: { hex: '#ffffff' } } };
    const a = { id: 'a', colors: { primary: '#101010' }, kits: { dark: { hex: '#101010' }, light: { hex: '#5a5a5a' } } };
    expect(contrastDeltaL(h.kits.dark.hex, a.kits.light.hex)).toBeLessThan(CLASH_DELTA_L); // the default pair clashes
    const kits = dressTeams({ home: h, away: a });
    expect(kits.away.tone).toBe('dark');
    expect(kits.home.tone).toBe('light');
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  it('every real matchup separates on the field', () => {
    for (const h of teams.teams) {
      for (const a of teams.teams) {
        if (h.id === a.id) continue;
        const kits = dressTeams({ home: h, away: a });
        expect(kits.home.tone).not.toBe(kits.away.tone);
        expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
      }
    }
  });

  it('an equipped Locker kit overrides YOUR side only', () => {
    const gearKit = { id: 'kit-gold', name: 'GOLD RUSH KIT', hex: '#f5c518' };
    const kits = dressTeams({ home, away, playerSide: 'away', gearKit });
    expect(kits.away.hex).toBe('#f5c518');
    expect(kits.away.ink).toBe('#0b0c10');           // gold is bright -> dark ink
    expect(kits.home.hex).toBe(home.kits.dark.hex);  // the opponent is untouched
    const asHome = dressTeams({ home, away, playerSide: 'home', gearKit });
    expect(asHome.home.hex).toBe('#f5c518');
    expect(asHome.away.hex).toBe(away.kits.light.hex);
  });

  it("a team-kit chip resolves to that crew's own light/dark", () => {
    const gearKit = { id: 'kit-team-light', teamKit: 'light', hex: '#f2f2f4' };
    const kits = dressTeams({ home, away, playerSide: 'away', gearKit });
    expect(kits.away.hex).toBe(away.kits.light.hex);
    expect(kits.away.logo).toBe(away.kits.light.logo);
  });

  it('two crews sent out in the SAME tone still separate on the field', () => {
    // team select lets you flip either side — "both light" is a tap away
    const a = byId('bullies'), h = byId('funk');
    expect(contrastDeltaL(h.kits.light.hex, a.kits.light.hex)).toBeLessThan(CLASH_DELTA_L);
    const kits = dressTeams({ home: h, away: a, tones: { home: 'light', away: 'light' } });
    expect(kits.home.tone).not.toBe(kits.away.tone);
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  it('the team-select tones seed the dressing', () => {
    const kits = dressTeams({ home, away, tones: { home: 'light', away: 'dark' } });
    expect(kits.home.tone).toBe('light');
    expect(kits.away.tone).toBe('dark');
  });
});

describe('teams.json kits + numbers', () => {
  it('every crew carries a dark and a light kit with ink and a logo variant', () => {
    for (const t of teams.teams) {
      for (const tone of ['dark', 'light']) {
        const k = t.kits?.[tone];
        expect(k, `${t.id}.kits.${tone}`).toBeTruthy();
        expect(k.hex).toMatch(/^#[0-9a-f]{6}$/i);
        expect(['#0b0c10', '#f4f4f6']).toContain(k.ink);
        expect([t.id, `${t.id}-light`]).toContain(k.logo);
        expect(typeof k.img).toBe('string'); // the portrait sprite suffix stays
      }
      // the two kits are genuinely a light and a dark one
      expect(contrastDeltaL(t.kits.dark.hex, t.kits.light.hex)).toBeGreaterThan(CLASH_DELTA_L);
    }
  });

  it('the ink is the readable one for the kit', () => {
    for (const t of teams.teams) {
      for (const tone of ['dark', 'light']) {
        const k = t.kits[tone];
        expect(contrastDeltaL(k.hex, k.ink)).toBeGreaterThan(40);
      }
    }
  });

  it('every roster wears 8 unique numbers, captain on the crew marquee', () => {
    for (const t of teams.teams) {
      const nums = t.roster.map((p) => p.number);
      expect(nums.length).toBe(8);
      expect(nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 99), `${t.id}: ${nums}`).toBe(true);
      expect(new Set(nums).size, `${t.id}: ${nums}`).toBe(8);
    }
    // the marquee numbers the crews were written around
    expect(byId('monarchs').roster[0].number).toBe(23); // King Reese wears the crown
    expect(byId('funk').roster[0].number).toBe(76);     // Philadelphia
  });

  it('kitFor reads the data and is still exported from screens.js', () => {
    const t = byId('funk');
    expect(kitFor(t, 'dark')).toEqual(t.kits.dark);
    expect(kitFor(t, 'light')).toEqual(t.kits.light);
    expect(kitForScreens(t, 'dark')).toEqual(t.kits.dark);
    // a team with no kits block still dresses (signature colour, base sprite)
    const bare = { id: 'x', colors: { primary: '#123456' } };
    expect(kitFor(bare, 'dark')).toMatchObject({ hex: '#123456', img: '' });
  });
});

describe('the Locker KITS tab', () => {
  it('leads with YOUR crew LIGHT and DARK, then the unlockables', () => {
    const s = mem();
    const team = byId('monarchs');
    const tabs = lockerTabs({ GEAR, isUnlocked: (id) => isUnlocked(s, id), eq: equippedGear(s), team });
    const kits = tabs.find((t) => t.cat === 'uniform');
    expect(kits.chips.slice(0, 2).map((c) => c.id)).toEqual(['kit-team-light', 'kit-team-dark']);
    expect(kits.chips.slice(0, 2).every((c) => c.stock && c.owned)).toBe(true);
    expect(kits.chips[0].hex).toBe(team.kits.light.hex);   // the swatch is the real kit colour
    expect(kits.chips[1].hex).toBe(team.kits.dark.hex);
    expect(kits.chips.some((c) => c.id === 'kit-blackout')).toBe(true);
    expect(kits.chips.findIndex((c) => c.id === 'kit-blackout')).toBeGreaterThan(1);
    expect(kits.chips.some((c) => c.id === null)).toBe(false); // no bare CLASSIC once stock kits exist
  });

  it('equips like any other piece and resolves to the crew colour', () => {
    const s = mem();
    const team = byId('threshers');
    expect(equipGear(s, 'uniform', 'kit-team-dark')).toBe(true);
    const eq = equippedGear(s);
    expect(eq.uniform.id).toBe('kit-team-dark');
    expect(resolveGearKit(eq.uniform, team).hex).toBe(team.kits.dark.hex);
  });

  it('the team kits never become the silent default for an empty slot', () => {
    const s = mem();
    expect(equippedGear(s).uniform).toBe(null); // bare stays bare — dressing picks the tone
  });
});
