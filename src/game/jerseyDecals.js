// JERSEY DECALS — the crew's mark on the chest and the back, and a number on
// every player. Dev, 2026-08-27: "team logos on the uniforms front and back
// with numbers"; the intro videos wear a BIG mark on the chest, so that's the
// bar — you should read who's out there from the dugout shot, and read WHO it
// is off the back of the shirt on the walk-up.
//
// The archetype GLBs are one skinned mesh sharing one atlas whose texels are
// re-used across UV islands (that's why cleats had to be tinted by geometry,
// see glbCharacters.applyCleatVertexTint) — painting a logo into that atlas
// would splatter it across faces and shoes. So the decal is GEOMETRY: camera-
// facing planes parented to the chest bone, drawn from a 512² canvas. Three of
// them — the chest, the back number, and the crest above it, which rides its
// OWN measured depth because the upper back is not the number band's depth.
//
// NOT FROM HERE: the black slab that used to sit behind the back number on a
// red or a gold kit is PRINTED INTO THE ARCHETYPE ATLAS — a dark number panel
// on the vest's back. `glbCharacters.recolorKitTexture` only re-inks pixels
// with `s < 0.17 && v > 0.52`, so the panel survives every kit and shows up on
// anything that isn't a dark shirt. Hide `jersey-back` and it is still there.
// Nothing in this file has EVER filled a rectangle behind a mark since the
// conditional patch came out; the tests below hold that line.
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
/** THE BACK'S OWN FALL-OFF POINT — bug fix, 2026-08-28. Fitting the parabola at
 *  RIB_X and then reading it out at the back number's real edge over-solves on
 *  a broad back: on arch-bald (bullies) the rib sample clamped to CURVE_MAX and,
 *  extrapolated to the number's own half-width, put the plane's edge 3.8 cm
 *  behind centre while the real shirt there only falls off 1–2 cm — enough to
 *  bury everything off-centre and leave a sliver of the number showing
 *  (`.superpowers/sdd/2026-08-27-crews-kits-walkout/casts/back-bullies-dark.png`,
 *  task-6 report §7). A parabola fit at 0.10 and evaluated at 0.13 is pure
 *  extrapolation — real anatomy DECELERATES toward the flank instead of
 *  continuing to accelerate the way x² does. Sampling the shirt again, right at
 *  the number's own edge, removes the extrapolation entirely: the curve is
 *  solved to match the shirt exactly where the number needs it to, not 30 %
 *  further out than where it was measured. `layoutBack().num.w / 2` is 0.13.
 *  Exported so the fix has a unit test pinned to the actual constant. */
export const BACK_HALF_W = 0.13;
/** Tolerance either side of BACK_HALF_W for that second sample, metres — same
 *  width as the RIB_X window below. */
const RIB_BACK_WINDOW = 0.025;
/** Half-width of the band we measure the shirt in — the trunk, not the arms. */
const TORSO_HALF_W = 0.12;
/** The outer cutoff actually used while walking vertices. BACK_HALF_W's own
 *  sample window reaches past TORSO_HALF_W (0.155 > 0.12), so the trunk cutoff
 *  has to widen enough to let it through. It only widens the FIRST gate —
 *  the mid/near/rib columns below keep their original, tighter thresholds, so
 *  this changes nothing for the front or for the existing rib sample. */
const TRUNK_SAMPLE_HALF_W = Math.max(TORSO_HALF_W, BACK_HALF_W + RIB_BACK_WINDOW);
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
/** WHO MAY VOTE ON THE CREST'S DEPTH, on top of the shirt joints. The crest
 *  sits over the shoulder blades, and on the short-haired archetypes the cloth
 *  up there is skinned to the SHOULDER joints, not the spine: measured on
 *  arch-bald (bullies), the crest band's centre column holds 16 spine-weighted
 *  vertices and every single one of them is the FRONT of the chest — read that
 *  band with the shirt filter alone and "the back" comes out at +0.13, i.e. the
 *  sternum. So shoulders vote HERE, and only here.
 *
 *  What keeps braids and dreadlocks out — they hang off these same joints — is
 *  CREST_WINDOW_M: a vote only counts if it lands within that of the number
 *  band's own depth. Real upper-back cloth is a few centimetres off it;
 *  arch-braids' hair sits 13–16 cm off the shirt (see SHIRT_JOINT), so it never
 *  gets a vote. Worst case for a style this window can't tell from cloth is a
 *  crest that stands a few cm proud — never one buried out of sight. */
