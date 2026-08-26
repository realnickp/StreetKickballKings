import { it, expect } from 'vitest';
import { PerfWatchdog } from '../src/engine/perfWatchdog.js';

const feed = (w, dtS, seconds) => {
  let out = null;
  for (let t = 0; t < seconds; t += dtS) { const r = w.tick(dtS); if (r !== null) out = r; }
  return out;
};

it('never fires during warm-up or on smooth frames', () => {
  const w = new PerfWatchdog();
  expect(feed(w, 0.030, 4)).toBe(null);
  expect(feed(w, 0.016, 10)).toBe(null);
  expect(w.level).toBe(4);
});

it('steps 4 -> 2 -> 0 on sustained slow frames, one step per window', () => {
  const w = new PerfWatchdog({ warmupS: 0 });
  expect(feed(w, 0.030, 3.2)).toBe(2);
  expect(feed(w, 0.030, 3.2)).toBe(0);
  expect(feed(w, 0.030, 3.2)).toBe(null);   // floor reached, stays quiet
  expect(w.level).toBe(0);
});

it('is one-way: smooth frames after a drop never raise the level', () => {
  const w = new PerfWatchdog({ warmupS: 0 });
  feed(w, 0.030, 3.2);
  expect(w.level).toBe(2);
  feed(w, 0.010, 10);
  expect(w.level).toBe(2);
});
