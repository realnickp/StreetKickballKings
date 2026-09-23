import { it, expect } from 'vitest';
import { yieldToMain } from '../src/engine/yieldToMain.js';

// Sixteen serial recolours of 130-400 ms each blocked the UI thread for a
// measured 14 s while the intro videos played — TAP TO SKIP did nothing
// (audit B15). Between bodies the build now hands the thread back.

it('resolves without requestAnimationFrame (node, a hidden tab) within the cap', async () => {
  const t0 = Date.now();
  await yieldToMain(30);
  expect(Date.now() - t0).toBeLessThan(500);
});

it('uses requestAnimationFrame when there is one, then a macrotask', async () => {
  const calls = [];
  globalThis.requestAnimationFrame = (cb) => { calls.push('raf'); setTimeout(() => cb(16), 0); return 1; };
  try {
    await yieldToMain(1000);
    expect(calls).toEqual(['raf']);
  } finally { delete globalThis.requestAnimationFrame; }
});
