// CREW ACCESSORIES — a headband or wristbands in the crew's accent colour,
// PRINTED ON THE BODY.
//
// Dev, on his phone, 2026-08-28: "wristbands and headbands look crazy still" —
// with a screenshot of Akron's #2 wearing two thick black cylinders hanging off
// her wrists at odd angles. That is what the first cut was: a torus and two
// cylinders bolted to the Head and Hand bones, sized off measured head/arm
// numbers and aimed down a bone axis. A primitive on a bone cannot win, for
// exactly the reason the jersey CARDS could not (see jerseyDecals.js): the arm
// is skinned to four joints and a cylinder is welded to one, so the moment the
// wrist bends the band shears off the arm; a cylinder has one radius and a
// forearm does not; and the band's own axis is the bone's axis, which on these
// auto-rigs is a couple of degrees off the limb it drives.
//
// So a band is no longer a shape ON the body — it IS the body. Each band is a
// SKINNED PATCH cut from the body mesh's own triangles, carrying the body's own
// `skinIndex`/`skinWeight`, bound to the body's own skeleton and pushed 3 mm out
// along its own normals. The GPU skins it with exactly the same maths it skins
// the arm with, so it rides the walk, the kick and the dance for free, it can
// never hang off a silhouette it is cut from, and it costs 60–1900 triangles
// (mesh density; the crossers are alpha-zero) and ZERO per-frame JavaScript. Same technique, same helpers, same
// grazing fade as the shirt print — see `jerseyDecals.js`, which exports the
// generic half of the machinery for this file to share.
//
// WHICH triangles is the whole design, and it is measured, not guessed:
//  - a WRISTBAND is the ring of forearm 2.5–5.5 cm proximal of the WRIST JOINT
//    (the `Hand` bone origin) along the forearm's own axis. Hand-dominant
//    triangles inside that band join it — the knuckle side is already excluded
//    by the distance test, and the cloth right at the wrist is skinned partly to
//    the hand on every one of these rigs.
//  - a HEADBAND is the 2.5 cm ring of skull at the BROW LINE — `measureHead`'s
//    EYE LINE lifted by BROW_OVER_EYE_M — round the full circumference, with
//    the HAIR struck off it (see `cullHairShell`).
//
// SHADES ARE GONE. There is no convincing skinned form for a visor: it is not
// on the surface of the head, it stands off it, and standing off the head is
// the entire defect this round exists to kill. `casts.json` re-cast every pair
// as a headband.
//
// UNITS. These rigs park the armature at scale 0.01 and each archetype's bind
// basis is rotated a little differently, so everything below is stated in a RIG
// FRAME — the mount bone with its bind rotation and bind scale cancelled — and
// every number is literal METRES on the finished 2.05 m player, landing the
// same way on all 19 archetypes.
import * as THREE from 'three';
import { labL } from './kits.js';
import {
  boneFrames, frameScale, skinPatchGeometry, applyGrazingFade, bindPatchToBody,
} from './jerseyDecals.js';

/** The vertex attribute a band carries: metres from the band's own centre line,
 *  along the band's axis. The fragment shader turns it into the band's EDGES —
 *  see `bandEdgeShader`. */
export const BAND_ATTR = 'aBandD';

/** The vocabulary casts.json may ask for. `shades` was retired this round. */
export const ACCESSORY_KINDS = ['none', 'headband', 'wristbands'];

/** How far the band is pushed off the body along each vertex's own normal.
 *  It is not clearance — the band IS the surface — only enough to win the depth
 *  test against the skin it is a copy of. Half the jersey print's 4 mm: a band
 *  wraps a limb, so a lift that reads as nothing on a flat chest reads as a
 *  sleeve standing off a 4 cm wrist. */
export const BAND_LIFT_M = 0.003;
/** The wristband, in metres PROXIMAL of the wrist joint along the forearm axis:
 *  a 3 cm cuff starting 2.5 cm up the arm, which is where a sweatband sits and
 *  clear of the knuckles either way the hand is turned. */
