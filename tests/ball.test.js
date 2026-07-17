import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Ball } from '../src/game/ball.js';

const scene = { add() {} }; // Ball only calls scene.add(mesh)

function fly(ball, seconds) {
  for (let t = 0; t < seconds; t += 1 / 120) ball.update(1 / 120);
}

describe('ball element physics', () => {
  it('wind bends a flying ball sideways', () => {
    const calm = new Ball(scene);
    calm.place(new THREE.Vector3(0, 0.22, 0));
    calm.launch(20, 40, 0);
    fly(calm, 1.2);

    const windy = new Ball(scene);
    windy.place(new THREE.Vector3(0, 0.22, 0));
    windy.wind = { x: 3.0, z: 0 };
    windy.launch(20, 40, 0);
    fly(windy, 1.2);

    expect(windy.pos.x).toBeGreaterThan(calm.pos.x + 1.0);
    expect(Math.abs(calm.pos.x)).toBeLessThan(0.01);
  });

  it('restitutionScale makes bounces livelier', () => {
    const mk = (scale) => {
      const b = new Ball(scene);
      b.place(new THREE.Vector3(0, 0.22, 0));
      b.restitutionScale = scale;
      b.launch(16, 45, 0);
      let last = 0;
      for (let t = 0; t < 4; t += 1 / 120) {
        b.update(1 / 120);
        if (b.bounces > 0) { last = b.vel.y; break; }
      }
      return last;
    };
    expect(mk(1.4)).toBeGreaterThan(mk(1) * 1.2);
  });

  it('a ball clearing the fence above the top sets exitedOverFence', () => {
    const b = new Ball(scene);
    b.setFence(30, 4);
    b.place(new THREE.Vector3(0, 0.22, 0));
    b.launch(26, 45, 0); // big fly, well past 30m
    fly(b, 3.5);
    expect(b.exitedOverFence).toBe(true);
  });

  it('a contained ball below the wall bounces back and never sets the flag', () => {
    const b = new Ball(scene);
    b.setFence(30, 40); // impossibly tall wall
    b.place(new THREE.Vector3(0, 0.22, 0));
    b.launch(26, 45, 0);
    fly(b, 4);
    expect(b.exitedOverFence).toBe(false);
    expect(Math.hypot(b.pos.x, b.pos.z)).toBeLessThan(30);
  });
});
