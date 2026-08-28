// A crew band is PRINTED ON THE BODY — a skinned patch cut from the body's own
// triangles, exactly like the jersey decals. So what these tests hold is the
// SELECTION: a wristband is the ring of forearm 2.5-5.5 cm proximal of the wrist
// joint and NOTHING on the hand or the upper arm; a headband is the ring of
// SKULL at the brow and NOT the afro hanging through the same slice. The rig
// below is a stand-in for an archetype — armature at 1/100, arms out, a head
// deeper than it is wide, and (on request) a hair shell round it.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ACCESSORY_KINDS, BAND_LIFT_M, WRIST_BAND, HEAD_BAND_M, SKULL_PAD_M, BROW_LIFT_M,
  MIN_BAND_TRIS, BAND_ATTR, BAND_FEATHER_M, attachAccessory, findNode, boneRig, headAxes, measureHead,
  bandVertices, bandTriangles, cullHairShell, jointSide, isHeadJoint,
  isForeArmJoint, isHandJoint,
} from '../src/game/accessories.js';
import { boneFrames } from '../src/game/jerseyDecals.js';

const SEG = 8;          // faces round a limb / round the skull
const ARM_R = 0.045;    // forearm radius, metres
const HAIR_R = 0.14;    // the puff's shell — far outside a 0.10 m skull
const BROW_TOL = 0.012;   // one ring of the synthetic skull

/** The skeleton: armature at 1/100 (what the GLBs ship with), a head that can
 *  be tilted out of axis, and arms straight out to the sides. */
function rig({ headTilt = 0 } = {}) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(0.01);
  group.add(inner);
  const hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 98, 0);
  inner.add(hips);
  const spine = new THREE.Bone(); spine.name = 'Spine'; spine.position.set(0, 48, 0);
  hips.add(spine);
  const head = new THREE.Bone(); head.name = 'Head'; head.position.set(0, 14, 0);
  head.rotation.x = headTilt;
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

/**
 * ONE skinned body on that skeleton: a head (deeper than it is wide), an
 * optional hair shell round it, and a forearm/hand tube on each arm running
 * from 5 cm past the fingers to 6 cm past the elbow, ringed every centimetre.
 *
 * A Skeleton's boneInverses come from the bones' BIND WORLD matrices, so with
 * an identity bindMatrix the vertices are authored in WORLD space.
 */