const CREST_JOINT = /(shoulder|clavicle)/i;
const CREST_WINDOW_M = 0.07;
/** How far past the badge's own edges the covering cloth is collected, metres.
 *  The set is picked in BIND pose and read in the live one, and the cloth that
 *  ends up over the badge is not the cloth that was over it in the bind A-pose:
 *  measured on arch-bald, the exact badge footprint misses the real occluder by
 *  1.9 cm and the mark comes back with its bottom bitten off. */
const CREST_REACH_M = 0.06;
/** …and how far past those edges a candidate still counts as "over the mark"
 *  when it is re-read against the live pose. Small: this one is evaluated in
 *  the pose the player is actually in, so it only has to cover the reach of the
 *  triangle a corner belongs to. */
const CREST_LIVE_M = 0.03;
/** Three vertices IS the data up there. arch-bald puts four in the badge's own
 *  footprint, and what protects the read is not sample count but the three
 *  gates every one of them passed: a shirt/shoulder joint, the badge's own
 *  footprint, and CREST_WINDOW_M of the number band's depth. */
const CREST_MIN_VOTES = 3;
/** THE SHIRT MOVES AND THE DECAL DOESN'T. `measureShirt` reads the mesh in BIND
 *  POSE, but the cloth it measures is skinned: the moment arch-bald's rig drops
 *  its arms out of the bind A-pose, the shoulder-skinned cloth over its blades
 *  swings from −0.229 to −0.276 — nearly 5 cm — and a plane placed off the bind
 *  read sits INSIDE it, so the shirt draws over the crest and the mark never
 *  appears at all (`decals/locker-bullies-dark-back.png`, three rounds of it).
 *  A single re-read after the pose settles isn't enough either: posed, that band
 *  holds THREE vertices, far too few to read. So the sample set is chosen once
 *  in bind pose and those same vertices are re-read against the live pose a few
 *  times a second, with the back planes sitting at the deepest the shirt has
 *  been over the last `SETTLE_KEEP` beats. A few hundred vertices per beat —
 *  the whole squad costs well under a millisecond of a frame. */
const SETTLE_EVERY_MS = 200;
const SETTLE_KEEP = 6;
/** …and the pose read can never drag a plane further than this off the bind
 *  read, metres: an animation that folds the mesh in half must not take the
 *  marks with it. */
const SETTLE_MAX_M = 0.08;
/** Ceiling on how many vertices a re-read walks per column. */
const SETTLE_SAMPLE_MAX = 256;
/** Used only when a character has no skinned geometry to measure (the fallback
 *  model): the mean chest/back surface across the archetype set. */
const FALLBACK_DEPTH = {
  front: 0.16, back: -0.19, backUpper: -0.19, curveFront: CURVE_DEFAULT, curveBack: CURVE_DEFAULT,
};

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

/** THE NUMBER'S EDGE, as a fraction of the drawn glyph size — NOT a fixed
 *  stroke. The back number is drawn about 2.3× the chest badge, so `lineWidth
 *  10` on both gave the hero number an edge less than half as heavy as the
 *  little one's, and it is the back that has to hold its own over whatever the
 *  shirt is printed with. 0.056 is the chest badge's old weight (10 px on its
 *  ~178 px glyph), so the front is where it always was and the back now matches
 *  it. NOTHING is ever filled behind the number — the edge is the glyph's own
 *  stroke, exactly like the mark's silhouette outline above. */
export const NUM_EDGE_RATIO = 0.056;

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

/**
 * THE BACK IS TWO PLANES — bug fix, 2026-08-28. One plane bowed in x only hangs
 * the crest at the NUMBER's depth, and a back is not one depth. Measured on
 * arch-bald (bullies), standing: the cloth is at −0.225 down where the number
 * goes and −0.276 up over the shoulder blades where the crest goes. The single
 * plane hung off the number's read, so the crest's rows of it sat 5 cm INSIDE
 * the cloth, the shirt drew over them, and the back came back with a clean
 * number and no crest at all, three rounds running
 * (`.superpowers/sdd/2026-08-27-crews-kits-walkout/decals/locker-bullies-dark-back.png`).
 * So the face is CUT along the blank stack gap between the two marks and each
 * half hangs at its own measured depth. Both halves still sample the ONE back
 * canvas — the cut is in the geometry, and the UVs follow it — so each mark is
 * drawn exactly once and the texture cache is untouched.
 *
 * @returns {number} where to cut, in PLANE-LOCAL metres above the plane centre:
 * the dead middle of the gap, so neither mark's ink is ever sliced.
 */
