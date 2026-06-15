// Procedural low-poly players: one shared joint rig built from primitives,
// swappable looks (skin/hair/build/fit/accessory), and a keyframe-free
// Animator whose clips are pure functions of normalized time.
// Style target: stylized vinyl-toy athlete — rounded shapes, broad shoulders,
// oversized sneakers, expressive head. NOT minecraft cubes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#3b2519'];

const BUILD = {
  standard: { h: 1.0, w: 1.0 },
  tank: { h: 1.04, w: 1.3 },
  lanky: { h: 1.12, w: 0.82 },
  stocky: { h: 0.92, w: 1.22 },
  compact: { h: 0.88, w: 0.95 },
};

/**
 * @param {{skin:number, hair:string, build:string, fit:string, accessory:string}} look
 * @param {{primary:string, secondary:string, accent:string}} colors team colors
 * @returns {{group: THREE.Group, joints: object, animator: Animator}}
 */
// transparent decal with just the number — slapped on the chest front
function jerseyTexture2(colors, number) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = colors.secondary;
  ctx.font = '900 78px Archivo, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 7;
  ctx.strokeText(String(number), 64, 68);
  ctx.fillText(String(number), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPlayer(look, colors, number = Math.floor(Math.random() * 89) + 10) {
  const b = BUILD[look.build] ?? BUILD.standard;
  const skin = SKIN[(look.skin ?? 3) - 1] ?? SKIN[2];
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 });
  const jerseyPlainMat = new THREE.MeshStandardMaterial({ color: colors.primary, roughness: 0.8 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.85 });
  const sneakerMat = new THREE.MeshStandardMaterial({ color: colors.secondary, roughness: 0.4 });
  const soleMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#181210', roughness: 0.95 });

  const group = new THREE.Group();
  const joints = {};
  const fitScale = look.fit === 'oversized' ? 1.14 : look.fit === 'tied-up' ? 0.95 : 1.0;

  // hips root — everything hangs off this so clips can bob the whole body
  const hips = new THREE.Group();
  hips.position.y = 0.95 * b.h;
  group.add(hips);
  joints.hips = hips;

  const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.4 * b.w, 0.3, 0.26, 3, 0.08), shortsMat);
  pelvis.castShadow = true;
  hips.add(pelvis);

  const torso = new THREE.Group();
  torso.position.y = 0.16;
  hips.add(torso);
  joints.torso = torso;

  // tapered athletic chest: wide shoulders, narrow waist
  const chest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27 * b.w * fitScale, 0.225 * b.w, 0.56 * b.h, 14),
    jerseyPlainMat,
  );
  chest.scale.z = 0.66; // flatten front-to-back
  chest.position.y = 0.3 * b.h;
  chest.castShadow = true;
  torso.add(chest);
  // chest number decal
  const numberDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3 * b.w, 0.3 * b.w),
    new THREE.MeshStandardMaterial({ map: jerseyTexture2(colors, number), transparent: true, roughness: 0.8 }),
  );
  numberDecal.position.set(0, 0.32 * b.h, 0.27 * b.w * fitScale * 0.66 + 0.02);
  torso.add(numberDecal);
  // shoulder caps
  for (const sgn of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1 * b.w, 10, 8), look.fit === 'sleeveless' ? skinMat : jerseyPlainMat);
    cap.position.set(sgn * 0.27 * b.w * fitScale, 0.54 * b.h, 0);
    cap.castShadow = true;
    torso.add(cap);
  }
  // neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.075, 0.08, 10), skinMat);
  neck.position.y = 0.6 * b.h;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.66 * b.h;
  torso.add(head);
  joints.head = head;
  // slightly oval expressive head — a touch oversized for the stylized look
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 13), skinMat);
  skull.scale.set(0.94, 1.1, 0.98);
  skull.position.y = 0.12;
  skull.castShadow = true;
  head.add(skull);
  // jaw fill
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 9), skinMat);
  jaw.scale.set(0.92, 0.8, 0.9);
  jaw.position.set(0, 0.045, 0.022);
  head.add(jaw);
  // ears
  for (const sgn of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 6), skinMat);
    ear.position.set(sgn * 0.145, 0.115, 0.01);
    head.add(ear);
  }
  // nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 6), skinMat);
  nose.position.set(0, 0.1, 0.15);
  head.add(nose);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#16110d' });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#f4f1ea' });
  for (const sx of [-0.058, 0.058]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeWhiteMat);
    white.scale.set(1, 0.85, 0.5);
    white.position.set(sx, 0.135, 0.132);
    head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), eyeMat);
    pupil.position.set(sx, 0.133, 0.152);
    head.add(pupil);
  }
  const brow = new THREE.Mesh(new RoundedBoxGeometry(0.135, 0.02, 0.024, 2, 0.008), eyeMat);
  brow.position.set(0, 0.175, 0.14);
  brow.rotation.x = 0.25;
  head.add(brow);

  addHair(head, look.hair, hairMat, jerseyPlainMat, colors);
  if (look.accessory === 'glasses') {
    const glasses = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.055, 0.045, 2, 0.018), new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.3 }));
    glasses.position.set(0, 0.135, 0.14);
    head.add(glasses);
  }
  if (look.accessory === 'chain') {
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.02, 6, 16),
      new THREE.MeshStandardMaterial({ color: '#f5c842', metalness: 0.9, roughness: 0.25 }),
    );
    chain.position.y = 0.6 * b.h;
    chain.position.z = 0.05;
    chain.rotation.x = Math.PI / 2.6;
    torso.add(chain);
  }
  if (look.accessory === 'headband') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.055, 14), new THREE.MeshStandardMaterial({ color: colors.secondary }));
    band.position.y = 0.165;
    head.add(band);
  }

  // arms: rounded capsules with hands
  const armMat = look.fit === 'sleeveless' ? skinMat : jerseyPlainMat;
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1;
    const arm = new THREE.Group();
    arm.position.set(sgn * (0.27 * b.w * fitScale + 0.04), 0.54 * b.h, 0);
    torso.add(arm);
    joints[`arm${side}`] = arm;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * b.w + 0.01, 0.24 * b.h, 3, 8), armMat);
    upper.position.y = -0.16 * b.h;
    upper.castShadow = true;
    arm.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.34 * b.h;
    arm.add(fore);
    joints[`fore${side}`] = fore;
    const foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.2 * b.h, 3, 8), skinMat);
    foreMesh.position.y = -0.13 * b.h;
    foreMesh.castShadow = true;
    fore.add(foreMesh);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 7), skinMat);
    hand.position.y = -0.27 * b.h;
    fore.add(hand);
    if (look.accessory === 'wristband') {
      const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), new THREE.MeshStandardMaterial({ color: colors.secondary }));
      wb.position.y = -0.22 * b.h;
      fore.add(wb);
    }
  }

  // legs: capsule thigh/calf + oversized sneakers with soles
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1;
    const leg = new THREE.Group();
    leg.position.set(sgn * 0.12 * b.w, -0.14, 0);
    hips.add(leg);
    joints[`leg${side}`] = leg;
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * b.w + 0.01, 0.26 * b.h, 3, 9), shortsMat);
    thigh.position.y = -0.17 * b.h;
    thigh.castShadow = true;
    leg.add(thigh);
    const shin = new THREE.Group();
    shin.position.y = -0.4 * b.h;
    leg.add(shin);
    joints[`shin${side}`] = shin;
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.2 * b.h, 3, 8), skinMat);
    calf.position.y = -0.14 * b.h;
    calf.castShadow = true;
    shin.add(calf);
    // chunky sneaker: body + white sole + toe cap
    const sneaker = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.11, 0.32, 3, 0.04), sneakerMat);
    sneaker.position.set(0, -0.345 * b.h, 0.07);
    sneaker.castShadow = true;
    shin.add(sneaker);
    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.045, 0.34, 2, 0.02), soleMat);
    sole.position.set(0, -0.385 * b.h, 0.07);
    shin.add(sole);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 7), soleMat);
    toe.scale.set(1, 0.7, 0.9);
    toe.position.set(0, -0.355 * b.h, 0.21);
    shin.add(toe);
  }

  const animator = new Animator(joints, b);
  return { group, joints, animator };
}

