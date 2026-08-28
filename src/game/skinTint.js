// SKIN TONE + KIT MASK — the two pixel rules the archetype recolour runs on.
//
// Every archetype ships ONE atlas: a neutral-grey kit, the player's baked skin,
// dark shorts and darker hair, texels re-used across UV islands. The recolour
// pass in glbCharacters walks that atlas once and has to answer two questions
// per texel: is this the SHIRT (paint it the crew's colour) or is this SKIN
// (move it to this player's tone)? Nothing may answer yes twice — a cheekbone
// that lands in the kit mask comes out the colour of the jersey.
//
// Both answers are pure maths on one texel, so they live here and are unit
// tested instead of eyeballed on a 2048² atlas.
//
// WHY THE SKIN RULE REACHES DOWN TO s = 0.09, not the 0.18 the spec sketched:
// measured across all 19 atlases (casts/probe-bands.mjs), 5–13 % of what the
// old `s < 0.17 && v > 0.52` kit mask caught on the pale rigs (shaggy 12.9 %,
// pony 10.4 %, bun 10.3 %, stache 6.6 %) was WARM, barely-saturated LIT SKIN —
// a lit cheek runs s ≈ 0.10-0.12, and on arch-stache that IS most of his face.
// Those texels were being painted the team colour. The kit itself is dead
// neutral (s = 0.00 clusters are 90 %+ of the mask) and warm-lit white cloth
// only reaches s ≈ 0.05-0.08, so the floor sits at 0.09: above the shirt,
// below the cheek.

/** The four tones a cast slot can ask for (spec §4). */
export const SKIN_TONES = {
  deep: '#5a3a2a',
  brown: '#8a5a3c',
  tan: '#b98461',
  light: '#e2b58f',
};

// --- the bands -------------------------------------------------------------
/**
 * ...AND WHY THE BORDER TEXELS ARE HANDED BACK (fix round 1).
 * A floor at 0.09 also catches the 1-2 texel ANTI-ALIASED SEAM between the kit
 * and the skin — a blend of white cloth and a warm arm is warm and barely
 * saturated, so the skin rule claimed it and re-lit it by L/refL. On a dark kit
 * those seam texels came out near-white and ran as a speckled outline round
 * every neckline, armhole, hem and shoe line (review 2026-08-28). Raising the
 * floor to 0.12 would sweep them up, but it ALSO repaints 500-1710 INTERIOR
 * face texels per rig (casts/probe-fringe.mjs) — the exact pale-cheek bug the
 * 0.09 measurement exists to prevent. So the floor stays, and the seam is taken
 * by ADJACENCY instead: a barely-saturated skin texel that TOUCHES a kit texel
 * is a blend of the two, and the kit takes it. Every texel that rule moves is
 * on the border by construction; nothing in the middle of a face can qualify.
 */
export const SKIN_BLEND_SAT = 0.13;
/** Skin hue window, degrees. Everything human on these atlases is orange-warm. */
export const SKIN_HUE = [10, 40];
/** Saturation window. The floor is the lit-cheek measurement above; the ceiling
 *  keeps the deepest shadow creases and any painted-on graphic out. */
export const SKIN_SAT = [0.09, 0.75];
/** Value window. No ceiling: a blown-out cheek is still a cheek, and the tint
 *  preserves luminance so it stays blown out. Pure white can't reach this rule
 *  anyway — s = 0 has no hue. */
export const SKIN_VAL = [0.25, 1.0];
/** Kit band: the neutral grey tank + its bright accents. */
export const KIT_SAT_MAX = 0.17;
export const KIT_VAL_MIN = 0.52;
/** How far a skin texel travels to the tone. The 15 % of the original that
 *  stays is the baked pore/shadow detail — go to 1.0 and the face is plastic. */
export const SKIN_MIX = 0.85;
/** The kit keeps its baked shading as a brightness curve: a texel at value `v`
 *  comes out at `kit · min(1, v · 1.12)`. The lift stops the mid-greys reading
 *  muddy once they carry a colour. */
