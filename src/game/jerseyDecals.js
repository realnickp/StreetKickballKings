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
/** Half-width of the CENTRE column, metres. 0.03 left the whole front/back read
 *  resting on a handful of vertices — one stray one and the plane moved a
 *  centimetre. 0.05 is still flat chest (the bow is solved off the ribs). */
const CENTRE_HALF_W = 0.05;
/** …and when even that column is thin — arch-locs puts SIXTEEN shirt vertices
 *  in it — widen to here before giving up. At 0.075 off centre the chest has
 *  fallen back under a centimetre, so the deep end of the column is still the
 *  sternum, but there are three times as many votes for it. */
const CENTRE_WIDE_W = 0.075;
/** Trim the tails before calling it "the shirt": a percentile, not a min/max.
 *  A single vertex — a seam, a lace tip, a stray weight — used to decide where
 *  a 0.40 m plane sat. */
const SHIRT_P_LO = 0.02;
const SHIRT_P_HI = 0.98;
/** Enough samples for the percentile to be doing anything; under the hard floor
 *  the read is guesswork, so take the archetype mean instead of moving the mark
 *  somewhere silly. */
const MIN_SAMPLES = 24;
const MIN_SAMPLES_HARD = 8;
/** Which skin joints count as SHIRT: the SPINE CHAIN plus the HIPS root —
 *  the trunk, and nothing that a hairstyle hangs off.
 *
 *  Both halves of that were measured, not assumed. Dumped every vertex in the
 *  decal's band by dominant joint across the archetype set:
 *   - SHOULDERS ARE OUT, though the review asked for them. These auto-rigs skin
 *     the hair to them: arch-braids gives `RightShoulder` 2865 vertices running
 *     back to z −0.30 against a shirt at −0.14, arch-locs hangs the dreadlocks
 *     off `LeftShoulder`, and spine-plus-shoulders reads arch-braids' back at
 *     −0.275 — i.e. it does not fix the bug at all.
 *   - HIPS IS IN. On arch-twists the whole lower back of the vest is weighted to
 *     `Hips` (405 vertices, −0.14 … +0.12) and the spine reaches only −0.12;
 *     spine-alone pulled the back plane 3 cm forward and the screenshot showed
 *     the number sunk INTO the shirt. Hips carries no hairstyle on any rig.
 *  `neck` is excluded by name — it carries the collar and every ponytail. */
const SHIRT_JOINT = /(spine|chest|torso|hip|pelvis)/i;
const NOT_SHIRT_JOINT = /(neck|head|hair|jaw|eye)/i;
/** Used only when a character has no skinned geometry to measure (the fallback
 *  model): the mean chest/back surface across the archetype set. */
const FALLBACK_DEPTH = { front: 0.16, back: -0.19, curveFront: CURVE_DEFAULT, curveBack: CURVE_DEFAULT };

const FONT_STACK = "'Archivo', system-ui, sans-serif";
/** Cap height as a fraction of the em box for Archivo 900. */
const CAP_RATIO = 0.72;
const INK_DARK = '#0b0c10';
const INK_LIGHT = '#f4f4f6';
/** THE INK OUTLINE. Every mark on every shirt wears one — a printed emblem has
 *  an edge, and that edge is what stops gold-on-gold, orange-on-orange and
 *  white-on-white from reading as nothing at all. It replaced a conditional
 *  filled slab, which read as a sticker on the crews that got it and did
 *  nothing for the ones that didn't: this is the mark's OWN silhouette, dilated
 *  and filled with the kit ink, drawn underneath it. Radius as a fraction of
 *  the drawn mark's width, so it scales with the chest mark and the small back
 *  one alike. */
export const OUTLINE_RATIO = 0.025;
/** The dilation is stamped, not filtered: the silhouette is redrawn round two
 *  rings (the outer one gives the radius, the inner one fills the gaps a single
 *  ring leaves between stamps on a thin serif). 18 draws of a cached canvas,
 *  once per texture — the texture cache means it never runs twice. */
const OUTLINE_RING = [[1, 12], [0.5, 6]];

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

/** Chest: the crew mark big and centred, the number small up on the wearer's
 *  LEFT chest — viewer's RIGHT, +x on this face — which is where a jersey
 *  actually wears it. */
