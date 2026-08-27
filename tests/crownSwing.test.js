import { it, expect } from 'vitest';
import { judgeKick, crownJudge } from '../src/game/kickTiming.js';
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