export function backSplitY() {
  const { logo, num } = faceBoxes('back');
  return ((logo.y - logo.h / 2) + (num.y + num.h / 2)) / 2;
}

/** The crest's own band of the shirt, in RIG metres about the chest bone (which
 *  sits at the collarbone — see CHEST_DROP_M), i.e. exactly the strip of upper
 *  back the crew mark is printed on. This is what `measureShirt` reads a second
 *  centre column in. */
export function backMarkBand(dropM = CHEST_DROP_M) {
  const { logo } = faceBoxes('back');
  return { lo: -dropM + logo.y - logo.h / 2, hi: -dropM + logo.y + logo.h / 2 };
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
    // The box holds the WHOLE drawn number — the glyph ink AND the edge around
    // it. `stackFace` settles the back run flush against the plane's bottom, so
    // a number fitted on its ink alone puts its baseline ON the last row of the
    // canvas and the edge is sliced clean off there: the hero number ended up
    // the one mark on the shirt with no edge along its foot. Two passes — the
    // ink measurement is exact and the edge is a fixed fraction of the size, so
    // the correction lands.
    for (let i = 0; i < 2; i++) {
      const h = inked(ctx.measureText?.(text)) + size * NUM_EDGE_RATIO;
      if (!(h > 0)) break;
      size *= target / h;
      ctx.font = `900 ${size}px ${FONT_STACK}`;
    }
    const maxW = mToPx(PLANE_M * 0.86);
    const w = (ctx.measureText?.(text)?.width ?? 0) + size * NUM_EDGE_RATIO;
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
    ctx.lineWidth = Math.max(2, size * NUM_EDGE_RATIO);
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

/** Is this bone allowed to vote on the CREST's depth, over and above the shirt
 *  bones? The shoulders, and nothing else — see CREST_JOINT for why the cloth
 *  over the blades is skinned to them, and for the depth window that keeps the
 *  hair hanging off those same joints from voting with them. */
export function isCrestBone(name) {
  const n = String(name ?? '');
  if (NOT_SHIRT_JOINT.test(n)) return false;
  return CREST_JOINT.test(n);
}

/** Take at most `max` of a list, evenly spread — a percentile over 300 samples
 *  says what it says over 3000, and these get walked again every pose beat. */
export function thin(list, max = SETTLE_SAMPLE_MAX) {
  if (!list?.length || list.length <= max) return list ?? [];
  const step = list.length / max;
  const out = [];
  for (let i = 0; out.length < max; i += step) out.push(list[Math.floor(i)]);
  return out;
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
 * a vertex RIGIDLY WELDED to that bone, whatever the rig did with node
 * transforms (these GLBs park the whole armature at scale 0.01), so this needs
 * no assumptions about units. But a shirt vertex is skinned, not welded — bug,
 * 2026-08-28: reading EVERY vertex through the CHEST bone's transform alone
 * (as if the whole shirt were rigidly bolted to it) is only correct where a
 * vertex's own weights happen to agree with the chest bone's own motion. They
 * don't have to: build scaling bakes a different accumulated scale into each
 * link of the spine, so a back vertex split nearly evenly across
 * Spine/Spine1/Spine2/Hips reads its OWN blended transform as much as 5 cm
 * deeper than "borrow the chest bone's transform" gives it — measured on
 * arch-bald, whose back decal that shallow reading buried clean out of sight
 * behind the real (deeper) cloth
 * (`.superpowers/sdd/2026-08-27-crews-kits-walkout/casts/back-bullies-dark.png`).
 * Every vertex is now placed with its OWN proper linear-blend transform — the
 * same weighted sum of joint transforms the GPU itself skins with — falling
 * back to the chest bone's transform only where a vertex has no usable weights
 * at all (a "statue" mesh with no JOINTS_0/WEIGHTS_0, or a degenerate one).
 *
 * Two more things keep the read honest, both of them fixes to a first pass
 * that put the back mark a hand's width behind arch-braids' shirt:
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
    const rigInv = new THREE.Matrix4().copy(rig.matrixWorld).invert();
    const worldXform = (b, biMat) => new THREE.Matrix4()
      .multiplyMatrices(rigInv, new THREE.Matrix4().multiplyMatrices(b.matrixWorld, biMat));
    // The CHEST bone's own transform — the fallback for a vertex with no
    // usable skin weights, and the shape EVERY vertex used to be forced into.
    const chestXform = worldXform(bone, bi);

    // Which skeleton slots are shirt. No JOINTS_0/WEIGHTS_0 (or no names) means
    // no filter — a statue rig still gets a measured, if hairier, shirt.
    const si = skinned.geometry.getAttribute?.('skinIndex');
    const sw = skinned.geometry.getAttribute?.('skinWeight');
    const bones = skinned.skeleton.bones ?? [];
    const boneInverses = skinned.skeleton.boneInverses ?? [];
    const shirtSlot = bones.map((b) => isShirtBone(b?.name));
    const filtering = !!(si && sw && shirtSlot.some(Boolean));
    // One world*inverse per joint, in RIG-local space — every vertex blends
    // across ITS OWN up-to-four of these, instead of borrowing the chest
    // bone's alone. Only built when there is skin data to blend with.
    const boneXform = (si && sw)
      ? bones.map((b, i) => (boneInverses[i] ? worldXform(b, boneInverses[i]) : null))
      : null;

    // The shirt is sampled in x columns: dead centre, out at ±RIB_X on each
    // flank, and — for the back only — again at ±BACK_HALF_W, the number's
    // own edge. Centre gives the depth, RIB_X gives the FRONT its fall-off,
    // and BACK_HALF_W gives the BACK its fall-off measured where it actually
    // needs to be right, instead of extrapolated from RIB_X (see BACK_HALF_W).
    //
    // The BACK is read twice down the face: the centre column over the whole
    // band gives `back`, where the number goes, and the cloth that actually
    // covers the crew mark gives `backUpper`. One depth for the whole back is
    // what buried the crest — see `backSplitY`.
    const markBand = backMarkBand(dropM);
    const crestSlot = bones.map((b) => isShirtBone(b?.name) || isCrestBone(b?.name));
    const v = new THREE.Vector3();
    const blended = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    /** Blend-skin vertex `i` into rig-local space through `xforms` — the same
     *  weighted sum the GPU skins with. Returns its DOMINANT skeleton slot, or
     *  −1 where it has no usable weights (then `fallback` places it). */
    const place = (i, xforms, fallback, out) => {
      v.fromBufferAttribute(pos, i);
      if (!xforms) { out.copy(v).applyMatrix4(fallback); return -1; }
      const idxs = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      const domIdx = w.indexOf(Math.max(...w));
      const domSlot = w[domIdx] > 0 ? idxs[domIdx] : -1;
      let usedW = 0;
      out.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        if (!(w[k] > 0)) continue;
        const xf = xforms[idxs[k]];
        if (!xf) continue;
        tmp.copy(v).applyMatrix4(xf);
        out.addScaledVector(tmp, w[k]);
        usedW += w[k];
      }
      if (usedW > 0) out.multiplyScalar(1 / usedW);
      else out.copy(v).applyMatrix4(fallback); // no bone had a usable transform
      return domSlot;
    };

    const mid = []; const near = []; const rib = []; const ribBack = [];
    const upperMid = []; const upperNear = [];
    // …and WHICH vertices those were. The pose re-read below walks these same
    // ones again (see `resample`), because band membership has to be decided
    // once, in bind pose: posed, arch-bald's crest band holds three vertices.
    const midAt = []; const nearAt = []; const upMidAt = []; const upNearAt = [];
    // Every vertex's bind-pose place, kept for the triangle sweep below.
    const vx = new Float32Array(pos.count);
    const vy = new Float32Array(pos.count);
    const vz = new Float32Array(pos.count);
    const crestOk = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {   // EVERY vertex — no stride to alias
      const domSlot = place(i, boneXform, chestXform, blended);
      vx[i] = blended.x; vy[i] = blended.y; vz[i] = blended.z;
      crestOk[i] = (!filtering || (domSlot >= 0 && crestSlot[domSlot])) ? 1 : 0;
      const ax = Math.abs(blended.x);
      if (ax > TRUNK_SAMPLE_HALF_W) continue;               // trunk, not arms
      if (Math.abs(blended.y + dropM) > PLANE_M / 2) continue; // the band the decal covers
      const isMid = ax < CENTRE_WIDE_W;
      const isRib = !isMid && ax > RIB_X - 0.025 && ax < RIB_X + 0.025;
      const isRibBack = ax > BACK_HALF_W - RIB_BACK_WINDOW && ax < BACK_HALF_W + RIB_BACK_WINDOW;
      if (!isMid && !isRib && !isRibBack) continue;
      const votes = !filtering || (domSlot >= 0 && shirtSlot[domSlot]); // hair doesn't vote
      if (isRib && votes) rib.push(blended.z);
      if (isRibBack && votes) ribBack.push(blended.z);
      if (isMid && votes) {
        near.push(blended.z); nearAt.push(i);
        if (ax < CENTRE_HALF_W) { mid.push(blended.z); midAt.push(i); }
      }
      // The crest's own strip, where the SHOULDER joints vote too — see
      // `isCrestBone`. Windowed against the number's depth further down, which
      // is what keeps braids and dreadlocks out of it. (Only the fall-back set:
      // the crest is normally read off the triangles that cover it, below.)
      if (isMid && crestOk[i] && blended.y >= markBand.lo && blended.y <= markBand.hi) {
        upperNear.push(blended.z); upNearAt.push(i);
        if (ax < CENTRE_HALF_W) { upperMid.push(blended.z); upMidAt.push(i); }
      }
    }

    // THE CREST'S SAMPLE SET: the cloth that can actually draw over the mark.
    // A vertex COLUMN is not enough on a sparse mesh — arch-bald puts four
    // vertices in the badge's own column, and the triangles that cover the
    // badge reach out well past it, so the surface between them runs 2 cm
    // deeper than anything the column can see (measured, posed: column −0.277,
    // the real covering triangles −0.297 — and the badge came back with its
    // bottom third eaten by cloth the read never knew about). A triangle is
    // planar, so its interior is never deeper than its own deepest corner:
    // clear every corner of every triangle that overlaps the badge and nothing
    // can draw over the badge. That is this set.
    const crestTriangleSet = () => {
      // …grown by CREST_REACH_M, because the set is chosen in BIND pose and the
      // cloth that ends up over the badge is not the cloth that was over it in
      // the T-pose.
      const half = faceBoxes('back').logo.w / 2 + CREST_REACH_M;
      const lo = markBand.lo - CREST_REACH_M;
      const hi = markBand.hi + CREST_REACH_M;
      const index = skinned.geometry.getIndex?.();
      const n = index ? index.count : pos.count;
      const picked = new Uint8Array(pos.count);
      const out = [];
      for (let t = 0; t + 2 < n; t += 3) {
        const a = index ? index.getX(t) : t;
        const b = index ? index.getX(t + 1) : t + 1;
        const c = index ? index.getX(t + 2) : t + 2;
        if (!(vz[a] < 0 || vz[b] < 0 || vz[c] < 0)) continue;       // the chest, not the back
        if (Math.min(vx[a], vx[b], vx[c]) > half || Math.max(vx[a], vx[b], vx[c]) < -half) continue;
        if (Math.min(vy[a], vy[b], vy[c]) > hi || Math.max(vy[a], vy[b], vy[c]) < lo) continue;
        for (const i of [a, b, c]) {
          if (picked[i] || !crestOk[i] || !(vz[i] < 0)) continue;   // hair still never votes
          picked[i] = 1;
          out.push(i);
        }
      }
      return out;
    };
    // the tight column when it has the numbers, the wide one when it doesn't
    const col = mid.length >= MIN_SAMPLES ? mid : near;
    if (col.length < MIN_SAMPLES_HARD) return FALLBACK_DEPTH;
    const enough = rib.length >= MIN_SAMPLES_HARD;
    const ribF = enough ? percentile(rib, SHIRT_P_HI) : NaN;
    const ribB = enough ? percentile(rib, SHIRT_P_LO) : NaN;
    // The back's own fall-off point. Falls back to the RIB_X sample — same as
    // before this fix — only when the narrower BACK_HALF_W band came up dry.
    const ribBackEnough = ribBack.length >= MIN_SAMPLES_HARD;
    const ribBackB = ribBackEnough ? percentile(ribBack, SHIRT_P_LO) : NaN;

    // The two sample SETS, chosen here and never re-chosen: the centre column,
    // and the crest's own strip of it. Strided down if a dense mesh hands us
    // thousands — the percentile does not get better past a few hundred, and
    // these are walked again on every pose beat.
    const colAt = thin(mid.length >= MIN_SAMPLES ? midAt : nearAt);
    const triAt = crestTriangleSet();
    // the covering triangles when there are any, the plain column when the mesh
    // has no index buffer or nothing overlaps (then it reads as it did before).
    // A looser cap than the column's: this one is read at its DEEPEST, not at a
    // percentile, so thinning it costs accuracy rather than just resolution.
    const upAt = thin(triAt.length >= MIN_SAMPLES_HARD
      ? triAt
      : (upperMid.length >= MIN_SAMPLES ? upMidAt : upNearAt), SETTLE_SAMPLE_MAX * 2);
    /** The badge's own footprint plus a hair, tested against the LIVE pose —
     *  membership in the candidate set is decided once, but whether a candidate
     *  is actually over the mark right now is decided every read. */
    const overMark = (p) => Math.abs(p.x) <= faceBoxes('back').logo.w / 2 + CREST_LIVE_M
      && p.y >= markBand.lo - CREST_LIVE_M && p.y <= markBand.hi + CREST_LIVE_M;
    /** The three depths off those sets, in whatever pose `xforms` describes. */
    const readColumns = (xforms, fallback) => {
      const zs = [];
      for (const i of colAt) { place(i, xforms, fallback, blended); zs.push(blended.z); }
      const f = percentile(zs, SHIRT_P_HI);
      const b = percentile(zs, SHIRT_P_LO);
      // The crest clears the DEEPEST cloth actually over it — not a percentile.
      // Every survivor of these three gates is real cloth on the badge: its own
      // joint (shirt or shoulder, never hair), the badge's own footprint in the
      // pose it is standing in, and within CREST_WINDOW_M of the number band's
      // depth. The one that reaches furthest back is the one that would draw
      // over the mark; a percentile leaves the last few nibbling its bottom
      // edge, which is exactly how the badge kept coming back cut.
      let deep = NaN; let votes = 0;
      for (const i of upAt) {
        place(i, xforms, fallback, blended);
        if (!overMark(blended)) continue;
        if (!(Math.abs(blended.z - b) <= CREST_WINDOW_M)) continue;
        votes++;
        if (!(deep <= blended.z)) deep = blended.z;
      }
      return { front: f, back: b, backUpper: votes >= CREST_MIN_VOTES ? deep : b };
    };
    const bind = readColumns(boneXform, chestXform);
    if (!Number.isFinite(bind.front) || !Number.isFinite(bind.back)) return FALLBACK_DEPTH;

    // The same read again, against the pose the player is standing in NOW.
    // Reuses one matrix per joint so a beat allocates nothing.
    const live = boneXform ? bones.map(() => new THREE.Matrix4()) : null;
    const liveChest = new THREE.Matrix4();
    const scratch = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const resample = () => {
      try {
        inv.copy(rig.matrixWorld).invert();
        liveChest.multiplyMatrices(inv, scratch.multiplyMatrices(bone.matrixWorld, bi));
        if (live) {
          for (let i = 0; i < bones.length; i++) {
            if (!boneInverses[i]) { live[i] = null; continue; }
            if (!live[i]) live[i] = new THREE.Matrix4();
            live[i].multiplyMatrices(inv, scratch.multiplyMatrices(bones[i].matrixWorld, boneInverses[i]));
          }
        }
        const r = readColumns(live, liveChest);
        return Number.isFinite(r.back) ? r : null;
      } catch { return null; }
    };

    return {
      ...bind,
      curveFront: fallOff(bind.front, ribF),
      curveBack: Number.isFinite(ribBackB)
        ? fallOff(-bind.back, -ribBackB, BACK_HALF_W)
        : fallOff(-bind.back, -ribB),
      resample,
    };
  } catch { return FALLBACK_DEPTH; }
}

