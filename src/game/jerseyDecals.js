// JERSEY DECALS — the crew's mark on the chest and the back, and a number on
// every player. Dev, 2026-08-27: "team logos on the uniforms front and back
// with numbers"; the intro videos wear a BIG mark on the chest, so that's the
// bar — you should read who's out there from the dugout shot, and read WHO it
// is off the back of the shirt on the walk-up.
//
// THE MARK IS PART OF THE SHIRT. Dev, on his phone, 2026-08-28: "I need the
// logos and numbers to actually be on the players not hovering like this. its
// really bad." Every round up to here hung the marks on CARDS — bowed planes
// parented to the chest bone, re-seated a few times a second by a "settler"
// that measured where the cloth had got to. A card on a bone cannot win: the
// shirt is skinned to four joints and the card is skinned to one, so the moment
// the kicker turned, breathed or raised an arm the crest floated off the chest,
// drew straight through the arm in front of it, and hung past the torso's
// outline into the background (his four screenshots: #12, #31, #23, #58).
//
// So the decal is no longer a card ON the shirt — it IS the shirt. Each player
// gets two SKINNED SUB-MESHES cut from the body mesh's own chest and back
// triangles, carrying the body's own `skinIndex`/`skinWeight`, bound to the
// body's own skeleton, pushed 4 mm out along their own normals and given a NEW
// planar uv onto the same decal canvas the cards used. The GPU skins them with
// exactly the same maths it skins the vest with, so they deform with the cloth,
// they are occluded by the arm the moment the arm is in front (depth test, no
// depth write), and they cannot hang past a silhouette they are cut from.
// Nothing measures, bows or settles any more — there is nothing left to settle.
//
// The archetype GLBs are one skinned mesh sharing one atlas whose texels are
// re-used across UV islands (that's why cleats had to be tinted by geometry,
// see glbCharacters.applyCleatVertexTint) — painting a logo into that atlas
// would splatter it across faces and shoes. The patch carries its OWN uv set,
// so it never touches the body's atlas.
//
// NOT FROM HERE: the black slab that used to sit behind the back number on a
// red or a gold kit is PRINTED INTO THE ARCHETYPE ATLAS — a dark number panel
// on the vest's back. `glbCharacters.recolorKitTexture` only re-inks pixels
// with `s < 0.17 && v > 0.52`, so the panel survives every kit and shows up on
// anything that isn't a dark shirt. Hide `jersey-back` and it is still there.
// Nothing in this file has EVER filled a rectangle behind a mark since the
// conditional patch came out; the tests below hold that line.
//
// Everything here is metres in the CHARACTER's own space. The window the patch
// is cut from, and the uv projection onto it, are stated in a RIG FRAME: the
// chest bone with its bind rotation and its bind scale cancelled (bone-local
// units are 1/100 of a metre on these rigs, and each archetype's bind basis is
// a little different), so the numbers below are literal metres on a 2.05 m
// player and every archetype gets the same placement.
import * as THREE from 'three';

/** The decal window, in metres — the square of shirt the canvas is printed on.
 *  Kept at 0.40 so the canvas layouts, and every number tuned against them,
 *  carry over from the plane era unchanged. */
export const PLANE_M = 0.40;
/** Canvas per face. 512² over 0.40 m ≈ 1280 px/m: the back number lands ~300 px
 *  tall, which still reads when a phone draws the player 120 px high. */
export const DECAL_PX = 512;
/** A full match dresses 16 players × 2 faces = 32 textures; 64 leaves room for
 *  the Locker captain and a kit change without ever evicting mid-match. */
export const DECAL_CACHE_MAX = 64;
/** Breathing room between the two marks on a face, metres. */
export const STACK_GAP_M = 0.02;
/** Window centre, metres BELOW the chest bone. That bone sits at the COLLARBONE
 *  on these rigs (measured on arch-locs: Hips 0.98, Spine 1.46, shoulders 1.49,
 *  neck 1.55 in model metres, ×1.067 into player metres) — centre the window on
 *  the bone itself and its top half is over bare shoulder and background. Drop
 *  it half a window and the 0.40 m square lands ON the vest: rig +0.01 down to
 *  −0.39, against a shirt that runs +0.03 to about −0.41. */
export const CHEST_DROP_M = 0.19;
/** How far the patch is pushed off the body along each vertex's own normal.
 *  It is not clearance — the patch IS the surface — it is only enough to win
 *  the depth test against the cloth it is a copy of. 4 mm plus `polygonOffset`;
 *  the 45° turntable shots are the check that it never z-fights. */
export const PATCH_LIFT_M = 0.004;
/** How far PAST the ink the patch is cut, metres. The selection keeps whole
 *  triangles whose CENTRE lands in the window, so the patch's own edge is
 *  ragged by up to half a triangle — this margin puts that raggedness outside
 *  the artwork instead of through it. Anything past the 0.40 m square samples
 *  the canvas's clamped (transparent) edge, so a wider patch is free. */
export const WINDOW_PAD_M = 0.03;
/** How square-on a triangle has to face for the patch to claim it — the cosine
 *  of its bind normal against the face's axis. 0.2 keeps the print running
 *  round to the flanks (a real print does) and stops it wrapping under the arm
 *  or onto the far side of the body. */
export const FACE_MIN_Z = 0.2;
/** Under this many triangles a patch is not a patch — an unexpected rig, a
 *  statue mesh, a body the window missed. Ship nothing rather than confetti. */
