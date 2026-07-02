import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ReplayRecorder, applyFrame } from '../src/cinematics/replay.js';

function mkChar(x = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, -5);
  const hips = new THREE.Bone(); hips.name = 'Hips';
  hips.position.set(0, 1, 0);
  group.add(hips);
  return { group };
}
const mkBall = () => ({ pos: new THREE.Vector3(0, 0.2, -8), mesh: { visible: true, position: new THREE.Vector3() } });

describe('ReplayRecorder', () => {
  it('captures at the configured rate and clips the last N seconds', () => {
    const rec = new ReplayRecorder({ seconds: 2, hz: 30 });
    const chars = [mkChar()], ball = mkBall();
    rec.track(chars, ball);
    for (let t = 0; t < 3; t += 1 / 60) rec.capture(t); // 3s of 60fps -> 30hz kept
    const clip = rec.clipLast(1.0);
    expect(clip.length).toBeGreaterThanOrEqual(28);
    expect(clip.length).toBeLessThanOrEqual(32);
    expect(clip[0].t).toBeLessThan(clip[clip.length - 1].t);
  });

  it('returns null when the buffer is too short (never a broken replay)', () => {
    const rec = new ReplayRecorder({ seconds: 6, hz: 30 });
    rec.track([mkChar()], mkBall());
    rec.capture(0);
    expect(rec.clipLast(2.0)).toBe(null);
  });

  it('applyFrame restores recorded transforms', () => {
    const rec = new ReplayRecorder({ seconds: 2, hz: 30 });
    const chars = [mkChar(3)], ball = mkBall();
    rec.track(chars, ball);
    rec.capture(0);
    rec.capture(0.5);
    const clip = rec.clipLast(0.5);
    chars[0].group.position.x = 99; // play moved on
    ball.pos.set(9, 9, 9);
    applyFrame(clip[0], chars, ball);
    expect(chars[0].group.position.x).toBeCloseTo(3);
    expect(ball.pos.y).toBeCloseTo(0.2);
  });
});
