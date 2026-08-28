// CREW ACCESSORIES — a headband, wristbands or shades in the crew's accent
// colour, bolted to the rig (spec §4).
//
// The archetype atlas can't carry these: its texels are re-used across UV
// islands, so a painted headband lands on three other body parts (the same
// reason the cleats tint by geometry and the jersey mark is a bone-parented
// plane). So an accessory is GEOMETRY on a bone — it rides the walk, the kick
// and the dance for free, and it costs one small mesh.
//
// UNITS. These rigs park the armature at scale 0.01 and each archetype's bind
// basis is rotated a little differently, so a mesh added straight to `Head`
// would come out 1/100 size and tilted. Every mount hangs off a RIG GROUP that
// cancels the bone's rotation and scale relative to the character root — same
// trick as jerseyDecals — so every number below is literal METRES on the
// finished player and lands the same way on all 19 archetypes.
//
// PLACEMENT is measured, not guessed. The rigs carry `head_end` (top of the
// skull) and `headfront` (the face), so the band goes up the skull's OWN axis
// and the shades out along the face's own normal; the wristbands run along the
// forearm→hand axis, so they stay round the wrist when the arm swings instead
// of standing upright in world space.
import * as THREE from 'three';

/** The vocabulary casts.json may ask for. */
export const ACCESSORY_KINDS = ['none', 'headband', 'wristbands', 'shades'];

/** Band round the forehead. */
export const HEADBAND = { radius: 0.11, tube: 0.014, seg: 8, ring: 20 };
/** Thin visor across the eyes. */
export const SHADES = { w: 0.16, h: 0.03, d: 0.02 };
/** A short sleeve on each wrist. */
export const WRISTBAND = { radius: 0.045, height: 0.05, seg: 12 };

/** Where each piece sits, as a fraction of the head's MEASURED height above the
 *  `Head` joint: the brow band just under the hairline, the visor on the eye
 *  line. Measured off the skinned mesh, not off `head_end` — that helper bone
 *  overshoots the crown by a good 15 % on these rigs, and taking it for the
 *  top of the skull put the band on top of arch-stache's head like a bowler. */
export const HEAD_FRAC = { headband: 0.62, shades: 0.44 };
/** How far under the temple line the eyes sit, metres. */
export const EYE_DROP_M = 0.030;
/** How far OVER the temple line the brow band rides, metres.
 *  MEASURED, fix round 1: the temple hunt below almost never fires — on 4 of
 *  the 5 rigs probed (puff, stache, fro, vet) the head is still WIDENING at the
 *  top of the face window, so the scan runs to the FACE_HEIGHT_M cap and the
 *  band's height is really "the chin plus 0.128 plus this lift"
 *  (casts/probe-temple.mjs). At 0.022 that landed the band ON THE EYEBROWS on
 *  both the rigs it was shot on — arch-puff in casts/locker-kestrals.png and
 *  arch-stache in casts/locker-marauders.png, one band-width low on each. 0.050
 *  puts it on the forehead under the hairline, and the head is no wider there
 *  (arch-puff 0.096 -> 0.098 m half-width, arch-stache 0.095 -> 0.091), so the
 *  band still sits on the skull rather than hovering off it. (0.040 was shot
 *  too: identical on both rigs to the eye, so the extra centimetre costs
 *  nothing — casts/locker-marauders.png, casts/locker-kestrals.png. On arch-puff
 *  the band's front arc still disappears under the hairline whatever the height,
 *  because that rig's hair starts ON the forehead.) */
export const BROW_LIFT_M = 0.050;
/** Slice spacing when hunting for the temple line, metres. */
export const TEMPLE_STEP_M = 0.012;
/** How far above the chin the face stops on these rigs, metres. */
export const FACE_HEIGHT_M = 0.13;
/** How far out the face the visor sits, as a fraction of the measured face
 *  depth — just inside it, so it reads as worn and not held. */