export const MIN_PATCH_TRIS = 12;
/** …and under this much of the CREW MARK's own box carried by the patch, the
 *  mark is not printed on that face at all: the number goes on alone.
 *
 *  These vests are TANK TOPS. Above the shoulder blades there is a racerback
 *  strap and then bare skin, and the back crest's box sits right up there at
 *  collarbone height — so on a good half of the archetype set the shirt simply
 *  cannot carry it. Measured 2026-08-28 over all 20: the back crest's box is
 *  0.90–1.00 covered on ten of them and 0.02–0.39 on seven (arch-curls 0.02,
 *  arch-twists 0.04, arch-waves and arch-braids 0.15). A card hid that by
 *  hovering in front of the gap; a print cannot, and a badge with four fifths
 *  of it missing reads as a rendering glitch — see `locker-monarchs-dark-back`
 *  in the first pass of `decals-skinned/`. A clean number reads as a jersey.
 *  The cut is where the measured set splits: nothing lands between 0.39 and
 *  0.61. Never gates a NUMBER — that is who the player is — and measured today
 *  it never fires on a chest (the front crest runs 0.65–1.00). */
export const MARK_COVER_MIN = 0.55;

/** Which skin joints count as SHIRT: the SPINE CHAIN plus the HIPS root — the
 *  trunk, and nothing a hairstyle hangs off.
 *
 *  Both halves of that were measured, not assumed, across the archetype set:
 *   - SHOULDERS ARE NOT TRUNK. These auto-rigs skin the hair to them:
 *     arch-braids gives `RightShoulder` 2865 vertices running back to z −0.30
 *     against a shirt at −0.14, and arch-locs hangs the dreadlocks off
 *     `LeftShoulder`. A patch that trusted the shoulders would be cut out of
 *     the braids. (They get back in under a weight gate — see below.)
 *   - HIPS IS IN. Measured on the shipped rule, 2026-08-28: with hips out, the
 *     back patch covers 11 % of the number's box on arch-locs and 27 % on
 *     arch-braids — the hero number, cut to ribbons. The lower back of these
 *     vests is Hips-weighted. Hips carries no hairstyle on any rig.
 *  `neck` is excluded by name — it carries the collar and every ponytail. */
const SHIRT_JOINT = /(spine|chest|torso|hip|pelvis)/i;
const NOT_SHIRT_JOINT = /(neck|head|hair|jaw|eye)/i;
const SHOULDER_JOINT = /(shoulder|clavicle)/i;
/** …AND THE SHOULDERS COME BACK IN, GATED ON WEIGHT. The cloth over the
 *  shoulder blades and across the upper chest is skinned to the SHOULDER
 *  joints, not the spine — measured 2026-08-28 on the shipped selection, the
 *  spine-and-hips-only rule covers 0–8 % of the back crest's box on every
 *  archetype tried (arch-locs 1 %, arch-bald 0 %). That is the whole upper back
 *  missing from the patch.
 *
 *  What tells blade cloth from a braid hanging off the same joint is the SKIN
 *  WEIGHTS, and nothing else does: they are one welded shell under one material
 *  on an atlas whose islands overlap, so neither geometry nor texel can
 *  separate them. Cloth on the trunk is blended shoulder+spine; a braid is
 *  ~1.0 shoulder and carries no spine weight at all. So a shoulder-dominant
 *  vertex joins the patch only if the SHIRT bones hold at least this much of
 *  its weight. A tenth, measured: it takes arch-locs' back crest from 1 % to
 *  97 % and arch-bald's from 0 % to 97 %, and at 0.20 both fall back to a
 *  quarter — the blade cloth itself starts failing the gate. */
export const SHOULDER_SHIRT_WEIGHT_MIN = 0.10;

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
// Rects are METRES on the 0.40 m window: `y`/`x` are offsets of the mark's
// CENTRE from the window centre (+y up, +x toward the player's left as you look
// at that face), `w`/`h` its box. A number's `w` is its CAP HEIGHT — the glyphs
// are as wide as they need to be.

/** HOW WIDE THESE VESTS ACTUALLY ARE, half-width in window metres. Measured
 *  2026-08-28 over all 20 archetypes: the shipped selection was projected
 *  through its own uv and averaged, and the band that has cloth on essentially
 *  every rig runs x −0.116 … +0.122 on the chest and −0.109 … +0.116 on the
 *  back (neither is symmetric — the A-pose arms are not). Call it 0.115 either
 *  side, both faces.
 *
 *  Past that you are printing on the arm, and once the print is part of the
 *  shirt "printing on the arm" means the ink is simply GONE. Two things were
 *  drawn past it and the patch is what made that visible instead of floating:
 *  the chest number (x +0.10, 0.10 m cap — its outer digit landed at +0.19, and
 *  came back sliced in half), and the back number, which was let out to 0.86 of
 *  the window: measured off the painted canvas, "23" inked 0.323 m wide, so its
 *  ends ran onto the flank where the planar projection SMEARS them round the
 *  ribs. See `.superpowers/sdd/2026-08-27-crews-kits-walkout/decals-skinned/`. */
export const CLOTH_HALF_W = 0.115;
/** What a number INKS, as a multiple of its cap height, edge included: two
 *  digits of Archivo 900 measured in the browser — advance 0.667 em each,
 *  ascent 0.7022 em, plus NUM_EDGE_RATIO. So (2×0.667 + 0.056) / (0.7022 +
 *  0.056) = 1.833. Half of that is how far a centred number reaches. */