function addHair(head, hair, hairMat, jerseyMat, colors) {
  switch (hair) {
    case 'afro': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), hairMat);
      m.position.y = 0.21;
      head.add(m);
      break;
    }
    case 'locs': {
      for (let i = 0; i < 8; i++) {
        const loc = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.26, 5), hairMat);
        const a = (i / 8) * Math.PI * 2;
        loc.position.set(Math.cos(a) * 0.12, 0.18, Math.sin(a) * 0.12);
        loc.rotation.set(Math.sin(a) * 0.7, 0, Math.cos(a) * -0.7);
        head.add(loc);
      }
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), hairMat);
      top.position.y = 0.2;
      head.add(top);
      break;
    }
    case 'braids': {
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.175, 8, 6), hairMat);
      top.position.y = 0.18;
      head.add(top);
      for (const sx of [-0.09, 0, 0.09]) {
        const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.3, 5), hairMat);
        braid.position.set(sx, 0.05, -0.14);
        braid.rotation.x = 0.35;
        head.add(braid);
      }
      break;
    }
    case 'durag': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.5 }));
      cap.position.y = 0.13;
      head.add(cap);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.24), new THREE.MeshStandardMaterial({ color: colors.accent, side: THREE.DoubleSide }));
      tail.position.set(0, 0.04, -0.17);
      tail.rotation.x = 0.3;
      head.add(tail);
      break;
    }
    case 'cap': {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.18, 0.12, 12), new THREE.MeshStandardMaterial({ color: colors.secondary }));
      crown.position.y = 0.24;
      head.add(crown);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.16), new THREE.MeshStandardMaterial({ color: colors.secondary }));
      brim.position.set(0, 0.19, 0.2);
      head.add(brim);
      break;
    }
    case 'twists': {
      for (let i = 0; i < 12; i++) {
        const t = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), hairMat);
        const a = (i / 12) * Math.PI * 2;
        const r = 0.1 + (i % 2) * 0.05;
        t.position.set(Math.cos(a) * r, 0.24 + (i % 3) * 0.02, Math.sin(a) * r);
        head.add(t);
      }
      break;
    }
    case 'fade':
    case 'buzz':
    default: {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.172, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), hairMat);
      m.position.y = 0.15;
      head.add(m);
      break;
    }
  }
}