export const KIT_LIFT = 1.12;

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** @param {number[]} rgb 0-255 @returns {{h:number,s:number,v:number}} h in degrees */
export function hsv(rgb) {
  const r = rgb[0], g = rgb[1], b = rgb[2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  const v = mx / 255;
  const s = mx === 0 ? 0 : d / mx;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

/** Rec.709 luminance, 0-255. Linear in rgb, which is what lets the tint mix
 *  preserve it exactly: L(tone · L/Ltone) == L. */
export function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Is this texel the player's skin? */
export function isSkinPixel(rgb) {
  const { h, s, v } = hsv(rgb);
  return h >= SKIN_HUE[0] && h <= SKIN_HUE[1]
    && s >= SKIN_SAT[0] && s <= SKIN_SAT[1]
    && v >= SKIN_VAL[0] && v <= SKIN_VAL[1];
}

/** Is this texel the neutral kit — the thing that takes the crew's colour?
 *  Skin wins every tie, so the two rules can never both say yes. */
export function isKitPixel(rgb) {
  const { s, v } = hsv(rgb);
  if (!(s < KIT_SAT_MAX && v > KIT_VAL_MIN)) return false;
  return !isSkinPixel(rgb);
}

/** A tone by name (`'tan'`), by hex (`'#b98461'`) or already a triple.
 *  @returns {number[]|null} */
export function toneRgb(tone) {
  if (Array.isArray(tone)) return [tone[0], tone[1], tone[2]];
  const hex = SKIN_TONES[tone] ?? (typeof tone === 'string' && /^#?[0-9a-f]{6}$/i.test(tone) ? tone : null);
  if (!hex) return null;
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Paint ONE kit texel the crew's colour, keeping the atlas's baked shading as
 * a brightness curve. Anything the kit rule doesn't claim — skin, hair, the
 * dark shorts, a coloured trim — comes back untouched.
 *
 * The same rule answers for a material that has NO texture at all: hand it the
 * material's flat colour and it either takes the kit (the authored colour was
 * a neutral light, i.e. a grey shirt) or stays put. No archetype needs that
 * today — all 19 atlases plus the fallback model are one mesh with one mapped
 * material (casts/probe-white-jersey.mjs) — but a future asset with a bare
 * material would otherwise walk out in whatever colour it was authored in.
 *
 * @param {number[]} rgb 0-255
 * @param {string|number[]} kit hex or triple
 * @returns {number[]} a NEW triple, integers 0-255
 */
export function kitTintPixel(rgb, kit) {
  const src = [rgb[0], rgb[1], rgb[2]];
  const k = toneRgb(kit);
  if (!k || !isKitPixel(src)) return src;
  const lift = Math.min(1, hsv(src).v * KIT_LIFT);
  return k.map((c) => Math.round(clamp255(c * lift)));
}

/** How far a dark panel may sit from the kit it is printed ON, in texels. */
export const PANEL_DILATE_PX = 6;
/** The band a baked panel lives in: unsaturated, and darker than the kit.
 *  The floor stays at 0.08: below it the flood's own paint rule (a texel at its
 *  OWN brightness in the crew's colour) can do nothing anyway, and dropping it
 *  lets the flood walk through every black seam on the sheet and bridge onto the
 *  next island. What lives under the floor is taken by the PLATE pass instead. */
export const PANEL_SAT_MAX = 0.2;
export const PANEL_VAL = [0.08, 0.52];

// --- the baked plate -------------------------------------------------------
/**
 * Ratio saturation is QUANTIZATION NOISE at the bottom of the range, so the
 * plate window measures neutrality by ABSOLUTE channel spread as well.
 * arch-locs' baked number plate comes out mean v 0.016 with mean **s 0.146** —
 * at mx = 4 a single step of quantization *is* s = 0.25 — so a plain `s < 0.12`
 * band catches only 4 505 of its 14 636 texels (casts/probe-plateband.mjs).
 */
export const PANEL_SPREAD = 10;
/** How dark a component has to be to read as a PRINT rather than as shading.
 *  The shorts wedge this pass already fixes sits at v 0.49-0.52, so the gap is
 *  clean and the wedge keeps its own brightness curve. */
export const PLATE_VAL_MAX = 0.30;
/** ...and how closed the shirt has to be round it. A print on the vest is ringed
 *  by kit and by the hair fence (which is a WALL, not a stranger: 561 of the
 *  1 196 boundary texels of arch-locs' plate are fence — his locs are unwrapped
 *  right beside the number, casts/probe-plate5.mjs). Anything else on the
 *  boundary — skin, padding, the atlas edge — means the region is not a print. */
export const PLATE_KIT_MIN = 0.25;
export const PLATE_STRANGER_MAX = 0.02;

/**
 * Grow a 0/1 bitmap by `r` texels, in two O(n) sliding-window sweeps rather
 * than an (2r+1)² box per texel. Used twice on the character build path — once
 * to find what is NEXT TO the kit, once to fence off the hair and the shoes —
 * so it is worth the running-sum.
 * @param {Uint8Array} src @returns {Uint8Array} a NEW bitmap
 */
export function dilateMask(src, width, height, r = 1) {
  const n = width * height;
  const out = new Uint8Array(n);
  if (!(n > 0) || src.length < n) return out;
  if (r <= 0) { out.set(src.subarray(0, n)); return out; }
  const row = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const o = y * width;
    let sum = 0;
    for (let x = 0; x <= r && x < width; x++) sum += src[o + x];
    for (let x = 0; x < width; x++) {
      row[o + x] = sum > 0 ? 1 : 0;
      const add = x + r + 1, drop = x - r;
      if (add < width) sum += src[o + add];
      if (drop >= 0) sum -= src[o + drop];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= r && y < height; y++) sum += row[y * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum > 0 ? 1 : 0;
      const add = y + r + 1, drop = y - r;
      if (add < height) sum += row[add * width + x];
      if (drop >= 0) sum -= row[drop * width + x];
    }
  }
  return out;
}

/**
 * Paint the atlas texels a chosen SET OF TRIANGLES samples — the mesh's own
 * answer to "which part of the body is this texel?".
 *
 * These atlases are a Meshy patchwork: triangles cover only 55-69 % of the
 * sheet and the rest is OPAQUE padding, so nothing in texel space separates the
 * hair island from the vest island (casts/probe-atlasmap.mjs — the picture of
 * it). Only the geometry knows. Same principle as the cleat tint, which picks
 * foot-weighted VERTICES because a texel-space shoe mask splattered.
 *
 * A triangle is rasterized when ANY of its three corners is kept, so a mask
 * built to FENCE SOMETHING OFF covers the boundary ring too.
 *
 * @param {{uv:ArrayLike<number>, index:ArrayLike<number>|null, keep:ArrayLike<number>,
 *          count:number, width:number, height:number}} o `uv` is TIGHTLY PACKED
 *   u,v pairs — three.js hands out INTERLEAVED attributes on most of these
 *   rigs, where `attribute.array` is the whole vertex buffer and reading it two
 *   floats at a time gives nonsense (measured: it made the median head triangle
 *   cover 12 % of arch-waves' atlas, and the fence swallowed 86-99 % of the
 *   sheet). Copy through getX/getY.
 * @returns {Uint8Array} width*height, 1 where a kept triangle lands
 */
export function rasterizeUvMask({ uv, index, keep, count, width, height } = {}) {
  const n = width * height;
  const out = new Uint8Array(n > 0 ? n : 0);
  if (!(n > 0) || !uv || !keep) return out;
  const tris = index ? index.length / 3 : count / 3;
  const px = (i) => uv[i * 2] * width;
  const py = (i) => (1 - uv[i * 2 + 1]) * height;
  for (let t = 0; t < tris; t++) {
    const a = index ? index[t * 3] : t * 3;
    const b = index ? index[t * 3 + 1] : t * 3 + 1;
    const c = index ? index[t * 3 + 2] : t * 3 + 2;
    if (!keep[a] && !keep[b] && !keep[c]) continue;
    const ax = px(a), ay = py(a), bx = px(b), by = py(b), cx = px(c), cy = py(c);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
    const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
    const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    if (x1 < x0 || y1 < y0) continue;
    // a triangle spanning almost the whole sheet in BOTH axes is a degenerate
    // or unwrapped face, not an island — rasterizing it would fence off the
    // entire atlas. (Anything smaller is honest: the barycentric test below
    // only fills the triangle itself, never its bounding box.)
    if ((x1 - x0 + 1) >= width * 0.9 && (y1 - y0 + 1) >= height * 0.9) continue;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!(Math.abs(d) > 1e-9)) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const l1 = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / d;
        const l2 = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / d;
        if (l1 < -0.02 || l2 < -0.02 || 1 - l1 - l2 < -0.02) continue;
        out[y * width + x] = 1;
      }
    }
  }
  return out;
}

