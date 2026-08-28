// JERSEY DECALS — the crew's mark on the chest and the back, and a number on
// every player. Dev, 2026-08-27: "team logos on the uniforms front and back
// with numbers"; the intro videos wear a BIG mark on the chest, so that's the
// bar — you should read who's out there from the dugout shot, and read WHO it
// is off the back of the shirt on the walk-up.
//
// The archetype GLBs are one skinned mesh sharing one atlas whose texels are
// re-used across UV islands (that's why cleats had to be tinted by geometry,
// see glbCharacters.applyCleatVertexTint) — painting a logo into that atlas
// would splatter it across faces and shoes. So the decal is GEOMETRY: two
// camera-facing planes parented to the chest bone, drawn from a 512² canvas.
//
// Everything here is metres in the CHARACTER's own space. The planes hang off
// a rig group whose transform cancels the chest bone's bind rotation + scale
// (bone-local units are 1/100 of a metre on these rigs, and each archetype's
// bind basis is a little different), so the offsets below are literal metres
// on a 2.05 m player and every archetype gets the same placement.
import * as THREE from 'three';
import { contrastDeltaL } from './kits.js';

/** The decal plane, in metres — a shade wider than these players' chests. */
export const PLANE_M = 0.40;
/** Canvas per face. 512² over 0.40 m ≈ 1280 px/m: the back number lands ~300 px
 *  tall, which still reads when a phone draws the player 120 px high. */
export const DECAL_PX = 512;
/** A full match dresses 16 players × 2 faces = 32 textures; 64 leaves room for
 *  the Locker captain and a kit change without ever evicting mid-match. */
export const DECAL_CACHE_MAX = 64;
/** Breathing room between the two marks on a face, metres. */
export const STACK_GAP_M = 0.02;
/** Plane centre, metres BELOW the chest bone. That bone sits at the COLLARBONE
 *  on these rigs (measured on arch-locs: Hips 0.98, Spine 1.46, shoulders 1.49,
 *  neck 1.55 in model metres, ×1.067 into player metres) — hang the plane off
 *  the bone itself and its top half is over bare shoulder and background, which
 *  is exactly where the first pass put the front number. Drop it half a plane
 *  and the 0.40 m square lands ON the vest: rig +0.01 down to −0.39, against a
 *  shirt that runs +0.03 to about −0.41. */
export const CHEST_DROP_M = 0.19;
/** How far the decal floats off the measured shirt surface. The measurement is
 *  taken in BIND POSE and the decal is rigid, but the chest is skinned to four
 *  joints and swells forward through an idle breath, never mind a kick — at
 *  0.012 the crown's ball punched straight through it on the turntable. This is
 *  the clearance at the CENTRE of a wrapped decal, so it holds all the way
 *  round instead of ballooning at the edges the way a flat card does. */
export const SURFACE_GAP_M = 0.02;
/** The decal BOWS to the chest instead of being a flat card: a flat 0.40 m
 *  plate on a 0.35 m chest stands 8 cm proud at its own edges, and the walk-up
 *  camera passes the player in near-profile — where that reads as a signboard
 *  hovering off his ribs. The bow is z = −c·x², with c measured off the shirt
 *  and clamped so a bad read can neither flatten it nor curl the mark out of
 *  sight (at x = 0.20 these bound the edge drop to 2–9 cm). */
const CURVE_MIN = 0.5;
const CURVE_MAX = 2.25;
const CURVE_DEFAULT = 1.4;
/** Where the flank is sampled to solve that fall-off, metres off centre. */
const RIB_X = 0.10;
/** Half-width of the band we measure the shirt in — the trunk, not the arms. */
const TORSO_HALF_W = 0.12;
/** Used only when a character has no skinned geometry to measure (the fallback
 *  model): the mean chest/back surface across the archetype set. */
const FALLBACK_DEPTH = { front: 0.16, back: -0.19, curveFront: CURVE_DEFAULT, curveBack: CURVE_DEFAULT };