// ---------- animation ----------
// Clips are functions (joints, t, ctx) with t in [0,1]. Looping clips wrap t;
// one-shots clamp and fire onDone. `contactAt` lets the kick/throw clips tell
// gameplay the exact frame the foot/hand connects.

const CLIPS = {
  idle: {
    loop: true,
    dur: 2.4,
    fn(j, t, ctx) {
      const s = Math.sin(t * Math.PI * 2);
      j.hips.position.y = ctx.hipY + Math.abs(s) * 0.02;
      j.torso.rotation.x = 0.03 + s * 0.015;
      if (ctx.variant === 'tank') {
        // arms folded, slow nod
        j.armL.rotation.set(-1.15, 0, 0.9);
        j.armR.rotation.set(-1.15, 0, -0.9);
        j.foreL.rotation.x = -1.2;
        j.foreR.rotation.x = -1.2;
        j.head.rotation.x = s * 0.05;
      } else {
        // bounce on toes
        j.armL.rotation.set(0.08 + s * 0.05, 0, 0.12);
        j.armR.rotation.set(-0.08 - s * 0.05, 0, -0.12);
        j.foreL.rotation.x = -0.25;
        j.foreR.rotation.x = -0.25;
      }
      j.legL.rotation.x = 0;
      j.legR.rotation.x = 0;
      j.shinL.rotation.x = 0;
      j.shinR.rotation.x = 0;
    },
  },

  // batter/kicker ready stance at the plate — bladed toward the mound, light bounce
  plate: {
    loop: true,
    dur: 1.9,
    fn(j, t, ctx) {
      const s = Math.sin(t * Math.PI * 2);
      j.hips.position.y = ctx.hipY - 0.06 + Math.abs(s) * 0.012;
      j.legL.rotation.x = 0.34;
      j.legR.rotation.x = -0.32;
      j.shinL.rotation.x = 0.18;
      j.shinR.rotation.x = 0.16;
      j.torso.rotation.x = 0.15 + s * 0.02;
      j.torso.rotation.y = -0.22;
      j.armL.rotation.set(-0.5, 0, 0.32);
      j.armR.rotation.set(-0.6 + s * 0.05, 0, -0.32);
      j.foreL.rotation.x = -0.75;
      j.foreR.rotation.x = -0.78;
      j.head.rotation.y = 0.18;
    },
  },

  // fielder athletic ready — low, wide base, hands down, eyes up on the kicker
  crouch: {
    loop: true,
    dur: 2.1,
    fn(j, t, ctx) {
      const s = Math.sin(t * Math.PI * 2);
      j.hips.position.y = ctx.hipY - 0.13 + Math.abs(s) * 0.015;
      j.legL.rotation.set(0.1, 0, 0.13);
      j.legR.rotation.set(0.1, 0, -0.13);
      j.shinL.rotation.x = 0.22;
      j.shinR.rotation.x = 0.22;
      j.torso.rotation.x = 0.48;
      j.armL.rotation.set(0.6, 0, 0.26);
      j.armR.rotation.set(0.6, 0, -0.26);
      j.foreL.rotation.x = -0.3;
      j.foreR.rotation.x = -0.3;
      j.head.rotation.x = -0.34;
    },
  },

  run: {
    loop: true,
    dur: 0.55,
    fn(j, t, ctx) {
      const a = Math.sin(t * Math.PI * 2);
      const b = Math.sin(t * Math.PI * 2 + Math.PI);
      const amp = 0.9 * (ctx.speedFactor ?? 1);
      j.legL.rotation.x = a * amp;
      j.legR.rotation.x = b * amp;
      j.shinL.rotation.x = Math.max(0, -a) * 1.1;
      j.shinR.rotation.x = Math.max(0, -b) * 1.1;
      j.armL.rotation.x = b * amp * 0.8;
      j.armR.rotation.x = a * amp * 0.8;
      j.foreL.rotation.x = -0.8;
      j.foreR.rotation.x = -0.8;
      j.torso.rotation.x = 0.22;
      j.hips.position.y = ctx.hipY + Math.abs(Math.sin(t * Math.PI * 4)) * 0.05;
    },
  },

  kick: {
    loop: false,
    dur: 0.7,
    contactAt: 0.5,
    fn(j, t, ctx) {
      j.torso.rotation.x = 0.1;
      if (t < 0.4) {
        // windup: kicking leg back, arms counter
        const k = t / 0.4;
        j.legR.rotation.x = k * 0.9;
        j.legL.rotation.x = -k * 0.15;
        j.torso.rotation.y = -k * 0.4;
        j.armL.rotation.x = -k * 0.7;
        j.armR.rotation.x = k * 0.5;
      } else if (t < 0.62) {
        // swing through: contact at t=0.5
        const k = (t - 0.4) / 0.22;
        j.legR.rotation.x = 0.9 - k * 2.2;
        j.shinR.rotation.x = Math.max(0, 0.8 - k * 0.8);
        j.legL.rotation.x = -0.15 + k * 0.05;
        j.torso.rotation.y = -0.4 + k * 0.75;
        j.armL.rotation.x = -0.7 + k * 1.1;
        j.armR.rotation.x = 0.5 - k * 0.9;
      } else {
        // follow-through hold
        const k = (t - 0.62) / 0.38;
        j.legR.rotation.x = -1.3 + k * 0.5;
        j.torso.rotation.y = 0.35;
        j.torso.rotation.x = -0.08;
        j.armL.rotation.x = 0.4;
        j.armR.rotation.x = -0.4;
      }
      j.hips.position.y = ctx.hipY;
    },
  },

  throw: {
    loop: false,
    dur: 0.5,
    contactAt: 0.45,
    fn(j, t, ctx) {
      if (t < 0.35) {
        const k = t / 0.35;
        j.armR.rotation.x = -k * 2.4;
        j.torso.rotation.y = -k * 0.5;
      } else {
        const k = (t - 0.35) / 0.65;
        j.armR.rotation.x = -2.4 + k * 3.4;
        j.foreR.rotation.x = -0.3;
        j.torso.rotation.y = -0.5 + k * 0.9;
      }
      j.hips.position.y = ctx.hipY;
    },
  },

  catch: {
    loop: false,
    dur: 0.45,
    fn(j, t, ctx) {
      const k = Math.min(1, t / 0.4);
      j.armL.rotation.x = -k * 1.9;
      j.armR.rotation.x = -k * 1.9;
      j.foreL.rotation.x = -0.3;
      j.foreR.rotation.x = -0.3;
      j.torso.rotation.x = 0.1 - k * 0.15;
      j.hips.position.y = ctx.hipY;
    },
  },

  stumble: {
    loop: false,
    dur: 1.1,
    fn(j, t, ctx) {
      if (t < 0.3) {
        const k = t / 0.3;
        j.torso.rotation.x = k * 0.9;
        j.armL.rotation.set(-k * 2.4, 0, k * 0.8);
        j.armR.rotation.set(-k * 2.0, 0, -k * 0.6);
        j.legL.rotation.x = k * 0.5;
        j.hips.position.y = ctx.hipY - k * 0.1;
      } else if (t < 0.7) {
        const k = (t - 0.3) / 0.4;
        j.torso.rotation.x = 0.9 + Math.sin(k * Math.PI) * 0.2;
        j.torso.rotation.z = Math.sin(k * Math.PI * 2) * 0.25;
        j.hips.position.y = ctx.hipY - 0.1 - k * 0.12;
        j.legL.rotation.x = 0.5 - k * 0.3;
        j.legR.rotation.x = k * 0.4;
      } else {
        const k = (t - 0.7) / 0.3;
        j.torso.rotation.x = 1.1 - k * 1.0;
        j.torso.rotation.z = 0.25 * (1 - k);
        j.hips.position.y = ctx.hipY - 0.22 + k * 0.22;
        j.armL.rotation.set(-2.4 + k * 2.4, 0, 0.8 - k * 0.8);
        j.armR.rotation.set(-2.0 + k * 2.0, 0, -0.6 + k * 0.6);
        j.legL.rotation.x = 0.2 * (1 - k);
        j.legR.rotation.x = 0.4 * (1 - k);
      }
    },
  },

  // -- celebrations: distinct silhouettes so they read from far away --
  dance1: {
    // arm-swing shoot style: one arm swings big, opposite leg kicks
    loop: true,
    dur: 0.8,
    fn(j, t, ctx) {
      const s = Math.sin(t * Math.PI * 2);
      j.armR.rotation.x = s * 2.2 - 0.5;
      j.armL.rotation.set(-0.3, 0, 0.5);
      j.legL.rotation.x = Math.max(0, s) * 1.1;
      j.shinL.rotation.x = Math.max(0, s) * 0.4;
      j.hips.position.y = ctx.hipY + Math.abs(Math.cos(t * Math.PI * 2)) * 0.09;
      j.torso.rotation.y = s * 0.2;
      j.head.rotation.x = -0.1;
    },
  },
  dance2: {
    // side-to-side shuffle with rolling arms
    loop: true,
    dur: 1.0,
    fn(j, t, ctx) {
      const s = Math.sin(t * Math.PI * 2);
      j.hips.position.x = s * 0.18;
      j.hips.position.y = ctx.hipY + Math.abs(Math.cos(t * Math.PI * 2)) * 0.06;
      j.armL.rotation.x = -1.0 + Math.sin(t * Math.PI * 6) * 0.5;
      j.armR.rotation.x = -1.0 + Math.cos(t * Math.PI * 6) * 0.5;
      j.foreL.rotation.x = -1.1;
      j.foreR.rotation.x = -1.1;
      j.torso.rotation.z = s * 0.12;
      j.legL.rotation.z = s * 0.1;
      j.legR.rotation.z = s * 0.1;
    },
  },
  dance3: {
    // full spin into both-arms-up pose
    loop: true,
    dur: 1.6,
    fn(j, t, ctx) {
      if (t < 0.5) {
        j.hips.rotation.y = (t / 0.5) * Math.PI * 2;
        j.armL.rotation.set(-0.4, 0, 1.1);
        j.armR.rotation.set(-0.4, 0, -1.1);
      } else {
        j.hips.rotation.y = 0;
        const k = Math.sin(((t - 0.5) / 0.5) * Math.PI);
        j.armL.rotation.set(-2.7, 0, 0.25);
        j.armR.rotation.set(-2.7, 0, -0.25);
        j.hips.position.y = ctx.hipY + k * 0.12;
        j.head.rotation.x = -0.25;
      }
    },
  },
  dance4: {
    // heavy bounce with alternating overhead arm waves
    loop: true,
    dur: 0.9,
    fn(j, t, ctx) {
      const s = Math.sin(t * Math.PI * 2);
      j.hips.position.y = ctx.hipY + Math.abs(s) * 0.11;
      j.armL.rotation.x = -2.6;
      j.armR.rotation.x = -2.6;
      j.armL.rotation.z = 0.4 + s * 0.45;
      j.armR.rotation.z = -0.4 + s * 0.45;
      j.torso.rotation.x = 0.08;
      j.legL.rotation.x = Math.abs(s) * 0.2;
      j.legR.rotation.x = Math.abs(s) * 0.2;
    },
  },

  dejected: {
    loop: true,
    dur: 2.2,
    fn(j, t, ctx) {
      // hands to head, slump, slow trudge
      const s = Math.sin(t * Math.PI * 2);
      if (t < 0.25) {
        const k = t / 0.25;
        j.armL.rotation.x = -k * 2.5;
        j.armR.rotation.x = -k * 2.5;
        j.foreL.rotation.x = -k * 1.3;
        j.foreR.rotation.x = -k * 1.3;
      } else {
        j.armL.rotation.x = -2.5 + Math.max(0, (t - 0.6)) * 4.2;
        j.armR.rotation.x = -2.5 + Math.max(0, (t - 0.6)) * 4.2;
        j.foreL.rotation.x = -1.3 + Math.max(0, (t - 0.6)) * 2.0;
        j.foreR.rotation.x = -1.3 + Math.max(0, (t - 0.6)) * 2.0;
      }
      j.head.rotation.x = 0.55 + s * 0.05;
      j.torso.rotation.x = 0.3;
      j.hips.position.y = ctx.hipY - 0.05;
      j.legL.rotation.x = s * 0.25;
      j.legR.rotation.x = -s * 0.25;
    },
  },
};

