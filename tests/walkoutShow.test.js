import { it, expect } from 'vitest';
import { WALKOUT_SHOW, walkoutTimeline, walkoutShotAt, craneT } from '../src/game/walkoutShow.js';

const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

it('every player rides his own line from the side gate to a wedge slot', () => {
  const tl = walkoutTimeline('away');
  expect(tl.lines).toHaveLength(8);
  expect(tl.sign).toBe(-1);
  // away comes out of the THIRD-base gate, home out of the first-base gate
  expect(tl.gate).toEqual({ x: -WALKOUT_SHOW.gateX, z: WALKOUT_SHOW.gateZ });
  expect(walkoutTimeline('home').gate).toEqual({ x: WALKOUT_SHOW.gateX, z: WALKOUT_SHOW.gateZ });
  for (const ln of tl.lines) {
    expect(ln.from).toEqual(tl.gate);            // one gate, one file
    expect(ln.to).toEqual({ x: WALKOUT_SHOW.slots[ln.i][0], z: WALKOUT_SHOW.slots[ln.i][1] });
    expect(ln.dist).toBeCloseTo(dist(ln.from, ln.to), 6);
  }
  // the wedge: captain on point at z -8.2, the crew filling back to z -11.8
  expect(WALKOUT_SHOW.slots).toEqual([
    [0, -8.2], [-1.7, -9.4], [1.7, -9.4],
    [-3.1, -10.6], [0, -10.6], [3.1, -10.6],
    [-2.2, -11.8], [2.2, -11.8],
  ]);
});

it('the file leaves the gate on a stagger and walks at one speed', () => {
  const tl = walkoutTimeline('home');
  tl.lines.forEach((ln, i) => {
    expect(ln.start).toBeCloseTo(i * WALKOUT_SHOW.stagger, 6);
    // arrival is the walk itself, unless the captain-lead hold-back stretches it
    expect(ln.arriveAt).toBeGreaterThanOrEqual(ln.start + ln.dist / WALKOUT_SHOW.mps - 1e-9);
    // and the pace a held-back walker settles into is never a sprint
    expect(ln.mps).toBeLessThanOrEqual(WALKOUT_SHOW.mps + 1e-9);
    expect(ln.mps).toBeGreaterThan(0.8);
  });
  expect(tl.lines[0].arriveAt).toBeCloseTo(tl.lines[0].dist / WALKOUT_SHOW.mps, 6);
});

it('THE CAPTAIN ARRIVES FIRST — nobody may beat him to the wedge', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    const cap = tl.lines[0];
    expect(tl.capArriveAt).toBeCloseTo(cap.arriveAt, 6);
    for (const ln of tl.lines.slice(1)) expect(ln.arriveAt).toBeGreaterThan(cap.arriveAt);
    // the near-column slots are physically CLOSER to the side gate than the
    // captain's point — the hold-back is what keeps him on point anyway
    expect(tl.lines.slice(1).some((ln) => ln.dist < cap.dist)).toBe(true);
  }
});

it('the whole crew is planted before the crane reveal has to hold it', () => {
  for (const side of ['away', 'home']) {
    const tl = walkoutTimeline(side);
    expect(tl.capArriveAt).toBeLessThanOrEqual(6.0);
    expect(tl.lastArriveAt).toBeLessThanOrEqual(6.0);      // brief gate
    expect(tl.lastArriveAt).toBeLessThan(tl.splashAt);      // settled BEFORE the crest lands
    expect(tl.totalS - tl.lastArriveAt).toBeGreaterThanOrEqual(WALKOUT_SHOW.holdS);
  }
});

it('three shots, cut on the beat, eight seconds a team', () => {
  const tl = walkoutTimeline('away');
  expect(tl.cuts).toEqual([0, 3.0, 5.6]);
  expect(tl.totalS).toBe(8.0);
  expect(tl.splashAt).toBeCloseTo(8.0 - WALKOUT_SHOW.splashS, 6);
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
});