const FONT_STACK = "'Archivo', system-ui, sans-serif";
/** Cap height as a fraction of the em box for Archivo 900. */
const CAP_RATIO = 0.72;
const INK_DARK = '#0b0c10';
const INK_LIGHT = '#f4f4f6';
/** Under this much L* between the mark and the kit it's wearing, the mark
 *  vanishes into the shirt (gold-on-gold, orange-on-orange, white-on-white —
 *  three crews' light kits carry a `-light` mark that is a plain copy of the
 *  dark one). Below the line the mark gets a patch to sit on. */
export const PATCH_DELTA_L = 20;
/** How much bigger than the mark the patch is drawn. */
const PATCH_PAD = 1.08;
const PATCH_ALPHA = 0.92;

/** The number reads in `ink` with a fat outline in the OTHER ink, so it holds
 *  its edge over a logo, over a light kit, over anything. */
export function oppositeInk(ink) {
  const n = parseInt(String(ink ?? '').replace('#', ''), 16);
  if (!Number.isFinite(n)) return INK_LIGHT;
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l < 0.5 ? INK_LIGHT : INK_DARK;
}

// ---- layout ---------------------------------------------------------------
// Rects are METRES on the 0.40 m plane: `y`/`x` are offsets of the mark's
// CENTRE from the plane centre (+y up, +x toward the player's left as you look
// at that face), `w`/`h` its box. A number's `w` is its CAP HEIGHT — the glyphs
// are as wide as they need to be.

/** Chest: the crew mark big and centred, the number small up on the left. */
export function layoutFront() {
  return { logo: { w: 0.34, h: 0.34, y: 0.06 }, num: { w: 0.10, y: 0.16, x: -0.10 } };
}

/** Back: the number is the hero, the crew mark rides above it. */
export function layoutBack() {
  return { num: { w: 0.26, y: 0.02 }, logo: { w: 0.16, y: 0.22 } };
}

/**
 * Squeeze the marks asked for onto one face, top to bottom, without overlap.
 * Both layouts ask for MORE than the plane holds (front .34 + .10, back
 * .26 + .16) — that's deliberate: it says "fill the shirt". Left alone they'd
 * collide and spill off the top, and a crew mark cut in half by a number is
 * the first thing anyone would notice. So: shrink both by the same factor
 * until they fit, stack them in the requested order, and settle the run
 * against the bottom edge if it hangs over.
 * @param {{key:string,w:number,h:number,x?:number,y:number}[]} items
 * @returns {Record<string,{x:number,y:number,w:number,h:number}>} centres + sizes, metres
 */
export function stackFace(items, { span = PLANE_M, gap = STACK_GAP_M } = {}) {
  const order = [...items].sort((a, b) => b.y - a.y); // top of the face first
  const gaps = gap * Math.max(0, order.length - 1);
  const sum = order.reduce((s, it) => s + it.h, 0);
  const k = sum + gaps > span ? (span - gaps) / sum : 1;
  const placed = [];
  let ceiling = span / 2;
  for (const it of order) {
    const h = it.h * k;
    const w = it.w * k;
    const top = Math.min(ceiling, it.y + h / 2);
    const half = span / 2 - w / 2;
    const x = Math.max(-half, Math.min(half, (it.x ?? 0) * k));
    placed.push({ key: it.key, x, y: top - h / 2, w, h });
    ceiling = top - h - gap;
  }
  const lowest = Math.min(...placed.map((p) => p.y - p.h / 2));
  const lift = lowest < -span / 2 ? -span / 2 - lowest : 0;
  const out = {};
  for (const p of placed) out[p.key] = { x: p.x, y: p.y + lift, w: p.w, h: p.h };
  return out;
}

/** The placed marks for one face — what the canvas actually draws. */
export function faceBoxes(side) {
  const L = side === 'back' ? layoutBack() : layoutFront();
  return stackFace([
    { key: 'logo', w: L.logo.w, h: L.logo.h ?? L.logo.w, x: L.logo.x ?? 0, y: L.logo.y },
    { key: 'num', w: L.num.w, h: L.num.h ?? L.num.w, x: L.num.x ?? 0, y: L.num.y },
  ]);
}

// ---- the texture ----------------------------------------------------------

/** Does this mark disappear into this kit? Pure, so the call is testable
 *  without a canvas: the mark's mean opaque colour against the shirt in L*. */
