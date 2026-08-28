import { it, expect } from 'vitest';
import {
  WALKOUT_SHOW, walkoutTimeline, walkoutShotAt, walkoutPosAt, walkoutPositionsAt, craneT,
} from '../src/game/walkoutShow.js';

const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const pathLen = (path) => path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0);
/** every walker's position, sampled at 30 Hz across the whole show */
const sample30 = (tl) => {
  const frames = [];
  for (let f = 0; f <= Math.ceil(tl.totalS * 30); f++) frames.push({ t: f / 30, p: walkoutPositionsAt(tl, f / 30) });
  return frames;
};

it('the WHOLE CREW is standing in the file at t = 0 — nothing pops in later', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    expect(tl.lines).toHaveLength(8);
    const at0 = walkoutPositionsAt(tl, 0);
    expect(at0).toHaveLength(8);
    // every man is ON HIS FEET at t 0, and every one of them is a distinct spot
    for (const ln of tl.lines) expect(walkoutPosAt(ln, 0)).toMatchObject({ x: ln.from.x, z: ln.from.z });
    // the file: captain at the gate mouth, the rest strung back along the gate
    // lane, `spacing` apart, all of them further out than the gate (|x| >= gateX)
    const file = [...tl.lines].sort((a, b) => a.queue - b.queue);
    expect(file[0].i).toBe(0);                              // the captain leads
    expect(file[0].from).toEqual(tl.gate);                  // ...from the mouth itself
    file.forEach((ln, q) => {
      expect(ln.queue).toBe(q);
      expect(ln.from.z).toBe(WALKOUT_SHOW.gateZ);
      expect(Math.abs(ln.from.x)).toBeCloseTo(WALKOUT_SHOW.gateX + q * WALKOUT_SHOW.spacing, 6);
      if (q) expect(dist(ln.from, file[q - 1].from)).toBeCloseTo(WALKOUT_SHOW.spacing, 6);
    });
    // spacing is the brief's floor or better, and `stagger` IS that spacing at
    // the file's speed — the gate-mouth crossings, not a free knob
    expect(WALKOUT_SHOW.spacing).toBeGreaterThanOrEqual(0.9);
    expect(WALKOUT_SHOW.stagger).toBeCloseTo(WALKOUT_SHOW.spacing / WALKOUT_SHOW.mps, 6);
    file.forEach((ln, q) => expect(ln.start).toBeCloseTo(q * WALKOUT_SHOW.stagger, 6));
  }
});

it('everyone walks ONE lane: gate -> the wedge’s outer flank -> in along his own row', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    const sign = tl.sign;
    const u = (x) => sign * x;                              // "gate space": u > 0 is the gate's side
    expect(tl.gate).toEqual({ x: sign * WALKOUT_SHOW.gateX, z: WALKOUT_SHOW.gateZ });
    for (const ln of tl.lines) {
      expect(ln.to).toEqual({ x: WALKOUT_SHOW.slots[ln.i][0], z: WALKOUT_SHOW.slots[ln.i][1] });
      expect(ln.path[0]).toEqual(ln.from);
      expect(ln.path[ln.path.length - 1]).toEqual(ln.to);
      expect(ln.dist).toBeCloseTo(pathLen(ln.path), 6);
      expect(ln.arriveAt).toBeCloseTo(ln.dist / WALKOUT_SHOW.mps, 6);
      // the shared spine: the gate mouth, then the flank corner on the front row
      expect(ln.path).toContainEqual(tl.gate);
      expect(ln.path).toContainEqual({ x: sign * WALKOUT_SHOW.flankU, z: WALKOUT_SHOW.slots[0][1] });
      // the flank lane clears the widest slot (|u| 3.1) by a lane's width
      expect(WALKOUT_SHOW.flankU - Math.max(...WALKOUT_SHOW.slots.map(([x]) => u(x)))).toBeGreaterThanOrEqual(0.8);
      // he turns in along HIS OWN ROW — the last leg is a pure sideways run at
      // his slot's z, from outside the wedge inward
      const last = ln.path[ln.path.length - 2];
      expect(last.z).toBe(ln.to.z);
      expect(u(last.x)).toBeCloseTo(WALKOUT_SHOW.flankU, 6);
    }
    // ROWS FILL BACK FIRST, AND FAR SIDE FIRST INSIDE A ROW (the captain's own
    // row is the lane's first corner, so leading it costs nobody a lane).
    const rest = tl.lines.slice(1);
    for (const z of [...new Set(rest.map((l) => l.to.z))]) {
      const row = rest.filter((l) => l.to.z === z).sort((a, b) => a.queue - b.queue);
      row.forEach((ln, k) => { if (k) expect(u(ln.to.x)).toBeGreaterThan(u(row[k - 1].to.x)); });
    }
    // and the deepest row is served before the shallowest one behind the captain
    const rowStart = (z) => Math.min(...rest.filter((l) => l.to.z === z).map((l) => l.queue));
    expect(rowStart(-11.8)).toBeLessThan(rowStart(-9.4));
  }
});

