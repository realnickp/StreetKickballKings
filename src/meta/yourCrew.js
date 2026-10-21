// YOUR CREW (story spec §2): a no-name crew off your block. The player names
// the CREW and picks colours + a mark — never the players (dev, 2026-10-20:
// "we cannot make the player name 14 players"). The eight block players arrive
// already named, already cast, rated low with one thing each of them can do.
import crewKit from '../data/story/crewKit.json';
import { inkFor } from '../game/kits.js';

export const NAME_MAX = 14;
const BLOCKLIST = ['fuck', 'shit', 'bitch', 'nigg', 'fag', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'retard', 'nazi'];
const STATS = ['power', 'speed', 'arm', 'glove'];
const SKINS = ['deep', 'brown', 'tan', 'light'];
const ACCESSORIES = ['none', 'wristbands', 'headband'];
const BENCHED_ARCHETYPE = 17; // glbCharacters.js BENCHED: rigged but never skinned
const ARCHETYPE_COUNT = 20;

/** The crew name as it goes on the shirt, or null when it can't be one. */
export function cleanCrewName(raw) {
  const name = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9 '&.-]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > NAME_MAX) return null;
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  return BLOCKLIST.some((w) => flat.includes(w)) ? null : name;
}

function rng(seed) { // mulberry32 — same seed, same block
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const shuffle = (r, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Eight block players from one seed: avg ~4/10, exactly one standout (6) each. */
export function makeBlockRoster(seed) {
  const r = rng(seed);
  const nicks = shuffle(r, crewKit.blockNames).slice(0, 8);
  const archetypes = shuffle(r, [...Array(ARCHETYPE_COUNT).keys()].filter((i) => i !== BENCHED_ARCHETYPE)).slice(0, 8);
  const numbers = shuffle(r, [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 21, 22, 24, 30, 33, 44, 55, 77, 88, 99]).slice(0, 8);
  let statSets;
  for (;;) { // reroll the whole block until it averages in the 3.6–4.4 band
    statSets = crewKit.positions.map(() => {
      const star = pick(r, STATS);
      return Object.fromEntries(STATS.map((s) => [s, s === star ? 6 : 2 + Math.floor(r() * 4)]));
    });
    const mean = statSets.flatMap((st) => STATS.map((s) => st[s])).reduce((a, b) => a + b, 0) / 32;
    if (mean >= 3.6 && mean <= 4.4) break;
  }
  return crewKit.positions.map((pos, i) => ({
    id: `b${i + 1}`,
    nick: nicks[i],
    pos,
    number: numbers[i],
    stats: statSets[i],
    cast: {
      archetype: archetypes[i],
      skin: pick(r, SKINS),
      height: Math.round((0.96 + r() * 0.1) * 100) / 100,
      build: Math.round((0.94 + r() * 0.15) * 100) / 100,
      accessory: pick(r, ACCESSORIES),
    },
  }));
}

/** Your crew in the same shape as a teams.json crew, so the match, the kits,
 *  the decals and the booth treat you like everybody else. */
export function crewTeam(story) {
  const { name, primary, secondary, mark } = story.crew;
  const logo = `stock/${mark}`;
  const DARK = '#16161a';
  return {
    id: 'yours',
    city: 'THE BLOCK',
    region: 'east',
    name,
    colors: { primary, secondary, accent: secondary },
    logo: `assets/logos/${logo}.png`,
    kits: {
      dark: { hex: DARK, ink: inkFor(DARK), logo, img: '' },
      light: { hex: primary, ink: inkFor(primary), logo, img: '' },
    },
    sprites: [],
    runSprites: [],
    anthem: null,
    introVideo: null,
    musicGenre: 'block',
    special: { id: 'block-boot', label: 'BLOCK BOOT' },
    homeField: 'blacktop',
    status: 'story',
    roster: story.roster,
  };
}