export const WRIST_BAND = { near: 0.025, far: 0.055 };
/** The headband's width, metres, centred on the brow line. */
export const HEAD_BAND_M = 0.025;
/** CLEAR AIR between two shells, metres — the gap that says "this is not the
 *  same surface any more". See `cullHairShell`: a fixed radius offset cannot do
 *  this job, because a skull is an EGG (a good 2 cm deeper than it is wide) that
 *  narrows another 2 cm over the height of the slice, so any offset generous
 *  enough to keep the back of a real head lets a fringe in, and any offset tight
 *  enough to stop the fringe shaves the head. A GAP does not care about either:
 *  the scalp's own samples run continuously, and a puff sits centimetres of
 *  nothing outside them. */
export const SKULL_PAD_M = 0.015;
/** Wedges the skull is split into when hunting for its own surface. 24 is 15°
 *  each — narrow enough that the skull's radius barely changes inside one, wide
 *  enough that every wedge of a low-poly head has vertices in it. */
export const HAIR_SECTORS = 24;
/** Under this many triangles a band is not a band — an unexpected rig, a body
 *  the window missed, a statue mesh with no skin weights at all. Ship nothing
 *  rather than confetti. */
export const MIN_BAND_TRIS = 4;
/** How far the band's edge is FEATHERED, metres.
 *
 *  A patch is made of WHOLE triangles, so its border is ragged by up to a
 *  triangle — on the chest that is hidden by printing the artwork inside the
 *  cut (`WINDOW_PAD_M`), but a band's border IS the artwork, and on a 3 cm cuff
 *  a body triangle is a third of the whole band. Shot at 30 cm on Akron's #2 it
 *  read as a torn strip of tape (`bands/close-wrists-akron-2` in the first
 *  pass). So the band's edges are drawn by ALPHA rather than by the cut: every
 *  vertex carries its own distance from the centre line, the fragment shader
 *  fades the last 4 mm, and the ragged geometry ends well outside anything the
 *  eye can see. Cheap — one float per vertex, no per-frame work.
 *
 *  The distance is interpolated and the fade taken PER FRAGMENT, which matters:
 *  taken per vertex, a single coarse triangle straddling the whole band has both
 *  its ends outside it and the band would vanish down the middle. */
export const BAND_FEATHER_M = 0.004;
/** A band fades on the last few degrees of the rim ONLY — see
 *  `jerseyDecals.grazingFadeShader`; the print's own numbers put a stripe down
 *  every wrinkle in a wrist. */
export const BAND_GRAZE = { from: 0.03, to: 0.16 };

/** LAST-RESORT brow height, as a fraction of the head's height above the `Head`
 *  joint — only for a rig whose face can't be found at all (see `eyeLine`).
 *  0.55 is the mean of the 20 archetypes' measured brow / `head_end` height,
 *  and it is a poor rule on purpose-built hair: on arch-puff `head_end` is up
 *  in the afro and this lands the band 8 cm high. It exists so an unknown rig
 *  gets a band somewhere sane, not so any shipped rig uses it. */
export const HEAD_FRAC = { headband: 0.55 };
/** How far OVER the measured eye line the band's CENTRE rides, metres.
 *
 *  Dev, on his phone, 2026-08-28, with Memphis #36 on Winter Classic: "the
 *  headband on the face" — a band ACROSS THE EYES. What put it there was the
 *  rule this replaces: the band rode `widestY`, the first local maximum of the
 *  head's WIDTH scanning up from the chin, plus a hand-tuned 5 cm. That hunt
 *  fires on only 4 of the 20 rigs and runs to its cap on the other 16, so for
 *  most of the league the band's height was really "the lowest head vertex plus
 *  17.8 cm" — and the Head joint sits anywhere from 2.3 cm to 8.6 cm above the
 *  chin depending on the rig, a 6 cm spread for a 2.5 cm band to absorb.
 *
 *  4.8 cm is measured, and it is bigger than "just over the eyebrow" for a
 *  reason: on these rigs the brow ridge sits ~3 cm over the eye line and the
 *  hairline ~6 cm over it, so this parks the band's lower edge on the FOREHEAD
 *  — over every rig's brow, under most rigs' hair. */
export const BROW_OVER_EYE_M = 0.048;
/** Where the eye line sits above the slice at which the face's front profile
 *  FALLS OFF THE NOSE, metres. These heads are low-poly with painted features:
 *  the profile leaves the nose at the middle of the bridge, and the eyes the
 *  texture paints sit about this much higher. Measured across the 20 rigs
 *  (`heads/probe-brow.mjs` + the ruler shots). */
