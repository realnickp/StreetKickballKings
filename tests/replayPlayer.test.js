import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ReplayRecorder, ReplayPlayer } from '../src/cinematics/replay.js';

function world() {
  const group = new THREE.Group();
  group.position.set(2, 0, -6);
  const hips = new THREE.Bone(); hips.name = 'Hips'; group.add(hips);
  const chars = [{ group }];
  const ball = { pos: new THREE.Vector3(1, 0.5, -7), mesh: new THREE.Mesh() };
  ball.mesh.visible = true;
  const cbs = new Set();
  const engine = {
    camera: new THREE.PerspectiveCamera(58, 0.6, 0.1, 500),
    cameraLock: false, timeScale: 1, paused: false, baseFov: 58,
    onFrame: (cb) => { cbs.add(cb); return () => cbs.delete(cb); },
    tick: (dt) => { for (const cb of [...cbs]) cb(dt, dt); },
  };
  const events = [];
  const bus = { emit: (e) => events.push(e), on: () => {} };
  const hud = { banner: vi.fn(), hideBanner: vi.fn(), setLetterbox: vi.fn() };
  return { chars, ball, engine, bus, hud, events };
}

describe('ReplayPlayer', () => {
  it('plays a clip, locks gameplay, restores state, fires onDone', () => {
    const w = world();
    const rec = new ReplayRecorder({ seconds: 4, hz: 30 });
    rec.track(w.chars, w.ball);
    for (let t = 0; t < 2; t += 1 / 30) { w.chars[0].group.position.x = 2 + t; rec.capture(t); }
    const liveX = w.chars[0].group.position.x;

    const player = new ReplayPlayer({ engine: w.engine, hud: w.hud, bus: w.bus });
    const onDone = vi.fn();
    player.play({ clip: rec.clipLast(1.5), chars: w.chars, ball: w.ball, focusIndex: 0, banner: 'ROBBED!', bannerKind: 'robbed', onDone });

    expect(w.engine.cameraLock).toBe(true);
    expect(w.events).toContain('cine:start');
    // drive fake frames until the replay finishes (1.5s clip at 0.4 speed < 5s)
    for (let i = 0; i < 400 && !onDone.mock.calls.length; i++) w.engine.tick(0.016);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(w.engine.cameraLock).toBe(false);
    expect(w.events).toContain('cine:done');
    expect(w.chars[0].group.position.x).toBeCloseTo(liveX); // live state restored
    expect(w.hud.setLetterbox).toHaveBeenCalledWith(true);
    expect(w.hud.setLetterbox).toHaveBeenCalledWith(false);
  });

  it('null clip = graceful skip (onDone immediately, no lock)', () => {
    const w = world();
    const player = new ReplayPlayer({ engine: w.engine, hud: w.hud, bus: w.bus });
    const onDone = vi.fn();
    player.play({ clip: null, chars: w.chars, ball: w.ball, focusIndex: 0, onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(w.engine.cameraLock).toBe(false);
  });
});
