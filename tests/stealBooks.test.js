import { it, expect } from 'vitest';
import { revertStealBooks } from '../src/game/stealBooks.js';

// Dead-ball bookkeeping: a foul un-commits a steal (street rule, fun drop §6).

it('reverts a committed 2nd/3rd steal: back on the original bag, no run change', () => {
  const { bases, runsDelta } = revertStealBooks([null, 4, null], { idx: 4, from: 0, to: 1 });
  expect(bases).toEqual([4, null, null]);
  expect(runsDelta).toBe(0);
});

it('reverts a scored home steal: the run comes off, runner back on 3rd', () => {
  const { bases, runsDelta } = revertStealBooks([null, null, null], { idx: 7, from: 2, to: 3 });
  expect(bases).toEqual([null, null, 7]);
  expect(runsDelta).toBe(-1);
});

it('never grows the bases array past the 3 bags', () => {
  const { bases } = revertStealBooks([null, null, null], { idx: 2, from: 2, to: 3 });
  expect(bases.length).toBe(3);
  expect(Object.keys({ ...bases }).length).toBeLessThanOrEqual(3);
});