export const SHADES_FRONT_FRAC = 0.92;
/** Fallbacks in metres for a rig with no `head_end` / `headfront` helper. */
export const HEAD_FALLBACK = { up: 0.23, front: 0.10 };
/** Wristband offset from the hand joint, up the forearm, metres. */
export const WRIST_UP_M = 0.03;

const BONE = {
  head: /^(mixamorig:)?head$/i,
  headEnd: /head_?end/i,
  headFront: /head_?front/i,
  hand: { l: /^(mixamorig:)?left_?hand$|^hand\.l$/i, r: /^(mixamorig:)?right_?hand$|^hand\.r$/i },
  foreArm: { l: /^(mixamorig:)?left_?(fore|lower)arm$/i, r: /^(mixamorig:)?right_?(fore|lower)arm$/i },
};

/** First node in `root` whose name matches — bones preferred over plain nodes. */
export function findNode(root, re) {
  let hit = null;
  root?.traverse?.((o) => {
    if (hit?.isBone) return;
    if (re.test(o.name ?? '') && (!hit || o.isBone)) hit = o;
  });
  return hit;
}

/**
 * A group parented to `bone` whose contents are in ROOT metres, upright and
 * facing the way the character faces, whatever the bind pose did.
 * @returns {THREE.Group}
 */
export function boneRig(root, bone, name) {
  root.updateMatrixWorld(true);
  const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(bone.matrixWorld);
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  rel.decompose(new THREE.Vector3(), q, s);
  const rig = new THREE.Group();
  rig.name = name;
  rig.quaternion.copy(q).invert();
  rig.scale.setScalar(1 / (s.x || 1));
  bone.add(rig);
  rig.updateMatrixWorld(true);
  return rig;
}

/** `to`'s position in `rig` space, or null. */
function localOf(rig, node) {
  if (!node) return null;
  try {
    const p = node.getWorldPosition(new THREE.Vector3());
    const v = rig.worldToLocal(p);
    return Number.isFinite(v.x) ? v : null;
  } catch { return null; }
}

/**
 * This skull's own axes, in rig metres: `up` from the Head joint to the crown,
 * `front` out through the face. Measured per archetype — they differ by a
 * couple of centimetres, which is the difference between a band on the brow
 * and a band sunk into it.
 */
export function headAxes(root, rig) {
  const up = localOf(rig, findNode(root, BONE.headEnd));
  const front = localOf(rig, findNode(root, BONE.headFront));
  const upV = up && up.length() > 1e-4 ? up.clone() : new THREE.Vector3(0, HEAD_FALLBACK.up, 0);
  let frontV = front && front.length() > 1e-4
    ? front.clone().projectOnPlane(upV.clone().normalize())
    : new THREE.Vector3(0, 0, HEAD_FALLBACK.front);
  if (frontV.length() < 0.02) frontV = new THREE.Vector3(0, 0, HEAD_FALLBACK.front);
  return { up: upV, front: frontV };
}

/**
 * The head this rig actually has, in rig metres, sampled from the vertices
 * SKINNED to it — the same trick the cleats use to find the foot.
 *
 * It reports the skull's extent above and below the `Head` joint (which sits
 * at the neck, not the chin, so the head hangs below it too) and the CROSS-
 * SECTION radius at any height. That last one is the point: a head is deeper
 * front-to-back than it is wide, so a band sized off the head's overall radius
 * comes out as an ellipse standing off both ears — which is exactly how the
 * first cut rendered on arch-stache, like a bowler hat.
 *
 * @returns {{rise:number, low:number, front:number,
 *   ringRadius:(y:number, band?:number)=>number, widestY:number}|null}
 */