export const EYE_OVER_FALL_M = 0.022;
/** Where the eye line sits above the NOSE TIP, metres — the answer for a face
 *  whose profile is too shallow to fall off its own nose (arch-shaggy's is:
 *  6 mm of nose over 8 cm of face). */
export const EYE_OVER_NOSE_M = 0.043;
/** How far above the nose tip a fall can be and still be the eye socket,
 *  metres. Further up than this and the walk has climbed something else — the
 *  hairline on arch-braids — and the nose tip answers instead. */
export const FALL_SPAN_M = 0.045;
/** Slice spacing when reading the face's front profile, metres. Fine enough to
 *  separate a nose from a brow, coarse enough that every slice of a 1000-vertex
 *  low-poly head has samples in it. */
export const PROFILE_STEP_M = 0.006;
/** Half-width of the face's CENTRE COLUMN, metres: the profile is read down the
 *  mid-sagittal strip, where the nose and the brow are and the ears are not. */
export const FACE_COLUMN_M = 0.03;
/** How far the face's front profile has to FALL off its own running maximum for
 *  the nose to be behind us. 1.5 cm: bigger than any wobble in a low-poly
 *  cheek, smaller than every one of the 20 rigs' nose-to-eye drop (2.6–4.2 cm
 *  measured). It is also what keeps HAIR out of the hunt — a braid or a puff
 *  hanging over the forehead reaches further forward than the nose does, but it
 *  is above the drop, and the walk has already stopped. */
export const EYE_DROP_M = 0.015;
/** Fallbacks in metres for a rig with no `head_end` / `headfront` helper. */
export const HEAD_FALLBACK = { up: 0.23, front: 0.10 };

const BONE = {
  head: /^(mixamorig:)?head$/i,
  headEnd: /head_?end/i,
  headFront: /head_?front/i,
  hand: { l: /^(mixamorig:)?left_?hand$|^hand\.l$/i, r: /^(mixamorig:)?right_?hand$|^hand\.r$/i },
  foreArm: {
    l: /^(mixamorig:)?left_?(fore|lower)arm$|^(fore)?arm\.l$/i,
    r: /^(mixamorig:)?right_?(fore|lower)arm$|^(fore)?arm\.r$/i,
  },
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
 *
 * Nothing is ever LEFT hanging off it now — a band is a patch next to the body,
 * not a child of a bone. The group exists only for the length of the build, as
 * the frame every measurement below is stated in (its inverse world matrix is
 * what `boneFrames` places the body's vertices with), and it is unhooked again
 * before `attachAccessory` returns.
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
 * WHERE THE EYES ARE, read off the face's own front profile.
 *
 * A head is not a shape a fraction can find. `head_end` is at the top of the
 * AFRO on arch-puff and at the top of the skull on arch-bald; the `Head` joint
 * sits 2.3 cm above the chin on one rig and 8.6 cm on another. The one thing
 * all 20 of these faces have, in the same place, modelled honestly, is a NOSE
 * — and the fall off the end of it.
 *
 * So: slice the face's CENTRE COLUMN (the mid-sagittal strip — no ears, no
 * temples) every `PROFILE_STEP_M` and take how far FORWARD each slice reaches.
 * Walking up from the chin that profile climbs the lips, peaks at the nose tip
 * and then falls away hard into the sockets. The first slice that has fallen
 * `EYE_DROP_M` off the running maximum is where the face LEAVES the nose; the
 * eyes these low-poly heads paint sit `EYE_OVER_FALL_M` above that, and the
 * sum is what comes back. Because the walk STOPS there, hair hanging over the
 * forehead — which reaches further forward than any nose on these rigs (+2.7 cm
 * on arch-puff, +1.9 cm on arch-braids) — is never even looked at.
 *
 * Measured against all 20 rigs shot front-on with a projected ruler
 * (`heads/probe-brow.mjs`, `heads/ruler-*.png`).
 *
 * @param {ArrayLike<number>} ys each sample's height along the head axis
 * @param {ArrayLike<number>} fs how far forward it reaches
 * @param {ArrayLike<number>} ss how far off the mid-sagittal plane it sits
 * @returns {number|null} the eye line in rig metres above the `Head` joint
 */
export function eyeLine(ys, fs, ss, low, rise) {
  const n = ys?.length ?? 0;
  if (n < 50 || !(rise > low)) return null;
  const N = Math.ceil((rise - low) / PROFILE_STEP_M) + 1;
  if (N < 6) return null;
  const prof = new Float64Array(N).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Math.abs(ss[i]) > FACE_COLUMN_M) continue;
    const k = Math.floor((ys[i] - low) / PROFILE_STEP_M);
    if (k < 0 || k >= N) continue;
    if (!(prof[k] >= fs[i])) prof[k] = fs[i];        // NaN-safe max
  }
  // A 3-slice median over the profile. A low-poly head leaves EMPTY slices and
  // the odd slice whose only centre-column sample is the BACK of the skull;
  // either one is a cliff the walk below would stop at, and neither is a face.
  const med = new Float64Array(N).fill(NaN);
  for (let k = 0; k < N; k++) {
    const w = [prof[k - 1], prof[k], prof[k + 1]].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (w.length) med[k] = w[(w.length - 1) >> 1];
  }
  const at = (k) => low + (k + 0.5) * PROFILE_STEP_M;
  let max = -Infinity;
  let maxK = -1;
  let seen = 0;
  for (let k = 0; k < N; k++) {
    const f = med[k];
    if (!Number.isFinite(f)) continue;
    // the nose has to have been climbed before its end can be found
    if (seen >= 3 && f <= max - EYE_DROP_M) {
      // A fall a long way over the nose tip is not the socket — it is the walk
      // finally coming off something else it climbed (arch-braids' hairline
      // reaches 1.2 cm further forward than her nose does). Fall back to the
      // nose itself, which is never wrong by more than the face is deep.
      return at(k) - at(maxK) > FALL_SPAN_M
        ? at(maxK) + EYE_OVER_NOSE_M
        : at(k) + EYE_OVER_FALL_M;
    }
    // `>=`, not `>`: a nose peaks over two or three slices on a low-poly head
    // and it is the LAST of them the face falls off, not the first
    if (f >= max) { max = f; maxK = k; }
    seen++;
  }
  // no fall at all: a face too shallow to leave one
  return maxK >= 0 ? at(maxK) + EYE_OVER_NOSE_M : null;
}