/**
 * Carry the crew's colour DOWN past the kit rule's brightness cliff — the dark
 * number plate printed on the back of the vest, and the shaded parts of the
 * shorts that fall just under it.
 *
 * The kit rule only claims texels above v = 0.52. Two things fall off that
 * cliff, and both are the kit: the rounded plate baked behind the number
 * (arch-locs' is a real black square, v = 0.22, 20 216 texels — it is the black
 * slab behind the 38 in casts/whiteout-locs-back.png), and the shaded middle of
 * the shorts at v = 0.49-0.52, which stayed grey while the texels a shade
 * brighter went gold — the jagged wedge on the back of every monarchs captain
 * in casts/back-monarchs-light.png.
 *
 * It cannot simply be added to the kit rule: the hair is dark and unsaturated
 * too, and painting that the crew colour is a team-coloured wig.
 *
 * THREE things separate them, and it takes all three:
 *
 * 1. `mask` — the kit/skin bitmap `recolorPixels` BUILT ON THE ORIGINAL atlas.
 *    Rebuilding it here from the recoloured buffer is what broke this pass in
 *    the first place: after the recolour no team hex satisfies `s < 0.17 &&
 *    v > 0.52`, so the mask collapsed to 0 texels on 8 of the 10 kits and to
 *    stray highlights on the other two (measured, casts/probe-panelfix.mjs).
 *
 * 2. A FLOOD, not a radius. Both targets are one CONNECTED BLOB whose rim
 *    touches the kit and whose middle is nowhere near it — arch-locs' plate is
 *    140 texels across, so a 6-texel reach nibbled its edge and left the slab
 *    (1 035 of 20 216 texels). So the pass seeds on the candidates within
 *    `dilate` of the kit and then spreads through touching candidates as far as
 *    they go. Skin and the kit itself are walls, which is what stops it walking
 *    off the shirt and onto a face.
 *
 * 3. `forbid` — a bitmap of the texels the HAIR and SHOE triangles sample (the
 *    boots carry the Locker's cleat colour and must not be flooded either),
 *    which only the
 *    mesh can draw, and which the flood treats as a WALL as well as a no-paint
 *    zone. Adjacency alone cannot do this job: triangles cover just 55-69 % of
 *    these atlases and every gap is OPAQUE padding, so a dilation — never mind a
 *    flood — walks straight from the vest island onto the hair (with the mask
 *    fixed but no fence, arch-puff inks 424 hair vertices; with it, none).
 *
 * A claimed texel is painted on the SAME brightness curve the kit rule uses
 * (`v · KIT_LIFT`), so the two passes meet with no seam at the cliff — the
 * shorts wedge disappears instead of turning into a hard edge in the right
 * colour — and anything genuinely dark stays a shade under the shirt it is on.
 *
 * ...WITH ONE EXCEPTION, and it is the reason for fix round 2: painting a texel
 * at its own brightness cannot rescue a texel that has none. The rounded NUMBER
 * PLATE baked into arch-locs' vest is 12 791 texels of near-pure black (mean
 * v 0.016), so `v · KIT_LIFT` painted it black again and the slab behind his 38
 * survived every previous round (casts/whiteout-locs-back.png). Those texels
 * take the KIT'S OWN brightness instead — the median lift of the kit island, so
 * the plate comes out the same shade as the shirt it is printed on and simply
 * disappears.
 *
 * That paint is far too strong to hand out on darkness alone: the same band
 * covers a black afro, the seams between UV islands and the atlas padding
 * (measured on all 19 atlases, casts/probe-plateband / plateshow / plate5.mjs —
 * a plain black band claims 179k texels on arch-puff and 197k on arch-bald,
 * across feet, hands and thighs). So it is decided per CONNECTED COMPONENT, and
 * only for a component the shirt closes round: ≥ PLATE_KIT_MIN of its boundary
 * is kit (or kit the flood is about to paint), ≤ PLATE_STRANGER_MAX is anything
 * that is neither kit nor fence, and the whole component is darker than
 * PLATE_VAL_MAX. Padding fails it on the atlas edge, hair fails it for want of
 * kit, and the shorts wedge is not dark enough to be asked.
 *
 * @param {Uint8ClampedArray|Uint8Array} px RGBA, modified in place
 * @param {{width:number, height:number, kit:string|number[], dilate?:number,
 *          mask?:Uint8Array|null, forbid?:Uint8Array|null}} o `mask` is
 *   `recolorPixels`'s return (1/3 = kit, 2 = skin); without it the bands are
 *   re-measured off `px`, which is only correct on an UN-recoloured buffer.
 * @returns {number} texels re-inked
 */