export const CLIP_NAMES = Object.keys(CLIPS);

export class Animator {
  constructor(joints, build) {
    this.joints = joints;
    this.ctx = { hipY: joints.hips.position.y, variant: null, speedFactor: 1 };
    this.current = null;
    this.t = 0;
    this.speed = 1;
    this.onContact = null;
    this.onDone = null;
    this.contactFired = false;
    this.play('idle');
  }

  play(name, { speed = 1, onContact = null, onDone = null, variant = null, speedFactor = 1 } = {}) {
    this.current = CLIPS[name];
    this.name = name;
    this.t = 0;
    this.speed = speed;
    this.onContact = onContact;
    this.onDone = onDone;
    this.contactFired = false;
    this.ctx.variant = variant;
    this.ctx.speedFactor = speedFactor;
    this.resetJoints();
  }

  resetJoints() {
    for (const key of Object.keys(this.joints)) {
      const j = this.joints[key];
      j.rotation.set(0, 0, 0);
    }
    this.joints.hips.position.x = 0;
    this.joints.hips.position.y = this.ctx.hipY;
  }

  update(dt) {
    if (!this.current) return;
    const clip = this.current;
    this.t += (dt * this.speed) / clip.dur;

    if (clip.contactAt != null && !this.contactFired && this.t >= clip.contactAt) {
      this.contactFired = true;
      this.onContact?.();
    }

    if (clip.loop) {
      this.t %= 1;
    } else if (this.t >= 1) {
      this.t = 1;
      const done = this.onDone;
      this.onDone = null;
      done?.();
    }

    clip.fn(this.joints, this.t, this.ctx);
  }
}

// Stable, recognizable streetball jersey numbers assigned by roster slot.
const JERSEY_NUMBERS = [23, 7, 3, 44, 11, 5, 88, 1, 32, 9, 21, 0];

/**
 * Build a full team of procedural 3D players from its roster, recolored to the
 * team's uniform. Universal across all 10 teams (no per-team sprite art needed).
 * Returns objects shaped for matchScene: { group, joints, animator, data, number }.
 * @param {object} team a teams.json entry (colors + roster)
 */
export function buildTeamChars(team) {
  const colors = team.colors;
  return (team.roster ?? []).map((p, i) => {
    const number = p.number ?? JERSEY_NUMBERS[i % JERSEY_NUMBERS.length];
    const char = buildPlayer(p.look ?? {}, colors, number);
    char.data = p;
    char.number = number;
    char.hasBall = false;
    return char;
  });
}
