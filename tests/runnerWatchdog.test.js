import { describe, it, expect } from 'vitest';
import { RunnerWatchdog } from '../src/game/runnerWatchdog.js';

describe('RunnerWatchdog', () => {
  it('fires after stallS seconds of no progress while running', () => {
    const w = new RunnerWatchdog(6);
    expect(w.check('r1', 10, 'running', 0)).toBe(false);
    expect(w.check('r1', 10.1, 'running', 3)).toBe(false);   // < epsilon movement
    expect(w.check('r1', 10.1, 'running', 6.5)).toBe(true);  // stuck > 6s
  });
  it('real progress resets the clock', () => {
    const w = new RunnerWatchdog(6);
    w.check('r1', 10, 'running', 0);
    expect(w.check('r1', 14, 'running', 5)).toBe(false); // moved 4m — fresh window
    expect(w.check('r1', 14, 'running', 10.9)).toBe(false);
    expect(w.check('r1', 14, 'running', 11.1)).toBe(true);
  });
  it('non-running states clear the record', () => {
    const w = new RunnerWatchdog(6);
    w.check('r1', 10, 'running', 0);
    expect(w.check('r1', 10, 'held', 7)).toBe(false);
    expect(w.check('r1', 10, 'running', 8)).toBe(false); // fresh start
  });
  it('tracks runners independently and reset() wipes all', () => {
    const w = new RunnerWatchdog(6);
    w.check('r1', 10, 'running', 0);
    w.check('r2', 5, 'running', 0);
    expect(w.check('r1', 10, 'running', 6.5)).toBe(true);
    w.reset();
    expect(w.check('r2', 5, 'running', 7)).toBe(false); // fresh after reset
  });
});