export function needsPatch(meanHex, kitHex) {
  if (!meanHex || !kitHex) return false;
  return contrastDeltaL(meanHex, kitHex) < PATCH_DELTA_L;
}

const meanCache = new Map(); // logo url -> '#rrggbb' mean opaque colour

/** The mark's own colour, averaged over its opaque pixels — once per file.
 *  Null when there's no canvas to read (node, a tainted image): no reading,
 *  no patch, the mark draws exactly as it always did. */
export function logoMeanHex(img) {
  const url = img?.src ?? '';
  if (!img) return null;
  if (meanCache.has(url)) return meanCache.get(url);
  let out = null;
  try {
    const n = 48; // plenty for a mean, and one 48² readback instead of 1024²
    const c = document.createElement('canvas');
    c.width = n; c.height = n;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, n, n);
    const px = g.getImageData(0, 0, n, n).data;
    let r = 0; let gg = 0; let b = 0; let w = 0;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a < 32) continue; // the marks are cut out; ignore the transparency
      r += px[i] * a; gg += px[i + 1] * a; b += px[i + 2] * a; w += a;
    }
    if (w > 0) {
      const hx = (v) => Math.round(v / w).toString(16).padStart(2, '0');
      out = `#${hx(r)}${hx(gg)}${hx(b)}`;
    }
  } catch { out = null; }
  meanCache.set(url, out);
  return out;
}

/** `patch` rides the key implicitly — it's a function of the mark and the kit
 *  hex, and two kits can share a mark AND an ink (hustlers wear the light mark
 *  on both) while only one of them needs the patch. */
export function decalKey(logoUrl, number, ink, side, patch = false) {
  return `${logoUrl}|${number}|${ink}|${side}${patch ? '|patch' : ''}`;
}

const cache = new Map(); // key -> CanvasTexture, insertion-ordered = LRU

export const decalCacheSize = () => cache.size;
export function clearDecalCache() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
  meanCache.clear();
}

const mToPx = (m) => (m / PLANE_M) * DECAL_PX;
const toX = (x) => DECAL_PX / 2 + mToPx(x);
const toY = (y) => DECAL_PX / 2 - mToPx(y);

/** A rounded slab for the mark to sit on when the kit would swallow it. */
function patchPath(ctx, cx, cy, w, h) {
  const r = Math.min(w, h) * 0.28;
  const x = cx - w / 2; const y = cy - h / 2;
  ctx.beginPath?.();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo?.(x + r, y);
  ctx.lineTo?.(x + w - r, y); ctx.quadraticCurveTo?.(x + w, y, x + w, y + r);
  ctx.lineTo?.(x + w, y + h - r); ctx.quadraticCurveTo?.(x + w, y + h, x + w - r, y + h);
  ctx.lineTo?.(x + r, y + h); ctx.quadraticCurveTo?.(x, y + h, x, y + h - r);
  ctx.lineTo?.(x, y + r); ctx.quadraticCurveTo?.(x, y, x + r, y);
  ctx.closePath?.();
}