export function layoutFront() {
  return { logo: { w: 0.34, h: 0.34, y: 0.06 }, num: { w: 0.10, y: 0.16, x: 0.10 } };
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

/** Slide a rect until it sits wholly inside the plane, size untouched. */
export function fitBox(b, span = PLANE_M) {
  const lim = (half) => Math.max(0, span / 2 - half);
  const cx = lim(b.w / 2); const cy = lim(b.h / 2);
  return {
    x: Math.max(-cx, Math.min(cx, b.x ?? 0)),
    y: Math.max(-cy, Math.min(cy, b.y)),
    w: b.w,
    h: b.h,
  };
}

/**
 * The placed marks for one face — what the canvas actually draws.
 *
 * BACK stacks: the number is the hero there and a crew mark cut in half by it
 * is the first thing anyone would notice.
 *
 * FRONT does not. Stacking shrank the 0.34 m chest mark to 0.29 to clear a
 * 0.10 m number, which is backwards — the mark is the whole point of the chest
 * and the number is a small badge that sits ON its upper corner, exactly the
 * way a real jersey wears it. Both keep their asked-for size; each is only slid
 * far enough to stay on the plane.
 */
export function faceBoxes(side) {
  const L = side === 'back' ? layoutBack() : layoutFront();
  const items = [
    { key: 'logo', w: L.logo.w, h: L.logo.h ?? L.logo.w, x: L.logo.x ?? 0, y: L.logo.y },
    { key: 'num', w: L.num.w, h: L.num.h ?? L.num.w, x: L.num.x ?? 0, y: L.num.y },
  ];
  if (side === 'back') return stackFace(items);
  const out = {};
  for (const it of items) out[it.key] = fitBox(it);
  return out;
}

// ---- the texture ----------------------------------------------------------

/** The ink outline is unconditional and its colour is the ink, which is already
 *  in the key — nothing else to carry. */
export function decalKey(logoUrl, number, ink, side) {
  return `${logoUrl}|${number}|${ink}|${side}`;
}

const cache = new Map(); // key -> CanvasTexture, insertion-ordered = LRU

export const decalCacheSize = () => cache.size;
export function clearDecalCache() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
  logoCache.clear();
}

const mToPx = (m) => (m / PLANE_M) * DECAL_PX;
const toX = (x) => DECAL_PX / 2 + mToPx(x);
const toY = (y) => DECAL_PX / 2 - mToPx(y);

/** The mark's own alpha, flooded with one flat colour: draw it, then paint the
 *  whole box through `source-in` so only the pixels the mark covers take the
 *  ink. That's the silhouette the outline is stamped from. Null if the browser
 *  won't give us a second canvas — the mark then draws bare, as it always did.
 */
function inkSilhouette(img, w, h, ink) {
  try {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = ink;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    return c;
  } catch { return null; }
}