function body(char, { hair = 0 } = {}) {
  const bones = [];
  char.group.traverse((o) => { if (o.isBone) bones.push(o); });
  const slot = (name) => bones.findIndex((b) => b.name === name);
  const P = []; const SI = []; const SW = []; const IX = [];
  const ring = (c, u, v, ru, rv, w) => {
    const base = P.length / 3;
    for (let a = 0; a < SEG; a++) {
      const th = (a / SEG) * Math.PI * 2;
      const ct = Math.cos(th) * ru; const st = Math.sin(th) * rv;
      P.push(c.x + u.x * ct + v.x * st, c.y + u.y * ct + v.y * st, c.z + u.z * ct + v.z * st);
      SI.push(w[0][0], w[1] ? w[1][0] : 0, 0, 0);
      SW.push(w[0][1], w[1] ? w[1][1] : 0, 0, 0);
    }
    return base;
  };
  const stitch = (a, b) => {
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      IX.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  };

  // ---- the head: chin at -0.06, crown at +0.20, widest ~40 % up, and BUILT IN
  // THE HEAD BONE'S OWN FRAME, so a tilted bind pose tilts the skull with it
  const headBone = char.group.getObjectByName('Head');
  const Q = headBone.getWorldQuaternion(new THREE.Quaternion());
  const HX = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
  const HY = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
  const HZ = new THREE.Vector3(0, 0, 1).applyQuaternion(Q);
  const skullAt = (y) => headBone.getWorldPosition(new THREE.Vector3()).addScaledVector(HY, y);
  const headSlot = slot('Head');
  let prev = null;
  for (let i = 0; i <= 26; i++) {
    const y = -0.06 + (i / 26) * 0.26;
    const t = (y + 0.06) / 0.26;
    const r = 0.055 + 0.045 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const base = ring(skullAt(y), HX, HZ, r, r * 1.25, [[headSlot, 1]]);
    if (prev !== null) stitch(prev, base);
    prev = base;
  }
  // ---- the puff: a shell skinned to the HEAD, hanging through the brow slice
  if (hair) {
    prev = null;
    for (let i = 0; i <= hair; i++) {
      const base = ring(skullAt(0.06 + (i / hair) * 0.24), HX, HZ, HAIR_R, HAIR_R, [[headSlot, 1]]);
      if (prev !== null) stitch(prev, base);
      prev = base;
    }
  }
  // ---- the arms: d is metres PROXIMAL of the wrist joint
  const U = new THREE.Vector3(0, 1, 0); const V = new THREE.Vector3(0, 0, 1);
  for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
    const hand = slot(`${side}Hand`); const fore = slot(`${side}ForeArm`); const arm = slot(`${side}Arm`);
    const wrist = new THREE.Vector3(sx * 0.68, 1.52, 0);
    const prox = new THREE.Vector3(-sx, 0, 0);
    prev = null;
    for (let k = 0; k <= 35; k++) {
      const d = -0.05 + k * 0.01;
      const w = d < -0.001 ? [[hand, 0.8], [fore, 0.2]]
        : d < 0.055 ? [[fore, 0.6], [hand, 0.4]]   // the cuff of skin at the wrist
          : d < 0.239 ? [[fore, 1]]
            : [[arm, 0.85], [fore, 0.15]];
      const base = ring(wrist.clone().addScaledVector(prox, d), U, V, ARM_R, ARM_R, w);
      if (prev !== null) stitch(prev, base);
      prev = base;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(IX);
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = 'body';
  char.group.add(mesh);
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  char.group.updateMatrixWorld(true);
  return mesh;
}

/** A dressed character: skeleton + skinned body, ready for a band. */
function player(opts = {}) {
  const char = rig(opts);
  const mesh = body(char, opts);
  return { char, mesh };
}

const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());
const countBands = (char) => {
  let n = 0;
  char.group.traverse((o) => { if (o.isMesh && /^accessory-/.test(o.name)) n++; });
  return n;
};
/** Every vertex of a patch, in world metres. */
function patchPoints(mesh) {
  const p = mesh.geometry.getAttribute('position');
  const out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  return out;
}

describe('the vocabulary', () => {
  it('is exactly what casts.json is allowed to ask for — shades are gone', () => {
    expect(ACCESSORY_KINDS).toEqual(['none', 'headband', 'wristbands']);
  });
  it('adds nothing for none, for shades, or for a kind nobody defined', () => {
    for (const kind of ['none', 'shades', '', null, undefined, 'cape']) {
      const { char } = player();
      expect(attachAccessory(char, kind, '#ff0000')).toBe(null);
      expect(countBands(char)).toBe(0);
    }
  });
  it('hands back null instead of throwing when there is no body to print on', () => {
    expect(attachAccessory(null, 'headband', '#fff')).toBe(null);
    expect(attachAccessory({ group: new THREE.Group() }, 'headband', '#fff')).toBe(null);
    expect(attachAccessory({ group: rig().group }, 'wristbands', '#fff')).toBe(null);
  });
});

describe('which joint owns a vertex', () => {
  it('reads a side off every naming convention these rigs ship with', () => {
    expect(jointSide('LeftForeArm')).toBe('l');
    expect(jointSide('mixamorig:RightHand')).toBe('r');
    expect(jointSide('forearm.L')).toBe('l');
    expect(jointSide('hand_r')).toBe('r');
    expect(jointSide('Spine')).toBe(null);
  });
  it('knows a forearm, a hand and a skull from everything else', () => {
    expect(isForeArmJoint('LeftForeArm')).toBe(true);
    expect(isForeArmJoint('RightLowerArm')).toBe(true);
    expect(isForeArmJoint('LeftArm')).toBe(false);
    expect(isHandJoint('mixamorig:LeftHand')).toBe(true);
    expect(isHandJoint('LeftForeArm')).toBe(false);
    expect(isHeadJoint('Head')).toBe(true);
    expect(isHeadJoint('head_end')).toBe(false);   // a helper bone, up at the crown
    expect(isHeadJoint('headfront')).toBe(false);
    expect(isHeadJoint('Neck')).toBe(false);
  });
});