function paintFace(logoImg, number, ink, side, patch) {
  const canvas = document.createElement('canvas');
  canvas.width = DECAL_PX; canvas.height = DECAL_PX;
  const ctx = canvas.getContext('2d');
  const box = faceBoxes(side);

  // The crew mark, aspect preserved inside its box.
  const iw = logoImg?.naturalWidth || logoImg?.width || 0;
  const ih = logoImg?.naturalHeight || logoImg?.height || 0;
  if (logoImg && iw && ih) {
    const b = box.logo;
    const s = Math.min(mToPx(b.w) / iw, mToPx(b.h) / ih);
    const w = iw * s; const h = ih * s;
    if (patch) {
      // gold on gold reads as nothing at all — give the mark a shirt of its own
      ctx.save();
      ctx.globalAlpha = PATCH_ALPHA;
      ctx.fillStyle = ink;
      patchPath(ctx, toX(b.x), toY(b.y), w * PATCH_PAD, h * PATCH_PAD);
      ctx.fill?.();
      ctx.restore();
    }
    ctx.drawImage(logoImg, toX(b.x) - w / 2, toY(b.y) - h / 2, w, h);
  }

  // The number, drawn LAST so it always wins — a jersey with no readable
  // number is a jersey nobody can call a play off.
  const text = String(number ?? '');
  if (text) {
    const b = box.num;
    let size = mToPx(b.h) / CAP_RATIO;
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    const maxW = mToPx(PLANE_M * 0.86);
    const w = ctx.measureText?.(text)?.width ?? 0;
    if (w > maxW && w > 0) {
      size *= maxW / w;
      ctx.font = `900 ${size}px ${FONT_STACK}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = oppositeInk(ink);
    ctx.strokeText(text, toX(b.x), toY(b.y));
    ctx.fillStyle = ink;
    ctx.fillText(text, toX(b.x), toY(b.y));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The chest (or back) of one player's shirt as a texture, cached: a whole crew
 * shares one mark and only the number changes, and a kit flip in the Locker
 * re-uses everything it already drew.
 * @param {HTMLImageElement|null} logoImg loaded crew mark, or null (number only)
 * @param {number|string} number
 * @param {string} ink the kit's number colour
 * @param {'front'|'back'} side
 * @param {string|null} kitHex the shirt the mark is going on (patch decision)
 * @returns {THREE.CanvasTexture} SHARED — never dispose it, the cache does
 */
export function decalTexture(logoImg, number, ink, side, kitHex = null) {
  const patch = needsPatch(logoMeanHex(logoImg), kitHex);
  const key = decalKey(logoImg?.src ?? '', number, ink, side, patch);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // touch = LRU
  const tex = paintFace(logoImg, number, ink, side, patch);
  cache.set(key, tex);
  while (cache.size > DECAL_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.get(oldest)?.dispose?.();
    cache.delete(oldest);
  }
  return tex;
}

// ---- the crew mark image --------------------------------------------------
// 1024² RGBA decodes to ~4 MB, so this cache stays TINY: a match needs two
// marks, the Locker one. The decal texture is what's kept — the source image
// is only needed while it's being drawn.
const LOGO_CACHE_MAX = 4;
const logoCache = new Map();

export function loadLogoImage(url) {
  if (!url) return Promise.resolve(null);
  const hit = logoCache.get(url);
  if (hit) { logoCache.delete(url); logoCache.set(url, hit); return hit; }
  const p = new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      // A missing mark must NOT cost the number — resolve null and paint on.
      img.onerror = () => { logoCache.delete(url); resolve(null); };
      img.src = url;
    } catch { resolve(null); }
  });
  logoCache.set(url, p);
  while (logoCache.size > LOGO_CACHE_MAX) logoCache.delete(logoCache.keys().next().value);
  return p;
}

// ---- the chest bone -------------------------------------------------------

/** Spine joints, best first. `Spine2`/`Spine1` are the Mixamo chest links. */
export const CHEST_PATTERNS = [/spine2/i, /spine1/i, /spine_02/i, /spine/i];

function walk(o, fn, depth = 0) {
  if (!o) return;
  fn(o, depth);
  for (const c of o.children ?? []) walk(c, fn, depth + 1);
}

/**
 * The joint the crew mark hangs off. Name priority first (a Mixamo rig means
 * exactly what it says), then DEPTH as the tie-break: the archetype rigs number
 * their spine DOWNWARD — `Spine02` is the belly, `Spine01` the ribs and plain
 * `Spine` the collarbone — so on those the last link in the chain is the chest
 * whatever the digits say. Both readings land on the same joint.
 * @returns {object|null}
 */
export function findChestBone(root) {
  const all = [];
  walk(root, (o, d) => all.push({ o, d }));
  const bones = all.filter((n) => n.o.isBone);
  const pool = bones.length ? bones : all.filter((n) => !n.o.isMesh);
  for (const re of CHEST_PATTERNS) {
    const hits = pool.filter((n) => re.test(n.o.name ?? ''));
    if (hits.length) return hits.reduce((a, b) => (b.d > a.d ? b : a)).o;
  }
  return null;
}

/**
 * Where this character's shirt actually IS, in rig metres. Measured, not
 * guessed: the archetypes differ by a good 5 cm front to back (arch-bald's
 * chest sits at +0.17, arch-locs' at +0.13), and a fixed offset would either
 * bury the mark inside the beefy ones or float it off the lean ones — and a
 * floating mark is exactly what the turntable shows off at 45°.
 *
 * In BIND POSE `bone.matrixWorld · boneInverse` IS the geometry→world map for
 * every vertex, whatever the rig did with node transforms (these GLBs park the
 * whole armature at scale 0.01), so this needs no assumptions about units.
 */
function measureShirt(root, bone, rig, dropM) {
  try {
    let skinned = null;
    root.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o; });
    const idx = skinned?.skeleton?.bones?.indexOf(bone) ?? -1;
    const bi = idx >= 0 ? skinned.skeleton.boneInverses?.[idx] : null;
    const pos = skinned?.geometry?.getAttribute?.('position');
    if (!bi || !pos) return FALLBACK_DEPTH;
    const m = new THREE.Matrix4().copy(rig.matrixWorld).invert()
      .multiply(new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, bi));
    const v = new THREE.Vector3();
    const step = Math.max(1, Math.floor(pos.count / 8000)); // ~8k samples is plenty
    // The shirt is sampled in three x columns: dead centre, and out at ±RIB_X
    // on each flank. Centre gives the depth, the pair gives the FALL-OFF —
    // how fast the chest turns away — which is what the decal has to follow.
    let front = -Infinity; let back = Infinity;
    let ribF = -Infinity; let ribB = Infinity;
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const ax = Math.abs(v.x);
      if (ax > TORSO_HALF_W) continue;                     // trunk, not arms
      if (Math.abs(v.y + dropM) > PLANE_M / 2) continue;   // the band the decal covers
      if (ax < 0.03) {
        if (v.z > front) front = v.z;
        if (v.z < back) back = v.z;
      } else if (ax > RIB_X - 0.025 && ax < RIB_X + 0.025) {
        if (v.z > ribF) ribF = v.z;
        if (v.z < ribB) ribB = v.z;
      }
    }
    if (!Number.isFinite(front) || !Number.isFinite(back)) return FALLBACK_DEPTH;
    return {
      front,
      back,
      curveFront: fallOff(front, ribF),
      curveBack: fallOff(-back, -ribB),
    };
  } catch { return FALLBACK_DEPTH; }
}

/** z = centre − c·x². Solve c from the rib sample, then clamp it: a flat card
 *  stands 8 cm proud of its own edges on a 0.35 m chest, a c that ran away
 *  would curl the mark round the ribs and out of sight. */
export function fallOff(centre, rib) {
  if (!Number.isFinite(centre) || !Number.isFinite(rib)) return CURVE_DEFAULT;
  const c = (centre - rib) / (RIB_X * RIB_X);
  return Math.min(CURVE_MAX, Math.max(CURVE_MIN, c));
}

/**
 * A 0.40 m square bowed onto the chest we just measured. This is a DECAL
 * PROJECTION, not a wrap: x stays put and only z follows the shirt, so the
 * artwork keeps its shape and the whole mark sits the same 2 cm off the
 * player. The first pass used a true cylindrical wrap on the torso's own
 * half-depth and it dived straight in behind a chest that is far flatter than
 * a circle — the crew mark lost both its flanks.
 */
function decalGeometry(curve) {
  const geo = new THREE.PlaneGeometry(PLANE_M, PLANE_M, 16, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, -curve * x * x); // 0 at the centre, falling away at the flanks
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  geo.userData.owned = true; // per-character: disposeCharacter() frees it
  return geo;
}

function decalMaterial(map) {
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  // GRAZING FADE. Print on a shirt disappears as the shirt turns away; a decal
  // does the opposite — the 2 cm it stands off the chest becomes ALL you see,
  // hanging past the player's outline. The walk-up camera sweeps right through
  // that angle. Fading the mark out as the surface turns edge-on costs nothing
  // legible (you can't read a number side-on) and kills the artefact, plus any
  // skinning lag: the chest skin is shared with two lower spine joints, so a
  // rigid decal on the chest bone leads the shirt through a torso twist.
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDecalN;\nvarying vec3 vDecalP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvDecalN = normalize(mat3(modelMatrix) * normal);\n\tvDecalP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDecalN;\nvarying vec3 vDecalP;')
      .replace('#include <alphatest_fragment>', '\tdiffuseColor.a *= smoothstep(0.14, 0.44, abs(dot(normalize(vDecalN), normalize(cameraPosition - vDecalP))));\n#include <alphatest_fragment>');
  };
  // one compiled program for every decal in the game, never shared with the
  // untouched basic materials (three keys its cache on the shader string)
  mat.customProgramCacheKey = () => 'jerseyDecal';
  return mat;
}

/**
 * Hang the crew mark and the number on one character's shirt.
 *
 * Sync: the planes go on immediately (hidden) and light up when the mark and
 * the display font have landed, so a slow logo never delays a player onto the
 * field. `ready` resolves once they're painted — the e2e pass waits on it.
 *
 * @param {{group:THREE.Object3D}} char a built character
 * @param {{logoUrl?:string, number?:number|string, ink?:string, hex?:string}} o
 * @returns {{front:THREE.Mesh, back:THREE.Mesh, ready:Promise<void>, dispose:Function}|null}
 */
export function attachJerseyDecals(char, { logoUrl = '', number = '', ink = null, hex = null } = {}) {
  try {
    const root = char?.group;
    if (!root) return null;
    root.updateMatrixWorld(true);
    const bone = findChestBone(root);
    if (!bone) return null;
    const paint = ink ?? oppositeInk(hex ?? INK_DARK);

    // The rig cancels the bone's bind rotation and its 1/100 scale, so what
    // hangs inside is plain metres with +Z the way the character faces (the
    // archetype spine joints come out near identity — X right, Y up the spine,
    // Z out through the sternum — but Hips and each archetype's own bake vary,
    // so cancel rather than trust).
    const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(bone.matrixWorld);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    rel.decompose(new THREE.Vector3(), q, s);
    const rig = new THREE.Group();
    rig.name = 'jersey-decals';
    rig.quaternion.copy(q).invert();
    rig.scale.setScalar(1 / (s.x || 1));
    bone.add(rig);
    rig.updateMatrixWorld(true);

    const depth = measureShirt(root, bone, rig, CHEST_DROP_M);
    const meshes = {};
    for (const side of ['front', 'back']) {
      const curve = side === 'front' ? depth.curveFront : depth.curveBack;
      const mesh = new THREE.Mesh(decalGeometry(curve ?? CURVE_DEFAULT), decalMaterial(null));
      mesh.position.set(
        0,
        -CHEST_DROP_M,
        side === 'front' ? depth.front + SURFACE_GAP_M : depth.back - SURFACE_GAP_M,
      );
      if (side === 'back') mesh.rotation.y = Math.PI;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false; // it rides a bone; the plane's own bounds lie
      mesh.visible = false;       // until the mark is painted
      mesh.name = `jersey-${side}`;
      rig.add(mesh);
      meshes[side] = mesh;
    }

    let dead = false;
    const ready = Promise.all([
      loadLogoImage(logoUrl),
      // Archivo comes off the page's webfont; drawing before it lands gives a
      // system-font number, and the canvas is cached, so it'd stay wrong.
      Promise.resolve(document?.fonts?.load?.(`900 100px ${FONT_STACK}`)).catch(() => null),
    ]).then(([img]) => {
      if (dead) return;
      for (const side of ['front', 'back']) {
        meshes[side].material.map = decalTexture(img, number, paint, side, hex);
        meshes[side].material.needsUpdate = true;
        meshes[side].visible = true;
      }
    }).catch(() => {});

    const dispose = () => {
      dead = true;
      for (const m of Object.values(meshes)) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose(); // the MAP is shared via the cache — never here
      }
      rig.removeFromParent();
    };
    return { front: meshes.front, back: meshes.back, ready, dispose };
  } catch (e) {
    console.warn('[skk] jersey decals unavailable:', e);
    return null; // cosmetic only — never block a character build
  }
}