/**
 * The head this rig actually has, in rig metres, sampled from the vertices
 * SKINNED to it — the same trick the cleats use to find the foot.
 *
 * It reports the skull's extent above and below the `Head` joint (which sits
 * at the neck, not the chin, so the head hangs below it too), how far forward
 * the face reaches, and the measured EYE LINE (`eyeLine`).
 *
 * @param {THREE.Vector3} [frontAxis] the head's own forward, from `headAxes`.
 *   Without it there is no face to read and `eyeY` comes back null.
 * @returns {{rise:number, low:number, front:number, eyeY:number|null}|null}
 */
export function measureHead(root, headBone, rig, up, frontAxis = null) {
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
    // The head's own forward, and the sideways that completes the frame. The
    // eye hunt is stated in them, so a head whose bind basis is a few degrees
    // off (every one of these auto-rigs is) still reads its own face.
    const fwd = frontAxis && frontAxis.length() > 1e-4
      ? frontAxis.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
    const side = new THREE.Vector3().crossVectors(axis, fwd).normalize();
    const v = new THREE.Vector3();
    const step = Math.max(1, Math.floor(pos.count / 12000));
    const ys = [];
    const fs = [];
    const ss = [];
    let rise = -Infinity, low = Infinity, front = 0;
    for (let i = 0; i < pos.count; i += step) {
      let hw = 0;
      for (let kk = 0; kk < 4; kk++) if (ji.getComponent(i, kk) === idx) hw += w.getComponent(i, kk);
      if (hw < 0.5) continue;                        // the skull, not the neck
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const y = v.dot(axis);
      ys.push(y);
      fs.push(v.dot(fwd));
      ss.push(v.dot(side));
      if (y > rise) rise = y;
      if (y < low) low = y;
      if (v.z > front) front = v.z;
    }
    if (ys.length < 50 || !Number.isFinite(rise) || !Number.isFinite(low)) return null;
    const eyeY = frontAxis ? eyeLine(ys, fs, ss, low, rise) : null;
    return { rise, low, front, eyeY };
  } catch { return null; }
}

// ---- which joint owns a vertex --------------------------------------------

const bare = (n) => String(n ?? '').replace(/^mixamorig:/i, '');

/** `'l'`, `'r'` or null — every naming convention these rigs ship with
 *  (`LeftForeArm`, `LeftLowerArm`, `forearm.L`, `hand_r`). */
