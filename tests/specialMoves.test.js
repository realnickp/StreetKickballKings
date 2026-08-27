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
  m.add('PERFECT'); m.add('homerun'); m.add('hit'); m.add('run'); // 120 -> capped
  expect(m.value).toBe(tuning.special.meterMax);
  expect(m.ready).toBe(true);
});

it('consume resets the meter and returns the team special', () => {
  const m = new SpecialMeter(monarchs, tuning);
  m.add('PERFECT'); m.add('homerun'); m.add('run');
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

it('the offense builds the crown: hits, runs, steals all feed the meter', () => {
  const m = new SpecialMeter(monarchs, tuning);
  m.add('hit'); m.add('run'); m.add('steal');
  const g = tuning.special.gain;
  expect(m.value).toBe(g.hit + g.run + g.steal);
  expect(g.hit).toBeGreaterThanOrEqual(15);
  expect(g.run).toBeGreaterThanOrEqual(20);
  expect(g.steal).toBeGreaterThanOrEqual(12);
});

it('a decent inning arms the crown (two hits + a run + a PERFECT)', () => {
  const m = new SpecialMeter(monarchs, tuning);
  m.add('hit'); m.add('hit'); m.add('run'); m.add('PERFECT');
  expect(m.ready).toBe(true);
});
