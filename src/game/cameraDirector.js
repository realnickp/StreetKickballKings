// src/game/cameraDirector.js — broadcast camera brain for the match.
// Named SHOTS are pure functions of live game context -> {pos, look, fovScale,
// stiffness?}. The director spring-damps position/look/fov toward the active
// shot every frame (critically damped -> settles without wobble) and can CUT
// (snap) like a real broadcast. matchScene owns WHICH shot plays; this owns HOW
// the camera moves. fovScale multiplies the aspect-derived base FOV so portrait
// framing survives (74 narrow / 58 wide, set by renderer resize).
import * as THREE from 'three';
import { WALKOUT_SHOW } from './walkoutShow.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SHOTS = {
  // INPUT-CRITICAL — identical to the legacy CAM presets. Never change framing.
  kick: () => ({ pos: V(0, 3.4, 8.0), look: V(0, 1.2, -12), fovScale: 1, stiffness: 30 }),
  pitchSelect: () => ({ pos: V(0, 5.0, -19.0), look: V(0, 1.1, -1.5), fovScale: 1, stiffness: 30 }),

  // WALK-UP (dev, 2026-08-27: "more cinematic ... highlights the player as they
  // walk to the plate"): a low side dolly beside the kicker leading the walk,
  // then a front push-in for the taunt. Hard cuts between them and back to kick.
  walkupDolly: (c) => {
    const k = c.kickerPos ?? V(-3.4, 0, 0.4);
    return { pos: V(k.x - 0.6, 1.1, k.z + 2.8), look: V(k.x + 1.0, 1.2, k.z), fovScale: 0.8, stiffness: 40 };
  },
  walkupTaunt: (c) => {
    const k = c.kickerPos ?? V(-0.9, 0, 0.4);
    const t = Math.max(0, Math.min(1, c.walkupT ?? 0));
    return { pos: V(k.x + 0.9, 1.35, k.z + 3.2 - 0.8 * t), look: V(k.x, 1.25, k.z), fovScale: 0.7, stiffness: 20 };
  },

  // STARTING LINEUPS WALK-OUT (dev, 2026-08-27: "different cinematic angles of
  // the teams walking out to the field"). Three shots, cut on the beat, all
  // driven through the director so clampNearHome still guards the backstop.
  // ctx: `lead` = the captain leading the file, `side` = ±1 (his gate),
  // `fileMid` = the file's centre of mass, `walkoutGateT` = s into the show,
  // `walkoutT` = 0→1 across the crane beat.
  //  1. GATE DOLLY (0-3.0 s): low, FRONT-quarter, and now standing far enough
  //     DOWN THE LINE OF THE FILE to hold all eight bodies at once (dev,
  //     2026-08-28: they must all be "rendered when the camera hits them").
  //     The crew queues 1 m apart along the gate lane behind the captain — a
  //     6.7 m line — and a portrait phone at fovScale 0.85 only has ~15.7° of
  //     HALF-width to spend. The old (-side·2.6, +3.6) offset stood 4.4 m off
  //     the captain and threw the tail 33° off axis; from (-side·6.4, +2.8)
  //     the captain sits 10° off and the tail 2°, so the whole file is in the
  //     frame with a body's width to spare. For the first second the lens
  //     LOOKS at the file's midpoint (the shot is the CREW, not the captain),
  //     then hands off to the lead as the line strings out down the flank.
  walkoutGate: (c) => {
    const lead = c.lead ?? V(-8, 0, -6);
    const s = c.side ?? -1;
    const held = V(lead.x, 1.2, lead.z);
    const mid = c.fileMid;
    const t = c.walkoutGateT ?? 99;
    const k = Math.max(0, Math.min(1, (t - WALKOUT_SHOW.gateLookHoldS) / WALKOUT_SHOW.gateLookBlendS));
    const look = mid ? V(mid.x, 1.2, mid.z).lerp(held, k) : held;
    return { pos: V(lead.x - s * 6.4, 1.55, lead.z + 2.8), look, fovScale: 0.85, stiffness: 45 };
  },
  //  2. SIDE STEADICAM (3.0-5.6 s): off the foul line, the whole file streaming
  //     across frame into the wedge.
  walkoutSide: (c) => ({ pos: V((c.side ?? -1) * 9, 1.4, -9.5), look: V(0, 1.1, -10), fovScale: 0.85, stiffness: 12 }),
  //  3. CRANE REVEAL (5.6-8.0 s): pull back and up off the captain until ALL
  //     EIGHT are in frame (the dev asked to see the crew, "all of them"), and
  //     it has to be WIDE before the crest card lands over the last beat — so
  //     the move starts further back than a face close-up and finishes on the
  //     kick framing, letting the GAME TIME break settle instead of jump.
  //     It also DRIFTS x 1.6 -> 0: dead on the centre line the wedge's middle
  //     column stacks into one silhouette, so the crane starts off-axis (the
  //     rows separate) and settles onto x 0 for the kick framing.
  walkoutCrane: (c) => {
    const t = Math.max(0, Math.min(1, c.walkoutT ?? 0));
    return { pos: V(1.6 - 1.6 * t, 2.4 + 2.2 * t, 6.5 * t), look: V(0, 1.05, -10), fovScale: 0.9, stiffness: 22 };
  },

  // hard CUT on contact: low hero cam beside the plate, looking up the lane.
  // TIGHTER than it was (dev, 2026-08-27: the camera "films the kicker from
  // behind the fence") — +2.2/+3.2 put the lens out past the side-fence panel,
  // so every contact cut shot through chain-link. +1.9/+2.4 keeps it inside
  // the V, and clampNearHome() below is the hard backstop for every shot.
  contact: (c) => {
    const k = c.kickerPos ?? V(0, 0, 0.4);
    return { pos: V(k.x + 1.9, 0.95, k.z + 2.4), look: V(k.x, 1.3, k.z - 6), fovScale: 0.9, stiffness: 60 };
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

  // elevated cam framing the lead runner AND the bag they're running to —
  // the TARGET BASE must stay in frame (dev call: "you gotta see 1st base")
  runners: (c) => {
    const r = c.leadRunnerPos ?? V(0, 0, 0);
    const bag = c.targetBasePos ?? V(11.3, 0, -11.3); // default: 1st
    const mid = r.clone().add(bag).multiplyScalar(0.5);
    const sep = Math.max(6, r.distanceTo(bag));
    return {
      pos: V(mid.x * 0.55, 8.5 + sep * 0.35, mid.z + 9.5 + sep * 0.45),
      look: V(mid.x, 0.6, mid.z),
      fovScale: 0.85, stiffness: 8,
    };
  },

  // a run is coming IN: low cam beside the plate looking up the third-base
  // line at the incoming runner — the kicker SEES his runs score (dev call)
  homeStretch: (c) => {
    const r = c.homeRunnerPos ?? V(-11.3, 0, -11.3);
    return {
      pos: V(4.2, 1.8, 2.6),
      look: V(r.x * 0.45, 1.0, r.z * 0.45),
      fovScale: 0.8, stiffness: 14,
    };
  },

  // PICKLE STAGE: hard side-on duel view of the contested basepath — both
  // bags at the screen edges, runner and taggers in profile. Shot from
  // OUTSIDE the diamond so the infield never blocks the lens.
  pickle: (c) => {
    const A = c.pickleA ?? V(11.3, 0, -11.3);
    const B = c.pickleB ?? V(0, 0, -22.6);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    let px = -(B.z - A.z);
    let pz = (B.x - A.x);
    // perp pointed AWAY from the diamond centre (0,0,-11.3) = outside
    if (px * mid.x + pz * (mid.z + 11.3) < 0) { px = -px; pz = -pz; }
    const n = Math.hypot(px, pz) || 1;
    // HIGH TACTICAL view — nearly top-down over the basepath, like a play
    // diagram: both bags, every body, and all the distances read instantly
    // (the ground-level side angle left players unable to tell what the
    // camera was even facing)
    // CLOSE SIDE DOLLY tracking the runner — players fill the frame; the HUD
    // duel LANE is the tactical readout now, not the camera
    const rp = c.pickleRunnerPos ?? mid;
    return {
      pos: V(rp.x + (px / n) * 7.5, 2.2, rp.z + (pz / n) * 7.5),
      look: V(rp.x, 1.15, rp.z),
      fovScale: 0.95, stiffness: 16,
    };
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

// z of the panel ends nearest home — the anchor the fence line is measured
// from. FENCE_V.z0 is the same edge rounded a hair wide, so the band test
// never straddles the anchor.
const PANEL_Z = -1.66;

/**
 * The V behind home, as geometry. The field runs toward -Z, so the two
 * backstop panels stand BEHIND the plate: each sweeps from (+-4.22, z -1.66)
 * out to (+-9.78, z 6.66), which means the mouth of the V opens away from the
 * field, toward +z. Its inner face is the line |x| = x0 + slope * (z -
 * PANEL_Z), not a box — a camera 4 m to the side of the plate at z 3 is in
 * open air, while the same 4 m at z -1 is out past the chain-link. x0 is a
 * HALF-width: the narrow end of the gap is 4.22 m per side, ~8.4 m across.
 */
export const FENCE_V = { z0: -1.7, z1: 6.7, x0: 4.22, slope: 0.668, margin: 0.35 };

// How fast the ceiling opens up once a shot leaves the band. A hard "no
// ceiling outside" would be a CLIFF at the edges — one frame capped at 3.84,
// the next uncapped — and a target crossing z0 (foulTrail rides the ball out
// past z -13) would jump metres sideways. 8 m of ceiling per metre of z means
// the cap is effectively gone 1.5 m outside the band while the function stays
// continuous through both edges.
const RAMP = 8;

/**
 * The widest |x| a camera may sit at for a given z without the backstop
 * crossing its lens: the fence line minus a 0.35 m margin inside the band, and
 * a ramp that opens at RAMP m/m outside it. Defined and CONTINUOUS everywhere,
 * so a shot whose z is moving never sees the ceiling step.
 */
export function fenceMaxX(z) {
  const line = (zz) => FENCE_V.x0 + FENCE_V.slope * (zz - PANEL_Z) - FENCE_V.margin;
  if (z <= FENCE_V.z0) return line(FENCE_V.z0) + RAMP * (FENCE_V.z0 - z);
  if (z >= FENCE_V.z1) return line(FENCE_V.z1) + RAMP * (z - FENCE_V.z1);
  return line(z);
}

/**
 * THE CONTACT CAM MUST NEVER COLLAPSE INTO A FACE (dev, 2026-08-27). The hero
 * contact/perfect beats stand off to the side AWAY from the pull:
 * `reach = min(5, fenceMaxX(p.z - 0.8) - side * p.x)`. But the kicker can slide
 * to |x| = 3.4 (KMAX), and when `side` points at the side he slid to, the fence
 * line has only ~1.3 m left to give — the lens ends up in his cheek. The
 * MIRRORED side always has the full 5 m in that case, so flip instead of
 * collapsing: a slightly worse angle beats a close-up of nothing.
 * @param {{x:number,z:number}} p kicker position
 * @param {number} side +1 / -1, the pull-away side the beat asked for
 * @param {(z:number)=>number} [maxX] fence ceiling (injectable for tests)
 * @returns {{side:number, reach:number}}
 */
export function contactSide(p, side, maxX = fenceMaxX) {
  const ceil = maxX(p.z - 0.8);
  const reachFor = (s) => Math.min(5.0, ceil - s * p.x);
  const reach = reachFor(side);
  if (reach >= 2.6) return { side, reach };
  return { side: -side, reach: reachFor(-side) };
}

/**
 * NEVER FILM THROUGH THE BACKSTOP (dev, 2026-08-27: the camera "films the
 * kicker from behind the fence"). Pulls a camera TARGET back inside
 * fenceMaxX(z) — the fence line with a lens margin near home, ramping away to
 * nothing outside the V. Ordinary plate-side shots are untouched: the gap is
 * 4.2 m per side at its narrowest and ~9 m per side by the time the panels
 * end. Mutates + returns p so it can wrap a shot target inline. The ceiling is
 * continuous in z (the line moves smoothly, and the band edges ramp instead of
 * stepping), so a dolly never jumps sideways.
 */
export function clampNearHome(p) {
  const maxX = fenceMaxX(p.z);
  if (Math.abs(p.x) > maxX) p.x = Math.sign(p.x) * maxX;
  return p;
}

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
      clampNearHome(t.pos); // a broadcast CUT must never land behind the fence
      this.pos.copy(t.pos); this.look.copy(t.look);
      this.posVel.set(0, 0, 0); this.lookVel.set(0, 0, 0);
      this.fov = this.baseFov * (t.fovScale ?? 1); this.fovVel = 0;
    }
  }

  update(rawDt, ctx = {}) {
    const def = SHOTS[this.shot];
    if (!def) return;
    const t = def(ctx);
    clampNearHome(t.pos); // every shot, every frame — including the walk-up dolly
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
