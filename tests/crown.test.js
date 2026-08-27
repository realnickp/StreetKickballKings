import { it, expect } from 'vitest';
import { Crown, halfRuns, isFinalHalf } from '../src/game/crown.js';
import { SpecialMeter } from '../src/game/specialMoves.js';
import tuning from '../src/data/tuning.json';
import teams from '../src/data/teams.json';
const monarchs = teams.teams.find((t) => t.id === 'monarchs');
const flair = { id: 'kick-flair', name: 'THE FLAIR', clip: 'kickFlair', mods: { powerMult: 1.45 } };
const mk = (gear = null) => new Crown({ meter: new SpecialMeter(monarchs, tuning), gear });

it('starts empty with no charges, whatever is equipped', () => {
  expect(mk(flair).fill).toBe(0); expect(mk(flair).ready).toBe(false); expect(mk(flair).name).toBe('THE FLAIR'); expect(mk().name).toBe('CROWN KICK');
});
it('fills only from the offense table; defense events are ignored', () => {
  const c = mk();
  expect(c.feed('catch')).toBe(false); expect(c.fill).toBe(0);
  expect(c.feed('peg')).toBe(false); expect(c.fill).toBe(0);
  expect(c.feed('hit')).toBe(false); expect(c.fill).toBe(20);
  expect(c.feed('shutout')).toBe(false); expect(c.fill).toBe(45);
  expect(c.feed('PERFECT')).toBe(false); expect(c.fill).toBe(80);
  expect(c.feed('run')).toBe(true); expect(c.fill).toBe(100); expect(c.ready).toBe(true);
  expect(c.feed('hit')).toBe(false); expect(c.fill).toBe(100); // capped, no re-announce
});
it('arm needs a full crown; consume resets to zero and carries the equipped kick', () => {
  const c = mk(flair);
  expect(c.arm()).toBe(false);
  c.feed('pickleEscape'); c.feed('homerun');
  expect(c.arm()).toBe(true); c.disarm(); expect(c.fill).toBe(100);
  c.arm(); const sp = c.consume();
  expect(sp).toEqual({ gear: flair, powerMult: 1.45, label: 'THE FLAIR' });
  expect(c.fill).toBe(0); expect(c.ready).toBe(false); expect(c.consume()).toBe(null);
  expect(mk().hudState()).toEqual({ name: 'CROWN KICK', fill: 0, ready: false, armed: false });
});
it('halfRuns reads the runs the given side scored between two score snapshots', () => {
  expect(halfRuns({ home: 2, away: 1 }, { home: 2, away: 4 }, 'away')).toBe(3);
  expect(halfRuns({ home: 2, away: 1 }, { home: 2, away: 1 }, 'home')).toBe(0);
});
it('with NO kick equipped the swing falls back to the team special', () => {
  const meter = new SpecialMeter(monarchs, tuning);
  const c = new Crown({ meter });
  expect(c.name).toBe('CROWN KICK');
  c.feed('pickleEscape'); c.feed('homerun');
  expect(c.arm()).toBe(true);
  const sp = c.consume();
  expect(sp.gear).toBe(null);
  expect(sp.powerMult).toBe(meter.tuning.special.powerMult);
  expect(sp.label).toBe(meter.team.special.label);
  expect(c.fill).toBe(0);
});

it('isFinalHalf gates the last half: the game ends after the bottom of the last inning unless it is tied', () => {
  const N = 5; // cfg.innings
  expect(isFinalHalf({ inning: 5, half: 'bottom' }, { home: 5, away: 2 }, N)).toBe(true);  // last half, somebody ahead
  expect(isFinalHalf({ inning: 5, half: 'bottom' }, { home: 3, away: 3 }, N)).toBe(false); // tied -> extra innings
  expect(isFinalHalf({ inning: 5, half: 'top' }, { home: 5, away: 2 }, N)).toBe(false);    // the bottom is still to come
  expect(isFinalHalf({ inning: 4, half: 'bottom' }, { home: 5, away: 2 }, N)).toBe(false); // earlier inning
  expect(isFinalHalf({ inning: 7, half: 'bottom' }, { home: 6, away: 5 }, N)).toBe(true);  // extra innings still end on a lead
});