export function inkKitPanels(px, { width, height, kit, dilate = PANEL_DILATE_PX, mask = null, forbid = null } = {}) {
  const k = toneRgb(kit);
  if (!k || !(width > 0) || !(height > 0) || px.length < width * height * 4) return 0;
  const n = width * height;
  const usable = mask && mask.length >= n ? mask : null;
  const fence = forbid && forbid.length >= n ? forbid : null;
  const isKit = new Uint8Array(n);
  // bit 1 = flood candidate · bit 2 = plate window · bit 4 = seen by the
  // component scan. Three bitmaps in one, because at 2048² each one is 4 MB.
  const dark = new Uint8Array(n);
  const kitHist = new Uint32Array(256);           // max-channel over the kit island
  let kitN = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (px[p + 3] === 0) continue;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (usable) {
      const m = usable[i];
      if (m === 1 || m === 3) { isKit[i] = 1; kitHist[mx] += 1; kitN += 1; continue; }
      if (m === 2) continue;                      // skin is never a panel
    }
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (!usable && s < KIT_SAT_MAX && v > KIT_VAL_MIN) { isKit[i] = 1; kitHist[mx] += 1; kitN += 1; continue; }
    // The FLOOD may not enter the fence — that is the white wig. The PLATE scan
    // may, because a print the shirt closes round cannot be hair whatever the
    // mesh says: on arch-locs a loc is unwrapped across the number and the fence
    // covers 10 400 texels of the plate itself, so a fence-blind scan leaves the
    // top bar of the slab standing (casts/probe-plate6.mjs, whiteout-locs-back).
    // Nothing is painted off that: a component that actually reaches into hair
    // fails the boundary census and is dropped whole.
    if (!(fence && fence[i]) && s < PANEL_SAT_MAX && v > PANEL_VAL[0] && v < PANEL_VAL[1]) dark[i] |= 1;
    if (v <= PLATE_VAL_MAX && (s < PANEL_SAT_MAX || mx - mn <= PANEL_SPREAD)) dark[i] |= 2;
  }
  // seed on what touches the kit, then FLOOD through the blob it belongs to.
  // The stack never holds more than the candidate set, and every texel is
  // pushed once, so this stays O(n) like the rest of the pass.
  const near = dilateMask(isKit, width, height, dilate);
  const claim = new Uint8Array(n);                // 0 none · 1 flood · 2 plate
  const stack = new Int32Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    if (!(dark[i] & 1) || claim[i] || !near[i]) continue;
    claim[i] = 1;
    stack[top++] = i;
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % width;
    if (x > 0) { const j = i - 1; if ((dark[j] & 1) && !claim[j]) { claim[j] = 1; stack[top++] = j; } }
    if (x < width - 1) { const j = i + 1; if ((dark[j] & 1) && !claim[j]) { claim[j] = 1; stack[top++] = j; } }
    if (i >= width) { const j = i - width; if ((dark[j] & 1) && !claim[j]) { claim[j] = 1; stack[top++] = j; } }
    if (i < n - width) { const j = i + width; if ((dark[j] & 1) && !claim[j]) { claim[j] = 1; stack[top++] = j; } }
  }

  // --- the PLATE: dark components the shirt closes round --------------------
  // The scan is a QUEUE in the same `stack` buffer, so the members are still
  // sitting in stack[0..tail) when the boundary census is done and the verdict
  // can be written back over them without a second allocation.
  for (let start = 0; start < n; start++) {
    if (!(dark[start] & 2) || (dark[start] & 4)) continue;
    let head = 0, tail = 0;
    stack[tail++] = start;
    dark[start] |= 4;
    let kitB = 0, wallB = 0, strangerB = 0;
    while (head < tail) {
      const i = stack[head++];
      const x = i % width;
      for (let d = 0; d < 4; d++) {
        const j = d === 0 ? (x > 0 ? i - 1 : -1)
          : d === 1 ? (x < width - 1 ? i + 1 : -1)
            : d === 2 ? (i >= width ? i - width : -1)
              : (i < n - width ? i + width : -1);
        if (j < 0) { strangerB += 1; continue; }   // the atlas edge is not a shirt
        if (dark[j] & 2) { if (!(dark[j] & 4)) { dark[j] |= 4; stack[tail++] = j; } continue; }
        if (isKit[j] || claim[j]) kitB += 1;       // kit, or kit-to-be: the shirt
        else if (fence && fence[j]) wallB += 1;    // hair/shoes: a wall, not a stranger
        else strangerB += 1;
      }
    }
    const bound = kitB + wallB + strangerB;
    if (!bound || strangerB > PLATE_STRANGER_MAX * bound || kitB < PLATE_KIT_MIN * bound) continue;
    for (let m = 0; m < tail; m++) claim[stack[m]] = 2;
  }

  // the kit island's own brightness, as the MEDIAN lift of its texels. With a
  // `mask` the buffer is already recoloured, so a kit texel holds `k · lift` and
  // the lift reads straight back off the max channel; without one the buffer is
  // still the original grey and the kit rule's curve applies.
  const kmax = k[0] > k[1] ? (k[0] > k[2] ? k[0] : k[2]) : (k[1] > k[2] ? k[1] : k[2]);
  let plateLift = 0;
  if (kitN > 0) {
    let acc = 0, med = 0;
    for (let b = 0; b < 256; b++) { acc += kitHist[b]; if (acc * 2 >= kitN) { med = b; break; } }
    plateLift = usable
      ? (kmax > 0 ? Math.min(1, med / kmax) : 0)
      : Math.min(1, (med / 255) * KIT_LIFT);
  }

  let inked = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!claim[i]) continue;
    let lift = plateLift;
    if (claim[i] === 1) {
      const mx = Math.max(px[p], px[p + 1], px[p + 2]) / 255;
      lift = mx * KIT_LIFT > 1 ? 1 : mx * KIT_LIFT;        // the kit rule's own curve
    }
    px[p] = Math.round(k[0] * lift);
    px[p + 1] = Math.round(k[1] * lift);
    px[p + 2] = Math.round(k[2] * lift);
    inked += 1;
  }
  return inked;
}

