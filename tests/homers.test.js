// HOMERS ARE EARNED (dev, 2026-08-28: "its really easy to kick homers").
// Two pure helpers own the new rule — `isHrEligible` (who may leave the yard)
// and `capSpeedForCarry` (everyone else dies at the track) — and the third
// block below is the one that actually answers the dev: a thousand kicks by a
// decent player through the REAL judge, counted.
import { describe, it, expect } from 'vitest';
import { judgeKick, powerFromError, launchParams, flickShape, isHrEligible, capSpeedForCarry, FLICK } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';

const HR = tuning.kick.hr;

// The ball's own flight model (ball.js: G = 11.5, no drag), closed-form, so the
// simulation and the cap tests measure exactly what the physics will do without
// booting three.js. Origin at ball height, so the ball returns to its own radius.
const G = 11.5;
const carryM = (speed, loftDeg) => {
  const l = (loftDeg * Math.PI) / 180;
  const vy = speed * Math.sin(l);
  return speed * Math.cos(l) * ((2 * vy) / G);
};

describe('isHrEligible — the gate a bomb has to pass', () => {
  const perfect = { quality: 'PERFECT', power01: 0.95, alignErrM: 0.2, loftDeg: 42 };

  it('passes a PERFECT, locked-meter, lined-up full flick', () => {
    expect(isHrEligible(perfect, tuning)).toBe(true);
  });
  it('never passes a GOOD kick, however hard and however well lined up', () => {
    expect(isHrEligible({ ...perfect, quality: 'GOOD', power01: 1, alignErrM: 0 }, tuning)).toBe(false);
    expect(isHrEligible({ ...perfect, quality: 'OK' }, tuning)).toBe(false);
    expect(isHrEligible({ ...perfect, quality: 'FOUL' }, tuning)).toBe(false);
  });
  it('passes at exactly the tuned power and alignment', () => {
    expect(isHrEligible({ ...perfect, power01: HR.power, alignErrM: HR.alignM }, tuning)).toBe(true);
  });
  it('fails at 0.90 power — the old bar', () => {
    expect(isHrEligible({ ...perfect, power01: 0.9 }, tuning)).toBe(false);
  });
  it('fails when the kicker is not under the ball', () => {
    expect(isHrEligible({ ...perfect, alignErrM: HR.alignM + 0.01 }, tuning)).toBe(false);
  });
  it('fails on a deliberate liner — no air under it', () => {
    expect(isHrEligible({ ...perfect, loftDeg: 20 }, tuning)).toBe(false);
    expect(isHrEligible({ ...perfect, loftDeg: FLICK.hrMinLoftDeg }, tuning)).toBe(true);
  });
  it('skips the loft axis when there are no flick metrics (AI kick)', () => {
    expect(isHrEligible({ quality: 'PERFECT', power01: 1, alignErrM: 0 }, tuning)).toBe(true);
  });
});