export const NUM_INK_W_RATIO = 1.833;

/** Chest: the crew mark big and centred, the number small up on the wearer's
 *  LEFT chest — viewer's RIGHT, +x on this face — which is where a jersey
 *  actually wears it.
 *
 *  The MARK keeps its 0.34: it is drawn wider than the vest and the armhole
 *  trims it, which is what a printed vest does and what "a BIG mark on the
 *  chest" asks for. The NUMBER cannot be trimmed — half a number is a bug, not
 *  a print — so its box is sized and slid to keep every digit inside
 *  CLOTH_HALF_W: 0.035 + 1.833 × 0.085 / 2 = 0.113. */
export function layoutFront() {
  return { logo: { w: 0.34, h: 0.34, y: 0.06 }, num: { w: 0.085, y: 0.14, x: 0.035 } };
}

/** Back: the number is the hero, the crew mark rides above it. */
export function layoutBack() {
  return { num: { w: 0.26, y: 0.02 }, logo: { w: 0.16, y: 0.22 } };
}

/**
 * Squeeze the marks asked for onto one face, top to bottom, without overlap.
 * Both layouts ask for MORE than the window holds (front .34 + .10, back
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

/** Slide a rect until it sits wholly inside the window, size untouched. */
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
 * far enough to stay on the window.
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
 * The strip of shirt one face is cut from, in RIG METRES about the chest bone.
 *
 * `cx/cy/w/h` are the 0.40 m canvas square itself — the uv projection maps that
 * square 1:1 onto the canvas the plane era drew, so every layout number, font
 * fit and outline weight carries over untouched. `halfX/loY/hiY` are the
 * SELECTION bounds: the ink's own union box grown by WINDOW_PAD_M.
 *
 * The FRONT takes the full window width. Its mark is drawn 0.34 m wide on a
 * torso that measures about 0.29 m across the chest, so the cut is made by the
 * ARM JOINTS (an arm vertex is never trunk) rather than by an x bound — the
 * print runs to the armhole and stops there, which is what a printed vest does.
 * The BACK takes its marks' own width: nothing out at the flanks belongs to it.
 */
export function patchWindow(side, dropM = CHEST_DROP_M) {
  const b = faceBoxes(side);
  const lo = Math.min(b.logo.y - b.logo.h / 2, b.num.y - b.num.h / 2) - WINDOW_PAD_M;
  const hi = Math.max(b.logo.y + b.logo.h / 2, b.num.y + b.num.h / 2) + WINDOW_PAD_M;
  const halfX = side === 'back'
    ? Math.max(Math.abs(b.logo.x ?? 0) + b.logo.w / 2, Math.abs(b.num.x ?? 0) + b.num.w / 2) + WINDOW_PAD_M
    : PLANE_M / 2;
  return { cx: 0, cy: -dropM, w: PLANE_M, h: PLANE_M, halfX, loY: -dropM + lo, hiY: -dropM + hi };
}

/**
 * Where a point of shirt lands on the decal canvas: a straight planar
 * projection of its BIND position onto the window square. No wrap, no
 * unwrapping — the artwork keeps its shape and the cloth carries it.
 *
 * The back mirrors `u`. Its patch is seen from behind, so without the mirror
 * the hero number reads backwards from the one place it exists to be read.
 * @returns {[number, number]} u, v
 */