/** z = centre − c·x². Solve c from a shirt sample taken at `x` metres off
 *  centre (RIB_X unless the caller solves it somewhere else — the back solves
 *  it at the number's own half-width, see BACK_HALF_W above), then clamp it: a
 *  flat card stands 8 cm proud of its own edges on a 0.35 m chest, a c that ran
 *  away would curl the mark round the ribs and out of sight. */
export function fallOff(centre, rib, x = RIB_X) {
  if (!Number.isFinite(centre) || !Number.isFinite(rib)) return CURVE_DEFAULT;
  const c = (centre - rib) / (x * x);
  return Math.min(CURVE_MAX, Math.max(CURVE_MIN, c));
}

/**
 * A 0.40 m square bowed onto the chest we just measured. This is a DECAL
 * PROJECTION, not a wrap: x stays put and only z follows the shirt, so the
 * artwork keeps its shape and the whole mark sits the same 2 cm off the
 * player. The first pass used a true cylindrical wrap on the torso's own
 * half-depth and it dived straight in behind a chest that is far flatter than
 * a circle — the crew mark lost both its flanks.
 *
 * `h`/`bottom` cut a horizontal SLICE of that square (plane-local metres, so
 * the full face is h = PLANE_M, bottom = −PLANE_M/2). The slice keeps the whole
 * width and re-maps its UVs onto its own rows of the shared canvas, so the back
 * can hang as two planes at two depths off ONE texture — see `backSplitY`.
 */
