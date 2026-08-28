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
/** The band a baked panel lives in: unsaturated, and darker than the kit. */
export const PANEL_SAT_MAX = 0.2;
export const PANEL_VAL = [0.08, 0.52];

/**
 * Re-ink the DARK panels printed on the kit — the rounded number plate baked
 * into the back of every archetype's vest.
 *
 * The kit rule only claims BRIGHT low-saturation texels, so that plate stayed
 * black and showed through as a slab behind the jersey number on every light
 * kit. It can't simply be added to the kit rule: the shorts and most of the
 * hair are dark and unsaturated too, and painting those the crew colour would
 * put a team-coloured wig on the field.
 *
 * ADJACENCY is what tells them apart — the panel is printed on the vest and
 * touches kit texels; the shorts and the hair live in their own UV islands
 * with nothing but background around them. So: dilate the kit mask by a few
 * texels and re-ink only the dark texels that fall inside it, keeping their own
 * brightness so the panel stays a shade under the shirt it sits on.
 *
 * Runs in two O(n) sliding-window sweeps rather than a 13×13 box per texel —
 * this is on the character build path, behind the walk-out.
 *
 * @param {Uint8ClampedArray|Uint8Array} px RGBA, modified in place
 * @param {{width:number, height:number, kit:string|number[], dilate?:number}} o
 * @returns {number} texels re-inked
 */
export function inkKitPanels(px, { width, height, kit, dilate = PANEL_DILATE_PX } = {}) {
  const k = toneRgb(kit);
  if (!k || !(width > 0) || !(height > 0) || px.length < width * height * 4) return 0;
  const n = width * height;
  const isKit = new Uint8Array(n);
  const dark = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (px[p + 3] === 0) continue;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (s < KIT_SAT_MAX && v > KIT_VAL_MIN) isKit[i] = 1;
    else if (s < PANEL_SAT_MAX && v > PANEL_VAL[0] && v < PANEL_VAL[1]) dark[i] = 1;
  }
  // dilate the kit mask: a running count across each row, then down each column
  const rowHit = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const o = y * width;
    let sum = 0;
    for (let x = 0; x <= dilate && x < width; x++) sum += isKit[o + x];
    for (let x = 0; x < width; x++) {
      rowHit[o + x] = sum > 0 ? 1 : 0;
      const add = x + dilate + 1;
      const drop = x - dilate;
      if (add < width) sum += isKit[o + add];
      if (drop >= 0) sum -= isKit[o + drop];
    }
  }
  const near = new Uint8Array(n);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= dilate && y < height; y++) sum += rowHit[y * width + x];
    for (let y = 0; y < height; y++) {
      near[y * width + x] = sum > 0 ? 1 : 0;
      const add = y + dilate + 1;
      const drop = y - dilate;
      if (add < height) sum += rowHit[add * width + x];
      if (drop >= 0) sum -= rowHit[drop * width + x];
    }
  }
  let inked = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!dark[i] || !near[i]) continue;
    const mx = Math.max(px[p], px[p + 1], px[p + 2]) / 255;
    px[p] = Math.round(k[0] * mx);
    px[p + 1] = Math.round(k[1] * mx);
    px[p + 2] = Math.round(k[2] * mx);
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
 * @param {Uint8ClampedArray|Uint8Array} px RGBA, modified in place
 * @param {{kit?:string|number[]|null, tone?:string|number[]|null, refL?:number|null}} what
 * @returns {{kit:number, skin:number, refL:number}} texels moved by each rule,
 *   and the reference the re-tone used
 */
export function recolorPixels(px, { kit = null, tone = null, refL = null } = {}) {
  const k = toneRgb(kit);
  const t = toneRgb(tone);
  const ref = t ? (refL != null && refL > 0 ? refL : skinMeanLuminance(px)) : 0;
  const counts = { kit: 0, skin: 0, refL: ref };
  if (!k && !t) return counts;
  const kr = k ? k[0] : 0, kg = k ? k[1] : 0, kb = k ? k[2] : 0;
  const tr = t ? t[0] : 0, tg = t ? t[1] : 0, tb = t ? t[2] : 0;
  const Lt = t ? 0.2126 * tr + 0.7152 * tg + 0.0722 * tb : 0;
  const canTone = !!t && Lt > 0;
  const refL0 = ref > 0 ? ref : Lt;
  const keep = 1 - SKIN_MIX;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
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
    if (skin) {
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
    } else if (k && s < KIT_SAT_MAX && v > KIT_VAL_MIN) {
      const lift = v * KIT_LIFT > 1 ? 1 : v * KIT_LIFT;
      px[i] = Math.round(kr * lift);
      px[i + 1] = Math.round(kg * lift);
      px[i + 2] = Math.round(kb * lift);
      counts.kit += 1;
    }
  }
  return counts;
}
