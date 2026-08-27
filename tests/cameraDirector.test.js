import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraDirector, SHOTS, clampNearHome } from '../src/game/cameraDirector.js';

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

  it('walk-up dolly rides beside the kicker, low, leading the walk', () => {
    const k = new THREE.Vector3(-2.0, 0, 0.4);
    const s = SHOTS.walkupDolly(ctx({ kickerPos: k }));
    // float noise: 0.4 + 2.8 = 3.1999999999999997 in JS, not 3.2 exactly —
    // toBeCloseTo per component instead of toEqual on the array.
    const [px, py, pz] = s.pos.toArray();
    expect(px).toBeCloseTo(-2.6);
    expect(py).toBeCloseTo(1.1);
    expect(pz).toBeCloseTo(3.2);
    expect(s.look.toArray()).toEqual([-1.0, 1.2, 0.4]);
    expect(s.fovScale).toBe(0.8);
  });
  it('walk-up taunt pushes in from 3.2 m to 2.4 m over the taunt', () => {
    const k = new THREE.Vector3(-0.9, 0, 0.4);
    expect(SHOTS.walkupTaunt(ctx({ kickerPos: k, walkupT: 0 })).pos.toArray()).toEqual([0, 1.35, 3.6]);
    expect(SHOTS.walkupTaunt(ctx({ kickerPos: k, walkupT: 1 })).pos.toArray()).toEqual([0, 1.35, 2.8]);
    expect(SHOTS.walkupTaunt(ctx({ kickerPos: k, walkupT: 1 })).look.toArray()).toEqual([-0.9, 1.25, 0.4]);
  });
  it('clampNearHome pulls a camera out of the side-fence V and leaves the rest alone', () => {
    expect(clampNearHome(new THREE.Vector3(-4.0, 1.1, 3.2)).x).toBeCloseTo(-3.2);
    expect(clampNearHome(new THREE.Vector3(4.6, 0.9, 3.6)).x).toBeCloseTo(3.2);
    expect(clampNearHome(new THREE.Vector3(-4.0, 1.1, 8.0)).x).toBeCloseTo(-4.0);   // past the V
    expect(clampNearHome(new THREE.Vector3(2.0, 0.9, 3.6)).x).toBeCloseTo(2.0);     // inside the gap
  });
  it('contact shot sits inside the V', () => {
    const s = SHOTS.contact(ctx({ kickerPos: new THREE.Vector3(0.6, 0, 0.4) }));
    expect(s.pos.toArray().map((v) => +v.toFixed(2))).toEqual([2.5, 0.95, 2.8]);
  });
});