function paintFace(logoImg, number, ink, side) {
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
    const x = toX(b.x) - w / 2; const y = toY(b.y) - h / 2;
    // THE INK OUTLINE, under the mark, always: the mark's silhouette stamped
    // round two rings so it grows by `r` in every direction. A crew mark cut
    // from its own kit colour (gold on gold, white on white) has nothing but
    // this edge to read by, and every other mark is only sharper for it.
    const sil = inkSilhouette(logoImg, w, h, ink);
    if (sil) {
      const r = Math.max(1, w * OUTLINE_RATIO);
      for (const [scale, n] of OUTLINE_RING) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.drawImage(sil, x + Math.cos(a) * r * scale, y + Math.sin(a) * r * scale, w, h);
        }
      }
    }
    ctx.drawImage(logoImg, x, y, w, h);
  }

  // The number, drawn LAST so it always wins — a jersey with no readable
  // number is a jersey nobody can call a play off.
  const text = String(number ?? '');
  if (text) {
    const b = box.num;
    const target = mToPx(b.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic'; // the ink box, not the em box — see below
    let size = target / CAP_RATIO;
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    // Fit the number to its REAL ink, both ways. CAP_RATIO is a guess at
    // Archivo's cap height; `actualBoundingBox*` is what the font actually
    // inked, and on the back that difference is the whole margin between the
    // number's top stroke and the crew mark above it.
    const inked = (m) => (m?.actualBoundingBoxAscent ?? size * CAP_RATIO) + (m?.actualBoundingBoxDescent ?? 0);
    const h0 = inked(ctx.measureText?.(text));
    if (h0 > 0) {
      size *= target / h0;
      ctx.font = `900 ${size}px ${FONT_STACK}`;
    }
    const maxW = mToPx(PLANE_M * 0.86);
    const w = ctx.measureText?.(text)?.width ?? 0;
    if (w > maxW && w > 0) {
      size *= maxW / w;
      ctx.font = `900 ${size}px ${FONT_STACK}`;
    }
    // Centre the INK on the box: digits sit on the baseline with nothing below
    // it, so an em-box 'middle' hangs them high by a good tenth of their size.
    const m = ctx.measureText?.(text);
    const asc = m?.actualBoundingBoxAscent ?? size * CAP_RATIO;
    const desc = m?.actualBoundingBoxDescent ?? 0;
    const baseY = toY(b.y) + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = oppositeInk(ink);
    ctx.strokeText(text, toX(b.x), baseY);
    ctx.fillStyle = ink;
    ctx.fillText(text, toX(b.x), baseY);
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
 * @param {string} ink the kit's number colour, and the mark's outline
 * @param {'front'|'back'} side
 * @returns {THREE.CanvasTexture} SHARED — never dispose it, the cache does
 */
export function decalTexture(logoImg, number, ink, side) {
  const key = decalKey(logoImg?.src ?? '', number, ink, side);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // touch = LRU
  const tex = paintFace(logoImg, number, ink, side);
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

/** Is this bone part of the SHIRT? Braids, dreadlocks and ponytails are skinned
 *  to the neck and — on these rigs — to the SHOULDER joints, and they hang
 *  straight down through the decal's own band, so a measurement that trusts
 *  geometry alone reads the hair as the player's back. Only the trunk votes:
 *  spine chain + hips. See SHIRT_JOINT for the numbers that settled it. */
export function isShirtBone(name) {
  const n = String(name ?? '');
  if (NOT_SHIRT_JOINT.test(n)) return false;
  return SHIRT_JOINT.test(n);
}

/** The p-th value of a sample, 0..1, sorted. Used instead of min/max: the
 *  extremes of a 40 k-vertex mesh are always some seam, lace tip or stray
 *  weight, and one of them used to decide where a 0.40 m plane sat. */
export function percentile(values, p) {
  if (!values?.length) return NaN;
  const a = Float64Array.from(values).sort();
  const i = Math.round((a.length - 1) * Math.min(1, Math.max(0, p)));
  return a[i];
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
 *
 * Two things keep the read honest, both of them fixes to a first pass that put
 * the back mark a hand's width behind arch-braids' shirt:
 *  - only vertices whose DOMINANT skin joint is a shirt bone count, so hair
 *    never votes (see `isShirtBone`);
 *  - the columns are read at the 2nd/98th percentile over EVERY vertex, not the
 *    min/max of a 1-in-N stride, so no single point moves the plane.
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

    // Which skeleton slots are shirt. No JOINTS_0/WEIGHTS_0 (or no names) means
    // no filter — a statue rig still gets a measured, if hairier, shirt.
    const si = skinned.geometry.getAttribute?.('skinIndex');
    const sw = skinned.geometry.getAttribute?.('skinWeight');
    const shirtSlot = (skinned.skeleton.bones ?? []).map((b) => isShirtBone(b?.name));
    const filtering = !!(si && sw && shirtSlot.some(Boolean));
    const dominantIsShirt = (i) => {
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      const j = w.indexOf(Math.max(...w));
      if (!(w[j] > 0)) return false;
      const slot = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)][j];
      return shirtSlot[slot] === true;
    };

    // The shirt is sampled in three x columns: dead centre, and out at ±RIB_X
    // on each flank. Centre gives the depth, the pair gives the FALL-OFF —
    // how fast the chest turns away — which is what the decal has to follow.
    const v = new THREE.Vector3();
    const mid = []; const near = []; const rib = [];
    for (let i = 0; i < pos.count; i++) {   // EVERY vertex — no stride to alias
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const ax = Math.abs(v.x);
      if (ax > TORSO_HALF_W) continue;                     // trunk, not arms
      if (Math.abs(v.y + dropM) > PLANE_M / 2) continue;   // the band the decal covers
      const column = ax < CENTRE_WIDE_W ? 'mid'
        : (ax > RIB_X - 0.025 && ax < RIB_X + 0.025 ? 'rib' : null);
      if (!column) continue;
      if (filtering && !dominantIsShirt(i)) continue;      // hair doesn't vote
      if (column === 'rib') { rib.push(v.z); continue; }
      near.push(v.z);
      if (ax < CENTRE_HALF_W) mid.push(v.z);
    }
    // the tight column when it has the numbers, the wide one when it doesn't
    const col = mid.length >= MIN_SAMPLES ? mid : near;
    if (col.length < MIN_SAMPLES_HARD) return FALLBACK_DEPTH;
    const front = percentile(col, SHIRT_P_HI);
    const back = percentile(col, SHIRT_P_LO);
    const enough = rib.length >= MIN_SAMPLES_HARD;
    const ribF = enough ? percentile(rib, SHIRT_P_HI) : NaN;
    const ribB = enough ? percentile(rib, SHIRT_P_LO) : NaN;
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
        meshes[side].material.map = decalTexture(img, number, paint, side);
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