function decalGeometry(curve, { h = PLANE_M, bottom = -PLANE_M / 2 } = {}) {
  const geo = new THREE.PlaneGeometry(PLANE_M, h, 16, 1);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, -curve * x * x); // 0 at the centre, falling away at the flanks
    // v runs 0 at the face's bottom edge to 1 at its top, whatever slice this
    // is — so each mark is sampled by exactly one plane, and drawn once.
    uv.setY(i, (bottom + PLANE_M / 2 + uv.getY(i) * h) / PLANE_M);
  }
  p.needsUpdate = true;
  uv.needsUpdate = true;
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

// ---- keeping the back planes on the moving shirt ---------------------------

/** ONE driver for every settling player on the field: each returns false when
 *  it is done (or disposed) and drops out. Nothing runs when nobody is on. */
const settlers = new Set();
let settleFrame = 0;
function pumpSettlers(t) {
  settleFrame = 0;
  for (const fn of [...settlers]) {
    let alive = false;
    try { alive = fn(t); } catch { alive = false; }
    if (!alive) settlers.delete(fn);
  }
  if (settlers.size) settleFrame = requestAnimationFrame(pumpSettlers);
}
function addSettler(fn) {
  if (typeof requestAnimationFrame !== 'function') return; // no frames, no pose
  settlers.add(fn);
  if (!settleFrame) settleFrame = requestAnimationFrame(pumpSettlers);
}
export const settlerCount = () => settlers.size;

