import { it, expect } from 'vitest';
import { PowerKicks } from '../src/game/powerKicks.js';
import { SpecialMeter } from '../src/game/specialMoves.js';
import tuning from '../src/data/tuning.json';
import teams from '../src/data/teams.json';

const monarchs = teams.teams.find((t) => t.id === 'monarchs');
const flair = { id: 'kick-flair', name: 'THE FLAIR', clip: 'kickFlair', mods: { powerMult: 1.45 } };
const mk = (gear = null) => new PowerKicks({ meter: new SpecialMeter(monarchs, tuning), gear });

it('an equipped kick starts the match with 2 charges; stock starts with 0', () => {
  expect(mk(flair).charges).toBe(2);
  expect(mk().charges).toBe(0);
  expect(mk().lit).toBe(false);
  expect(mk().name).toBe('CROWN KICK');
  expect(mk(flair).name).toBe('THE FLAIR');
});

it('a full crown meter mints +1 charge and resets', () => {
  const p = mk();
  expect(p.feed('PERFECT')).toBe(false);
  expect(p.feed('homerun')).toBe(false);
  expect(p.feed('peg')).toBe(true);
  expect(p.charges).toBe(1);
  expect(p.meter.value).toBe(0);
  expect(p.hudState().meterFill).toBe(0);
});

it('arm needs a charge; consume spends it at launch; disarm refunds', () => {
  const p = mk();
  expect(p.arm()).toBe(false);
  p.feed('pickleEscape'); p.feed('homerun');
  expect(p.arm()).toBe(true);
  p.disarm();
  expect(p.charges).toBe(1);
  p.arm();
  const sp = p.consume();
  expect(sp.powerMult).toBe(tuning.special.powerMult);
  expect(sp.gear).toBe(null);
  expect(sp.label).toBe(monarchs.special.label);
  expect(p.charges).toBe(0);
  expect(p.consume()).toBe(null);
});

it('gear rides the consume: its mods replace the stock power', () => {
  const p = mk(flair);
  p.arm();
  const sp = p.consume();
  expect(sp.gear).toBe(flair);
  expect(sp.powerMult).toBe(1.45);
  expect(sp.label).toBe('THE FLAIR');
  expect(p.hudState()).toEqual({ name: 'THE FLAIR', charges: 1, armed: false, meterFill: 0 });
});