export function projectUv(x, y, win, side) {
  const u = (x - win.cx) / win.w + 0.5;
  const v = (y - win.cy) / win.h + 0.5;
  return [side === 'back' ? 1 - u : u, v];
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
    // it. `stackFace` settles the back run flush against the window's bottom, so
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
    // …AND NO WIDER THAN THE SHIRT. This used to be 0.86 of the window — a
    // number free to ink 0.344 m across a back that is 0.23 m wide, so a
    // two-digit number ran off both flanks. Off a card that just looked big;
    // on a patch the ends land where the cloth is turning away from the
    // projection and smear round the ribs (`decals-skinned/proof-45-monarchs-*`).
    // Bounded by the cloth, the hero number is smaller and all of it is there.
    const maxW = mToPx(2 * CLOTH_HALF_W);
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
// Every mark in public/assets/logos/ is cut to 1024² RGBA — 4 MB decoded, and
// the size any new art must land at (eight of them shipped at 2000² for a
// while, which is 16 MB each and made this comment a lie). So the cache stays
// TINY: a match needs two marks, the Locker one. The decal texture is what's
// kept — the source image is only needed while it's being drawn.
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
 * The joint the decal window hangs off. Name priority first (a Mixamo rig means
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

/** Is this bone part of the SHIRT's TRUNK? Braids, dreadlocks and ponytails are
 *  skinned to the neck and — on these rigs — to the SHOULDER joints, so a patch
 *  that trusted geometry alone would be cut out of the hair. Only the trunk
 *  qualifies outright: spine chain + hips. See SHIRT_JOINT for the numbers. */
export function isShirtBone(name) {
  const n = String(name ?? '');
  if (NOT_SHIRT_JOINT.test(n)) return false;
  return SHIRT_JOINT.test(n);
}

/** Is this bone a SHOULDER — the joint the blade and upper-chest cloth is
 *  skinned to, and the joint every long hairstyle hangs off? A vertex it
 *  dominates joins the patch only under the weight gate (see
 *  SHOULDER_SHIRT_WEIGHT_MIN). */
export function isShoulderBone(name) {
  const n = String(name ?? '');
  if (NOT_SHIRT_JOINT.test(n)) return false;
  return SHOULDER_JOINT.test(n);
}

// ---- cutting the patch out of the body ------------------------------------

/**
 * What the selection needs to know about each of the skeleton's slots: how it
 * places a vertex in RIG metres (and turns a normal), and what part of the body
 * it is.
 *
 * `rigInv` is the inverse of the rig frame's world matrix — pass null (a test
 * rig already stated in rig metres) and the geometry is read as-is.
 *
 * In bind pose `bone.matrixWorld · boneInverse` IS the geometry→world map for a
 * vertex welded to that bone, whatever the rig did with node transforms (these
 * GLBs park the whole armature at scale 0.01), so this needs no assumptions
 * about units. A shirt vertex is SKINNED rather than welded, so it is placed
 * with its own linear blend of those maps — the same weighted sum the GPU skins
 * with — because build scaling bakes a different accumulated scale into each
 * link of the spine and "borrow the chest bone's transform" reads a four-joint
 * back vertex as much as 5 cm out.
 */
export function rigSlots(mesh, rigInv = null) {
  return boneFrames(mesh, rigInv).map((f) => ({
    ...f,
    shirt: isShirtBone(f.name),
    shoulder: isShoulderBone(f.name),
  }));
}

/**
 * The BIND MAP of every slot in a skeleton, with nothing said about what part
 * of the body it is — the half of `rigSlots` that is pure geometry.
 *
 * SHARED WITH `accessories.js`, which cuts a wristband and a headband out of
 * the same body the same way; the only thing that differs between a crest and a
 * band is which joints and which window claim a triangle.
 *
 * @param {THREE.SkinnedMesh} mesh
 * @param {THREE.Matrix4|null} rigInv inverse of the rig frame's world matrix —
 *   null (a test rig already stated in rig metres) reads the geometry as-is
 * @returns {{name:string, xform:THREE.Matrix4|null, normal:THREE.Matrix3|null}[]}
 */
export function boneFrames(mesh, rigInv = null) {
  const bones = mesh?.skeleton?.bones ?? [];
  const inverses = mesh?.skeleton?.boneInverses ?? [];
  return bones.map((b, i) => {
    let xform = null;
    if (rigInv && b && inverses[i]) {
      xform = new THREE.Matrix4()
        .multiplyMatrices(rigInv, new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inverses[i]));
    }
    return {
      name: b?.name ?? '',
      xform,
      normal: xform ? new THREE.Matrix3().getNormalMatrix(xform) : null,
    };
  });
}

/** RIG METRES PER GEOMETRY UNIT for a set of bone frames — every lift in this
 *  file and in `accessories.js` is quoted in metres and every position buffer
 *  is in whatever units the GLB was authored in (1/100 m on these rigs). */
export function frameScale(frames) {
  const ref = frames?.find?.((f) => f.xform)?.xform;
  return ref ? new THREE.Vector3().setFromMatrixScale(ref).x : 1;
}

/**
 * THE PATCH: the body's own triangles that make up one face of the print.
 *
 * A triangle joins the patch when
 *  1. EVERY vertex is shirt — its dominant joint is a trunk joint, or a
 *     shoulder joint holding at least SHOULDER_SHIRT_WEIGHT_MIN of trunk weight
 *     (that gate is the only thing that separates blade cloth from a braid);
 *  2. it FACES the right way — the mean of its three bind normals, projected
 *     on the face's axis, clears FACE_MIN_Z; and
 *  3. its CENTRE lands inside the window.
 *
 * The centre — rather than all three corners — is what makes the patch cover
 * the ink rather than a shape a triangle's width inside it; WINDOW_PAD_M keeps
 * the resulting ragged edge off the artwork. Vertices are COPIED, not shared,
 * so a corner shared with a rejected neighbour costs nothing.
 *
 * One pass over the vertices and one over the index buffer, once per character
 * at build. Nothing runs per frame.
 *
 * @param {THREE.SkinnedMesh} mesh the body
 * @returns {{triangles:number[], x:Float32Array, y:Float32Array, z:Float32Array,
 *   window:object}|null} `triangles` is flat: three BODY vertex indices per face
 */
export function selectPatchTriangles(mesh, { side = 'front', slots = null, window: win = null } = {}) {
  const geo = mesh?.geometry;
  const pos = geo?.getAttribute?.('position');
  if (!pos?.count) return null;
  const nor = geo.getAttribute?.('normal');
  const si = geo.getAttribute?.('skinIndex');
  const sw = geo.getAttribute?.('skinWeight');
  const slot = slots ?? rigSlots(mesh, null);
  const W = win ?? patchWindow(side);
  const sign = side === 'back' ? -1 : 1;

  const N = pos.count;
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const z = new Float32Array(N);
  const nz = new Float32Array(N);
  const shirt = new Uint8Array(N);

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  const pn = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const skinned = !!(si && sw);

  for (let i = 0; i < N; i++) {
    v.fromBufferAttribute(pos, i);
    if (nor) n.fromBufferAttribute(nor, i); else n.set(0, 0, sign);
    if (!skinned) {
      // A statue rig (no JOINTS_0/WEIGHTS_0 — arch-band's authoring defect)
      // has nothing to filter hair/arms on, so it gets NO print rather than a
      // crest on whatever face or arm falls in the window. Benched today.
      p.copy(v); pn.copy(n);
      const one = slot.find((s) => s.xform);
      if (one) { p.applyMatrix4(one.xform); pn.applyMatrix3(one.normal); }
      x[i] = p.x; y[i] = p.y; z[i] = p.z;
      nz[i] = pn.normalize().z;
      shirt[i] = 0;
      continue;
    }
    const j0 = si.getX(i); const j1 = si.getY(i); const j2 = si.getZ(i); const j3 = si.getW(i);
    const w0 = sw.getX(i); const w1 = sw.getY(i); const w2 = sw.getZ(i); const w3 = sw.getW(i);
    p.set(0, 0, 0); pn.set(0, 0, 0);
    let used = 0; let total = 0; let trunk = 0; let domW = 0; let domSlot = -1;
    for (let k = 0; k < 4; k++) {
      const w = k === 0 ? w0 : k === 1 ? w1 : k === 2 ? w2 : w3;
      if (!(w > 0)) continue;
      const j = k === 0 ? j0 : k === 1 ? j1 : k === 2 ? j2 : j3;
      total += w;
      if (slot[j]?.shirt) trunk += w;
      if (w > domW) { domW = w; domSlot = j; }   // ties go to the first
      const s = slot[j];
      if (!s?.xform) continue;
      tmp.copy(v).applyMatrix4(s.xform); p.addScaledVector(tmp, w);
      tmp.copy(n).applyMatrix3(s.normal); pn.addScaledVector(tmp, w);
      used += w;
    }
    if (used > 0) { p.multiplyScalar(1 / used); pn.multiplyScalar(1 / used); }
    else { p.copy(v); pn.copy(n); }               // no slot had a usable transform
    x[i] = p.x; y[i] = p.y; z[i] = p.z;
    nz[i] = pn.lengthSq() > 0 ? pn.normalize().z : 0;
    const s = slot[domSlot];
    const share = total > 0 ? trunk / total : 0;
    shirt[i] = (s && (s.shirt || (s.shoulder && share >= SHOULDER_SHIRT_WEIGHT_MIN))) ? 1 : 0;
  }

  const index = geo.getIndex?.();
  const tris = index ? Math.floor(index.count / 3) : Math.floor(N / 3);
  const triangles = [];
  for (let t = 0; t < tris; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    if (!shirt[a] || !shirt[b] || !shirt[c]) continue;
    if ((nz[a] + nz[b] + nz[c]) / 3 * sign < FACE_MIN_Z) continue;
    const cx = (x[a] + x[b] + x[c]) / 3;
    const cy = (y[a] + y[b] + y[c]) / 3;
    if (Math.abs(cx - W.cx) > W.halfX || cy < W.loY || cy > W.hiY) continue;
    triangles.push(a, b, c);
  }
  return { triangles, x, y, z, window: W };
}

/**
 * That selection as a geometry the GPU can skin: the body's own positions,
 * normals and skin weights for the chosen vertices, re-indexed, with a NEW
 * planar uv onto the decal canvas — and every position pushed `lift` out along
 * its own normal so the print wins the depth test against the cloth it is a
 * copy of.
 *
 * @param {THREE.SkinnedMesh} mesh the body
 * @param {object} sel what `selectPatchTriangles` returned
 * @param {'front'|'back'} side
 * @param {{lift?:number, scale?:number}} o `scale` is RIG METRES PER GEOMETRY
 *   UNIT — the lift is quoted in metres and the buffer is in the body's units.
 */
export function buildPatchGeometry(mesh, sel, side, { lift = PATCH_LIFT_M, scale = 1 } = {}) {
  return skinPatchGeometry(mesh, sel.triangles, {
    lift,
    scale,
    defaultNormal: side === 'back' ? [0, 0, -1] : [0, 0, 1],
    uv: (old) => projectUv(sel.x[old], sel.y[old], sel.window, side),
  });
}

/**
 * One averaged, normalised normal per POSITION over the vertices a patch uses —
 * the cure for the hairline cracks a uv seam opens in a lifted patch.
 * Positions at a seam are bit-identical (the split is in uv and normal only),
 * so an exact key is the right key.
 * @returns {Map<number, [number,number,number]>} body vertex -> normal
 */
export function weldNormals(pos, nor, triangles) {
  const out = new Map();
  if (!nor) return out;
  const groups = new Map();
  for (const i of triangles) {
    if (out.has(i)) continue;
    out.set(i, null);
    const key = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
    let g = groups.get(key);
    if (!g) { g = { n: [0, 0, 0], of: [] }; groups.set(key, g); }
    g.n[0] += nor.getX(i); g.n[1] += nor.getY(i); g.n[2] += nor.getZ(i);
    g.of.push(i);
  }
  for (const g of groups.values()) {
    const len = Math.hypot(g.n[0], g.n[1], g.n[2]) || 1;
    const n = [g.n[0] / len, g.n[1] / len, g.n[2] / len];
    for (const i of g.of) out.set(i, n);
  }
  return out;
}

/**
 * ANY list of body triangles as a geometry the GPU can skin — the generic half
 * of `buildPatchGeometry`, shared with `accessories.js`.
 *
 * The body's own positions, normals and skin weights for the chosen vertices,
 * re-indexed, every position pushed `lift` METRES out along its own normal so
 * the patch wins the depth test against the surface it is a copy of. Vertices
 * are COPIED, not shared, so a corner shared with a rejected neighbour costs
 * nothing.
 *
 * @param {THREE.SkinnedMesh} mesh the body
 * @param {number[]} triangles flat: three BODY vertex indices per face
 * @param {{lift?:number, scale?:number, uv?:((i:number)=>[number,number])|null,
 *   defaultNormal?:number[], attributes?:{name:string, value:(i:number)=>number}[]}} o
 *   `scale` is RIG METRES PER GEOMETRY UNIT (see `frameScale`); `uv` null means
 *   the patch carries no uv at all — a flat colour needs none, and an unused
 *   attribute is bytes on the GPU for nothing. `attributes` adds one float per
 *   vertex for a shader of the caller's own (the bands' edge coordinate).
 *   `weld` averages the normals of vertices sharing a position — see below.
 */
export function skinPatchGeometry(mesh, triangles, {
  lift = PATCH_LIFT_M, scale = 1, uv = null, defaultNormal = [0, 0, 1], attributes = [],
  weld = false,
} = {}) {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const off = lift / (scale || 1);
  // SPLIT NORMALS TEAR A LIFTED PATCH. A uv seam duplicates a vertex in the
  // body mesh — same position, DIFFERENT normal — and pushing each copy along
  // its own normal pulls them apart by up to the whole lift, so the patch opens
  // a hairline crack down every seam it crosses and the skin underneath shines
  // through it (`bands/close-wrists-akron-2`, second pass). Averaging the
  // normals of everything at one position closes it; the seam's own shading is
  // irrelevant here because a patch is drawn flat.
  const welded = weld ? weldNormals(pos, nor, triangles) : null;
  const seen = new Map(); // body vertex -> patch vertex
  const P = []; const NN = []; const UV = []; const SI = []; const SW = []; const IX = [];
  const EX = attributes.map(() => []);
  for (const old of triangles) {
    let at = seen.get(old);
    if (at === undefined) {
      at = P.length / 3;
      seen.set(old, at);
      const w3 = welded?.get(old);
      const nx = w3 ? w3[0] : (nor ? nor.getX(old) : defaultNormal[0]);
      const ny = w3 ? w3[1] : (nor ? nor.getY(old) : defaultNormal[1]);
      const nzv = w3 ? w3[2] : (nor ? nor.getZ(old) : defaultNormal[2]);
      P.push(pos.getX(old) + nx * off, pos.getY(old) + ny * off, pos.getZ(old) + nzv * off);
      NN.push(nx, ny, nzv);
      if (uv) { const [u, v] = uv(old); UV.push(u, v); }
      SI.push(si ? si.getX(old) : 0, si ? si.getY(old) : 0, si ? si.getZ(old) : 0, si ? si.getW(old) : 0);
      SW.push(sw ? sw.getX(old) : 1, sw ? sw.getY(old) : 0, sw ? sw.getZ(old) : 0, sw ? sw.getW(old) : 0);
      attributes.forEach((a, k) => EX[k].push(a.value(old)));
    }
    IX.push(at);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  attributes.forEach((a, k) => out.setAttribute(a.name, new THREE.Float32BufferAttribute(EX[k], 1)));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  out.setIndex(IX);
  out.computeBoundingSphere();
  out.userData.owned = true; // per-character: disposeCharacter() frees it
  return out;
}

/**
 * How much of one mark's box the patch actually carries, 0..1 — rasterised
 * through the patch's OWN uv, which IS the canvas square, so a covered texel is
 * a texel with cloth behind it. Run once per face at build; nothing per frame.
 * @param {THREE.BufferGeometry} geometry a built patch
 * @param {{x?:number,y:number,w:number,h:number}} box a `faceBoxes` rect, metres
 */
export function patchCoverage(geometry, box, side, res = 32) {
  const uv = geometry?.getAttribute?.('uv');
  const ix = geometry?.getIndex?.();
  if (!uv || !ix || !box) return 0;
  const toU = (m) => m / PLANE_M + 0.5;
  const u0 = toU((box.x ?? 0) - box.w / 2); const u1 = toU((box.x ?? 0) + box.w / 2);
  const v0 = toU(box.y - box.h / 2); const v1 = toU(box.y + box.h / 2);
  if (!(u1 > u0) || !(v1 > v0)) return 0;
  const cell = new Uint8Array(res * res);
  const px = [0, 0, 0]; const py = [0, 0, 0];
  for (let t = 0; t + 2 < ix.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i = ix.getX(t + k);
      const u = side === 'back' ? 1 - uv.getX(i) : uv.getX(i);
      px[k] = ((u - u0) / (u1 - u0)) * res;
      py[k] = ((uv.getY(i) - v0) / (v1 - v0)) * res;
    }
    const d = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
    if (!(Math.abs(d) > 1e-12)) continue;
    const x0 = Math.max(0, Math.floor(Math.min(px[0], px[1], px[2])));
    const x1 = Math.min(res - 1, Math.ceil(Math.max(px[0], px[1], px[2])));
    const y0 = Math.max(0, Math.floor(Math.min(py[0], py[1], py[2])));
    const y1 = Math.min(res - 1, Math.ceil(Math.max(py[0], py[1], py[2])));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const cx = xx + 0.5; const cy = yy + 0.5;
        const w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / d;
        const w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / d;
        if (w0 >= -1e-6 && w1 >= -1e-6 && 1 - w0 - w1 >= -1e-6) cell[yy * res + xx] = 1;
      }
    }
  }
  let on = 0;
  for (let i = 0; i < cell.length; i++) on += cell[i];
  return on / (res * res);
}