it('NOBODY WALKS THROUGH ANYBODY — 0.6 m of daylight, every walker, every frame', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    let minPair = Infinity;
    let minPlanted = Infinity;
    for (const { p } of sample30(tl)) {
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) minPair = Math.min(minPair, dist(p[i], p[j]));
        // a PLANTED man is furniture: no later walker may brush him either
        if (!p[i].arrived) continue;
        for (let j = 0; j < p.length; j++) if (j !== i && !p[j].arrived) minPlanted = Math.min(minPlanted, dist(p[i], p[j]));
      }
    }
    expect(minPair).toBeGreaterThan(0.6);
    expect(minPlanted).toBeGreaterThan(0.6);
  }
});

it('the pace is a WALK — the clip never stretches past 1.5x', () => {
  expect(WALKOUT_SHOW.gateX).toBe(5.5);
  expect(WALKOUT_SHOW.mps).toBe(2.4);
  expect(WALKOUT_SHOW.spacing).toBe(1.0);
  expect(WALKOUT_SHOW.flankU).toBe(4.0);
  // feet match ground speed via a time-scaled walk clip; past ~1.5x it reads
  // as fast-forward instead of a stride (3.0 m/s was 1.88x)
  expect(WALKOUT_SHOW.mps / WALKOUT_SHOW.walkClipMps).toBeLessThanOrEqual(1.5 + 1e-9);
  // ...and nobody ever hurries to catch up: ONE speed, the whole file
  for (const ln of walkoutTimeline('away').lines) expect(ln.mps).toBe(WALKOUT_SHOW.mps);
  expect(walkoutTimeline('away').capArriveAt).toBeCloseTo(2.78, 1);
});

it('THE CAPTAIN ARRIVES FIRST — nobody may beat him to the wedge', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    const cap = tl.lines[0];
    expect(cap.queue).toBe(0);
    expect(tl.capArriveAt).toBeCloseTo(cap.arriveAt, 6);
    for (const ln of tl.lines.slice(1)) expect(ln.arriveAt).toBeGreaterThan(cap.arriveAt + 1.5);
    // his walk is the SHORTEST because his row is the lane's first corner —
    // that, not a hold-back on everyone else, is what keeps him on point
    for (const ln of tl.lines.slice(1)) expect(ln.dist).toBeGreaterThan(cap.dist);
  }
});

it('the whole crew is planted before the crane reveal has to hold it', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    expect(tl.capArriveAt).toBeLessThanOrEqual(6.0);
    expect(tl.lastArriveAt).toBeLessThanOrEqual(6.0);      // brief gate
    // and a full second of PLANTED WEDGE before the crest wash covers it
    expect(tl.lastArriveAt).toBeLessThanOrEqual(tl.splashAt - 1.0);
    expect(tl.totalS - tl.lastArriveAt).toBeGreaterThanOrEqual(WALKOUT_SHOW.holdS);
    // and the wedge really is a wedge by then: everyone on his slot
    const end = walkoutPositionsAt(tl, tl.lastArriveAt);
    end.forEach((p, i) => {
      expect(p.arrived).toBe(true);
      expect(dist(p, tl.lines[i].to)).toBeCloseTo(0, 6);
    });
  }
});