export function measureHead(root, headBone, rig, up) {
  try {
    let skinned = null;
    root.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o; });
    const idx = skinned?.skeleton?.bones?.indexOf(headBone) ?? -1;
    const bi = idx >= 0 ? skinned.skeleton.boneInverses?.[idx] : null;
    const pos = skinned?.geometry?.getAttribute?.('position');
    const ji = skinned?.geometry?.getAttribute?.('skinIndex');
    const w = skinned?.geometry?.getAttribute?.('skinWeight');
    if (!bi || !pos || !ji || !w) return null;
    const m = new THREE.Matrix4().copy(rig.matrixWorld).invert()
      .multiply(new THREE.Matrix4().multiplyMatrices(headBone.matrixWorld, bi));
    const axis = up.clone().normalize();
    const v = new THREE.Vector3();
    const step = Math.max(1, Math.floor(pos.count / 12000));
    const ys = [];
    const xs = [];
    let rise = -Infinity, low = Infinity, front = 0;
    for (let i = 0; i < pos.count; i += step) {
      let hw = 0;
      for (let kk = 0; kk < 4; kk++) if (ji.getComponent(i, kk) === idx) hw += w.getComponent(i, kk);
      if (hw < 0.5) continue;                        // the skull, not the neck
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const y = v.dot(axis);
      ys.push(y);
      xs.push(Math.abs(v.x));                        // ACROSS the head — a band's radius
      if (y > rise) rise = y;
      if (y < low) low = y;
      if (v.z > front) front = v.z;
    }
    if (ys.length < 50 || !Number.isFinite(rise) || !Number.isFinite(low)) return null;
    /** Widest half-width across the head in the slice at height `y`. */
    const ringRadius = (y, band = 0.02) => {
      let r = 0;
      for (let i = 0; i < ys.length; i++) if (Math.abs(ys[i] - y) <= band && xs[i] > r) r = xs[i];
      return r;
    };
    // THE TEMPLE LINE. Scanning up from the chin and stopping at the FIRST
    // local maximum of the head's width is what keeps HAIR out of it: an
    // afro-puff or a stack of locs is far wider than the skull and pushes
    // `rise` up by 20 cm (arch-puff measures 0.52 m from chin to hair-top, vs
    // 0.26 for a bald rig), so any fraction-of-height rule parks the band in
    // the hair. The face's own widest slice is the cheek/temple line, and it
    // always comes first on the way up.
    let widestY = low + (rise - low) * 0.35;
    let prev = -1;
    // and the hunt stops at the top of the FACE (~13 cm above the chin on
    // these 2.05 m rigs), so a rig whose hair only widens on the way up —
    // arch-vet's grey mop — can't drag the band onto the crown
    for (let y = low + 0.02; y < low + FACE_HEIGHT_M; y += TEMPLE_STEP_M) {
      const r = ringRadius(y, 0.012);
      if (prev >= 0 && r < prev * 0.985) { widestY = y - TEMPLE_STEP_M; break; }
      prev = r;
      widestY = y;
    }
    return { rise, low, front, ringRadius, widestY };
  } catch { return null; }
}

function gearMaterial(hex) {
  const c = new THREE.Color(hex ?? '#101014');
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.55,
    metalness: 0.0,
    // most fields are night scenes — a touch of self-light so the band doesn't
    // vanish into the silhouette at phone size
    emissive: c.clone(),
    emissiveIntensity: 0.18,
  });
}

function gearMesh(geo, hex, name) {
  geo.userData.owned = true; // disposeCharacter() frees what the build allocated
  const m = new THREE.Mesh(geo, gearMaterial(hex));
  m.name = name;
  m.castShadow = true;
  m.frustumCulled = false; // it rides a bone; its own bounds lie
  return m;
}

/** Point a mesh's own `axis` along `dir`. */
function aim(mesh, axis, dir) {
  mesh.quaternion.setFromUnitVectors(axis, dir.clone().normalize());
}

/**
 * Bolt one accessory onto a built character.
 * @param {{group:THREE.Object3D}} char
 * @param {string} kind one of ACCESSORY_KINDS
 * @param {string} hex the crew's accent colour
 * @param {{scale?:number}} [opts] `scale` keeps the piece in proportion with a
 *   cast slot's height (the rig cancels the bone scale, that height included)
 * @returns {{meshes:THREE.Mesh[], dispose:()=>void}|null} null when there's
 *   nothing to add — never throws, it's cosmetic
 */
