// src/game/walkoutShow.js — STARTING LINEUPS walk-out, as pure math.
// Dev, 2026-08-27: "we need to see different cinematic angles of the teams
// walking out to the field, all of them for starting lineups". A WALK, not a
// dance number: eight players come through the side gate in a file, captain on
// point, and plant in a wedge in front of the plate while three broadcast shots
// cut on the beat (gate dolly → side steadicam → crane reveal).
//
// Dev, 2026-08-28, after seeing it on the phone: "every character just appears
// randomly instead of them all just walking out … the whole team at the same
// time … all players should be rendered when the camera hits them not rendering
// one by one at random times … they walk through each other … like ghosts."
// So this file was rebuilt around two hard rules:
//
//   1. THE WHOLE CREW IS ON SCREEN FROM t = 0. Nobody is hidden and popped in
//      later. All eight stand in one file on the approach lane outside the
//      gate, `spacing` metres apart, and the file starts moving TOGETHER — one
//      conveyor, everybody at `mps`. `start` is no longer "when this man
//      becomes visible", it is simply WHEN HE CROSSES THE GATE MOUTH, and it
//      falls out of the geometry: queue index × spacing / mps.
//   2. ONE LANE, AND IT NEVER CROSSES ITSELF. Everybody walks the SAME
//      polyline — out of the gate, down the wedge's outer flank (the side the
//      gate is on), then in along his OWN ROW from outside — and peels off at
//      his slot. Because every man rides one shared path at one speed, the gap
//      between any two of them is their queue gap (≥ `spacing`) for as long as
//      both are moving; once a man plants, the lane is already 0.9 m clear of
//      him. No two bodies ever occupy the same ground: no ghosts.
//
// matchScene owns the bodies and the camera requests; this file owns WHEN and
// WHERE — so the whole show is testable without a renderer.
//
// LANE GEOMETRY (all of it in "gate space": u = sign · x, so u > 0 is always
// the gate's side of the diamond and one description covers both crews):
//
//        u ─────────────────────────────────────────────►  (out toward the gate)
//   z −6 │        ●7  ●6  ●5  ●4  ●3  ●2  ●1  ●0 ← gate mouth (u 5.5)
//        │                                     ╱                the file queues
//   −8.2 │            [cap]◄────────────────── A (u 4.0)        back along here
//   −9.4 │        ◄────────────────────────────┤
//  −10.6 │    ◄────────────────────────────────┤   the outer-flank lane
//  −11.8 │      ◄──────────────────────────────┘
//
// The captain's row is the lane's first corner (A), so his walk is the shortest
// and he is ALWAYS on point. Everyone else rides the flank down past the rows
// and turns in along his own row line — 1.2 m clear of the rows in front of and
// behind him, 0.9 m clear of the flank-side slots. Rows fill BACK FIRST and,
// inside a row, FAR SIDE FIRST (which falls out for free: sorting the file by
// descending lane length orders each row from the far seat inward), so a
// planted man is never standing in a later walker's lane.
//
// TUNING NOTE (why the pace is what it is): the design's gate/speed pair
// (x ±14 at 1.7 m/s) is a 14–17 m walk = 8–12 s of walking per player, i.e. a
// ~28 s pre-game before a single pitch. The show's shape is the requirement —
// three shots at 0 / 3.0 / 5.6, the crew PLANTED by 6 s so the crane reveals a
// finished wedge, 8 s a team, ~17 s for both. So the gate sits on the sideline
// (|x| 5.5 at z −6, where a gate would be) and the walk is the SLOWEST speed
// that still lands the last man before the crane has to hold: 2.4 m/s. That is
// a 1.5× stretch of the 1.6 m/s walk clip — the ceiling at which feet still
// read as a stride instead of fast-forward. (2.3 m/s, the old pace, misses the
// 6.0 s gate by 0.07 s now that the lane goes AROUND the wedge instead of
// straight through it.)
const SLOTS = [ // captain on point, rows 2-3-2 behind — the victoryLap wedge, pushed out to the infield
  [0, -8.2], [-1.7, -9.4], [1.7, -9.4],
  // slot 4 is off the captain's centre line ON PURPOSE: dead centre at
  // [0, −10.6] hides behind the point man for the whole crane (14° elevation),
  // so the "all of them" reveal was only ever seven bodies.
  [-3.1, -10.6], [0.6, -10.6], [3.1, -10.6],
  [-2.2, -11.8], [2.2, -11.8],
];

const MPS = 2.4;
const SPACING = 1.0;

export const WALKOUT_SHOW = {
  gateX: 5.5,        // side gate, on the sideline at z -6
  gateZ: -6.0,
  slots: SLOTS,
  // |u| of the walking lane down the wedge's outer flank. 4.0 clears the
  // outermost slot (|u| 3.1) by 0.9 m — a lane, not a squeeze.
  flankU: 4.0,
  spacing: SPACING,  // metres between two men in the file (the brief's floor is 0.9)
  mps: MPS,          // a WALK the eye can read (see TUNING NOTE)
  walkClipMps: 1.6,  // ground speed the `walk` clip is baked for (WALKUP.mps)
  // s between one man crossing the gate mouth and the next. NOT a free knob any
  // more — it IS the file's spacing at the file's speed, which is what keeps
  // the crew from ever closing on each other.
  stagger: SPACING / MPS,
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
  // The gate dolly opens on the WHOLE FILE (the dev's "all of them"), so it
  // looks at the file's midpoint first and hands off to the captain.
  gateLookHoldS: 1.0,
  gateLookBlendS: 0.8,
};