it('the wedge itself is unchanged — the crane still sees all eight', () => {
  // the wedge: captain on point at z -8.2, the crew filling back to z -11.8
  expect(WALKOUT_SHOW.slots).toEqual([
    [0, -8.2], [-1.7, -9.4], [1.7, -9.4],
    [-3.1, -10.6], [0.6, -10.6], [3.1, -10.6],
    [-2.2, -11.8], [2.2, -11.8],
  ]);
  // NOBODY IS HIDDEN BEHIND THE CAPTAIN. The crane looks down the +z axis at
  // ~14°, so a slot on the captain's centre line is a body he eclipses for the
  // whole reveal — slot 4 is off-axis on purpose.
  for (const [x, z] of WALKOUT_SHOW.slots.slice(1)) {
    expect(Math.abs(x - WALKOUT_SHOW.slots[0][0]) > 0.5 || z === WALKOUT_SHOW.slots[0][1]).toBe(true);
  }
});

it('three shots, cut on the beat, eight seconds a team', () => {
  const tl = walkoutTimeline('away');
  expect(tl.cuts).toEqual([0, 3.0, 5.6]);
  expect(tl.totalS).toBe(8.0);
  // the crest card is a near-opaque full-screen wash: it lands LAST, so the
  // crane's reveal gets 1.4 s of legible lineup before it slams
  expect(WALKOUT_SHOW.splashS).toBe(1.0);
  expect(tl.splashAt).toBeCloseTo(7.0, 6);
  expect(tl.splashAt).toBeCloseTo(8.0 - WALKOUT_SHOW.splashS, 6);
  expect(tl.splashAt - tl.cuts[2]).toBeGreaterThanOrEqual(1.4);
  expect(walkoutShotAt(0)).toBe('walkoutGate');
  expect(walkoutShotAt(2.99)).toBe('walkoutGate');
  expect(walkoutShotAt(3.0)).toBe('walkoutSide');
  expect(walkoutShotAt(5.59)).toBe('walkoutSide');
  expect(walkoutShotAt(5.6)).toBe('walkoutCrane');
  expect(walkoutShotAt(99)).toBe('walkoutCrane');
});

it('the crane runs 0 -> 1 across its own beat only', () => {
  expect(craneT(0)).toBe(0);
  expect(craneT(5.6)).toBe(0);
  expect(craneT(6.8)).toBeCloseTo(0.5, 6);
  expect(craneT(8.0)).toBe(1);
  expect(craneT(20)).toBe(1);
});

it('the captain plate opens the show and is gone before the second shot', () => {
  expect(WALKOUT_SHOW.plateInS).toBe(0.4);
  expect(WALKOUT_SHOW.plateOutS).toBe(3.0);
  expect(WALKOUT_SHOW.plateOutS).toBeLessThanOrEqual(WALKOUT_SHOW.cuts[1]);
  // the gate dolly holds the WHOLE FILE first, then hands off to the captain,
  // and it is done handing off long before the cut
  expect(WALKOUT_SHOW.gateLookHoldS + WALKOUT_SHOW.gateLookBlendS).toBeLessThan(WALKOUT_SHOW.cuts[1]);
});

it('a walker points where he is WALKING, and squares up on arrival', () => {
  const tl = walkoutTimeline('away');
  const ln = tl.lines[6];                                   // a deep-row man: three corners
  const heading = (t) => { const p = walkoutPosAt(ln, t); return Math.round(Math.atan2(p.hx, p.hz) * 57.2958); };
  const legs = new Set();
  for (let t = 0.05; t < ln.arriveAt; t += 0.05) legs.add(heading(t));
  expect(legs.size).toBeGreaterThanOrEqual(3);              // in to the gate, down the flank, in along the row
  for (let t = 0.05; t < ln.arriveAt; t += 0.05) expect(Math.hypot(walkoutPosAt(ln, t).hx, walkoutPosAt(ln, t).hz)).toBeCloseTo(1, 6);
  expect(walkoutPosAt(ln, ln.arriveAt + 0.5)).toMatchObject({ x: ln.to.x, z: ln.to.z, arrived: true });
});
