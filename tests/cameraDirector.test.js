import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraDirector, SHOTS } from '../src/game/cameraDirector.js';

const mkCam = () => new THREE.PerspectiveCamera(58, 0.6, 0.1, 500);
const ctx = (over = {}) => ({
  ball: { pos: new THREE.Vector3(0, 1, -10), mode: 'flying' },
  kickerPos: new THREE.Vector3(0, 0, 0.4),
  leadRunnerPos: new THREE.Vector3(6, 0, -6),
  activeFielderPos: new THREE.Vector3(2, 0, -14),
  ...over,
});

describe('CameraDirector', () => {
  it('kick shot matches the legacy CAM.kick framing exactly (input-critical)', () => {
    const s = SHOTS.kick(ctx());
    expect(s.pos.toArray()).toEqual([0, 3.4, 8.0]);
    expect(s.look.toArray()).toEqual([0, 1.2, -12]);
    expect(s.fovScale).toBe(1);
  });

  it('pitchSelect shot matches legacy CAM.pitch', () => {
    const s = SHOTS.pitchSelect(ctx());
    expect(s.pos.toArray()).toEqual([0, 5.0, -19.0]);
    expect(s.look.toArray()).toEqual([0, 1.1, -1.5]);
  });

  it('ballFlight is telephoto (fovScale < 0.75) and looks at the ball', () => {
    const c = ctx();
    const s = SHOTS.ballFlight(c);
    expect(s.fovScale).toBeLessThan(0.75);
    expect(s.look.distanceTo(c.ball.pos)).toBeLessThan(1.5);
  });

  it('cut() snaps instantly; smooth request glides', () => {
    const cam = mkCam();
    const d = new CameraDirector(cam, { baseFov: 58 });
    d.request('kick', ctx(), { cut: true });
    d.update(0.016, ctx());
    expect(cam.position.distanceTo(new THREE.Vector3(0, 3.4, 8.0))).toBeLessThan(0.01);
    d.request('pitchSelect', ctx()); // no cut
    d.update(0.016, ctx());
    // one frame of spring motion cannot cover the ~27m jump
    expect(cam.position.distanceTo(new THREE.Vector3(0, 5.0, -19.0))).toBeGreaterThan(5);
    for (let i = 0; i < 400; i++) d.update(0.016, ctx());
    expect(cam.position.distanceTo(new THREE.Vector3(0, 5.0, -19.0))).toBeLessThan(0.2);
  });

  it('fov follows the shot fovScale against baseFov', () => {
    const cam = mkCam();
    const d = new CameraDirector(cam, { baseFov: 58 });
    d.request('ballFlight', ctx(), { cut: true });
    d.update(0.016, ctx());
    expect(cam.fov).toBeLessThan(58 * 0.8);
    d.setBaseFov(74); // portrait resize mid-shot
    d.request('kick', ctx(), { cut: true });
    d.update(0.016, ctx());
    expect(cam.fov).toBeCloseTo(74, 0);
  });

  it('unknown shot or missing ctx fields never throw', () => {
    const cam = mkCam();
    const d = new CameraDirector(cam, { baseFov: 58 });
    d.request('nope', {});
    expect(() => d.update(0.016, {})).not.toThrow();
  });
});