/**
 * The mean luminance of the SKIN texels in an atlas — the reference point a
 * re-tone is measured from. Pure; walks the buffer without touching it.
 * @param {Uint8ClampedArray|Uint8Array} px RGBA
 * @returns {number} 0-255, or 0 when the atlas has no skin at all
 */
export function skinMeanLuminance(px) {
  let n = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const rgb = [px[i], px[i + 1], px[i + 2]];
    if (!isSkinPixel(rgb)) continue;
    n += 1;
    sum += luminance(rgb);
  }
  return n ? sum / n : 0;
}

/**
 * Move ONE texel to a skin tone, keeping the atlas's baked shading.
 *
 * `mix(src, tone · L/refL, 0.85)`. The tone is re-lit by how bright this texel
 * is RELATIVE TO THE ATLAS'S OWN MEAN SKIN (`refL`), so a face lands ON the
 * tone while a shadow under the jaw stays a shadow and a lit forehead stays
 * lit. The relative shading is what survives, not the absolute brightness —
 * that distinction is the whole feature: refL = the tone's own luminance (the
 * default) is a pure HUE rotation that cannot make a pale player deep, which
 * is exactly what the first cut of this did (arch-afro's mean skin moved
 * [180,114,84] → [178,115,83] and the contact sheet looked untouched).
 *
 * Non-skin texels come back untouched, which is what makes it safe to run over
 * the whole atlas. A very bright texel re-lit to a deep tone can push a channel
 * past 255; the clip would quietly darken the pixel, so the leftover luminance
 * is handed back to the channels that still have headroom instead.
 *
 * @param {number[]} rgb 0-255
 * @param {string|number[]} tone name, hex, or triple
 * @param {{mix?:number, refL?:number|null}} [opts] `refL` is the source atlas's
 *   mean skin luminance (see skinMeanLuminance); omit it and the tone's own
 *   luminance stands in, which preserves this texel's brightness exactly.
 * @returns {number[]} a NEW triple, integers 0-255
 */
