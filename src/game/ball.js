// Arcade ball physics: ballistic flight, ground bounces, rolling friction.
// Hand-rolled instead of a physics engine so the feel is 100% tunable and
// flight paths are analytically predictable for the fielder AI.
import * as THREE from 'three';

const G = 11.5; // a touch heavier than earth gravity = punchier arcs
const RESTITUTION = 0.52;
const ROLL_FRICTION = 9.0; // m/s^2 — blacktop grabs the ball so grounders are fieldable
const GROUND_GRAB = 0.5;   // a settling ball loses half its skid speed to the turf
const BALL_R = 0.22;       // a real kickball, not a beachball — proportional to the players

export class Ball {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(BALL_R, 18, 14);
    // Glossy red rubber: lower roughness + env reflectance gives a real kickball
    // sheen (a soft specular highlight rolling across it) instead of a flat matte ball.
    const mat = new THREE.MeshStandardMaterial({ color: '#c83232', roughness: 0.38, metalness: 0, envMapIntensity: 0.8 });
    this.mesh = new THREE.Mesh(geo, mat);
    // No hard cast shadow: a 0.22m ball through the shadow map renders as a blocky
    // black square that tracks the ball ("black box around it"). It's airborne most of
    // the time anyway; a soft contact blob can replace this later if grounding is wanted.
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.vel = new THREE.Vector3();
    this.active = false;
    this.mode = 'idle'; // idle | rolling-pitch | flying
    this.onGround = false;
    this.bounces = 0;
    this.fenceR = 9999;     // outfield fence radius (matchScene sets it)
    this.fenceTopY = 9999;  // a ball must clear this height to leave the park
  }

  /** Define the outfield wall: balls below topY at the radius bounce back in. */
  setFence(radiusM, topY) {
    this.fenceR = radiusM;
    this.fenceTopY = topY;
  }

  get pos() {
    return this.mesh.position;
  }

  place(v) {
    this.mesh.position.copy(v).setY(Math.max(BALL_R, v.y));
    this.vel.set(0, 0, 0);
    this.mode = 'idle';
  }

  /**
   * Roll from `from` to `to` over `seconds` (the pitch).
   * @param {object|number} opts per-type flight: { bounce, curveM, ease } (a bare
   *   number is treated as legacy `bounce`). curveM = sideways break in metres,
   *   ramped late (∝ progress²) for a true late break; ease<1 = changeup (fast then
   *   slow); bounce>0 = bouncy hop.
   */
  startPitch(from, to, seconds, opts = {}) {
    if (typeof opts === 'number') opts = { bounce: opts };
    this.place(from);
    this.mode = 'rolling-pitch';
    this.pitchFrom = from.clone();
    this.pitchTo = to.clone();
    this.pitchT = 0;
    this.pitchDur = seconds;
    this.pitchBounce = opts.bounce ?? 0;
    this.pitchCurveM = opts.curveM ?? 0;
    this.pitchEase = opts.ease ?? 1;
  }

  /** Launch with speed (m/s), loft (deg above horizon) and direction (deg, 0 = straight at 2nd, + = right field). */
  launch(speed, loftDeg, directionDeg) {
    const loft = THREE.MathUtils.degToRad(loftDeg);
    const dir = THREE.MathUtils.degToRad(directionDeg);
    const horiz = speed * Math.cos(loft);
    this.vel.set(Math.sin(dir) * horiz, speed * Math.sin(loft), -Math.cos(dir) * horiz);
    this.mode = 'flying';
    this.bounces = 0;
    this.onGround = false;
  }

  /** Throw the ball along a flat-ish arc toward a target point. */
  throwTo(target, speed) {
    const from = this.pos.clone();
    const flat = target.clone().setY(0).sub(from.clone().setY(0));
    const dist = flat.length();
    const t = Math.max(0.18, dist / speed);
    // solve vy so we land at target height
    const vy = (target.y - from.y + 0.5 * G * t * t) / t;
    flat.normalize().multiplyScalar(dist / t);
    this.vel.set(flat.x, vy, flat.z);
    this.mode = 'flying';
    this.bounces = 0;
    this.onGround = false;
    return t;
  }

  update(dt) {
    if (this.mode === 'rolling-pitch') {
      this.pitchT += dt;
      const k = Math.min(1, this.pitchT / this.pitchDur);
      // ease<1 = changeup: covers ground fast early, dawdles into the plate
      const kEff = this.pitchEase === 1 ? k : Math.pow(k, this.pitchEase);
      this.mesh.position.lerpVectors(this.pitchFrom, this.pitchTo, kEff);
      // late sideways break, concentrated near the plate (∝ kEff²)
      if (this.pitchCurveM) this.mesh.position.x += this.pitchCurveM * kEff * kEff;
      const hop = this.pitchBounce > 0 ? Math.abs(Math.sin(kEff * Math.PI * 3)) * this.pitchBounce * 0.5 : 0;
      this.mesh.position.y = BALL_R + hop;
      this.mesh.rotation.x -= dt * 10;
      if (k >= 1) this.mode = 'idle';
      return;
    }

    if (this.mode !== 'flying') return;

    this.vel.y -= G * dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    this.mesh.rotation.x -= this.vel.length() * dt * 0.8;

    // outfield fence: a ball below the wall height bounces back into the park
    if (this.fenceR < 900) {
      const d = Math.hypot(this.mesh.position.x, this.mesh.position.z);
      if (d >= this.fenceR && this.mesh.position.y <= this.fenceTopY) {
        const nx = this.mesh.position.x / d;
        const nz = this.mesh.position.z / d;
        this.mesh.position.x = nx * (this.fenceR - 0.15);
        this.mesh.position.z = nz * (this.fenceR - 0.15);
        const vr = this.vel.x * nx + this.vel.z * nz; // outward radial speed
        if (vr > 0) {
          const e = 0.4;
          this.vel.x -= (1 + e) * vr * nx;
          this.vel.z -= (1 + e) * vr * nz;
        }
        this.bounces += 1;
      }
    }

    if (this.mesh.position.y <= BALL_R) {
      this.mesh.position.y = BALL_R;
      if (Math.abs(this.vel.y) > 1.2) {
        this.vel.y = -this.vel.y * RESTITUTION;
        this.vel.x *= 0.85;
        this.vel.z *= 0.85;
        this.bounces += 1;
      } else {
        // the frame the ball settles, the turf grabs it (kills a fast skid)
        if (!this.onGround) { this.vel.x *= GROUND_GRAB; this.vel.z *= GROUND_GRAB; }
        this.vel.y = 0;
        this.onGround = true;
        // rolling friction
        const flat = new THREE.Vector2(this.vel.x, this.vel.z);
        const sp = flat.length();
        if (sp > 0.05) {
          const ns = Math.max(0, sp - ROLL_FRICTION * dt);
          flat.normalize().multiplyScalar(ns);
          this.vel.x = flat.x;
          this.vel.z = flat.y;
        } else {
          this.vel.set(0, 0, 0);
          this.mode = 'idle';
        }
      }
    }
  }

  /** Predict where a freshly-launched ball first lands (ignores bounces). */
  static predictLanding(origin, speed, loftDeg, directionDeg) {
    const loft = THREE.MathUtils.degToRad(loftDeg);
    const dir = THREE.MathUtils.degToRad(directionDeg);
    const vy = speed * Math.sin(loft);
    const horiz = speed * Math.cos(loft);
    // time until y returns to ball radius height
    const t = (vy + Math.sqrt(vy * vy + 2 * G * (origin.y - BALL_R))) / G;
    return {
      t,
      apex: origin.y + (vy * vy) / (2 * G),
      point: new THREE.Vector3(
        origin.x + Math.sin(dir) * horiz * t,
        BALL_R,
        origin.z - Math.cos(dir) * horiz * t,
      ),
    };
  }
}

export const BALL_RADIUS = BALL_R;