export function attachAccessory(char, kind, hex, { scale = 1 } = {}) {
  if (!kind || kind === 'none' || !ACCESSORY_KINDS.includes(kind)) return null;
  try {
    const root = char?.group;
    if (!root) return null;
    const meshes = [];
    const rigs = [];
    const mount = (bone, name) => {
      const rig = boneRig(root, bone, name);
      rig.scale.multiplyScalar(scale);
      rig.updateMatrixWorld(true);
      rigs.push(rig);
      return rig;
    };

    if (kind === 'headband' || kind === 'shades') {
      const head = findNode(root, BONE.head);
      if (!head) return null;
      const rig = mount(head, `accessory-${kind}`);
      const { up, front } = headAxes(root, rig);
      // the measured skull wins; `head_end`/`headfront` are the fallback
      const M = measureHead(root, head, rig, up);
      const upUnit = up.clone().normalize();
      const frontUnit = front.clone().normalize();
      const reach = M ? Math.max(M.front, 0.04) : front.length();
      if (kind === 'headband') {
        // Straight onto the temple line, at the width the head IS there. A
        // fixed radius either strangles a heavyset skull or hovers off a lean
        // one, and either way it stops reading as something the player put on.
        const y = M ? M.widestY + BROW_LIFT_M : up.length() * HEAD_FRAC.headband;
        const radius = M
          ? Math.min(0.15, Math.max(0.085, M.ringRadius(y, 0.02) * 1.02))
          : HEADBAND.radius;
        const m = gearMesh(
          new THREE.TorusGeometry(radius, HEADBAND.tube, HEADBAND.seg, HEADBAND.ring),
          hex, 'accessory-headband',
        );
        aim(m, new THREE.Vector3(0, 0, 1), upUnit); // the torus hole looks up the skull
        m.position.copy(upUnit).multiplyScalar(y);
        rig.add(m); meshes.push(m);
      } else {
        // the eye line sits a little under the temples
        const y = M ? M.widestY - EYE_DROP_M : up.length() * HEAD_FRAC.shades;
        const m = gearMesh(new THREE.BoxGeometry(SHADES.w, SHADES.h, SHADES.d), hex, 'accessory-shades');
        aim(m, new THREE.Vector3(0, 0, 1), frontUnit);
        m.position.copy(upUnit).multiplyScalar(y)
          .addScaledVector(frontUnit, reach * SHADES_FRONT_FRAC);
        rig.add(m); meshes.push(m);
      }
    } else if (kind === 'wristbands') {
      for (const side of ['l', 'r']) {
        const hand = findNode(root, BONE.hand[side]);
        if (!hand) continue;
        const rig = mount(hand, `accessory-wrist-${side}`);
        const fore = localOf(rig, findNode(root, BONE.foreArm[side]));
        // toward the elbow: the band sits just up the arm from the wrist joint
        const dir = fore && fore.length() > 1e-4 ? fore.clone().normalize() : new THREE.Vector3(0, 1, 0);
        const m = gearMesh(
          new THREE.CylinderGeometry(WRISTBAND.radius, WRISTBAND.radius, WRISTBAND.height, WRISTBAND.seg),
          hex, `accessory-wristband-${side}`,
        );
        aim(m, new THREE.Vector3(0, 1, 0), dir);
        m.position.copy(dir).multiplyScalar(WRIST_UP_M);
        rig.add(m); meshes.push(m);
      }
      if (!meshes.length) return null;
    }

    let dead = false;
    const dispose = () => {
      if (dead) return;
      dead = true;
      for (const m of meshes) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose();
      }
      for (const r of rigs) r.removeFromParent();
    };
    return { meshes, dispose };
  } catch (e) {
    console.warn('[skk] accessory unavailable:', e);
    return null; // cosmetic only — never block a character build
  }
}
