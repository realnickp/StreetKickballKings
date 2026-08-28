// Crew accessories ride a BONE, and these rigs park the armature at scale 0.01
// with a rotated bind basis — so the thing under test is that a 0.11 m band
// comes out 0.11 m and level on the brow, not 1.1 mm and tilted. The rig here
// is a stand-in for an archetype: 1/100 units, a tilted head, arms out.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ACCESSORY_KINDS, HEADBAND, SHADES, WRISTBAND, HEAD_FRAC, WRIST_UP_M,
  attachAccessory, findNode, boneRig, headAxes, measureHead,
} from '../src/game/accessories.js';

/** A miniature of the real thing: armature at 1/100, head tilted 20°, hands
 *  out at the ends of forearms. Bone-local positions are in rig units. */
function rig({ headTilt = 0.35 } = {}) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(0.01);      // the armature scale the GLBs ship with
  group.add(inner);
  const hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 98, 0);
  inner.add(hips);
  const spine = new THREE.Bone(); spine.name = 'Spine'; spine.position.set(0, 48, 0);
  hips.add(spine);
  const head = new THREE.Bone(); head.name = 'Head'; head.position.set(0, 14, 0);
  head.rotation.x = headTilt;       // a bind pose that is NOT axis-aligned
  spine.add(head);
  const headEnd = new THREE.Bone(); headEnd.name = 'head_end'; headEnd.position.set(0, 23, 0);
  head.add(headEnd);
  const headFront = new THREE.Bone(); headFront.name = 'headfront'; headFront.position.set(0, 9, 10);
  head.add(headFront);
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    const arm = new THREE.Bone(); arm.name = `${side}Arm`; arm.position.set(sign * 18, 6, 0);
    spine.add(arm);
    const fore = new THREE.Bone(); fore.name = `${side}ForeArm`; fore.position.set(sign * 26, 0, 0);
    arm.add(fore);
    const hand = new THREE.Bone(); hand.name = `${side}Hand`; hand.position.set(sign * 24, 0, 0);
    fore.add(hand);
  }
  group.updateMatrixWorld(true);
  return { group };
}

const worldSize = (mesh) => {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return box.getSize(new THREE.Vector3());
};
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());
const countAccessories = (char) => {
  let n = 0;
  char.group.traverse((o) => { if (o.isMesh && /^accessory-/.test(o.name)) n++; });
  return n;
};

describe('the vocabulary', () => {
  it('is exactly what casts.json is allowed to ask for', () => {
    expect(ACCESSORY_KINDS).toEqual(['none', 'headband', 'wristbands', 'shades']);
  });
  it('adds nothing for none, or for a kind nobody defined', () => {
    for (const kind of ['none', '', null, undefined, 'cape']) {
      const char = rig();
      expect(attachAccessory(char, kind, '#ff0000')).toBe(null);
      expect(countAccessories(char)).toBe(0);
    }
  });
  it('hands back null instead of throwing when there is no character', () => {
    expect(attachAccessory(null, 'headband', '#fff')).toBe(null);
    expect(attachAccessory({ group: new THREE.Group() }, 'headband', '#fff')).toBe(null);
  });
});

describe('boneRig', () => {
  it('cancels the 1/100 armature scale so its contents are in metres', () => {
    const char = rig();
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    r.add(m);
    const size = worldSize(m);
    expect(size.x).toBeCloseTo(1, 3);
    expect(size.y).toBeCloseTo(1, 3);
  });
  it('cancels the bind tilt, so up is up', () => {
    const char = rig({ headTilt: 0.6 });
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const m = new THREE.Object3D(); m.position.set(0, 1, 0);
    r.add(m); r.updateMatrixWorld(true);
    const p = worldPos(m).sub(worldPos(head));
    expect(p.y).toBeCloseTo(1, 3);
    expect(Math.abs(p.z)).toBeLessThan(1e-6);
  });
});

describe('headAxes', () => {
  it('measures the skull off head_end and the face off headfront', () => {
    const char = rig();
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const { up, front } = headAxes(char.group, r);
    expect(up.length()).toBeCloseTo(0.23, 2);   // 23 rig units = 0.23 m
    expect(front.length()).toBeGreaterThan(0.05);
    expect(up.dot(front)).toBeCloseTo(0, 6);    // the face is square to the skull
  });
});

