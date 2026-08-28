// KITS — who wears what, and why you can tell the two crews apart (spec §3),
// AND why you can tell them from the ground they're standing on.
//
// Every crew carries a DARK and a LIGHT kit in `teams.json` (`kits.dark` /
// `kits.light`, each `{ hex, ink, logo, img }`). The match dresses them:
// HOME wears dark, AWAY wears light; if that pair doesn't separate on a phone
// (ΔL* < 25) both sides flip. An equipped Locker kit PINS your side — you wear
// what you picked — and the opponent picks the tone that reads against it.
//
// THE GROUND GETS A VOTE. Dev, on his phone, 2026-08-28, on Winter Classic:
// "the white in Chicago makes it hard to see" — Memphis in their white kit, on
// a white player, on white snow. Two crews can clear ΔL* 25 from each other and
// still both vanish, because the pairing rule had never heard of the court.
// `dressTeams` now takes the field's own `groundL` (the L* the lit court
// actually renders at — measured headless, `src/data/fields.json`, resolved for
// a crew by `groundLFor`) and PREFERS the pairing whose worse kit stands
// furthest off it — but it never re-dresses a tone you actually TAPPED for a
// gain under `GROUND_GAIN_L`, because the swatch has to mean something.
//
// Pure + data-driven on purpose: the screens (team select swatches, the Locker
// chips, GEAR UP's "what you're wearing" line) and the 3D recolour all read the
// SAME kit object, so the preview is the uniform you actually take out there.
// `ink` is the number/decal colour, `logo` the mark FILE (no extension) — a
// bright kit asks for the light cut, and gets it only where the crew actually
// ships one (see LIGHT_LOGOS/markFor); otherwise it wears the base mark.
import fields from '../data/fields.json';

/** Two crews closer than this in Lab lightness read as one team at phone size.
 *  The same number is what a kit has to clear against the GROUND to count as
 *  standing off it — a player is a figure on a court exactly the way one crew
 *  is a figure next to the other, and the eye has the same amount of trouble. */
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

// ---- the light mark -------------------------------------------------------
// Crews that ship a SECOND, light-background cut of their mark as
// `<id>-light.png`. EMPTY today, on purpose: the ten `-light.png` files this
// repo carried were byte-for-byte COPIES of the base marks — 20 MB of duplicate
// art and duplicate download for a file that could never look different. They
// were deleted and every kit now names the one mark that exists.
//
// The hook survives the deletion as DATA: drop a real light cut next to the
// base mark and add its crew id here. That is the whole change — `logoFor` and
// `kitFor` both resolve through `markFor`, so the variant reaches the shirt,
// the 3D decals and anything else reading `kit.logo` with no call-site edit.
export const LIGHT_LOGOS = new Set();

/** The mark FILE a logo name resolves to (no extension): `<id>-light` only
 *  where a light cut is registered, otherwise the crew's base mark. Idempotent
 *  and safe on a raw `teams.json` value, which may still say `<id>-light`. */
export function markFor(logo) {
  const base = String(logo ?? '').replace(/-light$/, '');
  return LIGHT_LOGOS.has(base) ? `${base}-light` : base;
}

/** The logo variant for a kit — the light-background mark on a bright kit,
 *  where the crew has one; the base mark otherwise. */
export function logoFor(team, hex) {
  return markFor(inkFor(hex) === INK_DARK ? `${team?.id ?? ''}-light` : `${team?.id ?? ''}`);
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
  // teams.json still names `<id>-light` on every light kit — a hook kept in the
  // data. `markFor` resolves it to the mark that is actually on disk, so a kit
  // object can never carry a logo name with no file behind it.
  if (k) return k.logo === markFor(k.logo) ? k : { ...k, logo: markFor(k.logo) };
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

/** How far a kit stands off the ground it's played on, in L*. `groundL` is the
 *  field's own measured number (`fields.json`); a field that doesn't carry one
 *  answers Infinity, which is the "the ground has no opinion" case and leaves
 *  every pairing decision exactly where it was. */
export function groundDeltaL(hex, groundL) {
  return Number.isFinite(groundL) ? Math.abs(labL(hex) - groundL) : Infinity;
}

/** The lightness of the court a crew hosts on — `fields.json`'s measured
 *  `groundL` for `team.homeField`, with the Blacktop's number for a crew whose
 *  field can't be found, because that is the field `main.js` puts the match on
 *  in the same case.
 *
 *  ONE lookup, so the Locker/GEAR UP preview and the field cannot disagree.
 *  They did: the preview dressed with no ground at all and the match dressed
 *  with one, so on 25 of the 90 reachable matchups the turntable showed you a
 *  kit you were never going to wear — and "see it on the player before you
 *  play" is the whole point of that screen. */
export function groundLFor(team) {
  const list = fields?.fields ?? [];
  const f = list.find((x) => x.id === team?.homeField) ?? list.find((x) => x.id === 'blacktop');
  return Number.isFinite(f?.groundL) ? f.groundL : null;
}

/** How far off the court an alternative pairing has to move the WORSE-off crew
 *  before it may overrule the tone you tapped in team select. 10 L* is a step
 *  you can see on a phone; under it the swatch you tapped would be getting
 *  thrown away for a difference nobody can point at, and the DARK/LIGHT chip
 *  would be decoration. (Blacktop, Brooklyn v Baltimore: the worse crew gains
 *  30 off the asphalt — the flip is right, and it fires. Blacktop, Brooklyn v
 *  Memphis: 8.9 — your pick holds and you wear what the chip promised.) */
export const GROUND_GAIN_L = 10;

/** Rank one dressed pair. Bigger is better, compared left to right:
 *   1. the two CREWS separate (ΔL* 25) — the hard one, and unchanged: a rule
 *      about the floor must never make the two teams look like one team;
 *   2. the WORSE of the two kits' ground gaps. MAXIMISE THE MINIMUM, not the
 *      count of kits that clear 25 and not the average: the complaint is
 *      always about the one player you cannot see, and a pairing that puts one
 *      crew 60 clear and the other 5 clear is a pairing with an invisible team
 *      in it.
 *  No kit is ever fabricated for the ground: every option scored here is a kit
 *  somebody designed, and on a court no designed kit can beat (`the-underpass`
 *  renders at L* 90 and eight of the ten light kits live between 77 and 96) the
 *  best of a bad set is still the crew's own colours. Fabricating a hex to
 *  clear the floor would cost the crew its identity on every field it visits,
 *  which is a worse trade than a pale kit on one. */
function groundScore(pair, groundL) {
  return [
    contrastDeltaL(pair.home.hex, pair.away.hex) >= CLASH_DELTA_L ? 1 : 0,
    Math.min(groundDeltaL(pair.home.hex, groundL), groundDeltaL(pair.away.hex, groundL)),
  ];
}
const better = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false; // a tie keeps the earlier (higher-seeded) option
};