describe('boneRig', () => {
  it('cancels the 1/100 armature scale so its contents are in metres', () => {
    const { char } = player();
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    r.add(m);
    m.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1, 3);
    expect(size.y).toBeCloseTo(1, 3);
    r.removeFromParent();
  });
  it('cancels the bind tilt, so up is up', () => {
    const { char } = player({ headTilt: 0.6 });
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const m = new THREE.Object3D(); m.position.set(0, 1, 0);
    r.add(m); r.updateMatrixWorld(true);
    const p = worldPos(m).sub(worldPos(head));
    expect(p.y).toBeCloseTo(1, 3);
    expect(Math.abs(p.z)).toBeLessThan(1e-6);
    r.removeFromParent();
  });
});

describe('headAxes', () => {
  it('measures the skull off head_end and the face off headfront', () => {
    const { char } = player();
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const { up, front } = headAxes(char.group, r);
    expect(up.length()).toBeCloseTo(0.23, 2);
    expect(front.length()).toBeGreaterThan(0.05);
    expect(up.dot(front)).toBeCloseTo(0, 6);
    r.removeFromParent();
  });
});

describe('measureHead — the skull the rig actually has', () => {
  const M = ({ char }) => {
    const head = findNode(char.group, /^head$/i);
    const r = boneRig(char.group, head, 'probe');
    const out = measureHead(char.group, head, r, headAxes(char.group, r).up);
    r.removeFromParent();
    return out;
  };
  it('reads the skull off the mesh: chin, crown, and the width at a height', () => {
    const m = M(player());
    expect(m).not.toBe(null);
    expect(m.low).toBeCloseTo(-0.06, 2);
    expect(m.rise).toBeCloseTo(0.20, 2);
    expect(m.ringRadius(0.05, 0.02)).toBeGreaterThan(m.ringRadius(0.19, 0.02));
  });
  it('finds the TEMPLE line, and big hair cannot drag it up', () => {
    const bald = M(player());
    const puffy = M(player({ hair: 14 }));
    expect(puffy.rise).toBeGreaterThan(bald.rise + 0.08);
    expect(puffy.widestY).toBeCloseTo(bald.widestY, 2);
    expect(bald.widestY).toBeGreaterThan(-0.03);
    expect(bald.widestY).toBeLessThan(0.11);
  });
});

// ---------------------------------------------------------------------------

/** The forearm band's own selection, straight off `bandVertices`. */
function wristSelection(char, mesh, side) {
  const hand = findNode(char.group, side === 'l' ? /^LeftHand$/ : /^RightHand$/);
  const fore = findNode(char.group, side === 'l' ? /^LeftForeArm$/ : /^RightForeArm$/);
  const r = boneRig(char.group, hand, 'probe');
  const axis = r.worldToLocal(worldPos(fore)).normalize();
  const frames = boneFrames(mesh, new THREE.Matrix4().copy(r.matrixWorld).invert());
  const joints = new Set();
  frames.forEach((f, i) => {
    if (jointSide(f.name) === side && (isForeArmJoint(f.name) || isHandJoint(f.name))) joints.add(i);
  });
  const sel = bandVertices(mesh, { frames, joints, axis, origin: new THREE.Vector3() });
  r.removeFromParent();
  return { sel, frames };
}

