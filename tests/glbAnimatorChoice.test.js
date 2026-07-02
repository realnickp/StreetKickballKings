import { describe, it, expect } from 'vitest';
import { chooseAnimator } from '../src/game/glbCharacters.js';

describe('animator selection', () => {
  it('uses mocap when clips are available', () => {
    expect(chooseAnimator({ clips: [{}], forceCode: false })).toBe('mocap');
  });
  it('falls back to code animator when clips failed to load', () => {
    expect(chooseAnimator({ clips: null, forceCode: false })).toBe('code');
  });
  it('?codeanim=1 forces the code animator even with clips', () => {
    expect(chooseAnimator({ clips: [{}], forceCode: true })).toBe('code');
  });
});