/** Dress both crews for one match.
 *  @param {{home: object, away: object, playerSide?: 'home'|'away',
 *           gearKit?: object|null, tones?: {home: string, away: string}|null,
 *           groundL?: number|null}} o `groundL` is the L* of the field's ground
 *   (`fields.json`); omit it and the ground has no say, exactly as before.
 *  @returns {{home: object, away: object}} each `{ hex, ink, logo, img, tone }` */
export function dressTeams({ home, away, playerSide = 'away', gearKit = null, tones = null, groundL = null }) {
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
    // widest gap from YOUR pinned kit first; where two of their kits both clear
    // it, the one that also stands off the COURT wins the tie (a Locker kit
    // can pin you into white, but it can't pin your opponent into the snow).
    // THE GROUND HAS TO BE THERE FOR THAT TIE-BREAK TO EXIST: with no `groundL`
    // both kits answer Infinity and `Infinity - Infinity` is NaN — not a
    // comparator, so the sort goes implementation-defined and the opponent
    // takes whichever tone array order handed it. That is what the Locker and
    // GEAR UP were doing (Maryland came out DARK against Brooklyn at ΔL 39.8
    // where the widest-gap rule gives 88.1), and it is the last place a rule
    // about the floor should be allowed to speak, since there is no floor.
    const byGap = ['dark', 'light']
      .map((t) => dress(crew[theirSide], t))
      .sort((a, b) => {
        const da = contrastDeltaL(a.hex, mine.hex);
        const db = contrastDeltaL(b.hex, mine.hex);
        const bothClear = Math.min(da, db) >= CLASH_DELTA_L;
        if (bothClear && Number.isFinite(groundL)) return groundDeltaL(b.hex, groundL) - groundDeltaL(a.hex, groundL);
        return db - da;
      });
    let theirs = byGap[0];
    if (contrastDeltaL(theirs.hex, mine.hex) < CLASH_DELTA_L) theirs = shiftKit(theirs, crew[theirSide], mine.hex);
    return mineSide === 'home' ? { home: mine, away: theirs } : { home: theirs, away: mine };
  }

  const seed = { home: tones?.home ?? 'dark', away: tones?.away ?? 'light' };
  // What you set in team select is tried FIRST — including "both crews light",
  // which is a choice you can make there. If that pair doesn't separate, fall
  // through the two proper pairings and take the first that clears; if none
  // does, keep the widest gap and shift the NON-player side to finish it.
  //
  // YOUR PICK IS A CHOICE, NOT A SUGGESTION. `tones` is the DARK/LIGHT swatch
  // you TAPPED, and the court may only overrule it for something you can see:
  // the pair has to fail the crew gate (two crews reading as one team is not a
  // taste question), or the alternative has to leave the worse-off crew at
  // least GROUND_GAIN_L further off the ground. Anything smaller and the chip
  // in team select is lying about what you'll be wearing.
  // With NO `tones` there is no pick to keep — `seed` is only spec §3's default
  // ordering — so the ground maximises freely, which is the contract the
  // ten-field sweep in `tests/fieldsGround.test.js` holds.
  const options = [seed, ...PAIRINGS.filter((p) => !same(p, seed))];
  let out = null;
  if (Number.isFinite(groundL)) {
    // THE GROUND IS IN THE ROOM: score every option rather than taking the
    // first that separates the crews. Seed order still wins ties, so a field
    // whose court has no opinion about either kit dresses exactly as before.
    const rows = options.map((o) => {
      const pair = { home: dress(home, o.home), away: dress(away, o.away) };
      return { pair, score: groundScore(pair, groundL) };
    });
    const bestOf = (list) => list.reduce((b, r) => (b && !better(r.score, b.score) ? b : r), null);
    const seedRow = rows[0];
    const alt = bestOf(rows.slice(1));
    const seedClears = seedRow.score[0] === 1;
    out = (!tones || !seedClears) ? bestOf(rows).pair
      : (alt && alt.score[0] === 1 && alt.score[1] >= seedRow.score[1] + GROUND_GAIN_L) ? alt.pair
        : seedRow.pair;
  } else {
    let bestD = -1;
    for (const o of options) {
      const pair = { home: dress(home, o.home), away: dress(away, o.away) };
      const d = contrastDeltaL(pair.home.hex, pair.away.hex);
      if (d >= CLASH_DELTA_L) { out = pair; break; }
      if (d > bestD) { bestD = d; out = pair; }
    }
  }
  if (contrastDeltaL(out.home.hex, out.away.hex) < CLASH_DELTA_L) {
    out[theirSide] = shiftKit(out[theirSide], crew[theirSide], out[mineSide].hex);
  }
  return out;
}