/** away walks out of the THIRD-base gate (-x), home out of the first-base gate. */
export const walkoutSign = (side) => (side === 'home' ? 1 : -1);

const len = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

/** drop the zero-length hops a degenerate corner leaves behind (the captain's
 *  row IS the lane's first corner; the lead man's queue seat IS the gate). */
function polyline(points) {
  const path = [points[0]];
  for (const p of points.slice(1)) {
    const prev = path[path.length - 1];
    if (len(prev, p) > 1e-9) path.push(p);
  }
  return path;
}

/**
 * The whole per-side walk-out as data.
 *
 * Every line carries the FULL polyline the man walks, starting at the spot he
 * is standing on at t = 0 (his seat in the file, out past the gate). Everyone
 * steps off together at t = 0 and holds `mps` the whole way, so the file's
 * spacing is a constant and nobody can overtake, close on, or walk through
 * anybody.
 *
 * @param {'home'|'away'} side
 * @returns {{side, sign, gate:{x,z}, lines:Array<{i,queue,start,from,to,path,dist,arriveAt,mps}>,
 *   capArriveAt:number, lastArriveAt:number, cuts:number[], splashAt:number, totalS:number}}
 */
export function walkoutTimeline(side) {
  const { gateX, gateZ, flankU, spacing, mps, totalS, splashS, cuts } = WALKOUT_SHOW;
  const sign = walkoutSign(side);
  const world = (u, z) => ({ x: sign * u, z });      // gate space -> world
  const gate = world(gateX, gateZ);
  const frontZ = SLOTS[0][1];                        // the captain's row = the lane's first corner
  const corner = world(flankU, frontZ);

  // gate-space read of every slot, and the lane length from the gate mouth to it:
  // the diagonal in off the gate + down the flank + in along the row.
  const legIn = len(gate, corner);
  const seats = SLOTS.map(([x, z], i) => {
    const u = sign * x;
    return { i, u, z, lane: legIn + Math.abs(z - frontZ) + (flankU - u) };
  });

  // FILE ORDER. The captain leads (his row is the lane's first corner — nobody
  // else's lane comes within 4 m of his slot, so leading costs no one). Behind
  // him the longest walk goes first, which (a) is what keeps the last arrival
  // inside the crane's gate and (b) fills every row from the FAR seat inward
  // for free: inside one row, lane length is just (flankU − u), so descending
  // length IS far-side-first.
  const order = [seats[0], ...seats.slice(1).sort((a, b) => b.lane - a.lane)];

  const lines = seats.map(() => null);
  order.forEach((seat, q) => {
    const back = spacing * q;                        // how far back in the file he starts
    const path = polyline([
      world(gateX + back, gateZ),                    // his seat in the file, out past the gate
      gate,                                          // the gate mouth
      corner,                                        // the wedge's outer flank, at the front row
      world(flankU, seat.z),                         // down the flank to his own row
      world(seat.u, seat.z),                         // in along the row to his slot
    ]);
    const dist = back + seat.lane;
    lines[seat.i] = {
      i: seat.i,
      queue: q,                                      // his place in the file, 0 = the gate mouth
      start: back / mps,                             // when he crosses the gate mouth
      from: path[0],
      to: { x: sign * seat.u, z: seat.z },
      path,
      dist,
      arriveAt: dist / mps,
      mps,
    };
  });

  return {
    side, sign, gate, lines,
    capArriveAt: lines[0].arriveAt,
    lastArriveAt: Math.max(...lines.map((l) => l.arriveAt)),
    cuts: [...cuts],
    splashAt: totalS - splashS,
    totalS,
  };
}

/**
 * Where a walker is (and which way he is pointed) t seconds into the show.
 * The single source of truth for the mover AND the tests — if the pure lane is
 * clean, the rendered one is the same lane.
 * @returns {{x:number, z:number, hx:number, hz:number, arrived:boolean}}
 */
export function walkoutPosAt(line, t) {
  const { path, mps } = line;
  let s = Math.max(0, t) * mps;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const l = len(a, b);
    if (s <= l || i === path.length - 1) {
      const k = Math.min(1, s / l);
      return {
        x: a.x + (b.x - a.x) * k,
        z: a.z + (b.z - a.z) * k,
        hx: (b.x - a.x) / l,
        hz: (b.z - a.z) / l,
        arrived: k >= 1,
      };
    }
    s -= l;
  }
  const b = path[path.length - 1];
  return { x: b.x, z: b.z, hx: 0, hz: 0, arrived: true };
}

/** Every walker's position at t, indexed by SLOT (so [0] is always the captain). */
export function walkoutPositionsAt(tl, t) {
  return tl.lines.map((ln) => walkoutPosAt(ln, t));
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
