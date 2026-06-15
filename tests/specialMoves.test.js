import { it, expect } from 'vitest';
import { SpecialMeter } from '../src/game/specialMoves.js';
import tuning from '../src/data/tuning.json';
import teams from '../src/data/teams.json';

const monarchs = teams.teams.find(t => t.id === 'monarchs');

it('meter starts empty and charges from plays', () => {
  const m = new SpecialMeter(monarchs, tuning);
  expect(m.value).toBe(0);
  m.add('PERFECT');
  expect(m.value).toBe(35);
  expect(m.ready).toBe(false);
});

it('meter caps at max and becomes ready', () => {
  const m = new SpecialMeter(monarchs, tuning);
  m.add('PERFECT'); m.add('homerun'); m.add('peg'); m.add('catch');
  expect(m.value).toBe(tuning.special.meterMax);
  expect(m.ready).toBe(true);
});

it('consume resets the meter and returns the team special', () => {
  const m = new SpecialMeter(monarchs, tuning);
  m.add('PERFECT'); m.add('homerun'); m.add('peg');
  const special = m.consume();
  expect(special.id).toBe('crown-crusher');
  expect(special.label).toBe('CROWN CRUSHER');
  expect(special.powerMult).toBe(tuning.special.powerMult);
  expect(m.value).toBe(0);
});

it('consume returns null when not ready', () => {
  const m = new SpecialMeter(monarchs, tuning);
  expect(m.consume()).toBe(null);
});