describe('capSpeedForCarry — the track is the ceiling', () => {
  const predict = (speed, loftDeg) => carryM(speed, loftDeg);

  it('brings a 38° bomb back inside 39 m', () => {
    const speed = 24; // the game's max
    expect(carryM(speed, 38)).toBeGreaterThan(39); // the kick this is protecting against
    const capped = capSpeedForCarry({ loftDeg: 38, carryM: 39, speed }, predict);
    expect(carryM(capped, 38)).toBeLessThanOrEqual(39);
    expect(carryM(capped, 38)).toBeGreaterThan(38); // ...and lands ON the track, not in the infield
  });
  it('never returns more than the uncapped speed', () => {
    for (const loft of [15, 24, 34, 42, 52]) {
      for (const speed of [10, 16, 20, 24, 30]) {
        expect(capSpeedForCarry({ loftDeg: loft, carryM: 37, speed }, predict)).toBeLessThanOrEqual(speed);
      }
    }
  });
  it('leaves a kick that already dies short exactly as it was', () => {
    const speed = 14; // ~16 m at 38°
    expect(capSpeedForCarry({ loftDeg: 38, carryM: 37, speed }, predict)).toBe(speed);
  });
  it('holds the ceiling across every loft the flick can produce', () => {
    for (let loft = FLICK.minLoftDeg; loft <= FLICK.maxLoftDeg; loft += 1) {
      const capped = capSpeedForCarry({ loftDeg: loft, carryM: 37, speed: 40 }, predict);
      expect(carryM(capped, loft)).toBeLessThanOrEqual(37);
    }
  });
  it('is inert without a usable predictor or speed', () => {
    expect(capSpeedForCarry({ loftDeg: 38, carryM: 37, speed: 24 }, null)).toBe(24);
    expect(capSpeedForCarry({ loftDeg: 38, carryM: 0, speed: 24 }, predict)).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// 1 000 KICKS BY A DECENT PLAYER, through the real judge + the real launch math.
// Error model: timing σ 90 ms, alignment σ 0.35 m, full flick (42°) every time.
// Seeded, so this is a fixed regression gate, not a coin flip.
describe('1 000-kick simulation: how often does a decent player go deep', () => {
  const mulberry32 = (a) => () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('lands the homer rate between 4% and 12%, and NEVER off a GOOD kick', () => {
    const rand = mulberry32(20260828);
    const gauss = (sigma) => {
      let u = 0; let v = 0;
      while (!u) u = rand();
      while (!v) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
    };
    const FENCE_M = 40;                 // mid of the 36-42 m range in fields.json
    const TRACK = FENCE_M - HR.trackM;  // the cap's ceiling
    // a full flick: 232 px of rise in 200 ms -> 42° and a mid-band snap
    const shape = flickShape({ risePx: 232, durMs: 200, driftPx: 0 });
    expect(shape.loftDeg).toBeGreaterThan(41.5);

    const N = 1000;
    const tally = { PERFECT: { n: 0, hr: 0 }, GOOD: { n: 0, hr: 0 }, OK: { n: 0, hr: 0 }, FOUL: { n: 0, hr: 0 }, WHIFF: { n: 0, hr: 0 } };
    let homers = 0;
    let uncapped = 0; // what the SAME thousand kicks did under the old physics-decides rule

    for (let i = 0; i < N; i += 1) {
      const errMs = gauss(90);
      const alignErrM = Math.abs(gauss(0.35));
      // matchScene folds the lateral miss into an effective error (1 m ~ 175 ms)
      const effErr = Math.abs(errMs) + alignErrM * 175;
      if (effErr > tuning.kick.okWindowMs * 1.6) { tally.WHIFF.n += 1; continue; }
      const judged = judgeKick(Math.sign(errMs || 1) * effErr, tuning);
      const power01 = powerFromError(errMs, tuning);
      const launch = launchParams(judged, { aimDeg: 0, power01, shape }, tuning);

      let eligible = isHrEligible({ quality: judged.quality, power01, alignErrM, loftDeg: shape.loftDeg }, tuning);
      // not every earned bomb IS a bomb: the gap-shot roll dies at the track too
      if (eligible && rand() < HR.gapShot) eligible = false;

      const speed = eligible
        ? launch.speed
        : capSpeedForCarry({ loftDeg: launch.loftDeg, carryM: TRACK, speed: launch.speed }, carryM);
      const flew = carryM(speed, launch.loftDeg);

      if (carryM(launch.speed, launch.loftDeg) > FENCE_M) uncapped += 1;
      const t = tally[judged.quality];
      t.n += 1;
      if (flew > FENCE_M) { t.hr += 1; homers += 1; }
    }

    const pct = (n) => `${((100 * n) / N).toFixed(1)}%`;
    console.log(`\n  1 000 decent-player kicks (σ 90 ms, σ 0.35 m, full flick, ${FENCE_M} m fence)`);
    console.log(`  homer rate: ${pct(homers)}  (same kicks, uncapped/old rule: ${pct(uncapped)})`);
    for (const q of ['PERFECT', 'GOOD', 'OK', 'FOUL', 'WHIFF']) {
      console.log(`    ${q.padEnd(8)} ${String(tally[q].n).padStart(4)} kicks  ${String(tally[q].hr).padStart(3)} homers`);
    }

    expect(homers / N).toBeGreaterThanOrEqual(0.04);
    expect(homers / N).toBeLessThanOrEqual(0.12);
    expect(tally.GOOD.hr).toBe(0);
    expect(tally.OK.hr).toBe(0);
    expect(tally.FOUL.hr).toBe(0);
    // and the round earned its name: the old rule sent most of them out
    expect(uncapped / N).toBeGreaterThan(0.4);
  });
});
