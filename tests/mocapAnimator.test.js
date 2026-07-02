import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MocapAnimator } from '../src/game/mocapAnimator.js';

// Build a minimal rig + synthetic clips so tests need no GLB/network.
function makeRig() {
  const root = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = 'Hips';
  root.add(hips);
  return root;
}
function makeClip(name, dur = 1) {
  const track = new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, dur], [0, 0, 0, 1, 0, 0, 0.383, 0.924]);
  return new THREE.AnimationClip(name, dur, [track]);
}
const CLIP_NAMES = ['idle', 'plate', 'run', 'kick', 'throw', 'pitch', 'catch',
  'crouch', 'holdball', 'strafeL', 'strafeR', 'juke', 'slide', 'stumble',
  'walk', 'swagger', 'dance1', 'dance2', 'dance3', 'dance4', 'dejected'];
const clips = CLIP_NAMES.map((n) => makeClip(n));

describe('MocapAnimator', () => {
  it('exposes the GlbCodeAnimator surface', () => {
    const a = new MocapAnimator(makeRig(), clips);
    expect(typeof a.play).toBe('function');
    expect(typeof a.update).toBe('function');
    expect(a.ctx).toHaveProperty('speedFactor');
    expect(a.name).toBe('idle');
  });

  it('play() switches the reported name; unknown names fall back to idle', () => {
    const a = new MocapAnimator(makeRig(), clips);
    a.play('run');
    expect(a.name).toBe('run');
    a.play('nope-not-a-clip');
    expect(a.name).toBe('idle');
  });

  it('fires onContact at the manifest contactAt fraction, once', () => {
    const a = new MocapAnimator(makeRig(), clips);
    const onContact = vi.fn();
    a.play('kick', { onContact });           // kick contactAt from manifest
    a.update(0.05);
    expect(onContact).not.toHaveBeenCalled(); // way before contact
    for (let i = 0; i < 40; i++) a.update(0.05); // run past the end
    expect(onContact).toHaveBeenCalledTimes(1);
  });

  it('fires onDone exactly once when a one-shot finishes', () => {
    const a = new MocapAnimator(makeRig(), clips);
    const onDone = vi.fn();
    a.play('throw', { onDone });
    for (let i = 0; i < 60; i++) a.update(0.05);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('speedFactor scales looping clips only', () => {
    const a = new MocapAnimator(makeRig(), clips);
    a.play('run', { speedFactor: 2 });
    expect(a._active.timeScale).toBeCloseTo(2);
    a.play('kick', { speedFactor: 2 });      // one-shot: plays at base rate
    expect(a._active.timeScale).toBeCloseTo(1);
  });

  it('live speedFactor changes via ctx are picked up on update (run cycle)', () => {
    const a = new MocapAnimator(makeRig(), clips);
    a.play('run', { speedFactor: 1 });
    a.ctx.speedFactor = 1.8;
    a.update(0.016);
    expect(a._active.timeScale).toBeCloseTo(1.8);
  });
});
