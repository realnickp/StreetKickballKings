// src/game/walkoutShow.js — STARTING LINEUPS walk-out, as pure math.
// Dev, 2026-08-27: "we need to see different cinematic angles of the teams
// walking out to the field, all of them for starting lineups". A WALK, not a
// dance number: eight players come through the side gate in a staggered file,
// captain on point, and plant in a wedge in front of the plate while three
// broadcast shots cut on the beat (gate dolly → side steadicam → crane reveal).
//
// matchScene owns the bodies and the camera requests; this file owns WHEN and
// WHERE — so the whole show is testable without a renderer.
//
// TUNING NOTE (why the pace is what it is): the design's gate/speed pair
// (x ±14 at 1.7 m/s) is a 14–17 m walk = 8–12 s of walking per player, i.e. a
// ~28 s pre-game before a single pitch. The show's shape is the requirement —
// three shots at 0 / 3.0 / 5.6, the crew PLANTED by 6 s so the crane reveals a
// finished wedge, 8 s a team, ~17 s for both. So the gate moved in to the
// sideline (|x| 6.5 at z −6, just outside the foul line where a real gate
// would be) and the walk was tuned to the SHORTEST speed that still lands the
// last man before the crane has to hold: 2.3 m/s. (3.0 m/s cleared the gate
// with room to spare but read as fast-forward — the walk clip is time-scaled
// by mps/walkClipMps to keep feet on the ground, and 3.0 meant a 1.88× clip.
// 2.3 is a 1.44× stretch: a stride you can read as a walk.)
const SLOTS = [ // captain on point, rows 2-3-2 behind — the victoryLap wedge, pushed out to the infield
  [0, -8.2], [-1.7, -9.4], [1.7, -9.4],
  // slot 4 is off the captain's centre line ON PURPOSE: dead centre at
  // [0, −10.6] hides behind the point man for the whole crane (14° elevation),
  // so the "all of them" reveal was only ever seven bodies.
  [-3.1, -10.6], [0.6, -10.6], [3.1, -10.6],
  [-2.2, -11.8], [2.2, -11.8],
];

export const WALKOUT_SHOW = {
  gateX: 6.5,        // side gate, just outside the foul line (|x| = 6 at z -6)
  gateZ: -6.0,
  slots: SLOTS,
  mps: 2.3,          // a WALK the eye can read (see TUNING NOTE)
  walkClipMps: 1.6,  // ground speed the `walk` clip is baked for (WALKUP.mps)
  stagger: 0.20,     // s between one player leaving the gate and the next
  trail: 0.14,       // s of daylight the captain keeps on each man behind him
  holdS: 1.6,        // the planted wedge must hold at least this long
  cuts: [0, 3.0, 5.6],
  shots: ['walkoutGate', 'walkoutSide', 'walkoutCrane'],
  totalS: 8.0,
  // The crest card is an 82%-opaque full-screen wash: land it EARLY and it
  // covers the reveal it is supposed to punctuate. 1.0 s at t 7.0 leaves the
  // crane 1.4 s of legible lineup and still stamps the crest before the cut.
  splashS: 1.0,
  plateInS: 0.4,     // captain's lower-third plate in...
  plateOutS: 3.0,    // ...and gone before the second shot
};

/** away walks out of the THIRD-base gate (-x), home out of the first-base gate. */
export const walkoutSign = (side) => (side === 'home' ? 1 : -1);

/**
 * The whole per-side walk-out as data.
 * @param {'home'|'away'} side
 * @returns {{side, sign, gate:{x,z}, lines:Array<{i,start,from,to,dist,arriveAt,mps}>,
 *   capArriveAt:number, lastArriveAt:number, cuts:number[], splashAt:number, totalS:number}}
 */
export function walkoutTimeline(side) {
  const { gateX, gateZ, mps, stagger, trail, totalS, splashS, cuts } = WALKOUT_SHOW;
  const sign = walkoutSign(side);
  const gate = { x: sign * gateX, z: gateZ };
  const legS = ([x, z]) => Math.hypot(x - gate.x, z - gate.z) / mps;
  // the captain leaves first and walks flat out; everyone else is held to at
  // least `trail` behind him. From a SIDE gate the near-column slots are
  // physically closer than the captain's point, so without the hold-back the
  // wedge would fill in from the back — the captain has to lead his crew.
  const capArriveAt = legS(SLOTS[0]);
  const lines = SLOTS.map((slot, i) => {
    const to = { x: slot[0], z: slot[1] };
    const start = i * stagger;
    const dist = Math.hypot(to.x - gate.x, to.z - gate.z);
    const arriveAt = i === 0
      ? start + dist / mps
      : Math.max(start + dist / mps, capArriveAt + i * trail);
    return { i, start, from: { ...gate }, to, dist, arriveAt, mps: dist / (arriveAt - start) };
  });
  return {
    side, sign, gate, lines,
    capArriveAt,
    lastArriveAt: Math.max(...lines.map((l) => l.arriveAt)),
    cuts: [...cuts],
    splashAt: totalS - splashS,
    totalS,
  };
}

/** Which of the three shots is live t seconds into a side's walk-out. */
export function walkoutShotAt(t) {
  const { cuts, shots } = WALKOUT_SHOW;
  let name = shots[0];
  for (let i = 0; i < cuts.length; i++) if (t >= cuts[i]) name = shots[i];
  return name;
}

/** 0 → 1 across the crane beat only (the shot's own dolly parameter). */
export function craneT(t) {
  const { cuts, totalS } = WALKOUT_SHOW;
  const t0 = cuts[cuts.length - 1];
  return Math.max(0, Math.min(1, (t - t0) / Math.max(0.001, totalS - t0)));
}