describe('headband', () => {
  const char = rig();
  const head = findNode(char.group, /^head$/i);
  const acc = attachAccessory(char, 'headband', '#f5b312');

  it('is one torus on the Head bone, in the accent colour', () => {
    expect(acc.meshes.length).toBe(1);
    const m = acc.meshes[0];
    expect(m.geometry.type).toBe('TorusGeometry');
    expect(m.geometry.parameters.radius).toBe(HEADBAND.radius);
    expect(m.geometry.parameters.tube).toBe(HEADBAND.tube);
    expect(m.material.color.getHexString()).toBe('f5b312');
    let p = m.parent; while (p && !p.isBone) p = p.parent;
    expect(p).toBe(head);
  });

  it('comes out life-size — 0.11 m radius on the finished player', () => {
    const size = worldSize(acc.meshes[0]);
    const want = 2 * (HEADBAND.radius + HEADBAND.tube);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(want, 2);
  });

  it('lies ACROSS the skull, so a tilted bind head wears it level on the brow', () => {
    const m = acc.meshes[0];
    m.updateMatrixWorld(true);
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
    const skull = worldPos(findNode(char.group, /head_?end/i)).sub(worldPos(head)).normalize();
    expect(axis.dot(skull)).toBeGreaterThan(0.99);
  });

  it('sits on the brow, not through the crown or round the neck', () => {
    const rise = worldPos(acc.meshes[0]).sub(worldPos(head)).length();
    expect(rise).toBeCloseTo(0.23 * HEAD_FRAC.headband, 2);
  });

  it('frees its geometry and unhooks itself, twice over if asked', () => {
    const geo = acc.meshes[0].geometry;
    expect(geo.userData.owned).toBe(true);
    acc.dispose();
    acc.dispose();
    expect(countAccessories(char)).toBe(0);
    expect(char.group.getObjectByName('accessory-headband')).toBe(undefined);
  });
});

describe('shades', () => {
  it('are a thin visor across the eyes, out in front of the face', () => {
    const char = rig();
    const head = findNode(char.group, /^head$/i);
    const acc = attachAccessory(char, 'shades', '#101410');
    expect(acc.meshes.length).toBe(1);
    const m = acc.meshes[0];
    expect(m.geometry.type).toBe('BoxGeometry');
    expect([m.geometry.parameters.width, m.geometry.parameters.height, m.geometry.parameters.depth])
      .toEqual([SHADES.w, SHADES.h, SHADES.d]);
    // in the head's own frame: up the skull a little, and out through the face
    const rigNode = m.parent;
    const local = rigNode.worldToLocal(worldPos(m));
    expect(local.y).toBeGreaterThan(0.05);
    expect(local.z).toBeGreaterThan(0.05);
    expect(worldPos(m).y).toBeGreaterThan(worldPos(head).y);
    acc.dispose();
  });
});

describe('wristbands', () => {
  const char = rig();
  const acc = attachAccessory(char, 'wristbands', '#e8c97a');

  it('are two cylinders, one per hand', () => {
    expect(acc.meshes.length).toBe(2);
    for (const m of acc.meshes) {
      expect(m.geometry.type).toBe('CylinderGeometry');
      expect(m.geometry.parameters.radiusTop).toBe(WRISTBAND.radius);
      expect(m.geometry.parameters.height).toBe(WRISTBAND.height);
      let p = m.parent; while (p && !p.isBone) p = p.parent;
      expect(/Hand$/.test(p.name)).toBe(true);
    }
    const names = acc.meshes.map((m) => m.parent.parent.name).sort();
    expect(names).toEqual(['LeftHand', 'RightHand']);
  });

  it('sit up the forearm from the wrist, not out past the fingers', () => {
    for (const m of acc.meshes) {
      const hand = m.parent.parent;
      const fore = hand.parent;
      const toElbow = worldPos(fore).sub(worldPos(hand)).normalize();
      const off = worldPos(m).sub(worldPos(hand));
      expect(off.length()).toBeCloseTo(WRIST_UP_M, 2);
      expect(off.normalize().dot(toElbow)).toBeGreaterThan(0.99);
    }
  });

  it('come out life-size, 9 cm across', () => {
    const size = worldSize(acc.meshes[0]);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(2 * WRISTBAND.radius, 2);
  });

  it('both hands let go on dispose', () => {
    acc.dispose();
    expect(countAccessories(char)).toBe(0);
  });
});