export function skinTintPixel(rgb, tone, { mix = SKIN_MIX, refL = null } = {}) {
  const src = [rgb[0], rgb[1], rgb[2]];
  const t = toneRgb(tone);
  if (!t || !isSkinPixel(src)) return src;
  const L = luminance(src);
  const Lt = luminance(t);
  if (!(Lt > 0)) return src;
  const ref = refL != null && refL > 0 ? refL : Lt;
  const k = L / ref;
  const want = Lt * k;                       // the luminance this texel is heading for
  const out = [0, 1, 2].map((i) => src[i] * (1 - mix) + t[i] * k * mix);
  const hold = L * (1 - mix) + want * mix;   // the luminance the mix should land on
  for (let pass = 0; pass < 3; pass++) {
    const clipped = out.map(clamp255);
    const deficit = hold - luminance(clipped);
    if (Math.abs(deficit) < 0.5) { return clipped.map((c) => Math.round(c)); }
    let moved = false;
    for (let i = 0; i < 3; i++) {
      const next = clamp255(clipped[i] + deficit);
      if (next !== clipped[i]) moved = true;
      out[i] = next;
    }
    if (!moved) break;
  }
  return out.map((c) => Math.round(clamp255(c)));
}

/**
 * The SAME two rules, run over a whole atlas in place and without allocating.
 *
 * Why this exists next to the pure pair: a 2048² atlas is 4.2 M texels and the
 * recolour happens per character, 16 of them behind the walk-out. Calling the
 * pure functions per texel measured **4.1 s** an atlas (two short-lived arrays
 * per pixel); inlined it is ~40 ms. `tests/skinTint.test.js` walks the colour
 * cube and asserts this loop and the pure pair agree texel for texel, so the
 * rules still live in exactly one place.
 *
 * A re-tone takes TWO sweeps: the first measures the atlas's own mean skin
 * luminance, the second moves every skin texel relative to it. That reference
 * is the difference between a tone and a hue rotation (see skinTintPixel).
 *
 * The pass runs in TWO sweeps over the classification and one over the pixels:
 * the first labels every texel (and adds up the skin luminance the re-tone
 * needs), the second hands the kit back its ANTI-ALIASED BORDER (see
 * SKIN_BLEND_SAT — it needs a texel's neighbours, so it can only happen once
 * every texel has a label), and the third writes. The label bitmap comes back
 * with the counts because the panel pass needs the mask THIS pass measured on
 * the original atlas — rebuilding it afterwards reads a buffer that no longer
 * has a neutral kit in it (see inkKitPanels).
 *
 * @param {Uint8ClampedArray|Uint8Array} px RGBA, modified in place
 * @param {{kit?:string|number[]|null, tone?:string|number[]|null, refL?:number|null,
 *          width?:number, height?:number}} what `width`/`height` enable the
 *   border sweep; without them the pass is exactly the two pure rules.
 * @returns {{kit:number, skin:number, blend:number, refL:number, mask:Uint8Array}}
 *   texels moved by each rule, the reference the re-tone used, and the label
 *   bitmap (0 none · 1 kit · 2 skin · 3 kit, taken off the skin border).
 */
