import { describe, it, expect } from 'vitest';
import { chooseLiveShot } from '../src/game/matchScene.js';

describe('live shot selection', () => {
  it('foul -> foulTrail', () => {
    expect(chooseLiveShot({ phase: 'FOUL' })).toBe('foulTrail');
  });
  it('player kicked, ball flying near the fence -> crane', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: true, trailBall: true, deepBall: true })).toBe('crane');
  });
  it('player kicked, ball flying infield -> ballFlight telephoto', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: true, trailBall: true, deepBall: false })).toBe('ballFlight');
  });
  it('player offense after the trail window -> runners cam', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: true, trailBall: false })).toBe('runners');
  });
  it('defense -> defense cam', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: false, trailBall: false })).toBe('defense');
  });
});