describe('measureHead — the skull the rig actually has', () => {
  // The band is placed off the MESH, not off the helper bones: `head_end` sits
  // outside the hair and a head is deeper than it is wide, so a band sized off
  // either one comes out as a hat brim. This stands up a head-shaped point
  // cloud skinned to the Head bone — plus a tower of "hair" above it, which is
  // what arch-puff has and what broke every fraction-of-height rule.
  function skinnedRig({ hair = 0 } = {}) {
    const char = rig({ headTilt: 0 });
    const head = findNode(char.group, /^head$/i);
    const bones = [];
    char.group.traverse((o) => { if (o.isBone) bones.push(o); });
    const headIdx = bones.indexOf(head);
    const pts = [];
    // a head in RIG metres: chin at -0.06, crown at +0.20, widest at +0.05
    for (let i = 0; i <= 26; i++) {
      const y = -0.06 + (i / 26) * 0.26;
      const t = (y + 0.06) / 0.26;
      const r = 0.055 + 0.045 * Math.sin(Math.PI * Math.min(1, t * 1.15)); // widest ~40% up
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * Math.PI * 2;
        pts.push(Math.cos(th) * r, y, Math.sin(th) * r * 1.25); // deeper than wide
      }
    }
    for (let i = 0; i < hair; i++) {                 // a puff: wider AND higher
      const y = 0.21 + (i / Math.max(1, hair)) * 0.22;
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * Math.PI * 2;
        pts.push(Math.cos(th) * 0.14, y, Math.sin(th) * 0.14);
      }
    }
    const n = pts.length / 3;
    const geo = new THREE.BufferGeometry();
    // a Skeleton's boneInverses are built from the bones' BIND WORLD matrices,
    // so skinned vertices are authored in world space — here, around the head
    // joint at y = 1.60 (0.98 hips + 0.48 spine + 0.14 head, all at 1/100)
    const headY = 1.60;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      pts.map((v, i) => (i % 3 === 1 ? v + headY : v)), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? headIdx : 0)), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    const skeleton = new THREE.Skeleton(bones);
    char.group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    char.group.updateMatrixWorld(true);
    return { char, head };
  }

  it('reads the skull off the mesh: chin, crown, and the width at a height', () => {
    const { char, head } = skinnedRig();
    const r = boneRig(char.group, head, 'probe');
    const M = measureHead(char.group, head, r, headAxes(char.group, r).up);
    expect(M).not.toBe(null);
    expect(M.low).toBeCloseTo(-0.06, 2);
    expect(M.rise).toBeCloseTo(0.20, 2);
    expect(M.ringRadius(0.05, 0.02)).toBeGreaterThan(M.ringRadius(0.19, 0.02)); // tapers to the crown
  });

  it('finds the TEMPLE line, and big hair cannot drag it up', () => {
    const bald = skinnedRig();
    const puffy = skinnedRig({ hair: 12 });
    const mOf = ({ char, head }) => {
      const r = boneRig(char.group, head, 'probe');
      return measureHead(char.group, head, r, headAxes(char.group, r).up);
    };
    const a = mOf(bald), b = mOf(puffy);
    expect(b.rise).toBeGreaterThan(a.rise + 0.15);      // the hair really is up there
    expect(b.widestY).toBeCloseTo(a.widestY, 2);        // and the temple line did not move
    expect(a.widestY).toBeGreaterThan(-0.03);
    expect(a.widestY).toBeLessThan(0.11);
  });

  it('puts the band on the brow at the width the head is THERE, not at its depth', () => {
    const { char, head } = skinnedRig({ hair: 12 });
    const acc = attachAccessory(char, 'headband', '#ffffff');
    const m = acc.meshes[0];
    const r = boneRig(char.group, head, 'probe2');
    const M = measureHead(char.group, head, r, headAxes(char.group, r).up);
    const local = m.parent.worldToLocal(worldPos(m));
    expect(local.y).toBeCloseTo(M.widestY + 0.022, 2);   // brow, not crown
    expect(local.y).toBeLessThan(0.16);                  // and nowhere near the hair
    // sized off the head's WIDTH — a depth-sized band would be 25 % bigger
    expect(m.geometry.parameters.radius).toBeLessThan(M.ringRadius(local.y, 0.02) * 1.1);
    expect(m.geometry.parameters.radius).toBeGreaterThan(M.ringRadius(local.y, 0.02) * 0.95);
    acc.dispose();
  });
});

describe('scale', () => {
  it('grows with a taller cast slot so the band still fits the head', () => {
    const a = rig(), b = rig();
    const small = attachAccessory(a, 'headband', '#fff', { scale: 1 });
    const big = attachAccessory(b, 'headband', '#fff', { scale: 1.08 });
    expect(worldSize(big.meshes[0]).x / worldSize(small.meshes[0]).x).toBeCloseTo(1.08, 2);
    small.dispose(); big.dispose();
  });
});