export function recolorPixels(px, { kit = null, tone = null, refL = null, width = 0, height = 0 } = {}) {
  const k = toneRgb(kit);
  const t = toneRgb(tone);
  const n = px.length >> 2;
  const mask = new Uint8Array(n);
  const counts = { kit: 0, skin: 0, blend: 0, refL: 0, mask };

  // --- sweep 1: label every texel, and measure the atlas's own mean skin
  let skinN = 0, skinSum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (px[p + 3] === 0) continue;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const d = mx - mn;
    const v = mx / 255;
    const s = mx === 0 ? 0 : d / mx;
    // SKIN first — the kit rule is "the kit band, minus whatever skin claims"
    let skin = false;
    if (d !== 0 && s >= SKIN_SAT[0] && s <= SKIN_SAT[1] && v >= SKIN_VAL[0] && v <= SKIN_VAL[1]) {
      let h;
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      skin = h >= SKIN_HUE[0] && h <= SKIN_HUE[1];
    }
    if (skin) { mask[i] = 2; skinN += 1; skinSum += 0.2126 * r + 0.7152 * g + 0.0722 * b; }
    else if (s < KIT_SAT_MAX && v > KIT_VAL_MIN) mask[i] = 1;
  }
  const ref = t ? (refL != null && refL > 0 ? refL : (skinN ? skinSum / skinN : 0)) : 0;
  counts.refL = ref;
  if (!k && !t) return counts;

  // --- sweep 2: the anti-aliased kit/skin seam belongs to the KIT. Marked as a
  // separate label (3) so one border texel turning kit can't cascade into the
  // face behind it — every flip is measured against the ORIGINAL labels.
  if (width > 0 && height > 0 && width * height === n) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i] !== 2) continue;
        const p = i * 4;
        const r = px[p], g = px[p + 1], b = px[p + 2];
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        if (mx === 0 || (mx - mn) / mx >= SKIN_BLEND_SAT) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) continue;
            if (mask[yy * width + xx] === 1) { touches = true; break; }
          }
        }
        if (touches) { mask[i] = 3; counts.blend += 1; }
      }
    }
  }

  // --- sweep 3: write
  const kr = k ? k[0] : 0, kg = k ? k[1] : 0, kb = k ? k[2] : 0;
  const tr = t ? t[0] : 0, tg = t ? t[1] : 0, tb = t ? t[2] : 0;
  const Lt = t ? 0.2126 * tr + 0.7152 * tg + 0.0722 * tb : 0;
  const canTone = !!t && Lt > 0;
  const refL0 = ref > 0 ? ref : Lt;
  const keep = 1 - SKIN_MIX;
  for (let i = 0, m = 0; i < px.length; i += 4, m += 1) {
    const label = mask[m];
    if (!label) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (label === 2) {
      if (!canTone) continue;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const kk = L / refL0;
      const f = kk * SKIN_MIX;
      const hold = L * keep + Lt * kk * SKIN_MIX;      // the luminance to land on
      let or = r * keep + tr * f;
      let og = g * keep + tg * f;
      let ob = b * keep + tb * f;
      for (let pass = 0; pass < 3; pass++) {           // luminance-preserving clamp
        const cr = or < 0 ? 0 : or > 255 ? 255 : or;
        const cg = og < 0 ? 0 : og > 255 ? 255 : og;
        const cb = ob < 0 ? 0 : ob > 255 ? 255 : ob;
        const def = hold - (0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
        if (def < 0.5 && def > -0.5) { or = cr; og = cg; ob = cb; break; }
        const nr = cr + def < 0 ? 0 : cr + def > 255 ? 255 : cr + def;
        const ng = cg + def < 0 ? 0 : cg + def > 255 ? 255 : cg + def;
        const nb = cb + def < 0 ? 0 : cb + def > 255 ? 255 : cb + def;
        if (nr === cr && ng === cg && nb === cb) { or = cr; og = cg; ob = cb; break; }
        or = nr; og = ng; ob = nb;
      }
      px[i] = Math.round(or < 0 ? 0 : or > 255 ? 255 : or);
      px[i + 1] = Math.round(og < 0 ? 0 : og > 255 ? 255 : og);
      px[i + 2] = Math.round(ob < 0 ? 0 : ob > 255 ? 255 : ob);
      counts.skin += 1;
    } else if (k) {
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const v = mx / 255;
      const lift = v * KIT_LIFT > 1 ? 1 : v * KIT_LIFT;
      px[i] = Math.round(kr * lift);
      px[i + 1] = Math.round(kg * lift);
      px[i + 2] = Math.round(kb * lift);
      counts.kit += 1;
    }
  }
  return counts;
}