describe('the wristband is the ring of forearm above the wrist', () => {
  const { char, mesh } = player();
  const { sel } = wristSelection(char, mesh, 'l');
  const tris = bandTriangles(mesh.geometry, sel, WRIST_BAND.near, WRIST_BAND.far);
  const picked = [...new Set(tris)];

  it('finds a closed ring, not a scatter of faces', () => {
    expect(tris.length / 3).toBeGreaterThanOrEqual(3 * SEG * 2); // ≥ 3 rows of quads
    const az = new Set(picked.map((i) => {
      const p = new THREE.Vector3(sel.x[i], sel.y[i], sel.z[i]);
      return Math.round(((Math.atan2(p.z, p.y) + Math.PI) / (Math.PI * 2)) * SEG) % SEG;
    }));
    expect(az.size, 'every face round the arm').toBe(SEG);
  });

  it('takes ONLY the 2.5-5.5 cm band — nothing on the hand, nothing up the arm', () => {
    const ds = picked.map((i) => sel.d[i]);
    // rings sit every centimetre, so the band's own rows run 0.02 … 0.06
    expect(Math.min(...ds)).toBeGreaterThan(0.019);
    expect(Math.max(...ds)).toBeLessThan(0.061);
    expect(ds.every((d) => d > 0), 'not a single vertex out past the wrist').toBe(true);
  });

  it('lets the HAND own a vertex inside the band — the knuckles are excluded by distance', () => {
    // the tube's 0-0.05 rows are hand-blended; the selection keeps them because
    // the distance test, not the joint, is what draws the cuff's edges
    const handSide = picked.filter((i) => sel.d[i] < 0.055);
    expect(handSide.length).toBeGreaterThan(0);
  });

  it('does the same on the other wrist', () => {
    const r = wristSelection(char, mesh, 'r');
    const t = bandTriangles(mesh.geometry, r.sel, WRIST_BAND.near, WRIST_BAND.far);
    expect(t.length).toBe(tris.length);
    expect([...new Set(t)].some((i) => picked.includes(i)), 'and takes different vertices').toBe(false);
  });

  it('never claims a vertex the upper arm owns', () => {
    let upper = 0;
    for (let i = 0; i < sel.count; i++) if (sel.ok[i] && sel.d[i] > 0.24) upper++;
    expect(upper).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/** The head band's own selection, hair cull included. */
function headSelection(char, mesh, { cull = true } = {}) {
  const head = findNode(char.group, /^head$/i);
  const r = boneRig(char.group, head, 'probe');
  const up = headAxes(char.group, r).up;
  const M = measureHead(char.group, head, r, up);
  const at = M.widestY + BROW_LIFT_M;
  const frames = boneFrames(mesh, new THREE.Matrix4().copy(r.matrixWorld).invert());
  const joints = new Set();
  frames.forEach((f, i) => { if (isHeadJoint(f.name)) joints.add(i); });
  const origin = new THREE.Vector3();
  const sel = bandVertices(mesh, { frames, joints, axis: up.clone().normalize(), origin });
  const lo = at - HEAD_BAND_M / 2; const hi = at + HEAD_BAND_M / 2;
  const culled = cull ? cullHairShell(sel, { origin, lo, hi }) : null;
  r.removeFromParent();
  return { sel, at, lo, hi, culled };
}

const radial = (sel, i) => Math.hypot(sel.x[i], sel.z[i]);

describe('the headband is the ring of SKULL at the brow', () => {
  it('sits at the brow line, a 2.5 cm band, right round the head', () => {
    const { char, mesh } = player();
    const { sel, at } = headSelection(char, mesh);
    const tris = bandTriangles(mesh.geometry, sel, at - HEAD_BAND_M / 2, at + HEAD_BAND_M / 2);
    const picked = [...new Set(tris)];
    expect(tris.length / 3).toBeGreaterThanOrEqual(2 * SEG * 2);
    for (const i of picked) expect(Math.abs(sel.d[i] - at)).toBeLessThan(HEAD_BAND_M / 2 + BROW_TOL);
    const az = new Set(picked.map((i) => Math.round(((Math.atan2(sel.z[i], sel.x[i]) + Math.PI) / (Math.PI * 2)) * SEG) % SEG));
    expect(az.size, 'full circumference').toBe(SEG);
  });

  it('takes the SKULL and not the puff hanging through the same slice', () => {
    const { char, mesh } = player({ hair: 14 });
    const { sel, at, culled } = headSelection(char, mesh);
    expect(culled.culled, 'the shell was struck off').toBeGreaterThan(0);
    const tris = bandTriangles(mesh.geometry, sel, at - HEAD_BAND_M / 2, at + HEAD_BAND_M / 2);
    const picked = [...new Set(tris)];
    expect(picked.length).toBeGreaterThan(0);
    for (const i of picked) {
      expect(radial(sel, i), 'a hair vertex got in').toBeLessThan(HAIR_R - SKULL_PAD_M);
    }
    // and the band is still a closed ring under the hair
    const az = new Set(picked.map((i) => Math.round(((Math.atan2(sel.z[i], sel.x[i]) + Math.PI) / (Math.PI * 2)) * SEG) % SEG));
    expect(az.size).toBe(SEG);
  });

  it('WOULD have taken the puff without the cull — the shell really is in the way', () => {
    const { char, mesh } = player({ hair: 14 });
    const { sel, at } = headSelection(char, mesh, { cull: false });
    const picked = [...new Set(bandTriangles(mesh.geometry, sel, at - HEAD_BAND_M / 2, at + HEAD_BAND_M / 2))];
    expect(picked.some((i) => radial(sel, i) > HAIR_R - 0.001)).toBe(true);
  });

  it('leaves a bald head untouched — the skull IS the innermost surface', () => {
    const { char, mesh } = player();
    const { culled } = headSelection(char, mesh);
    expect(culled.culled).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('attachAccessory prints the band on the body', () => {
  it('gives the headband one SkinnedMesh bound to the BODY skeleton', () => {
    const { char, mesh } = player({ hair: 14 });
    const acc = attachAccessory(char, 'headband', '#f5b312');
    expect(acc.meshes.length).toBe(1);
    const m = acc.meshes[0];
    expect(m.isSkinnedMesh).toBe(true);
    expect(m.name).toBe('accessory-headband');
    expect(m.skeleton).toBe(mesh.skeleton);           // BORROWED, never cloned
    expect(m.parent).toBe(mesh.parent);
    expect(m.geometry.getAttribute('skinIndex')).toBeTruthy();
    expect(m.geometry.getAttribute('skinWeight')).toBeTruthy();
    expect(m.geometry.getAttribute('uv'), 'a flat colour needs no uv').toBeFalsy();
    expect(m.geometry.userData.owned).toBe(true);
    expect(m.userData.band.triangles).toBeGreaterThanOrEqual(MIN_BAND_TRIS);
    acc.dispose();
  });

  it('gives the wristbands one patch per wrist, sharing one material', () => {
    const { char, mesh } = player();
    const acc = attachAccessory(char, 'wristbands', '#e8c97a');
    expect(acc.meshes.length).toBe(2);
    expect(acc.meshes.map((m) => m.name).sort())
      .toEqual(['accessory-wristband-l', 'accessory-wristband-r']);
    expect(acc.meshes[0].material).toBe(acc.meshes[1].material);
    for (const m of acc.meshes) {
      expect(m.isSkinnedMesh).toBe(true);
      expect(m.skeleton).toBe(mesh.skeleton);
      expect(m.userData.band.triangles).toBeGreaterThanOrEqual(MIN_BAND_TRIS);
    }
    acc.dispose();
  });

  it('is flat accent colour, offset, drawn over the body', () => {
    const { char } = player();
    const m = attachAccessory(char, 'wristbands', '#e8c97a').meshes[0];
    expect(m.material.type).toBe('MeshBasicMaterial');
    expect(m.material.color.getHexString()).toBe('e8c97a');
    expect(m.material.transparent).toBe(true);
    expect(m.material.depthWrite).toBe(false);
    expect(m.material.polygonOffsetFactor).toBe(-2);
    expect(m.material.toneMapped).toBe(false);
    expect(typeof m.material.onBeforeCompile).toBe('function');   // the grazing fade
    expect(m.material.customProgramCacheKey()).toBe('accessoryBand');
    expect(m.renderOrder).toBe(2);
    expect(m.frustumCulled).toBe(false);
  });

  it('carries its own edge coordinate, and is CUT wider than it is DRAWN', () => {
    const { char } = player();
    const acc = attachAccessory(char, 'wristbands', '#fff');
    const centre = (WRIST_BAND.near + WRIST_BAND.far) / 2;
    const half = (WRIST_BAND.far - WRIST_BAND.near) / 2;
    for (const m of acc.meshes) {
      const a = m.geometry.getAttribute(BAND_ATTR);
      expect(a, 'the feather has nothing to read without it').toBeTruthy();
      expect(a.itemSize).toBe(1);
      expect(a.count).toBe(m.geometry.getAttribute('position').count);
      const wristX = m.name.endsWith('-l') ? 0.68 : -0.68;
      const sign = m.name.endsWith('-l') ? -1 : 1;
      const pts = patchPoints(m);
      let out = 0;
      for (let i = 0; i < a.count; i++) {
        expect(a.getX(i)).toBeCloseTo((pts[i].x - wristX) * sign - centre, 3);
        if (Math.abs(a.getX(i)) > half) out++;
      }
      // the fade needs geometry OUTSIDE the band to fade into
      expect(out, 'the cut stops dead on the band edge').toBeGreaterThan(0);
      expect(BAND_FEATHER_M).toBeLessThan(half);
    }
    acc.dispose();
  });

  it('rides 3 mm off the skin it is cut from — the band, not a sleeve', () => {
    const { char } = player();
    const acc = attachAccessory(char, 'wristbands', '#fff');
    const left = acc.meshes.find((m) => m.name.endsWith('-l'));
    for (const p of patchPoints(left)) {
      // the tube runs along x; its surface is ARM_R from that axis
      expect(Math.hypot(p.y - 1.52, p.z)).toBeCloseTo(ARM_R + BAND_LIFT_M, 4);
    }
    acc.dispose();
  });

  it('sits ON the wrist: every vertex 2-6 cm up the forearm from the hand joint', () => {
    const { char } = player();
    const acc = attachAccessory(char, 'wristbands', '#fff');
    for (const m of acc.meshes) {
      const wristX = m.name.endsWith('-l') ? 0.68 : -0.68;
      const sign = m.name.endsWith('-l') ? -1 : 1;
      for (const p of patchPoints(m)) {
        const d = (p.x - wristX) * sign;
        expect(d).toBeGreaterThan(0.019);
        expect(d).toBeLessThan(0.061);
      }
    }
    acc.dispose();
  });

  it('sits ON the brow, and follows a bind pose that is not axis-aligned', () => {
    const { char } = player({ headTilt: 0.35, hair: 14 });
    const head = findNode(char.group, /^head$/i);
    const acc = attachAccessory(char, 'headband', '#fff');
    const at = acc.meshes[0].userData.band.at;
    const skull = worldPos(findNode(char.group, /head_?end/i)).sub(worldPos(head)).normalize();
    const origin = worldPos(head);
    for (const p of patchPoints(acc.meshes[0])) {
      const rel = p.clone().sub(origin);
      expect(Math.abs(rel.dot(skull) - at)).toBeLessThan(HEAD_BAND_M / 2 + BROW_TOL);
      expect(rel.clone().addScaledVector(skull, -rel.dot(skull)).length()).toBeLessThan(HAIR_R - SKULL_PAD_M);
    }
    acc.dispose();
  });

  it('frees its geometry and unhooks itself, twice over if asked', () => {
    const { char, mesh } = player();
    const acc = attachAccessory(char, 'wristbands', '#fff');
    expect(countBands(char)).toBe(2);
    acc.dispose();
    acc.dispose();
    expect(countBands(char)).toBe(0);
    expect(char.group.getObjectByName('accessory-wristband-l')).toBe(undefined);
    expect(mesh.skeleton.bones.length, 'the skeleton is the body\'s — untouched').toBeGreaterThan(0);
  });

  it('leaves NOTHING hanging off a bone — no rig groups, no per-frame passengers', () => {
    const { char } = player();
    const acc = attachAccessory(char, 'headband', '#fff');
    let onBones = 0;
    char.group.traverse((o) => { if (o.isBone) onBones += o.children.filter((c) => !c.isBone).length; });
    expect(onBones).toBe(0);
    acc.dispose();
  });
});