/** Basic, not lit: the mark has to READ on a 120 px player in any light, and it
 *  is the same canvas the plane era shipped. `depthWrite:false` with the depth
 *  TEST left on is what puts the arm in front of the crest — the body writes
 *  depth first and the print is simply not drawn where the arm already is,
 *  which is the whole bug the dev photographed. `polygonOffset` backs up the
 *  4 mm lift against z-fighting at grazing angles. */
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
  // THE GRAZING FADE at the PRINT's thresholds (`GRAZE`, below). The uv is a
  // PLANAR projection of the window onto the cloth, so where the cloth turns
  // edge-on to that projection a texel covers a lot of surface and the print
  // SMEARS round the flank — on the walk-out that read as a black slick of the
  // back number's outline down a player's ribs (`decals-skinned/walkout-4.png`,
  // first pass). Tightening the selection's own facing gate costs the crest its
  // flanks on every archetype for a defect that only shows at the silhouette; a
  // fade is camera-relative, so it only ever touches the rim that is actually
  // smeared — and a print running out of sight round a body is what a print
  // does. A FLAT-COLOUR band has no projection to smear and fades far later.
  applyGrazingFade(mat, 'jerseyPatch');
  mat.userData.owned = true;
  return mat;
}

/** How square-on a patch has to face the camera before it fades out, as the
 *  cosine of its skinned normal against the view ray. The PRINT's numbers: it
 *  is a planar projection, so it starts smearing well before the silhouette. */