/**
 * Hang the crew mark and the number on one character's shirt.
 *
 * Sync: the planes go on immediately (hidden) and light up when the mark and
 * the display font have landed, so a slow logo never delays a player onto the
 * field. `ready` resolves once they're painted — the e2e pass waits on it.
 *
 * @param {{group:THREE.Object3D}} char a built character
 * @param {{logoUrl?:string, number?:number|string, ink?:string, hex?:string}} o
 * @returns {{front:THREE.Mesh, back:THREE.Mesh, backMark:THREE.Mesh, ready:Promise<void>,
 *   settle:Function, dispose:Function}|null}
 *   `back` is the NUMBER's plane; `backMark` is the crest riding above it at
 *   the upper back's own depth. `settle()` re-reads the shirt against the pose
 *   the player is standing in right now and moves those two planes onto it —
 *   the module beats it a few times a second on its own; it is exposed so a
 *   test can drive it by hand.
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
    rig.userData.shirt = depth; // what the shirt measured, for probes and shots
    // The back is cut in two along the blank gap between its marks so the crest
    // can ride the upper back's own depth (see `backSplitY`). The number half
    // keeps the name `jersey-back` — it is the plane every probe and evidence
    // shot in the repo looks up.
    const split = backSplitY();
    const faces = [
      { key: 'front', name: 'jersey-front', side: 'front', z: depth.front + SURFACE_GAP_M, curve: depth.curveFront },
      {
        key: 'back',
        name: 'jersey-back',
        side: 'back',
        z: depth.back - SURFACE_GAP_M,
        curve: depth.curveBack,
        bottom: -PLANE_M / 2,
        h: split + PLANE_M / 2,
      },
      {
        key: 'backMark',
        name: 'jersey-back-mark',
        side: 'back',
        z: (depth.backUpper ?? depth.back) - SURFACE_GAP_M,
        curve: depth.curveBack,
        bottom: split,
        h: PLANE_M / 2 - split,
      },
    ];
    const meshes = {};
    for (const f of faces) {
      const bottom = f.bottom ?? -PLANE_M / 2;
      const h = f.h ?? PLANE_M;
      const mesh = new THREE.Mesh(
        decalGeometry(f.curve ?? CURVE_DEFAULT, { h, bottom }),
        decalMaterial(null),
      );
      // …the slice's own centre, so a cut face still hangs where its rows do
      mesh.position.set(0, -CHEST_DROP_M + bottom + h / 2, f.z);
      if (f.side === 'back') mesh.rotation.y = Math.PI;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false; // it rides a bone; the plane's own bounds lie
      mesh.visible = false;       // until the mark is painted
      mesh.name = f.name;
      rig.add(mesh);
      meshes[f.key] = mesh;
    }

    let dead = false;

    // THE BACK PLANES RIDE THE POSE. Everything above is a bind-pose read, and
    // the cloth over the shoulder blades does not stay where bind pose left it
    // (see SETTLE_EVERY_MS). So the same vertices get re-read a few times a
    // second and the two back planes sit at the DEEPEST the shirt has been over
    // the last few beats — the shirt can never close over the marks, and the
    // window means they follow it back in instead of floating out there for
    // good. The front is left exactly where it was measured: its cloth is spine
    // -skinned, it does not swing, and it has been right on screen for rounds.
    const seen = [{ back: depth.back, backUpper: depth.backUpper }];
    // A pose read may only ever ADD clearance. Halfway through a kick the torso
    // is twisted far enough that the "back" of the shirt is barely behind the
    // rig at all (monarchs read −0.105 against a bind −0.160), and a plane that
    // followed THAT would climb inside the shirt and take the number with it.
    // So: never shallower than the bind read, and never more than SETTLE_MAX_M
    // deeper than it.
    const rail = (bindZ, z) => Math.min(bindZ, Math.max(z, bindZ - SETTLE_MAX_M));
    const settle = () => {
      const r = dead ? null : depth.resample?.();
      if (!r) return false;
      seen.push({ back: rail(depth.back, r.back), backUpper: rail(depth.backUpper, r.backUpper) });
      while (seen.length > SETTLE_KEEP) seen.shift();
      meshes.back.position.z = Math.min(...seen.map((d) => d.back)) - SURFACE_GAP_M;
      meshes.backMark.position.z = Math.min(...seen.map((d) => d.backUpper)) - SURFACE_GAP_M;
      return true;
    };
    let nextBeat = 0;
    addSettler((t) => {
      if (dead) return false;
      if (t < nextBeat) return true;
      nextBeat = t + SETTLE_EVERY_MS;
      return settle();
    });

    const ready = Promise.all([
      loadLogoImage(logoUrl),
      // Archivo comes off the page's webfont; drawing before it lands gives a
      // system-font number, and the canvas is cached, so it'd stay wrong.
      Promise.resolve(document?.fonts?.load?.(`900 100px ${FONT_STACK}`)).catch(() => null),
    ]).then(([img]) => {
      if (dead) return;
      // One texture per FACE, however many planes that face is cut into: the
      // two back halves share the back canvas and each samples its own rows.
      const tex = {
        front: decalTexture(img, number, paint, 'front'),
        back: decalTexture(img, number, paint, 'back'),
      };
      for (const f of faces) {
        const mesh = meshes[f.key];
        mesh.material.map = tex[f.side];
        mesh.material.needsUpdate = true;
        mesh.visible = true;
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
    return { front: meshes.front, back: meshes.back, backMark: meshes.backMark, ready, settle, dispose };
  } catch (e) {
    console.warn('[skk] jersey decals unavailable:', e);
    return null; // cosmetic only — never block a character build
  }
}