export function jointSide(name) {
  const n = bare(name).toLowerCase();
  if (/^left|[._-]l$|[._-]l[._-]/.test(n)) return 'l';
  if (/^right|[._-]r$|[._-]r[._-]/.test(n)) return 'r';
  return null;
}

/** The forearm link — `LeftForeArm` / `LeftLowerArm` / `forearm.L`. */
export const isForeArmJoint = (name) => /(fore|lower)arm/i.test(bare(name));
/** The hand, fingers included: a finger is distal of the wrist, so the band's
 *  own distance test throws it out and there is nothing to gain by naming it. */
export const isHandJoint = (name) => /hand/i.test(bare(name));
/** The skull. `head_end` / `headfront` are HELPER bones — they carry no skin,
 *  but a rig that welded a stray vertex to one would put it on the crown. */
export const isHeadJoint = (name) => /head/i.test(bare(name)) && !/(end|front|top|tip|_nub)/i.test(bare(name));

// ---- cutting a band out of the body ---------------------------------------

/**
 * Every vertex of the body placed in the band's own RIG FRAME, with the two
 * things a band selection asks of it: does the right JOINT own it, and how far
 * along the band's axis does it sit.
 *
 * A vertex belongs to a joint when that joint holds the LARGEST share of its
 * weight — the same "dominant joint" rule the jersey print uses to tell a
 * shoulder from a braid. It is placed with its own linear blend of the bind
 * maps, the same weighted sum the GPU skins with, because these rigs bake a
 * different accumulated scale into each link and borrowing one bone's transform
 * reads a four-joint vertex centimetres out.
 *
 * One pass over the vertices, once per band at build. Nothing runs per frame.
 *
 * @param {THREE.SkinnedMesh} body
 * @param {{frames:object[], joints:Set<number>, axis:THREE.Vector3,
 *   origin:THREE.Vector3}} o `frames` from `boneFrames(body, rigInv)`;
 *   `joints` the skeleton slots that may own a vertex of this band; `axis` the
 *   unit direction the band is measured along; `origin` the rig-metre point
 *   where that measurement is zero (the wrist joint, the head joint)
 * @returns {{ok:Uint8Array, d:Float32Array, x:Float32Array, y:Float32Array,
 *   z:Float32Array, axis:THREE.Vector3, count:number}|null}
 */
export function bandVertices(body, { frames, joints, axis, origin }) {
  const geo = body?.geometry;
  const pos = geo?.getAttribute?.('position');
  if (!pos?.count) return null;
  const si = geo.getAttribute?.('skinIndex');
  const sw = geo.getAttribute?.('skinWeight');
  if (!si || !sw) return null; // a statue rig has nothing to select on
  const N = pos.count;
  const ok = new Uint8Array(N);
  const d = new Float32Array(N);
  const X = new Float32Array(N); const Y = new Float32Array(N); const Z = new Float32Array(N);
  const ax = axis.clone().normalize();
  const v = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.fromBufferAttribute(pos, i);
    p.set(0, 0, 0);
    let dom = -1; let domW = 0; let used = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (!(w > 0)) continue;
      const j = si.getComponent(i, k);
      if (w > domW) { domW = w; dom = j; }          // ties go to the first
      const f = frames[j];
      if (!f?.xform) continue;
      tmp.copy(v).applyMatrix4(f.xform);
      p.addScaledVector(tmp, w);
      used += w;
    }
    if (used > 0) p.multiplyScalar(1 / used);
    else p.copy(v);                                 // no slot had a usable transform
    X[i] = p.x; Y[i] = p.y; Z[i] = p.z;
    d[i] = tmp.copy(p).sub(origin).dot(ax);
    ok[i] = dom >= 0 && joints.has(dom) ? 1 : 0;
  }
  return { ok, d, x: X, y: Y, z: Z, axis: ax, count: N };
}