export const GRAZE = { from: 0.14, to: 0.44 };

/**
 * THE GRAZING FADE — fade a skinned patch out where its surface turns edge-on
 * to the camera, so the rim never smears round a flank or leaves a hard seam
 * where the patch's border runs off the silhouette. SHARED with the crew
 * accessories, which are the same kind of patch in a flat colour.
 *
 * `transformedNormal` is three's own SKINNED, view-space normal, which the
 * basic vertex shader computes whenever USE_SKINNING is on (it always is here).
 * The card era faded on `mat3(modelMatrix) * normal`, which on a skinned mesh is
 * the BIND normal and would lag every pose.
 *
 * The thresholds are a parameter because a BAND is not a print: a print's uv is
 * a planar projection that smears long before the silhouette, and a flat colour
 * has no projection to smear. Faded on the print's numbers, a wristband loses a
 * stripe down every wrinkle in the wrist (`bands/close-wrists-akron-2` in the
 * first pass) — so a band fades only on the last few degrees of the rim.
 * @param {object} sh three's shader object, inside `onBeforeCompile`
 */
export function grazingFadeShader(sh, { from = GRAZE.from, to = GRAZE.to } = {}) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDecalN;\nvarying vec3 vDecalV;')
    .replace('#include <begin_vertex>', '#ifdef USE_SKINNING\n\tvDecalN = transformedNormal;\n#else\n\tvDecalN = vec3(0.0, 0.0, 1.0);\n#endif\n#include <begin_vertex>')
    .replace('#include <project_vertex>', '#include <project_vertex>\n\tvDecalV = -mvPosition.xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDecalN;\nvarying vec3 vDecalV;')
    .replace('#include <alphatest_fragment>', `\tdiffuseColor.a *= smoothstep(${from.toFixed(3)}, ${to.toFixed(3)}, abs(dot(normalize(vDecalN), normalize(vDecalV))));\n#include <alphatest_fragment>`);
  return sh;
}

