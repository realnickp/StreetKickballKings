// KITS — who wears what, and why you can tell the two crews apart (spec §3).
//
// Every crew carries a DARK and a LIGHT kit in `teams.json` (`kits.dark` /
// `kits.light`, each `{ hex, ink, logo, img }`). The match dresses them:
// HOME wears dark, AWAY wears light; if that pair doesn't separate on a phone
// (ΔL* < 25) both sides flip. An equipped Locker kit PINS your side — you wear
// what you picked — and the opponent picks the tone that reads against it.
//
// Pure + data-driven on purpose: the screens (team select swatches, the Locker
// chips, GEAR UP's "what you're wearing" line) and the 3D recolour all read the
// SAME kit object, so the preview is the uniform you actually take out there.
// `ink` is the number/decal colour, `logo` the mark variant ('<id>' reads on a
// dark kit, '<id>-light' on a bright one).

/** Two crews closer than this in Lab lightness read as one team at phone size. */
export const CLASH_DELTA_L = 25;

const INK_DARK = '#0b0c10';
const INK_LIGHT = '#f4f4f6';

const hexToRgb = (h) => {
  const s = String(h ?? '').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0);
};
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** CIE L* (0 black … 100 white) — perceptual lightness, not raw RGB average.
 *  Raw luminance calls #E0701A and #7A2417 nearly the same brightness; L*
 *  doesn't, which is the whole point of the clash check. */
export function labL(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => srgbToLinear(v / 255));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** How far apart two kits read, in L*. Symmetric, 0 for a colour against itself. */
export function contrastDeltaL(a, b) {
  return Math.abs(labL(a) - labL(b));
}

/** The number/decal ink for a kit: whichever of the two reads further from it. */
export function inkFor(hex) {
  return contrastDeltaL(hex, INK_DARK) >= contrastDeltaL(hex, INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

/** The logo variant for a kit — the light-background mark on a bright kit. */
export function logoFor(team, hex) {
  return inkFor(hex) === INK_DARK ? `${team.id}-light` : `${team.id}`;
}

/** Which tone a loose colour belongs to (a Locker kit has no tone of its own). */
export const toneOf = (hex) => (inkFor(hex) === INK_DARK ? 'light' : 'dark');

// LAST RESORT: a brightness-shifted variant of a crew's colour, hue kept. Its
// 0.5 threshold is the old naive luma the shift was tuned against, deliberately
// left alone — it only ever runs for a stub crew whose BOTH kits clash, and the
// caller re-derives ink/logo so the fabricated kit can't contradict itself.
const mix = (hex, target, t) => { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t); };
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** A uniform for `hex` that contrasts in brightness with `vsHex`, keeping its hue. */
export const contrastUniform = (hex, vsHex) =>
  (lum(vsHex) < 0.5 ? mix(hex, [255, 255, 255], 0.6) : mix(hex, [12, 14, 20], 0.55));

/** Resolve a team's kit for a tone ('dark'|'light'). A team with no `kits`
 *  block (a stub crew) still dresses: signature colour, base sprite. */
export function kitFor(team, tone) {
  const k = team?.kits?.[tone];
  if (k) return k;
  const hex = team?.colors?.primary ?? '#8a8a92';
  return { hex, ink: inkFor(hex), logo: logoFor(team ?? { id: '' }, hex), img: '' };
}

const dress = (team, tone) => ({ ...kitFor(team, tone), tone });
/** The two ways a match can be dressed, best first (spec §3: home wears dark). */
const PAIRINGS = [{ home: 'dark', away: 'light' }, { home: 'light', away: 'dark' }];
const same = (a, b) => a.home === b.home && a.away === b.away;

/** An equipped Locker uniform as a kit. `kit-team-light`/`kit-team-dark` are
 *  your crew's own kits (`teamKit`); BLACKOUT/WHITEOUT/GOLD are flat colours,
 *  so their ink and logo variant are derived the same way the data is. */
export function resolveGearKit(gear, team) {
  if (!gear) return null;
  if (gear.teamKit) return { ...dress(team, gear.teamKit), gear: gear.id };
  const hex = gear.hex;
  return {
    hex,
    ink: inkFor(hex),
    logo: logoFor(team, hex),
    img: kitFor(team, toneOf(hex)).img ?? '',
    tone: toneOf(hex),
    gear: gear.id,
    name: gear.name,
  };
}

/** Re-cut a kit around a shifted hex. The hex is fabricated, so the ink and the
 *  logo variant must be RE-DERIVED from it — carrying the original's would put
 *  a light number and a dark-kit mark on a pale shirt. */
const shiftKit = (kit, team, vsHex) => {
  const hex = contrastUniform(kit.hex, vsHex);
  return { ...kit, hex, ink: inkFor(hex), logo: logoFor(team, hex) };
};

/** Dress both crews for one match.
 *  @param {{home: object, away: object, playerSide?: 'home'|'away',
 *           gearKit?: object|null, tones?: {home: string, away: string}|null}} o
 *  @returns {{home: object, away: object}} each `{ hex, ink, logo, img, tone }` */
export function dressTeams({ home, away, playerSide = 'away', gearKit = null, tones = null }) {
  const mineSide = playerSide === 'home' ? 'home' : 'away';
  const theirSide = mineSide === 'home' ? 'away' : 'home';
  const crew = { home, away };

  // AN EQUIPPED LOCKER KIT PINS YOUR SIDE. That's the promise the chip makes —
  // you wear what you picked — so the OPPONENT is the one who dresses against
  // it: whichever of their two real, designed kits reads furthest from yours.
  // (Every crew in teams.json clears ΔL* 49 on one of its two tones against the
  // Locker kits, so the shift below is stub-crew insurance, not a normal path.)
  if (gearKit) {
    const mine = resolveGearKit(gearKit, crew[mineSide]);
    const byGap = ['dark', 'light']
      .map((t) => dress(crew[theirSide], t))
      .sort((a, b) => contrastDeltaL(b.hex, mine.hex) - contrastDeltaL(a.hex, mine.hex));
    let theirs = byGap[0];
    if (contrastDeltaL(theirs.hex, mine.hex) < CLASH_DELTA_L) theirs = shiftKit(theirs, crew[theirSide], mine.hex);
    return mineSide === 'home' ? { home: mine, away: theirs } : { home: theirs, away: mine };
  }

  const seed = { home: tones?.home ?? 'dark', away: tones?.away ?? 'light' };
  // What you set in team select is tried FIRST — including "both crews light",
  // which is a choice you can make there. If that pair doesn't separate, fall
  // through the two proper pairings and take the first that clears; if none
  // does, keep the widest gap and shift the NON-player side to finish it.
  const options = [seed, ...PAIRINGS.filter((p) => !same(p, seed))];
  let out = null;
  let bestD = -1;
  for (const o of options) {
    const pair = { home: dress(home, o.home), away: dress(away, o.away) };
    const d = contrastDeltaL(pair.home.hex, pair.away.hex);
    if (d >= CLASH_DELTA_L) { out = pair; break; }
    if (d > bestD) { bestD = d; out = pair; }
  }
  if (contrastDeltaL(out.home.hex, out.away.hex) < CLASH_DELTA_L) {
    out[theirSide] = shiftKit(out[theirSide], crew[theirSide], out[mineSide].hex);
  }
  return out;
}
