// The kicker's walk-up (dev, 2026-08-25: "they should walk out before they
// kick" + a taunt). Pure numbers + the taunt pick; matchScene moves the body.
export const TAUNTS = ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser'];
// tauntS is a CAP, not a play length: the taunt phase ends on the clip's own
// onDone or at the cap, whichever lands first (the taunt clips run ~1.7-1.8s).
export const WALKUP = { startX: -3.4, plateX: -0.9, z: 0.4, mps: 1.6, tauntS: 1.9, serveDelayS: 0.3 };
export const walkS = () => (WALKUP.plateX - WALKUP.startX) / WALKUP.mps;
// ---------- EVERY KICKER BRINGS HIS OWN (dev, 2026-08-28: "Every player should
// use a different taunt... if every taunt is the same when kicking, it gets
// redundant"). A crew's eight kickers get a taunt EACH, dealt off a shuffle
// seeded by the crew id: same crew, same order, every match; two crews, two
// orders. Five clips over eight slots, so the last three repeat the ones used
// LONGEST ago — and never next to themselves, counting the wrap from the 8th
// kicker back to the leadoff (the order loops all game).
export const WALKUP_SLOTS = 8;

/** FNV-1a — a crew id in, a stable 32-bit seed out. */
const seedOf = (id) => {
  let h = 2166136261;
  for (const ch of String(id ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
/** mulberry32: tiny, seedable, good enough to deal five clips. */
const rngOf = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** This crew's whole taunt rotation, slot 0 (leadoff/captain) first.
 *  @param {{id?: string}|string} team the crew — its id is the only seed
 *  @returns {string[]} one clip name per kicking slot */
export function tauntOrder(team, clips = TAUNTS, slots = WALKUP_SLOTS) {
  const pool = [...clips];
  const rnd = rngOf(seedOf(typeof team === 'object' ? team?.id : team));
  for (let i = pool.length - 1; i > 0; i--) {           // seeded Fisher-Yates
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = [];
  for (let i = 0; i < slots; i++) {
    if (i < pool.length) { out.push(pool[i]); continue; }
    // out of fresh clips: reach for the one used longest ago, skipping anything
    // that would land next to itself (the last slot sits next to the leadoff)
    const cand = [...pool]
      .sort((a, b) => out.lastIndexOf(a) - out.lastIndexOf(b))
      .find((c) => c !== out[i - 1] && !(i === slots - 1 && c === out[0]));
    out.push(cand ?? pool[i % pool.length]);
  }
  return out;
}

/** The clip kicker `i` of this crew taunts with. Deterministic and stable. */
export function tauntForSlot(team, i, clips = TAUNTS, slots = WALKUP_SLOTS) {
  const order = tauntOrder(team, clips, slots);
  return order[((i % order.length) + order.length) % order.length];
}

/** YOUR pick dresses YOUR CAPTAIN and nobody else (spec §4): slot 0 of your
 *  crew wears the Locker taunt, the other seven — and every CPU kicker — bring
 *  the one their slot was dealt. */
export function pickTaunt({ isPlayer = false, slot = 0, team = null, equipped = null } = {}) {
  if (isPlayer && slot === 0 && equipped?.clip) return equipped.clip;
  return tauntForSlot(team, slot);
}

// The walk-up made SETUP ~3.5s long, which handed a mashing runner a FREE,
// uncontested bag: the throw only ever comes from pitch resolution. No steals
// until the kicker is at the plate.
export const stealAllowed = ({ walkup, stealing, lastStealCommit, phase, playFinalized }) =>
  !walkup && !stealing && !lastStealCommit && phase !== 'LIVE' && !playFinalized;