/**
 * The fade, hung on a material.
 * @param {THREE.Material} mat needs `transparent` — the fade is on ALPHA
 * @param {string} cacheKey three caches programs by material type + defines, so
 *   a patched shader MUST carry a key of its own or it is served the stock one.
 *   Anything baked into the source below — the thresholds, an `extra` patch —
 *   has to be answered for by this key.
 * @param {{from?:number, to?:number, extra?:(sh:object)=>void}} [o] `extra`
 *   chains another patch onto the same compile (the bands' edge feather)
 */
export function applyGrazingFade(mat, cacheKey = 'skinPatch', { from, to, extra = null } = {}) {
  mat.onBeforeCompile = (sh) => {
    grazingFadeShader(sh, { from, to });
    extra?.(sh);
  };
  mat.customProgramCacheKey = () => cacheKey;
  return mat;
}

/**
 * Hang a patch off the body it was cut from: next to the body, with the body's
 * own transform, bound to the body's own skeleton.
 *
 * In `attached` bind mode a skinned mesh's own matrix cancels out of the skin,
 * but keeping them identical means nothing about it can ever drift. SHARED with
 * `accessories.js`.
 */
export function bindPatchToBody(patch, body, root = null) {
  patch.position.copy(body.position);
  patch.quaternion.copy(body.quaternion);
  patch.scale.copy(body.scale);
  patch.bindMode = body.bindMode;
  patch.bind(body.skeleton, body.bindMatrix);
  // only in the graph once it is bound — a throw above leaves nothing behind
  (body.parent ?? root)?.add(patch);
  patch.updateMatrixWorld(true);
  return patch;
}