/**
 * STRIKE THE HAIR OFF A HEAD BAND.
 *
 * These auto-rigs skin an afro-puff, a stack of locs and a ponytail to the HEAD
 * itself, and they are one welded shell under one material on an atlas whose
 * islands overlap — so neither the joint, nor the geometry, nor the texel tells
 * a forehead from a fringe hanging in front of it. What does is that THE SKULL
 * IS THE INNERMOST SURFACE: in any direction from the head's own axis, the
 * scalp comes first and anything past it is hair.
 *
 * So the slice is split into `sectors` wedges and each wedge's samples are
 * walked OUTWARD from the nearest: the scalp's own samples run continuously
 * (its radius drifts by millimetres between neighbours, egg-shaped and tapering
 * though it is), and the first gap of `pad` CLEAR AIR is where the head stops
 * and the hair starts. Everything past that gap is struck off.
 *
 * A rig whose hair is MODELLED INTO the forehead (arch-puff's starts on it) has
 * no inner skull to find and no gap to cut at, so the wedge's nearest surface IS
 * the hairline and the band prints on it — which is what a headband over a
 * fringe looks like, and far better than a bare arc.
 *
 * Mutates `sel.ok` in place.
 * @returns {{cut:Float64Array, culled:number}} `cut` is each wedge's outer edge
 *   of skull, metres from the head axis (Infinity = nothing to cut there)
 */
export function cullHairShell(sel, { origin, lo, hi, pad = SKULL_PAD_M, sectors = HAIR_SECTORS }) {
  const axis = sel.axis;
  const u = new THREE.Vector3(Math.abs(axis.x) > 0.9 ? 0 : 1, 0, Math.abs(axis.x) > 0.9 ? 1 : 0);
  u.crossVectors(axis, u).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const wedge = Array.from({ length: sectors }, () => []);
  const rad = new Float32Array(sel.count);
  const p = new THREE.Vector3();
  // the slice is grown by a whole band either side: a hair triangle can span
  // the band without landing a single vertex inside it
  const near = lo - HEAD_BAND_M;
  const far = hi + HEAD_BAND_M;
  for (let i = 0; i < sel.count; i++) {
    if (!sel.ok[i]) continue;
    if (sel.d[i] < near || sel.d[i] > far) continue;
    p.set(sel.x[i], sel.y[i], sel.z[i]).sub(origin).addScaledVector(axis, -sel.d[i]);
    const a = Math.atan2(p.dot(w), p.dot(u));
    const s = Math.min(sectors - 1, Math.max(0, Math.floor(((a + Math.PI) / (Math.PI * 2)) * sectors)));
    rad[i] = p.length();
    wedge[s].push(i);
  }
  const cut = new Float64Array(sectors).fill(Infinity);
  let culled = 0;
  for (let s = 0; s < sectors; s++) {
    const list = wedge[s];
    if (list.length < 2) continue;
    list.sort((a, b) => rad[a] - rad[b]);
    let edge = Infinity;
    for (let k = 1; k < list.length; k++) {
      if (rad[list[k]] - rad[list[k - 1]] > pad) { edge = rad[list[k - 1]]; break; }
    }
    cut[s] = edge;
    if (!Number.isFinite(edge)) continue;
    for (const i of list) if (rad[i] > edge) { sel.ok[i] = 0; culled++; }
  }
  return { cut, culled };
}

/**
 * The body triangles that make up the band: every vertex owned by the right
 * joint (and not struck off as hair), and the triangle's own span along the
 * band axis OVERLAPPING the band.
 *
 * The SPAN — rather than the centre the jersey print uses — is what makes a
 * band a band. A print is 0.4 m across a chest mesh whose triangles are
 * millimetres; a wristband is 3 cm on a forearm whose triangles are a centimetre
 * or more, so a centre test drops every ring that straddles the band and can
 * cut the cuff clean in half. Taking anything the band passes THROUGH gives a
 * closed ring on every rig, at the cost of at most one row of triangles either
 * side.
 *
 * @param {THREE.BufferGeometry} geo the body's geometry
 * @param {{ok:Uint8Array, d:Float32Array}} sel from `bandVertices`
 * @returns {number[]} flat: three BODY vertex indices per face
 */
export function bandTriangles(geo, sel, lo, hi) {
  const index = geo?.getIndex?.();
  const n = geo?.getAttribute?.('position')?.count ?? 0;
  const tris = index ? Math.floor(index.count / 3) : Math.floor(n / 3);
  const out = [];
  for (let t = 0; t < tris; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    if (!sel.ok[a] || !sel.ok[b] || !sel.ok[c]) continue;
    if (Math.max(sel.d[a], sel.d[b], sel.d[c]) < lo) continue;
    if (Math.min(sel.d[a], sel.d[b], sel.d[c]) > hi) continue;
    out.push(a, b, c);
  }
  return out;
}

