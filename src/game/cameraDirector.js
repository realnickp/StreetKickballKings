// src/game/cameraDirector.js — broadcast camera brain for the match.
// Named SHOTS are pure functions of live game context -> {pos, look, fovScale,
// stiffness?}. The director spring-damps position/look/fov toward the active
// shot every frame (critically damped -> settles without wobble) and can CUT
// (snap) like a real broadcast. matchScene owns WHICH shot plays; this owns HOW
// the camera moves. fovScale multiplies the aspect-derived base FOV so portrait
// framing survives (74 narrow / 58 wide, set by renderer resize).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SHOTS = {
  // INPUT-CRITICAL — identical to the legacy CAM presets. Never change framing.
  kick: () => ({ pos: V(0, 3.4, 8.0), look: V(0, 1.2, -12), fovScale: 1, stiffness: 30 }),
  pitchSelect: () => ({ pos: V(0, 5.0, -19.0), look: V(0, 1.1, -1.5), fovScale: 1, stiffness: 30 }),

  // hard CUT on contact: low hero cam beside the plate, looking up the lane
  contact: (c) => {
    const k = c.kickerPos ?? V(0, 0, 0.4);
    return { pos: V(k.x + 2.2, 0.9, k.z + 3.2), look: V(k.x, 1.3, k.z - 6), fovScale: 0.9, stiffness: 60 };
  },

  // telephoto ball tracker: far back + narrow lens = background compression
  ballFlight: (c) => {
    const b = c.ball?.pos ?? V(0, 2, -15);
    return {
      pos: V(b.x * 0.35, Math.max(4.5, b.y * 0.5 + 4), b.z + 26),
      look: b.clone(),
      fovScale: 0.55, stiffness: 14,
    };
  },

  // elevated sideline cam framing lead runner + infield
  runners: (c) => {
    const r = c.leadRunnerPos ?? V(0, 0, 0);
    const fx = r.x * 0.5;
    return { pos: V(fx + 9, 9.5, -3.5), look: V(fx * 0.6, 0.8, -8), fovScale: 0.85, stiffness: 8 };
  },

  // defense: frame your fielder + the ball (legacy live framing, spring-damped)
  defense: (c) => {
    const a = c.activeFielderPos ?? V(0, 0, -14);
    const b = c.ball?.pos ?? a;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const sep = Math.min(30, a.distanceTo(b));
    return { pos: V(mid.x * 0.5, Math.min(15, 8 + sep * 0.25), mid.z + 9 + sep * 0.25), look: V(mid.x, 0.5, mid.z), fovScale: 1, stiffness: 8 };
  },

  // deep ball: crane rising with the ball toward the fence
  crane: (c) => {
    const b = c.ball?.pos ?? V(0, 6, -30);
    return { pos: V(b.x * 0.6, Math.max(9, b.y + 4), b.z + 17), look: b.clone(), fovScale: 0.65, stiffness: 10 };
  },

  // foul: trail the ball so you see where it went (legacy behavior)
  foulTrail: (c) => {
    const b = c.ball?.pos ?? V(0, 2, 4);
    return { pos: V(b.x * 0.7, Math.max(6.5, b.y * 0.45 + 7.5), b.z + 11.5), look: V(b.x, Math.max(0.6, b.y * 0.5), b.z), fovScale: 1, stiffness: 10 };
  },
};

/** critically damped spring toward target (no overshoot wobble, real weight) */
function spring(current, vel, target, stiffness, dt) {
  const c = 2 * Math.sqrt(stiffness);
  const ax = stiffness * (target.x - current.x) - c * vel.x;
  const ay = stiffness * (target.y - current.y) - c * vel.y;
  const az = stiffness * (target.z - current.z) - c * vel.z;
  vel.x += ax * dt; vel.y += ay * dt; vel.z += az * dt;
  current.x += vel.x * dt; current.y += vel.y * dt; current.z += vel.z * dt;
}

export class CameraDirector {
  constructor(camera, { baseFov = 58 } = {}) {
    this.camera = camera;
    this.baseFov = baseFov;
    this.shot = 'kick';
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, 1, -10);
    this.posVel = new THREE.Vector3();
    this.lookVel = new THREE.Vector3();
    this.fov = baseFov;
    this.fovVel = 0;
  }

  setBaseFov(f) { this.baseFov = f; }

  /** switch shots; cut=true snaps this frame (broadcast cut) */
  request(name, ctx = {}, { cut = false } = {}) {
    if (!SHOTS[name]) return;
    this.shot = name;
    if (cut) {
      const t = SHOTS[name](ctx);
      this.pos.copy(t.pos); this.look.copy(t.look);
      this.posVel.set(0, 0, 0); this.lookVel.set(0, 0, 0);
      this.fov = this.baseFov * (t.fovScale ?? 1); this.fovVel = 0;
    }
  }

  update(rawDt, ctx = {}) {
    const def = SHOTS[this.shot];
    if (!def) return;
    const t = def(ctx);
    const dt = Math.min(rawDt, 0.05);
    const k = t.stiffness ?? 10;
    spring(this.pos, this.posVel, t.pos, k, dt);
    spring(this.look, this.lookVel, t.look, k, dt);
    const targetFov = this.baseFov * (t.fovScale ?? 1);
    const c = 2 * Math.sqrt(k);
    this.fovVel += (k * (targetFov - this.fov) - c * this.fovVel) * dt;
    this.fov += this.fovVel * dt;

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
