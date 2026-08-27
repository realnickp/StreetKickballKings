import { it, expect } from 'vitest';
import { judgeKick, crownJudge, clampCrownDirection } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';

// Dev, 2026-08-27: "I just did a crowned kick and it was a normal kick." The
// judge folds alignment into the timing error, so a well-timed crown swing
// taken ~0.8 m off the ball judged FOUL and dribbled. A consumed crown is
// never a dribbler — the judge floors at OK.

it('promotes a FOUL-quality crown swing to OK', () => {
  const judged = judgeKick(300, tuning);
  expect(judged.quality).toBe('FOUL');
  const crowned = crownJudge(judged, tuning);
  expect(crowned.quality).toBe('OK');
  expect(crowned.power).toBe(tuning.kick.power.OK);
});

it('keeps the raw timing error so downstream bias/guarantee still read it', () => {
  const judged = judgeKick(-310, tuning);
  expect(crownJudge(judged, tuning).errorMs).toBe(judged.errorMs);
});

it('leaves PERFECT, GOOD and OK swings untouched', () => {
  for (const err of [0, 90, 200]) {
    const judged = judgeKick(err, tuning);
    expect(crownJudge(judged, tuning)).toEqual(judged);
  }
});

it('a promoted swing is no longer cinematic-gated as a foul', () => {
  const crowned = crownJudge(judgeKick(300, tuning), tuning);
  expect(crowned.cinematic).toBe(false);
  expect(crowned.quality).not.toBe('FOUL');
});

// A GUARANTEED CROWN SWING MUST STAY FAIR (dev, 2026-08-27). The guarantee
// floors loft and speed but never touched direction, so aimSpreadDeg (52) plus
// the gear curl could send the biggest swing in the game foul — and burn the
// meter doing it. The fair wedge at fenceM + 10 is ~45 deg a side; 40 holds
// inside it with margin.
it('pulls a foul-bound crown heading back inside the fair wedge', () => {
  expect(clampCrownDirection(55)).toBe(40);
  expect(clampCrownDirection(-52)).toBe(-40);
});

it('leaves an already-fair heading exactly alone', () => {
  expect(clampCrownDirection(12)).toBe(12);
  expect(clampCrownDirection(-39.9)).toBe(-39.9);
  expect(clampCrownDirection(0)).toBe(0);
});

it('holds at the wedge edge and honours a custom wedge', () => {
  expect(clampCrownDirection(40)).toBe(40);
  expect(clampCrownDirection(80, 45)).toBe(45);
});

it('a non-finite heading never leaks NaN into the launch', () => {
  expect(clampCrownDirection(NaN)).toBe(0);
  expect(clampCrownDirection(undefined)).toBe(0);
});

it('the full aim spread plus timing bias would have gone foul without it', () => {
  const worst = tuning.kick.aimSpreadDeg + 8; // clamped pull + late-timing bias
  expect(worst).toBeGreaterThan(45);
  expect(Math.abs(clampCrownDirection(worst))).toBeLessThanOrEqual(40);
});
