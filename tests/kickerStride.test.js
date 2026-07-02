import { describe, it, expect } from 'vitest';
import { kickerStrideAnim } from '../src/game/matchScene.js';

describe('kicker stride selection', () => {
  it('moving +x (kicker faces the mound at -z, so +x is his right) -> strafeR', () => {
    expect(kickerStrideAnim(2.0)).toBe('strafeR');
  });
  it('moving -x -> strafeL', () => {
    expect(kickerStrideAnim(-2.0)).toBe('strafeL');
  });
  it('below the dead-zone -> null (settled)', () => {
    expect(kickerStrideAnim(0.3)).toBe(null);
    expect(kickerStrideAnim(-0.3)).toBe(null);
  });
});
