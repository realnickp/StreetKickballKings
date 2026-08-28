// Light + dark kits per crew, as DATA (spec §3). Two crews must never take the
// field in colours a phone can't tell apart: home wears dark, away wears light,
// and if that pair doesn't separate the two sides flip. The Locker's LIGHT/DARK
// chips and the jersey numbers ride the same data.
import { describe, it, expect } from 'vitest';
import teams from '../src/data/teams.json';
import fields from '../src/data/fields.json';
import fs from 'node:fs';
import { contrastDeltaL, contrastUniform, groundDeltaL, groundLFor, dressTeams, inkFor, kitFor, logoFor, markFor, resolveGearKit, CLASH_DELTA_L, GROUND_GAIN_L, LIGHT_LOGOS } from '../src/game/kits.js';
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

  it('all 90 ordered matchups separate on the field, on their own kits', () => {
    let n = 0;
    for (const h of teams.teams) {
      for (const a of teams.teams) {
        if (h.id === a.id) continue;
        n++;
        const kits = dressTeams({ home: h, away: a });
        const label = `${h.id} v ${a.id}`;
        expect(kits.home.tone, label).not.toBe(kits.away.tone);
        expect(contrastDeltaL(kits.home.hex, kits.away.hex), label).toBeGreaterThanOrEqual(CLASH_DELTA_L);
        // no fabricated hexes anywhere in the real league: both crews wear a
        // kit somebody designed, ink and logo variant included
        expect([h.kits.dark.hex, h.kits.light.hex], label).toContain(kits.home.hex);
        expect([a.kits.dark.hex, a.kits.light.hex], label).toContain(kits.away.hex);
      }
    }
    expect(n).toBe(90);
  });

  it('an equipped Locker kit PINS your side and the opponent dresses against it', () => {
    const gearKit = { id: 'kit-gold', name: 'GOLD RUSH KIT', hex: '#f5c518' };
    const kits = dressTeams({ home, away, playerSide: 'away', gearKit });
    expect(kits.away.hex).toBe('#f5c518');
    expect(kits.away.ink).toBe('#0b0c10');           // gold is bright -> dark ink
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
    // and the opponent wears a DESIGNED kit — one of their own two, never a
    // fabricated hex (that's what made the number/logo contradict the shirt)
    expect([home.kits.dark.hex, home.kits.light.hex]).toContain(kits.home.hex);
    const asHome = dressTeams({ home, away, playerSide: 'home', gearKit });
    expect(asHome.home.hex).toBe('#f5c518');
    expect([away.kits.dark.hex, away.kits.light.hex]).toContain(asHome.away.hex);
    expect(contrastDeltaL(asHome.home.hex, asHome.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  it('BLACKOUT sends the crews that used to clash into their LIGHT kit, ink and logo intact', () => {
    // the old order (pair first, gear last) left #1b1b22 next to marauders'
    // near-black dark kit, then main.js patched only the HEX of the shifted
    // opponent — a light number and a dark-kit mark on a pale grey shirt
    const gearKit = { id: 'kit-blackout', name: 'BLACKOUT KIT', hex: '#1b1b22' };
    const me = byId('monarchs');
    for (const id of ['marauders', 'funk', 'kestrals']) {
      const opp = byId(id);
      const kits = dressTeams({ home: opp, away: me, playerSide: 'away', gearKit });
      expect(kits.away.hex, id).toBe('#1b1b22');           // your pick is untouched
      // their real light kit, whole — its mark resolved to the file on disk
      expect(kits.home, id).toMatchObject({ ...opp.kits.light, logo: markFor(opp.kits.light.logo) });
      expect(contrastDeltaL(kits.home.hex, kits.away.hex), id).toBeGreaterThanOrEqual(49);
      // playerSide mirrors: the same two crews, your side still pinned
      const mirrored = dressTeams({ home: me, away: opp, playerSide: 'home', gearKit });
      expect(mirrored.home.hex, id).toBe('#1b1b22');
      expect(mirrored.away, id).toMatchObject({ ...opp.kits.light, logo: markFor(opp.kits.light.logo) });
    }
  });

  it('a fabricated fallback kit is internally consistent — ink and logo re-cut', () => {
    // both of this crew's kits clash with the pinned one, so the shift runs
    const me = { id: 'me', colors: { primary: '#1b1b22' } };
    const them = { id: 'them', colors: { primary: '#202028' },
      kits: { dark: { hex: '#202028', ink: '#f4f4f6', logo: 'them', img: '' },
              light: { hex: '#2a2a33', ink: '#f4f4f6', logo: 'them', img: '' } } };
    const gearKit = { id: 'kit-blackout', name: 'BLACKOUT KIT', hex: '#1b1b22' };
    const kits = dressTeams({ home: them, away: me, playerSide: 'away', gearKit });
    expect(kits.away.hex).toBe('#1b1b22');
    expect([them.kits.dark.hex, them.kits.light.hex]).not.toContain(kits.home.hex); // shifted
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
    expect(kits.home.ink).toBe(inkFor(kits.home.hex));          // not the original's
    expect(kits.home.logo).toBe(logoFor(them, kits.home.hex));
    expect(contrastDeltaL(kits.home.hex, kits.home.ink)).toBeGreaterThan(40);
  });

  it('the last-resort shift moves the NON-player side, whichever that is', () => {
    const h = { id: 'h', colors: { primary: '#3a3a3a' }, kits: { dark: { hex: '#3a3a3a', ink: '#f4f4f6', logo: 'h', img: '' }, light: { hex: '#4a4a4a', ink: '#f4f4f6', logo: 'h', img: '' } } };
    const a = { id: 'a', colors: { primary: '#404040' }, kits: { dark: { hex: '#404040', ink: '#f4f4f6', logo: 'a', img: '' }, light: { hex: '#464646', ink: '#f4f4f6', logo: 'a', img: '' } } };
    const asAway = dressTeams({ home: h, away: a, playerSide: 'away' });
    expect([a.kits.dark.hex, a.kits.light.hex]).toContain(asAway.away.hex); // you kept yours
    expect(contrastDeltaL(asAway.home.hex, asAway.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
    expect(asAway.home.ink).toBe(inkFor(asAway.home.hex));
    const asHome = dressTeams({ home: h, away: a, playerSide: 'home' });
    expect([h.kits.dark.hex, h.kits.light.hex]).toContain(asHome.home.hex);
    expect(contrastDeltaL(asHome.home.hex, asHome.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
    expect(asHome.away.ink).toBe(inkFor(asHome.away.hex));
  });

  it("a team-kit chip resolves to that crew's own light/dark", () => {
    const gearKit = { id: 'kit-team-light', teamKit: 'light', hex: '#f2f2f4' };
    const kits = dressTeams({ home, away, playerSide: 'away', gearKit });
    expect(kits.away.hex).toBe(away.kits.light.hex);
    // the DATA still names the `<id>-light` hook; the kit wears the mark that
    // is actually on disk (see LIGHT_LOGOS — empty today, so the base mark)
    expect(kits.away.logo).toBe(markFor(away.kits.light.logo));
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

// THE MARK ON THE SHIRT. The ten `<id>-light.png` files were byte-identical
// copies of the base marks — 20 MB of duplicate art — so they are gone and
// every kit names the one mark that exists. `LIGHT_LOGOS` is the hook that lets
// real light art come back one entry at a time; these pin BOTH halves of that
// contract, so a future drop can't ship a kit pointing at a missing file.
describe('the light mark resolves to a file that exists', () => {
  it('markFor is idempotent and strips an unregistered -light', () => {
    expect(LIGHT_LOGOS.size).toBe(0);              // no light art today
    expect(markFor('monarchs-light')).toBe('monarchs');
    expect(markFor('monarchs')).toBe('monarchs');
    expect(markFor(markFor('monarchs-light'))).toBe('monarchs');
    expect(markFor(null)).toBe('');
  });

  it('a bright kit still asks for the light cut, and gets one where it exists', () => {
    const registered = new Set(['monarchs']);
    const pick = (id, hex) => (inkFor(hex) === '#0b0c10'
      ? (registered.has(id) ? `${id}-light` : id) : id);
    // what logoFor would answer if `monarchs` were registered — the shape of
    // the hook, checked without mutating the shipped Set
    expect(pick('monarchs', '#f5b312')).toBe('monarchs-light');
    expect(pick('snappers', '#ece5d2')).toBe('snappers');
    // ...and what it answers TODAY, with nothing registered
    expect(logoFor({ id: 'monarchs' }, '#f5b312')).toBe('monarchs');
    expect(logoFor({ id: 'monarchs' }, '#16161a')).toBe('monarchs');
  });

  it('every kit a match can dress names a mark on disk', () => {
    for (const t of teams.teams) {
      for (const tone of ['dark', 'light']) {
        const k = kitFor(t, tone);
        expect(k.logo, `${t.id}.${tone}`).toBe(markFor(k.logo));
        expect(fs.existsSync(`public/assets/logos/${k.logo}.png`), `${t.id}.${tone} -> ${k.logo}.png`).toBe(true);
      }
    }
    // ...and every pairing the dresser can produce, shift included
    for (const home of teams.teams) {
      for (const away of teams.teams) {
        const kits = dressTeams({ home, away, playerSide: 'away' });
        for (const side of ['home', 'away']) {
          expect(fs.existsSync(`public/assets/logos/${kits[side].logo}.png`),
            `${home.id} v ${away.id} ${side} -> ${kits[side].logo}.png`).toBe(true);
        }
      }
    }
  });

  it('the duplicate -light copies are gone from the repo', () => {
    for (const t of teams.teams) {
      expect(fs.existsSync(`public/assets/logos/${t.id}-light.png`), `${t.id}-light.png`).toBe(false);
    }
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
    // the light kit comes back whole too — only its `logo` is resolved past the
    // `<id>-light` hook to the mark that ships (markFor / LIGHT_LOGOS)
    expect(kitFor(t, 'light')).toEqual({ ...t.kits.light, logo: markFor(t.kits.light.logo) });
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
    // AUTO first — an empty uniform slot is a real choice (the match dresses
    // you), and it's what a fresh save is already wearing
    expect(kits.chips[0]).toMatchObject({ id: null, name: 'AUTO', on: true, owned: true });
    expect(kits.chips.slice(1, 3).map((c) => c.id)).toEqual(['kit-team-light', 'kit-team-dark']);
    expect(kits.chips.slice(1, 3).every((c) => c.stock && c.owned)).toBe(true);
    expect(kits.chips[1].hex).toBe(team.kits.light.hex);   // the swatch is the real kit colour
    expect(kits.chips[2].hex).toBe(team.kits.dark.hex);
    expect(kits.chips.some((c) => c.id === 'kit-blackout')).toBe(true);
    expect(kits.chips.findIndex((c) => c.id === 'kit-blackout')).toBeGreaterThan(2);
  });

  it('AUTO un-equips the uniform slot and goes back on', () => {
    const s = mem();
    const team = byId('monarchs');
    equipGear(s, 'uniform', 'kit-team-dark');
    const on = (eq) => lockerTabs({ GEAR, isUnlocked: (id) => isUnlocked(s, id), eq, team })
      .find((t) => t.cat === 'uniform').chips.find((c) => c.on);
    expect(on(equippedGear(s)).id).toBe('kit-team-dark');
    expect(equipGear(s, 'uniform', null)).toBe(true);       // the AUTO chip's tap
    expect(equippedGear(s).uniform).toBe(null);
    expect(on(equippedGear(s))).toMatchObject({ id: null, name: 'AUTO' });
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

// ---------------------------------------------------------------------------
// THE GROUND GETS A VOTE (dev, on his phone, 2026-08-28, on Winter Classic:
// "the white in Chicago makes it hard to see"). Two crews can clear ΔL* 25 from
// each other and still both vanish into the court, so `dressTeams` now takes
// the field's own measured `groundL` and prefers the pairing whose WORSE kit
// stands furthest off it. Designed kits only — nothing is fabricated for the
// ground, and a field with no `groundL` dresses exactly as it always did.
describe('dressTeams sees the ground', () => {
  const groundOf = (id) => fields.fields.find((f) => f.id === id).groundL;
  const legalPairs = (h, a) => [['dark', 'light'], ['light', 'dark']]
    .map(([ht, at]) => ({ ht, at, hh: h.kits[ht].hex, ah: a.kits[at].hex }))
    .filter((p) => contrastDeltaL(p.hh, p.ah) >= CLASH_DELTA_L);

  it('no ground means no change — every matchup dresses as it always did', () => {
    for (const h of teams.teams) {
      for (const a of teams.teams) {
        if (h.id === a.id) continue;
        const label = `${h.id} v ${a.id}`;
        expect(dressTeams({ home: h, away: a, groundL: null }), label)
          .toEqual(dressTeams({ home: h, away: a }));
      }
    }
  });

  it('grey asphalt sends Brooklyn out of its red', () => {
    // The Blacktop renders at L* 56 and bullies' #d7263d sits at 47 — nine
    // points of separation between a crew and the court they stand on. The
    // pairing rule used to take home-dark/away-light and never look down; with
    // the ground in the room Brooklyn wears the white and Baltimore the black,
    // and the worse-off crew goes from 9 clear of the asphalt to 39.
    const h = byId('bullies'), a = byId('monarchs');
    const ground = groundOf('blacktop');
    const blind = dressTeams({ home: h, away: a });
    expect(blind.home.hex).toBe(h.kits.dark.hex);
    expect(groundDeltaL(blind.home.hex, ground)).toBeLessThan(15);   // red on grey
    const seeing = dressTeams({ home: h, away: a, groundL: ground });
    expect(seeing.home.hex).toBe(h.kits.light.hex);
    expect(seeing.away.hex).toBe(a.kits.dark.hex);
    expect(Math.min(groundDeltaL(seeing.home.hex, ground), groundDeltaL(seeing.away.hex, ground)))
      .toBeGreaterThan(Math.min(groundDeltaL(blind.home.hex, ground), groundDeltaL(blind.away.hex, ground)));
    expect(contrastDeltaL(seeing.home.hex, seeing.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  it('the SNOW keeps Chicago out of its pale blue — the dev\'s Winter Classic', () => {
    // kestrals host, hustlers visit. Chicago's light kit (#a8d8ea, L* 84) is
    // 1.5 off the lit snow (L* 82) — a crew you cannot see at all. The ground
    // rule holds Chicago in the charcoal, which stands 62 clear of it.
    const snow = groundOf('winter-classic');
    expect(snow).toBe(82);
    const kits = dressTeams({ home: byId('kestrals'), away: byId('hustlers'), playerSide: 'away', groundL: snow });
    expect(kits.home.hex).toBe(byId('kestrals').kits.dark.hex);
    expect(groundDeltaL(kits.home.hex, snow)).toBeGreaterThan(CLASH_DELTA_L);
    // and the alternative really was worse for the worse-off crew
    const flipped = { home: byId('kestrals').kits.light.hex, away: byId('hustlers').kits.dark.hex };
    expect(Math.min(groundDeltaL(flipped.home, snow), groundDeltaL(flipped.away, snow)))
      .toBeLessThan(Math.min(groundDeltaL(kits.home.hex, snow), groundDeltaL(kits.away.hex, snow)));
  });

  it('never trades crew separation away for the ground', () => {
    // a court exactly on one crew's dark kit: the ground would love the light
    // one, but the two crews have to read apart first
    const h = { id: 'h', colors: { primary: '#2c3035' }, kits: { dark: { hex: '#2c3035', ink: '#f4f4f6', logo: 'h', img: '' }, light: { hex: '#f2f2f2', ink: '#0b0c10', logo: 'h', img: '' } } };
    const a = { id: 'a', colors: { primary: '#efefef' }, kits: { dark: { hex: '#33373c', ink: '#f4f4f6', logo: 'a', img: '' }, light: { hex: '#efefef', ink: '#0b0c10', logo: 'a', img: '' } } };
    const kits = dressTeams({ home: h, away: a, groundL: 20 });
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  it('10 fields x 90 matchups: the ground never leaves contrast on the table', () => {
    // The honest sweep. The league's ten palettes cannot clear ΔL* 15 of every
    // court — `the-underpass` renders at L* 90 and eight of the ten LIGHT kits
    // live between 77 and 96, so on that slab somebody is always pale — and the
    // cure (a fabricated hex) is worse than the disease: it costs the crew its
    // colours and its mark. So what is held here is that the dressing takes the
    // BEST ground contrast any legal pairing offers, on every field, in every
    // matchup — plus the two invariants that were already true.
    let n = 0;
    let worst = Infinity;
    for (const f of fields.fields) {
      const g = f.groundL;
      expect(Number.isFinite(g), f.id).toBe(true);
      for (const h of teams.teams) {
        for (const a of teams.teams) {
          if (h.id === a.id) continue;
          n++;
          const label = `${f.id}: ${h.id} v ${a.id}`;
          const kits = dressTeams({ home: h, away: a, groundL: g });
          // the two crews still read apart, on kits somebody designed
          expect(contrastDeltaL(kits.home.hex, kits.away.hex), label).toBeGreaterThanOrEqual(CLASH_DELTA_L);
          expect([h.kits.dark.hex, h.kits.light.hex], label).toContain(kits.home.hex);
          expect([a.kits.dark.hex, a.kits.light.hex], label).toContain(kits.away.hex);
          // ...and nobody could have stood further off this court
          const got = Math.min(groundDeltaL(kits.home.hex, g), groundDeltaL(kits.away.hex, g));
          const best = Math.max(...legalPairs(h, a)
            .map((p) => Math.min(groundDeltaL(p.hh, g), groundDeltaL(p.ah, g))));
          expect(got, label).toBeCloseTo(best, 6);
          worst = Math.min(worst, got);
        }
      }
    }
    expect(n).toBe(900);
    // the floor across the whole league: it is not 15, and pretending it is
    // would only mean fabricating a kit somewhere
    expect(worst).toBeGreaterThan(0);
  });

  it('a pinned Locker kit still lets the opponent off the court', () => {
    // BLACKOUT on the neon court (L* 10): both of Akron's kits clear the pinned
    // #1b1b22 by a mile, so the tie goes to the one that also stands off the
    // near-black asphalt — the orange, not the #1c1c1c.
    const gearKit = { id: 'kit-blackout', name: 'BLACKOUT KIT', hex: '#1b1b22' };
    const opp = byId('marauders');
    const kits = dressTeams({ home: opp, away: byId('hustlers'), playerSide: 'away', gearKit, groundL: groundOf('neon-night-court') });
    expect(kits.away.hex).toBe('#1b1b22');           // your pick is still pinned
    expect(kits.home.hex).toBe(opp.kits.light.hex);  // ...and they take the orange
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeGreaterThanOrEqual(CLASH_DELTA_L);
  });

  // -------------------------------------------------------------------------
  // ...AND WITH NO GROUND IT MUST NOT SPEAK AT ALL. `groundDeltaL` answers
  // Infinity when there is no court, and the pinned-kit tie-break subtracted
  // one from the other: `Infinity - Infinity` is NaN — a comparator that
  // answers neither "greater" nor "less", so V8 is free to leave the array as
  // it found it and the opponent came out in whatever tone `['dark','light']`
  // put first. Every screen that dresses without a field ran through it: the
  // Locker, GEAR UP, the drills.
  const UNIFORMS = GEAR.filter((g) => g.cat === 'uniform');
  /** The pre-branch rule, written out: widest gap from the pinned kit, and a
   *  tie keeps 'dark' because the sort is stable and 'dark' is authored first. */
  const oldPick = (crew, mineHex) => ['dark', 'light']
    .map((t) => ({ t, hex: kitFor(crew, t).hex }))
    .sort((a, b) => contrastDeltaL(b.hex, mineHex) - contrastDeltaL(a.hex, mineHex))[0];

  it('Maryland in their own dark kit does not put Brooklyn in red', () => {
    // the case the NaN was found on. Baltimore pinned into #16161a; Brooklyn's
    // white stands 88.10 off it and their red 39.80, and array order was
    // handing them the red.
    const mine = byId('monarchs'), opp = byId('bullies');
    const kits = dressTeams({ home: opp, away: mine, playerSide: 'away', gearKit: GEAR.find((g) => g.id === 'kit-team-dark') });
    expect(kits.away.hex).toBe('#16161a');
    expect(kits.home.hex).toBe('#f2f2f2');
    expect(contrastDeltaL(kits.home.hex, kits.away.hex)).toBeCloseTo(88.10, 2);
    expect(contrastDeltaL(opp.kits.dark.hex, kits.away.hex)).toBeCloseTo(39.80, 2);
  });

  it('a pinned kit with NO ground dresses all 90 matchups exactly as it did before the ground rule', () => {
    let n = 0, shifted = 0;
    for (const gear of UNIFORMS) {
      for (const mine of teams.teams) {
        for (const opp of teams.teams) {
          if (mine.id === opp.id) continue;
          n++;
          const label = `${gear.id}: ${mine.id} v ${opp.id}`;
          const kits = dressTeams({ home: opp, away: mine, playerSide: 'away', gearKit: gear });
          const mineHex = resolveGearKit(gear, mine).hex;
          const best = oldPick(opp, mineHex);
          // the last resort: neither of their tones clears the pinned kit, so
          // the shift fabricates one. It is not a stub-crew-only path after all
          // — LIGHT KIT/DARK KIT pin you into your CREW'S own colours, and
          // Brooklyn's red sits 23 off Phoenix's brown and 15 off their orange.
          const clash = contrastDeltaL(best.hex, mineHex) < CLASH_DELTA_L;
          const wantHex = clash ? contrastUniform(best.hex, mineHex) : best.hex;
          expect(kits.away.hex, label).toBe(mineHex);          // your pick is pinned
          expect(kits.home.hex, label).toBe(wantHex);          // ...and theirs is the OLD answer
          expect(kits.home.tone, label).toBe(best.t);
          if (clash) shifted++;
          else expect(contrastDeltaL(kits.home.hex, kits.away.hex), label).toBeGreaterThanOrEqual(CLASH_DELTA_L);
          // and the ground, when there IS one, never unpins your side
          const withGround = dressTeams({ home: opp, away: mine, playerSide: 'away', gearKit: gear, groundL: groundLFor(opp) });
          expect(withGround.away.hex, label).toBe(mineHex);
        }
      }
    }
    expect(n).toBe(UNIFORMS.length * 90);
    expect(shifted, 'the fabricated-kit path is exercised, not theoretical').toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // YOUR TONE PICK HOLDS. `tones` is the DARK/LIGHT swatch you TAPPED in team
  // select; the court may only overrule it for a gain you can see on a phone
  // (GROUND_GAIN_L), or when the pick makes the two crews read as one team.
  // Without a `tones` object there is no pick — the seed is only spec §3's
  // default ordering — and the ground maximises freely, which is what the
  // ten-field sweep above (and `tests/fieldsGround.test.js`) hold.
  it('the swatch you tapped survives every court unless the court really eats it', () => {
    let held = 0, flipped = 0, gated = 0;
    for (const f of fields.fields) {
      const g = f.groundL;
      for (const h of teams.teams) {
        for (const a of teams.teams) {
          if (h.id === a.id) continue;
          for (const tones of [{ home: 'dark', away: 'light' }, { home: 'light', away: 'dark' }]) {
            const label = `${f.id}: ${h.id}(${tones.home}) v ${a.id}(${tones.away})`;
            const kits = dressTeams({ home: h, away: a, tones, groundL: g });
            const seed = { hh: kitFor(h, tones.home).hex, ah: kitFor(a, tones.away).hex };
            const alt = { hh: kitFor(h, tones.home === 'dark' ? 'light' : 'dark').hex, ah: kitFor(a, tones.away === 'dark' ? 'light' : 'dark').hex };
            const min = (p) => Math.min(groundDeltaL(p.hh, g), groundDeltaL(p.ah, g));
            const clears = (p) => contrastDeltaL(p.hh, p.ah) >= CLASH_DELTA_L;
            if (!clears(seed)) {                       // the gate is not negotiable
              gated++;
              expect(contrastDeltaL(kits.home.hex, kits.away.hex), label).toBeGreaterThanOrEqual(CLASH_DELTA_L);
            } else if (clears(alt) && min(alt) >= min(seed) + GROUND_GAIN_L) {
              flipped++;                               // ...and neither is a court you vanish into
              expect(kits.home.hex, label).toBe(alt.hh);
              expect(kits.away.hex, label).toBe(alt.ah);
            } else {
              held++;                                  // you wear what the chip promised
              expect(kits.home.hex, label).toBe(seed.hh);
              expect(kits.away.hex, label).toBe(seed.ah);
            }
          }
        }
      }
    }
    expect(held + flipped + gated).toBe(1800);
    // it is not a rule that never fires, and not one that always does
    expect(flipped).toBeGreaterThan(100);
    expect(held).toBeGreaterThan(100);
  });

  it('a pick the ground barely improves on is left alone', () => {
    // Blacktop (L* 56), Brooklyn v Memphis: the alternative moves the worse-off
    // crew 8.93 further off the asphalt — real, and under the 10 you can see.
    const h = byId('bullies'), a = byId('hustlers'), g = groundOf('blacktop');
    const tones = { home: 'dark', away: 'light' };
    const kits = dressTeams({ home: h, away: a, tones, groundL: g });
    expect(kits.home.hex).toBe(h.kits.dark.hex);
    const gain = Math.min(groundDeltaL(h.kits.light.hex, g), groundDeltaL(a.kits.dark.hex, g))
      - Math.min(groundDeltaL(h.kits.dark.hex, g), groundDeltaL(a.kits.light.hex, g));
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(GROUND_GAIN_L);
  });

  it('a pick the court would eat is overruled — Brooklyn v Baltimore on the asphalt', () => {
    // the same field, 30 L* on the table instead of 8.9: the red is 9 off the
    // Blacktop and the flip is worth making even though you tapped DARK
    const h = byId('bullies'), a = byId('monarchs'), g = groundOf('blacktop');
    const kits = dressTeams({ home: h, away: a, tones: { home: 'dark', away: 'light' }, groundL: g });
    expect(kits.home.hex).toBe(h.kits.light.hex);
    expect(kits.away.hex).toBe(a.kits.dark.hex);
  });
});

// ---------------------------------------------------------------------------
// THE PREVIEW IS THE UNIFORM. GEAR UP's turntable exists so you can see what
// you're taking out there ("they need to actually be able to see it on the
// player in the preview" — dev, 2026-08-27), and it dressed with NO ground
// while the match dressed with one: on 25 of the 90 reachable matchups the
// captain on the turntable wore a kit that was never going to walk out.
// `groundLFor` is the one lookup both sides now make.
describe('the Locker preview dresses like the field', () => {
  const blacktop = fields.fields.find((f) => f.id === 'blacktop');
  /** What `main.js` puts the match on: the HOME (opponent) crew's own field,
   *  the Blacktop when that id names nothing. */
  const fieldOf = (opp) => fields.fields.find((f) => f.id === opp.homeField) ?? blacktop;

  it('groundLFor answers the court the match is actually played on', () => {
    for (const t of teams.teams) expect(groundLFor(t), t.id).toBe(fieldOf(t).groundL);
    // a crew with no field of its own plays the Blacktop, and dresses for it
    expect(groundLFor({ id: 'stub' })).toBe(blacktop.groundL);
    expect(groundLFor(null)).toBe(blacktop.groundL);
  });

  it('every reachable matchup: what GEAR UP shows is what the field dresses', () => {
    // GEAR UP calls dressTeams with { home: opponent, away: you, tones, gear }
    // (src/ui/screens/lockerScreen.js) and startMatchFlow calls it with the
    // same four (src/main.js). The fifth used to be missing.
    let n = 0, drift = 0;
    for (const you of teams.teams) {
      for (const opp of teams.teams) {
        if (you.id === opp.id) continue;
        n++;
        const label = `${you.id} at ${opp.id} (${opp.homeField})`;
        const tones = { home: 'dark', away: 'light' };   // team select's default chips
        const args = { home: opp, away: you, playerSide: 'away', tones };
        const field = dressTeams({ ...args, groundL: fieldOf(opp).groundL });
        const preview = dressTeams({ ...args, groundL: groundLFor(opp) });
        expect(preview, label).toEqual(field);
        // ...and the caption GEAR UP prints comes off the same object
        expect(preview.away.tone, label).toBe(field.away.tone);
        if (dressTeams(args).away.hex !== field.away.hex) drift++;
      }
    }
    expect(n).toBe(90);
    // the bug, counted: this many matchups showed you the wrong kit
    expect(drift).toBe(14);
  });

  it('...with an equipped Locker kit on too', () => {
    for (const gear of GEAR.filter((g) => g.cat === 'uniform')) {
      for (const you of teams.teams) {
        for (const opp of teams.teams) {
          if (you.id === opp.id) continue;
          const label = `${gear.id}: ${you.id} at ${opp.id}`;
          const args = { home: opp, away: you, playerSide: 'away', gearKit: gear, tones: { home: 'dark', away: 'light' } };
          expect(dressTeams({ ...args, groundL: groundLFor(opp) }), label)
            .toEqual(dressTeams({ ...args, groundL: fieldOf(opp).groundL }));
        }
      }
    }
  });

  it('the menu Locker has no opponent and no court — its captain is unchanged', () => {
    // buildLocker(mode:'locker') dresses against a stand-in crew with no field,
    // and passes groundL null: the turntable there is the crew's own dark kit.
    const NEUTRAL = { id: '', colors: { primary: '#8a8a92' }, kits: {
      dark: { hex: '#23232a', ink: '#f4f4f6', logo: '', img: '' },
      light: { hex: '#f2f2f4', ink: '#0b0c10', logo: '', img: '' },
    } };
    for (const t of teams.teams) {
      const menu = dressTeams({ home: NEUTRAL, away: t, playerSide: 'away', tones: { home: 'dark', away: 'light' }, groundL: null });
      expect(menu.away.hex, t.id).toBe(t.kits.light.hex);
    }
  });
});