// ---- the two bands --------------------------------------------------------

/** Skeleton slots whose bone name passes `pred`. */
function slotsWhere(frames, pred) {
  const out = new Set();
  frames.forEach((f, i) => { if (pred(f.name)) out.add(i); });
  return out;
}

/** The ring of forearm one wristband is cut from, in the WRIST's own frame. */
function wristBand(root, body, side) {
  const hand = findNode(root, BONE.hand[side]);
  if (!hand) return null;
  const rig = boneRig(root, hand, `accessory-wrist-frame-${side}`);
  try {
    // toward the elbow: the band sits just up the arm from the wrist joint, and
    // the FOREARM's own axis is the only thing that keeps it round the wrist
    // instead of standing upright in world space when the arm swings
    const fore = localOf(rig, findNode(root, BONE.foreArm[side]));
    const axis = fore && fore.length() > 1e-4 ? fore.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const frames = boneFrames(body, new THREE.Matrix4().copy(rig.matrixWorld).invert());
    const joints = slotsWhere(
      frames,
      (n) => jointSide(n) === side && (isForeArmJoint(n) || isHandJoint(n)),
    );
    if (!joints.size) return null;
    const sel = bandVertices(body, { frames, joints, axis, origin: new THREE.Vector3() });
    if (!sel) return null;
    return {
      name: `accessory-wristband-${side}`,
      triangles: bandTriangles(body.geometry, sel, WRIST_BAND.near, WRIST_BAND.far),
      scale: frameScale(frames),
      sel,
      at: (WRIST_BAND.near + WRIST_BAND.far) / 2,
      half: (WRIST_BAND.far - WRIST_BAND.near) / 2,
    };
  } finally { rig.removeFromParent(); }
}

/** Where the headband's centre line sits on THIS head, in rig metres above the
 *  `Head` joint. The measured eye line wins; `head_end` is the last resort.
 *  Split out so the tests can hold the rule without building a whole band. */
export function browHeight(M, up) {
  if (Number.isFinite(M?.eyeY)) return M.eyeY + BROW_OVER_EYE_M;
  return (up?.length?.() ?? 0) * HEAD_FRAC.headband;
}

/** The ring of skull the headband is cut from, in the HEAD's own frame. */
function headBand(root, body) {
  const head = findNode(root, BONE.head);
  if (!head) return null;
  const rig = boneRig(root, head, 'accessory-head-frame');
  try {
    const { up, front } = headAxes(root, rig);
    // the measured EYE LINE wins; `head_end` is the fallback
    const M = measureHead(root, head, rig, up, front);
    const at = browHeight(M, up);
    const lo = at - HEAD_BAND_M / 2;
    const hi = at + HEAD_BAND_M / 2;
    const frames = boneFrames(body, new THREE.Matrix4().copy(rig.matrixWorld).invert());
    const joints = slotsWhere(frames, isHeadJoint);
    if (!joints.size) return null;
    const origin = new THREE.Vector3();
    const sel = bandVertices(body, {
      frames, joints, axis: up.clone().normalize(), origin,
    });
    if (!sel) return null;
    cullHairShell(sel, { origin, lo, hi });
    return {
      name: 'accessory-headband',
      triangles: bandTriangles(body.geometry, sel, lo, hi),
      scale: frameScale(frames),
      sel,
      at,
      half: HEAD_BAND_M / 2,
    };
  } finally { rig.removeFromParent(); }
}

// ---- the material ---------------------------------------------------------

/** THE BAND'S OWN EDGES, drawn in alpha off `BAND_ATTR` — see BAND_FEATHER_M.
 *  `uBandHalf` is half the band's width in metres, so one shader program serves
 *  a 3 cm cuff and a 2.5 cm brow band alike. */
function bandEdgeShader(half) {
  return (sh) => {
    sh.uniforms.uBandHalf = { value: half };
    sh.uniforms.uBandFeather = { value: BAND_FEATHER_M };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${BAND_ATTR};\nvarying float vBandD;`)
      .replace('#include <begin_vertex>', `\tvBandD = ${BAND_ATTR};\n#include <begin_vertex>`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBandHalf;\nuniform float uBandFeather;\nvarying float vBandD;')
      .replace('#include <alphatest_fragment>', '\tdiffuseColor.a *= 1.0 - smoothstep(uBandHalf, uBandHalf + uBandFeather, abs(vBandD));\n#include <alphatest_fragment>');
  };
}