let warnedPatch = false;
function warnPatch(msg) {
  if (warnedPatch) return;
  warnedPatch = true;
  console.warn('[skk] jersey decal patch:', msg);
}

/**
 * Print the crew mark and the number ON one character's shirt.
 *
 * Sync: the patches go on immediately (hidden) and light up when the mark and
 * the display font have landed, so a slow logo never delays a player onto the
 * field. `ready` resolves once they're painted — the e2e pass waits on it.
 *
 * @param {{group:THREE.Object3D}} char a built character
 * @param {{logoUrl?:string, number?:number|string, ink?:string, hex?:string}} o
 * @returns {{front:THREE.SkinnedMesh|null, back:THREE.SkinnedMesh|null,
 *   triangles:{front:number,back:number}, marks:{front:boolean,back:boolean},
 *   cover:{front:number,back:number}, ready:Promise<void>, dispose:Function}|null}
 *   `marks` says whether each face got the CREW MARK as well as the number —
 *   a face whose shirt could not carry it wears the number alone.
 */
export function attachJerseyDecals(char, { logoUrl = '', number = '', ink = null, hex = null } = {}) {
  try {
    const root = char?.group;
    if (!root) return null;
    root.updateMatrixWorld(true);
    const bone = findChestBone(root);
    if (!bone) return null;
    let body = null;
    root.traverse((o) => { if (!body && o.isSkinnedMesh && o.skeleton) body = o; });
    if (!body) { warnPatch('no skinned body mesh — no print'); return null; }
    const paint = ink ?? oppositeInk(hex ?? INK_DARK);

    // THE RIG FRAME: the chest bone with its bind rotation and its bind scale
    // cancelled, so what is stated inside it is plain metres with +Z the way
    // the character faces. (The archetype spine joints come out near identity —
    // X right, Y up the spine, Z out through the sternum — but Hips and each
    // archetype's own bake vary, so cancel rather than trust.) It is a MATRIX,
    // not a node: nothing hangs off the bone any more.
    const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(bone.matrixWorld);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    rel.decompose(new THREE.Vector3(), q, s);
    const rigLocal = new THREE.Matrix4().compose(
      new THREE.Vector3(),
      q.clone().invert(),
      new THREE.Vector3().setScalar(1 / (s.x || 1)),
    );
    const rigInv = new THREE.Matrix4()
      .multiplyMatrices(bone.matrixWorld, rigLocal).invert();

    const slots = rigSlots(body, rigInv);
    // Rig metres per geometry unit — the lift is quoted in metres and the
    // position buffer is in whatever the GLB was authored in.
    const scale = frameScale(slots);

    const meshes = {};
    const triangles = { front: 0, back: 0 };
    /** Whether the CREW MARK is printed on each face — see MARK_COVER_MIN. */
    const marks = { front: false, back: false };
    const cover = { front: 0, back: 0 };
    for (const side of ['front', 'back']) {
      const sel = selectPatchTriangles(body, { side, slots });
      const n = sel ? sel.triangles.length / 3 : 0;
      triangles[side] = n;
      if (n < MIN_PATCH_TRIS) {
        warnPatch(`${side}: only ${n} triangles on this rig — no print on that face`);
        continue;
      }
      const patch = new THREE.SkinnedMesh(
        buildPatchGeometry(body, sel, side, { scale }),
        decalMaterial(null),
      );
      patch.name = side === 'back' ? 'jersey-back' : 'jersey-front';
      patch.renderOrder = 2;
      patch.frustumCulled = false; // it rides a skeleton; its own bounds lie
      patch.visible = false;       // until the mark is painted
      cover[side] = patchCoverage(patch.geometry, faceBoxes(side).logo, side);
      marks[side] = cover[side] >= MARK_COVER_MIN;
      patch.userData.decal = {
        side, triangles: n, window: sel.window, markCover: cover[side], mark: marks[side],
      };
      bindPatchToBody(patch, body, root);
      meshes[side] = patch;
    }
    if (!meshes.front && !meshes.back) return null;

    let dead = false;
    const ready = Promise.all([
      loadLogoImage(logoUrl),
      // Archivo comes off the page's webfont; drawing before it lands gives a
      // system-font number, and the canvas is cached, so it'd stay wrong.
      Promise.resolve(document?.fonts?.load?.(`900 100px ${FONT_STACK}`)).catch(() => null),
    ]).then(([img]) => {
      if (dead) return;
      for (const side of ['front', 'back']) {
        const m = meshes[side];
        if (!m) continue;
        // A face whose shirt cannot carry the mark gets the NUMBER alone: a
        // badge four fifths eaten by a racerback reads as a glitch. Passing
        // null re-uses `paintFace`'s own number-only path and keys its own
        // cache entry, which every player in the same fix then shares.
        m.material.map = decalTexture(marks[side] ? img : null, number, paint, side);
        m.material.needsUpdate = true;
        m.visible = true;
      }
    }).catch(() => {});

    const dispose = () => {
      dead = true;
      for (const m of Object.values(meshes)) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose(); // the MAP is shared via the cache — never here
        // the SKELETON is the body's; disposing it here would blank the player
      }
    };
    return { front: meshes.front ?? null, back: meshes.back ?? null, triangles, marks, cover, ready, dispose };
  } catch (e) {
    console.warn('[skk] jersey decals unavailable:', e);
    return null; // cosmetic only — never block a character build
  }
}
