import { describe, it, expect } from 'vitest';
import { TUTORIAL_PAGES } from '../src/ui/screens/tutorial.js';

describe('tutorial pages', () => {
  it('covers every core system in order', () => {
    expect(TUTORIAL_PAGES.map((p) => p.title)).toEqual([
      'KICKING', 'RUNNING', 'EXTRA BASES', 'THE PICKLE — THE DUEL', 'FIELDING', 'PITCH & THE CROWN',
    ]);
  });

  it('every page has a demo and readable copy', () => {
    for (const p of TUTORIAL_PAGES) {
      expect(p.demo).toContain('tut-stage');
      expect(p.lines.length).toBeGreaterThanOrEqual(2);
      for (const l of p.lines) expect(l.length).toBeGreaterThan(10);
    }
  });

  it('teaches the controls by name', () => {
    const all = TUTORIAL_PAGES.flatMap((p) => p.lines).join(' ');
    for (const term of ['FLICK UP', 'MASH', 'GO!', 'THROW!', 'SWIPE UP', 'PEG', 'TRACE', 'CROWNED', 'STEAL']) {
      expect(all).toContain(term);
    }
  });
});