/** Flat, not lit: the accent has to READ on a 120 px player in a night game,
 *  and a band is 3 mm of a limb — a lit material at that size is a smudge.
 *  `depthWrite:false` with the depth TEST left on is what puts the forearm in
 *  front of the far wristband; `polygonOffset` backs up the 3 mm lift against
 *  z-fighting at grazing angles; the grazing fade softens the silhouette rim and
 *  the edge shader draws the band's own two edges.
 *  @param {number} half half the band's width, metres */
function bandMaterial(hex, half) {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex ?? '#101014'),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  applyGrazingFade(mat, 'accessoryBand', { ...BAND_GRAZE, extra: bandEdgeShader(half) });
  mat.userData.owned = true;
  return mat;
}

/**
 * Print one accessory ON a built character.
 * @param {{group:THREE.Object3D}} char
 * @param {string} kind one of ACCESSORY_KINDS
 * @param {string} hex the crew's accent colour
 * @param {{scale?:number}} [opts] accepted and IGNORED: the band is cut from
 *   the body, so a taller cast slot already carries a taller band. It stays in
 *   the signature because the call sites pass the cast's height and there is
 *   nothing for them to change.
 * @returns {{meshes:THREE.SkinnedMesh[], triangles:Record<string,number>,
 *   dispose:()=>void}|null} null when there's nothing to add — never throws,
 *   it's cosmetic
 */
export function attachAccessory(char, kind, hex, opts = {}) {
  void opts; // `scale` is the cast's height — the body already carries it
  if (!kind || kind === 'none' || !ACCESSORY_KINDS.includes(kind)) return null;
  let mat = null;
  const meshes = [];
  try {
    const root = char?.group;
    if (!root) return null;
    root.updateMatrixWorld(true);
    let body = null;
    root.traverse((o) => {
      if (!body && o.isSkinnedMesh && o.skeleton && !/^(accessory|jersey)-/.test(o.name ?? '')) body = o;
    });
    if (!body) return null;

    const bands = kind === 'headband'
      ? [headBand(root, body)]
      : [wristBand(root, body, 'l'), wristBand(root, body, 'r')];
    const triangles = {};
    for (const band of bands) {
      const n = band ? band.triangles.length / 3 : 0;
      if (!band || n < MIN_BAND_TRIS) continue;
      mat ??= bandMaterial(hex, band.half); // one material for both wrists
      const patch = new THREE.SkinnedMesh(
        skinPatchGeometry(body, band.triangles, {
          lift: BAND_LIFT_M,
          scale: band.scale,
          weld: true, // a wrist has uv seams and the lift tears the patch open at them
          // each vertex's own metres from the centre line: the band's EDGES
          attributes: [{ name: BAND_ATTR, value: (i) => band.sel.d[i] - band.at }],
        }),
        mat,
      );
      patch.name = band.name;
      patch.renderOrder = 2;
      patch.frustumCulled = false; // it rides a skeleton; its own bounds lie
      patch.userData.band = { kind, triangles: n, at: band.at ?? null, half: band.half };
      bindPatchToBody(patch, body, root);
      meshes.push(patch);
      triangles[band.name] = n;
    }
    if (!meshes.length) {
      mat?.dispose();
      return null;
    }

    let dead = false;
    const dispose = () => {
      if (dead) return;
      dead = true;
      for (const m of meshes) {
        m.removeFromParent();
        m.geometry.dispose();
        // the SKELETON is the body's; disposing it here would blank the player
      }
      mat?.dispose(); // shared by both wrists — freed once
    };
    return { meshes, triangles, dispose };
  } catch (e) {
    console.warn('[skk] accessory unavailable:', e);
    for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
    mat?.dispose();
    return null; // cosmetic only — never block a character build
  }
}

/** The band colour. Half the league's `accent` is near-black (#111111,
 *  #1A1A1A…), which vanishes on dark hair and deep skin — a band that cannot
 *  be seen is not a band. Below L* 25 the crew's secondary stands in. */
export function bandHexFor(team) {
  const accent = team?.colors?.accent;
  if (!accent) return team?.colors?.secondary ?? null;
  const dark = labL(accent) < 25;
  return (dark ? team?.colors?.secondary : accent) ?? accent;
}
