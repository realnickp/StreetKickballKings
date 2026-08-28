// The two PIXEL RULES the archetype recolour runs on (spec §4). Both are pure
// maths over one texel, so they get tested here instead of by eyeballing a
// 2048² atlas: the kit rule decides what turns the team's colour, the skin rule
// decides what turns the player's tone — and NOTHING may satisfy both, or a
// cheekbone ends up gold.
import { describe, it, expect } from 'vitest';
import {
  SKIN_TONES, KIT_SAT_MAX, KIT_VAL_MIN, SKIN_MIX, KIT_LIFT, SKIN_BLEND_SAT,
  hsv, luminance, isSkinPixel, isKitPixel, toneRgb, skinTintPixel, kitTintPixel, recolorPixels, skinMeanLuminance, inkKitPanels,
  dilateMask, rasterizeUvMask,
} from '../src/game/skinTint.js';

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Real texels, read off the archetype atlases with
// .superpowers/sdd/2026-08-27-crews-kits-walkout/casts/probe-atlas.mjs
const KIT_GREY = [176, 176, 176];   // arch-locs, 21% of its atlas
const KIT_WHITE = [240, 240, 240];  // the bright kit/sneaker accents
const KIT_COOL = [176, 208, 208];   // arch-curls' cool grey kit, s = 0.15
const HAIR_BLACK = [16, 16, 16];
const SHORTS_DARK = [48, 48, 48];
const SKIN_MID = [176, 112, 80];    // arch-afro, 26% of its atlas
const SKIN_PALE = [240, 176, 144];  // arch-bun/arch-stache, the palest rigs
const SKIN_HILIGHT = [244, 226, 216]; // the near-white lit cheek on arch-stache

describe('hsv', () => {
  it('reads a grey as unsaturated and a warm skin texel as hue 10-40', () => {
    expect(hsv(KIT_GREY).s).toBe(0);
    expect(hsv(SKIN_MID).h).toBeGreaterThanOrEqual(10);
    expect(hsv(SKIN_MID).h).toBeLessThanOrEqual(40);
    expect(hsv([0, 0, 0])).toEqual({ h: 0, s: 0, v: 0 });
  });
});

describe('isKitPixel — what turns the team colour', () => {
  it('takes the neutral kit, bright or mid, warm-grey or cool-grey', () => {
    expect(isKitPixel(KIT_GREY)).toBe(true);
    expect(isKitPixel(KIT_WHITE)).toBe(true);
    expect(isKitPixel(KIT_COOL)).toBe(true);
  });
  it('leaves the dark shorts and the hair alone', () => {
    expect(isKitPixel(SHORTS_DARK)).toBe(false);
    expect(isKitPixel(HAIR_BLACK)).toBe(false);
  });
  it('leaves skin alone — including the PALE rigs the old mask painted gold', () => {
    // arch-stache's lit cheek is warm but barely saturated: under the plain
    // `s < 0.17 && v > 0.52` band it fell in the KIT mask and went team-
    // coloured, which is why the crane frame had a face the colour of a shirt.
    expect(hsv(SKIN_HILIGHT).s).toBeLessThan(KIT_SAT_MAX);
    expect(hsv(SKIN_HILIGHT).v).toBeGreaterThan(KIT_VAL_MIN);
    expect(isKitPixel(SKIN_HILIGHT)).toBe(false);
    expect(isKitPixel(SKIN_PALE)).toBe(false);
    expect(isKitPixel(SKIN_MID)).toBe(false);
  });
});

describe('isSkinPixel — what turns the player tone', () => {
  it('takes skin from the deepest rig to the palest', () => {
    expect(isSkinPixel(SKIN_MID)).toBe(true);
    expect(isSkinPixel(SKIN_PALE)).toBe(true);
    expect(isSkinPixel(SKIN_HILIGHT)).toBe(true);
  });
  it('leaves the kit, the shorts and the hair alone', () => {
    for (const px of [KIT_GREY, KIT_WHITE, KIT_COOL, SHORTS_DARK, HAIR_BLACK]) {
      expect(isSkinPixel(px), String(px)).toBe(false);
    }
  });
  it('every tone in the palette is itself a skin pixel', () => {
    for (const [name, hex] of Object.entries(SKIN_TONES)) {
      expect(isSkinPixel(hex2rgb(hex)), name).toBe(true);
    }
  });
  it('never claims a pixel the kit rule claims', () => {
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          expect(isSkinPixel([r, g, b]) && isKitPixel([r, g, b]), `${r},${g},${b}`).toBe(false);
        }
      }
    }
  });
});

describe('kitTintPixel', () => {
  const GOLD = '#f5b312';
  const gold = hex2rgb(GOLD);

  it('paints the neutral kit the crew colour, keeping its baked shading', () => {
    const bright = kitTintPixel(KIT_WHITE, GOLD);
    const mid = kitTintPixel(KIT_GREY, GOLD);
    expect(bright).toEqual(gold);                       // v·1.12 clamps to 1
    expect(luminance(mid)).toBeLessThan(luminance(bright)); // the shading survives
    expect(hsv(mid).h).toBeCloseTo(hsv(gold).h, 0);     // and it IS the crew colour
    expect(kitTintPixel(KIT_COOL, GOLD)).not.toEqual(KIT_COOL);
  });

  it('never touches skin, hair or the dark shorts', () => {
    for (const px of [SKIN_MID, SKIN_PALE, SKIN_HILIGHT, HAIR_BLACK, SHORTS_DARK]) {
      expect(kitTintPixel(px, GOLD), String(px)).toEqual(px);
    }
  });

  it('answers for a material with NO map: a bare grey takes the kit, a dark trim does not', () => {
    expect(kitTintPixel([204, 204, 204], GOLD)).not.toEqual([204, 204, 204]);
    expect(kitTintPixel([40, 40, 48], GOLD)).toEqual([40, 40, 48]);
    expect(kitTintPixel([170, 90, 60], GOLD)).toEqual([170, 90, 60]); // an authored warm colour
  });

  it('lifts by 1.12 and no further — the kit never blows past its own colour', () => {
    expect(KIT_LIFT).toBe(1.12);
    for (let v = 140; v <= 255; v += 5) {
      const out = kitTintPixel([v, v, v], GOLD);
      for (let i = 0; i < 3; i++) expect(out[i]).toBeLessThanOrEqual(gold[i]);
    }
  });

  it('the two rules never move the same pixel — order cannot matter', () => {
    for (let r = 0; r < 256; r += 23) {
      for (let g = 0; g < 256; g += 23) {
        for (let b = 0; b < 256; b += 23) {
          const px = [r, g, b];
          const kitFirst = skinTintPixel(kitTintPixel(px, GOLD), 'deep');
          const skinFirst = kitTintPixel(skinTintPixel(px, 'deep'), GOLD);
          expect(kitFirst, `${px}`).toEqual(skinFirst);
        }
      }
    }
  });
});

describe('recolorPixels — the fast atlas pass', () => {
  // A 2048² atlas is 4.2 M texels and every character recolours its own copy,
  // so the real loop can't call the pure pair per pixel (measured: 4.1 s an
  // atlas vs ~40 ms inlined). This is the guard that the fast loop and the
  // rules it stands in for are the SAME function.
  const cube = (step) => {
    const px = [];
    for (let r = 0; r < 256; r += step) {
      for (let g = 0; g < 256; g += step) {
        for (let b = 0; b < 256; b += step) px.push(r, g, b, 255);
      }
    }
    return new Uint8ClampedArray(px);
  };
  // a coarse lattice plus a SEEDED scatter: the lattice covers the bands'
  // corners, the scatter catches anything that hides between them, and both
  // together run in a fraction of a second
  const scatter = (n) => {
    const px = new Uint8ClampedArray(n * 4);
    let seed = 20260828;
    const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % 256; };
    for (let i = 0; i < n; i++) { px[i * 4] = next(); px[i * 4 + 1] = next(); px[i * 4 + 2] = next(); px[i * 4 + 3] = 255; }
    return px;
  };

  it('agrees with kitTintPixel + skinTintPixel over the colour cube', { timeout: 20000 }, () => {
    for (const [kit, tone] of [['#f5b312', 'deep'], ['#2e5944', 'light'], ['#a8d8ea', 'tan'], ['#d7263d', 'brown']]) {
      const lattice = cube(19);
      const src = new Uint8ClampedArray(lattice.length + 4000 * 4);
      src.set(lattice, 0);
      src.set(scatter(4000), lattice.length);
      const got = new Uint8ClampedArray(src);
      const { refL } = recolorPixels(got, { kit, tone });
      expect(refL).toBeCloseTo(skinMeanLuminance(src), 6);
      for (let i = 0; i < src.length; i += 4) {
        const px = [src[i], src[i + 1], src[i + 2]];
        const want = skinTintPixel(kitTintPixel(px, kit), tone, { refL });
        expect([got[i], got[i + 1], got[i + 2]], `${kit}/${tone} ${px}`).toEqual(want);
      }
    }
    // ~10 000 texels x four kit/tone pairs, each with a per-pixel `expect` — it
    // runs in well under a second alone, but the full suite loads every worker
    // at once and this is the one test that has tipped past the 5 s default.
    // The budget is generous on purpose: a REAL regression here fails on the
    // first mismatched texel, so nothing is bought by failing it on the clock.
  });

  it('does the kit alone when no tone is cast, and the tone alone with no kit', () => {
    const kitOnly = cube(17), toneOnly = cube(17), src = cube(17);
    recolorPixels(kitOnly, { kit: '#f5b312' });
    const { refL } = recolorPixels(toneOnly, { tone: 'deep' });
    for (let i = 0; i < src.length; i += 4) {
      const px = [src[i], src[i + 1], src[i + 2]];
      expect([kitOnly[i], kitOnly[i + 1], kitOnly[i + 2]]).toEqual(kitTintPixel(px, '#f5b312'));
      expect([toneOnly[i], toneOnly[i + 1], toneOnly[i + 2]]).toEqual(skinTintPixel(px, 'deep', { refL }));
    }
  });

  it('counts what each rule moved, and leaves a fully transparent texel alone', () => {
    const px = new Uint8ClampedArray([176, 176, 176, 255, 176, 112, 80, 255, 16, 16, 16, 255, 200, 200, 200, 0]);
    const n = recolorPixels(px, { kit: '#f5b312', tone: 'deep' });
    expect(n.kit).toBe(1);
    expect(n.skin).toBe(1);
    expect([px[8], px[9], px[10]]).toEqual([16, 16, 16]);       // hair
    expect([px[12], px[13], px[14]]).toEqual([200, 200, 200]);  // transparent
  });

  // THE FEATURE. A re-tone that preserves each texel's ABSOLUTE brightness is
  // only a hue rotation — it cannot make a pale player deep, and the first cut
  // of this did exactly that (arch-afro's mean skin moved [180,114,84] to
  // [178,115,83] and the ten captains all still had the same complexion).
  // Measuring from the atlas's OWN mean is what makes a tone a tone.
  const skinAtlas = () => {
    const out = [];
    // a face lit from 0.6x to 1.15x of its own mean — a range that still fits
    // in gamut once it is re-lit to the LIGHTEST tone, so the prediction below
    // is testing the maths and not the ceiling
    for (let i = 0; i < 60; i++) {
      const k = 0.6 + (i / 59) * 0.55;
      out.push(Math.round(200 * k), Math.round(142 * k), Math.round(112 * k), 255);
    }
    out.push(176, 176, 176, 255, 16, 16, 16, 255); // a shirt and some hair
    return new Uint8ClampedArray(out);
  };

  it('lands the crew mean on the tone, less the 15 % of the atlas the mix keeps', () => {
    // out = 0.15·src + 0.85·tone·(L/ref), so across a face whose mean IS ref
    // the mean lands at exactly 0.15·ref + 0.85·Ltone. That residual is the
    // baked detail the mix deliberately keeps — on the palest atlas it puts a
    // 'deep' face at 80 rather than 64, which is still a move of nearly 100
    // luminance off chalk-white.
    for (const tone of Object.keys(SKIN_TONES)) {
      const px = skinAtlas();
      const ref = skinMeanLuminance(px);
      recolorPixels(px, { tone });
      const Lt = luminance(toneRgb(tone));
      const predicted = (1 - SKIN_MIX) * ref + SKIN_MIX * Lt;
      // ±2 for the per-texel rounding and the gamut clamp on the brightest cheeks
      expect(Math.abs(skinMeanLuminance(px) - predicted), tone).toBeLessThan(2);
    }
  });

  it('actually changes the complexion — four tones, four different faces', () => {
    const seen = Object.keys(SKIN_TONES).map((tone) => {
      const px = skinAtlas();
      recolorPixels(px, { tone });
      return Math.round(skinMeanLuminance(px));
    });
    expect(new Set(seen).size).toBe(4);
    expect(seen[0]).toBeLessThan(seen[3] - 60); // deep is a long way from light
  });

  it('keeps the baked shading: the light half of a face stays lighter than the dark half', () => {
    const px = skinAtlas();
    const before = [...px];
    recolorPixels(px, { tone: 'deep' });
    const L = (a, i) => luminance([a[i], a[i + 1], a[i + 2]]);
    for (let i = 4; i < 60 * 4; i += 4) {
      expect(L(px, i), `texel ${i / 4}`).toBeGreaterThanOrEqual(L(px, i - 4) - 0.5);
      expect(L(before, i)).toBeGreaterThan(L(before, i - 4) - 0.5);
    }
    // and the face as a whole got DARKER — that is the point of 'deep'
    expect(skinMeanLuminance(px)).toBeLessThan(skinMeanLuminance(new Uint8ClampedArray(before)) * 0.7);
  });

  it('is a no-op when nothing is asked for — but it still hands back the labels', () => {
    const px = cube(51);
    const before = new Uint8ClampedArray(px);
    const got = recolorPixels(px, {});
    expect({ kit: got.kit, skin: got.skin, blend: got.blend, refL: got.refL })
      .toEqual({ kit: 0, skin: 0, blend: 0, refL: 0 });
    expect(px).toEqual(before);
    // the label bitmap is measured before anything is written, so it is there
    // whether or not there was a colour to paint — the panel pass reads it.
    expect(got.mask.length).toBe(px.length / 4);
    expect(got.mask.some((m) => m === 1)).toBe(true);   // the cube has neutral lights
    expect(got.mask.some((m) => m === 2)).toBe(true);   // ...and warm mid-tones
  });
});

describe('inkKitPanels — the number plate baked into the vest', () => {
  // The archetypes carry a dark rounded panel printed on the BACK of the kit.
  // The kit rule only claims bright texels, so that plate stayed black and
  // showed as a slab behind the jersey number on every light kit. It can't
  // just be added to the kit rule — the shorts and the hair are dark and
  // unsaturated too. ADJACENCY separates them: the panel is printed ON the
  // shirt; the shorts and the hair sit in their own UV islands.
  const W = 32, H = 32;
  const atlas = () => {
    const px = new Uint8ClampedArray(W * H * 4);
    const put = (x, y, c) => { const p = (y * W + x) * 4; px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [0, 0, 0]); // background
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) put(x, y, [180, 180, 180]); // the vest
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) put(x, y, [40, 40, 42]);    // its number plate
    for (let y = 20; y < 28; y++) for (let x = 20; x < 28; x++) put(x, y, [38, 38, 40]);  // the shorts, alone
    return px;
  };
  const at = (px, x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]];

  it('re-inks the plate ON the kit and leaves the island of shorts black', () => {
    const px = atlas();
    const inked = inkKitPanels(px, { width: W, height: H, kit: '#f5b312' });
    expect(inked).toBe(16);                                   // the 4x4 plate, nothing else
    const plate = at(px, 7, 7);
    expect(hsv(plate).h).toBeCloseTo(hsv(hex2rgb('#f5b312')).h, 0);
    expect(luminance(plate)).toBeLessThan(luminance(hex2rgb('#f5b312'))); // still a shade under
    expect(at(px, 24, 24)).toEqual([38, 38, 40]);             // the shorts never moved
    expect(at(px, 0, 0)).toEqual([0, 0, 0]);                  // nor the background
  });

  it('reaches exactly as far as the dilation, and no further', () => {
    const px = atlas();
    // a dark patch 4 texels off the vest is inside a 6 px reach, 12 off is not
    const put = (x, y, c) => { const p = (y * W + x) * 4; px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255; };
    put(17, 7, [40, 40, 42]);   // 4 texels right of the vest edge (x < 14)
    put(29, 7, [40, 40, 42]);   // 16 texels away
    inkKitPanels(px, { width: W, height: H, kit: '#f5b312', dilate: 6 });
    expect(at(px, 17, 7)).not.toEqual([40, 40, 42]);
    expect(at(px, 29, 7)).toEqual([40, 40, 42]);
  });

  it('leaves the kit itself, skin and anything saturated alone', () => {
    const px = new Uint8ClampedArray([
      180, 180, 180, 255,   // kit — the kit rule's business, not this one
      176, 112, 80, 255,    // skin
      120, 40, 40, 255,     // a saturated dark red trim
      255, 255, 255, 0,     // transparent
    ]);
    const before = [...px];
    inkKitPanels(px, { width: 4, height: 1, kit: '#f5b312' });
    expect([...px]).toEqual(before);
  });

  it('does nothing without a size or a colour', () => {
    const px = atlas();
    const before = [...px];
    expect(inkKitPanels(px, { width: 0, height: H, kit: '#f5b312' })).toBe(0);
    expect(inkKitPanels(px, { width: W, height: H, kit: null })).toBe(0);
    expect([...px]).toEqual(before);
  });
});

describe('skinTintPixel', () => {
  const near = (a, b, pct) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * pct);

  it('moves a skin pixel toward the tone and keeps its luminance (±8%)', () => {
    for (const tone of Object.keys(SKIN_TONES)) {
      for (const src of [SKIN_MID, SKIN_PALE, SKIN_HILIGHT]) {
        const out = skinTintPixel(src, tone);
        expect(out, `${tone} ${src}`).not.toEqual(src);
        expect(near(luminance(out), luminance(src), 0.08), `${tone} ${src} lum ${luminance(out)} vs ${luminance(src)}`).toBe(true);
        // toward the tone: the hue lands no further from the tone's than the
        // source was. Skipped once a channel PINS at 255 — a 229-luminance
        // highlight is brighter than the deep tone's hue can be at any
        // saturation (its ceiling is 180), so holding the brightness there
        // means washing toward white, which is what a blown highlight does.
        if (Math.max(...out) < 255) {
          const want = hsv(toneRgb(tone)).h;
          expect(Math.abs(hsv(out).h - want), `${tone} ${src}`).toBeLessThanOrEqual(Math.abs(hsv(src).h - want) + 8);
        }
      }
    }
  });

  it('a blown-out cheek keeps its brightness and washes out instead of dimming', () => {
    const out = skinTintPixel(SKIN_HILIGHT, 'deep');
    expect(Math.max(...out)).toBe(255);              // pinned, not dimmed
    expect(near(luminance(out), luminance(SKIN_HILIGHT), 0.08)).toBe(true);
    expect(hsv(out).s).toBeGreaterThan(hsv(SKIN_HILIGHT).s); // still warmer than it was
  });

  it('leaves a grey kit pixel and a black hair pixel exactly as they were', () => {
    for (const px of [KIT_GREY, KIT_WHITE, KIT_COOL, HAIR_BLACK, SHORTS_DARK]) {
      for (const tone of Object.keys(SKIN_TONES)) {
        expect(skinTintPixel(px, tone), `${tone} ${px}`).toEqual(px);
      }
    }
  });

  it('is a no-op on a pixel that is already the tone', () => {
    for (const hex of Object.values(SKIN_TONES)) {
      const px = hex2rgb(hex);
      const out = skinTintPixel(px, hex);
      for (let i = 0; i < 3; i++) expect(Math.abs(out[i] - px[i])).toBeLessThanOrEqual(1);
    }
  });

  it('settles: tinting twice is the same picture as tinting once', () => {
    for (const tone of Object.keys(SKIN_TONES)) {
      const once = skinTintPixel(SKIN_MID, tone);
      const twice = skinTintPixel(once, tone);
      for (let i = 0; i < 3; i++) expect(Math.abs(twice[i] - once[i])).toBeLessThanOrEqual(4);
    }
  });

  it('separates the tones — deep is not tan is not light', () => {
    const shot = Object.keys(SKIN_TONES).map((t) => skinTintPixel(SKIN_MID, t).join(','));
    expect(new Set(shot).size).toBe(4);
  });

  it('keeps every channel in gamut', () => {
    for (const tone of Object.keys(SKIN_TONES)) {
      for (let v = 70; v <= 250; v += 6) {
        const out = skinTintPixel([v, Math.round(v * 0.72), Math.round(v * 0.58)], tone);
        for (const c of out) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(255); }
        expect(out.every(Number.isInteger)).toBe(true);
      }
    }
  });

  it('mixes 85 % of the way, so a trace of the baked skin detail survives', () => {
    expect(SKIN_MIX).toBe(0.85);
    const full = skinTintPixel(SKIN_MID, 'deep', { mix: 1 });
    const mixed = skinTintPixel(SKIN_MID, 'deep');
    expect(mixed).not.toEqual(full);
  });

  it('takes a tone by name, by hex or by triple', () => {
    const a = skinTintPixel(SKIN_MID, 'tan');
    expect(skinTintPixel(SKIN_MID, SKIN_TONES.tan)).toEqual(a);
    expect(skinTintPixel(SKIN_MID, toneRgb('tan'))).toEqual(a);
    expect(skinTintPixel(SKIN_MID, 'nonsense')).toEqual(SKIN_MID); // unknown tone: leave it be
  });
});

describe('dilateMask', () => {
  it('grows a dot by exactly r in both axes and copies at r = 0', () => {
    const px = new Uint8Array(11 * 11);
    px[5 * 11 + 5] = 1;
    const d2 = dilateMask(px, 11, 11, 2);
    expect(d2[5 * 11 + 7]).toBe(1);
    expect(d2[5 * 11 + 8]).toBe(0);
    expect(d2[7 * 11 + 5]).toBe(1);
    expect(d2[8 * 11 + 5]).toBe(0);
    expect(d2[7 * 11 + 7]).toBe(1);            // the two sweeps compose into a box
    expect([...dilateMask(px, 11, 11, 0)]).toEqual([...px]);
  });

  it('hands back an empty bitmap rather than throwing on a bad size', () => {
    expect([...dilateMask(new Uint8Array(4), 0, 4, 1)]).toEqual([]);
    expect([...dilateMask(new Uint8Array(2), 4, 4, 1)]).toEqual(new Array(16).fill(0));
  });
});

describe('rasterizeUvMask — the mesh drawing on the atlas', () => {
  // one square island out of two triangles, in the top-left quarter of a 16x16
  const uv = new Float32Array([0.125, 0.875, 0.375, 0.875, 0.375, 0.625, 0.125, 0.625]);
  const index = new Uint16Array([0, 1, 2, 0, 2, 3]);

  it('fills the triangles whose corners are kept, and nothing else', () => {
    const m = rasterizeUvMask({ uv, index, keep: new Uint8Array([1, 1, 1, 1]), count: 4, width: 16, height: 16 });
    expect(m[3 * 16 + 4]).toBe(1);            // inside the island
    expect(m[10 * 16 + 10]).toBe(0);          // the other side of the sheet
    const none = rasterizeUvMask({ uv, index, keep: new Uint8Array(4), count: 4, width: 16, height: 16 });
    expect(none.every((v) => v === 0)).toBe(true);
  });

  it('takes a triangle when ANY corner is kept — a fence covers its boundary', () => {
    const one = new Uint8Array([0, 0, 1, 0]);  // only the third vertex
    const m = rasterizeUvMask({ uv, index, keep: one, count: 4, width: 16, height: 16 });
    expect(m.reduce((a, b) => a + b, 0)).toBeGreaterThan(4);
  });

  it('ignores a UV that spans the sheet — a degenerate face is not an island', () => {
    const huge = new Float32Array([0, 1, 1, 1, 1, 0]);
    const m = rasterizeUvMask({
      uv: huge, index: new Uint16Array([0, 1, 2]), keep: new Uint8Array([1, 1, 1]),
      count: 3, width: 16, height: 16,
    });
    expect(m.every((v) => v === 0)).toBe(true);
  });

  it('survives being handed nothing', () => {
    expect(rasterizeUvMask().length).toBe(0);
    expect(rasterizeUvMask({ width: 4, height: 4 }).length).toBe(16);
  });
});

describe('the kit passes IN PRODUCTION ORDER — recolour, then panels', () => {
  // The shipped bug this suite exists for: inkKitPanels rebuilt its own kit mask
  // and it ran AFTER the recolour — by which point no team hex satisfies
  // `s < 0.17 && v > 0.52`, so the mask collapsed to nothing on 8 of the 10 kits
  // and, on WHITEOUT #f2f2f4 (whose hex DOES satisfy it), re-inked the HAIR
  // white instead: 71 892 texels on arch-locs, a white wig.
  //
  // So this atlas is built the way the real ones are (casts/probe-atlasmap.mjs):
  // the hair island sits 4 texels from the vest with OPAQUE padding between, so
  // adjacency alone cannot tell them apart — only the mesh can, and the fence it
  // draws is what the `forbid` argument carries.
  const W = 48, H = 32;
  const VEST = [180, 180, 182];         // v 0.71 — well over the kit rule cliff
  const PLATE = [58, 58, 64];           // the number plate as it MEASURES on the rigs: v 0.251
  const PLATE_BLACK = [4, 4, 5];        // ...and arch-locs' is nearer this: v 0.016, s 0.2
  const HAIR_DEEP = [6, 6, 7];          // a black patch inside the hair island
  const SHOE = [10, 10, 12];            // a black island with no shirt anywhere near it
  const SHORTS_LIT = [150, 152, 153];   // v 0.60 — shorts the kit rule DOES take
  const SHORTS_SHADE = [122, 124, 125]; // v 0.49 — the grey wedge under the cliff
  const HAIR = [30, 30, 34];            // dark, unsaturated: the panel band twin
  const SKIN = [196, 148, 118];         // a warm mid arm
  const SEAM = [226, 208, 198];         // the anti-aliased kit/skin border texel
  const TEAM = { DARK: '#16161a', GOLD: '#f5b312', WHITEOUT: '#f2f2f4' };

  const at = (px, x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]];
  const box = (px, x0, y0, x1, y1, c) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255;
      }
    }
  };
  const atlas = () => {
    const px = new Uint8ClampedArray(W * H * 4);
    box(px, 0, 0, W, H, [64, 64, 64]);          // OPAQUE padding, like the real sheets
    box(px, 2, 2, 18, 16, VEST);                // the vest island
    box(px, 7, 6, 13, 11, PLATE);               // its number plate
    box(px, 3, 3, 6, 6, PLATE_BLACK);           // ...and the near-black print beside it
    box(px, 2, 18, 18, 28, SHORTS_LIT);         // the shorts, touching nothing else
    box(px, 6, 21, 14, 26, SHORTS_SHADE);       // the shaded wedge inside them
    box(px, 22, 2, 34, 16, HAIR);               // the HAIR — 4 texels off the vest
    box(px, 22, 18, 34, 28, SKIN);              // an arm
    box(px, 18, 18, 22, 28, SEAM);              // its border against the shorts
    box(px, 38, 3, 45, 10, SHOE);               // a black island off the shirt entirely
    box(px, 36, 16, 46, 27, HAIR);              // a second hair island, also fenced...
    box(px, 39, 19, 43, 24, HAIR_DEEP);         // ...with a black patch inside it
    return px;
  };
  /** what the mesh knows: these texels are sampled by HEAD (or FOOT) triangles */
  const fence = () => {
    const f = new Uint8Array(W * H);
    for (let y = 1; y < 17; y++) for (let x = 21; x < 35; x++) f[y * W + x] = 1;
    for (let y = 15; y < 28; y++) for (let x = 35; x < 47; x++) f[y * W + x] = 1;
    return f;
  };
  /** the whole production pipeline, in order */
  const run = (kit, { forbid = fence(), tone = 'brown' } = {}) => {
    const px = atlas();
    const { mask } = recolorPixels(px, { kit, tone, width: W, height: H });
    const inked = inkKitPanels(px, { width: W, height: H, kit, mask, forbid });
    return { px, mask, inked };
  };

  it('inks the shaded shorts on the crew curve, on every real team hex', () => {
    for (const [name, kit] of Object.entries(TEAM)) {
      const { px, inked } = run(kit);
      expect(inked, name).toBeGreaterThan(100);
      const k = hex2rgb(kit);
      const got = at(px, 9, 23);
      expect(got, `${name} the shaded shorts`).not.toEqual(SHORTS_SHADE);
      // painted in the crew colour, on the crew brightness curve
      const lift = Math.min(1, hsv(SHORTS_SHADE).v * KIT_LIFT);
      expect(got, `${name} the shaded shorts`).toEqual(k.map((c) => Math.round(c * lift)));
    }
  });

  it('gives the baked plate the KIT\'s brightness — it comes out the shirt colour', () => {
    // The fix-round-2 bug: the flood paints a claimed texel at its OWN
    // brightness, so a plate baked at v 0.25 came back at v 0.28 of the crew
    // colour — still a black slab on WHITEOUT — and a plate baked at v 0.016
    // came back black on every kit. A print the shirt closes round takes the
    // shirt's own brightness instead, so it disappears into the vest.
    for (const [name, kit] of Object.entries(TEAM)) {
      const { px } = run(kit);
      const shirt = at(px, 3, 14);                    // a lit vest texel, painted by the kit rule
      for (const [x, y, src, what] of [[9, 8, PLATE, 'the number plate'], [4, 4, PLATE_BLACK, 'the black print']]) {
        const got = at(px, x, y);
        expect(got, `${name} ${what}`).not.toEqual(src);
        expect(got, `${name} ${what}`).toEqual(shirt);
      }
    }
  });

  it('leaves black that is NOT a print on the shirt alone — the shoe and the hair', () => {
    // Both are as black as the plate. The shoe island has padding and the atlas
    // edge round it, the hair patch has nothing but hair: neither is enclosed by
    // shirt, so neither may take the shirt's colour.
    for (const [name, kit] of Object.entries(TEAM)) {
      const { px } = run(kit);
      expect(at(px, 41, 6), `${name} the shoe`).toEqual(SHOE);
      expect(at(px, 41, 21), `${name} the hair patch`).toEqual(HAIR_DEEP);
    }
  });

  it('...and the fence does not cut a plate in half — a loc unwrapped over the number', () => {
    // On arch-locs a loc is unwrapped across the number: 10 400 texels OF THE
    // PLATE ITSELF sit inside the hair fence, and 561 of the 1 196 texels round
    // it are fence too (casts/probe-plate5 / probe-plate6.mjs). A fence-blind
    // plate scan left the top bar of the slab standing. The fence is a wall to
    // the FLOOD; a print the shirt closes round is not hair whatever the mesh
    // says, so the plate scan reads through it — and anything that really does
    // reach into hair fails the boundary census and is dropped whole.
    const px = atlas();
    const f = fence();
    for (let y = 6; y < 9; y++) for (let x = 7; x < 13; x++) f[y * W + x] = 1;
    const { mask } = recolorPixels(px, { kit: TEAM.WHITEOUT, tone: 'brown', width: W, height: H });
    inkKitPanels(px, { width: W, height: H, kit: TEAM.WHITEOUT, mask, forbid: f });
    const shirt = at(px, 3, 14);
    expect(at(px, 9, 7), 'the fenced half of the plate').toEqual(shirt);
    expect(at(px, 9, 10), 'the rest of it').toEqual(shirt);
    expect(at(px, 41, 21), 'the hair patch').toEqual(HAIR_DEEP);
  });

  it('meets the kit rule at the cliff with NO seam — the grey wedge just goes', () => {
    // the wedge and the shorts around it are 18 % apart in brightness and must
    // come out 18 % apart in the SAME hue; a pass on a different curve would
    // have swapped a grey wedge for a hard-edged darker-gold one.
    const { px } = run(TEAM.GOLD);
    const lit = at(px, 3, 19), shade = at(px, 9, 23);
    expect(hsv(lit).h).toBeCloseTo(hsv(shade).h, 0);
    const ratio = luminance(shade) / luminance(lit);
    expect(ratio).toBeCloseTo(hsv(SHORTS_SHADE).v / hsv(SHORTS_LIT).v, 2);
  });

  it('leaves the HAIR alone — including on WHITEOUT, which is the white-wig bug', () => {
    for (const [name, kit] of Object.entries(TEAM)) {
      const { px } = run(kit);
      for (const [x, y] of [[23, 3], [28, 9], [33, 15]]) {
        expect(at(px, x, y), `${name} hair at ${x},${y}`).toEqual(HAIR);
      }
    }
  });

  it('...and the FENCE is what does it — without one the pass walks into the hair', () => {
    // the reach is what makes this a real risk: the padding between the vest
    // and the hair is OPAQUE, so a dilation crosses it as if it were shirt.
    const moved = (px) => {
      let n = 0;
      for (let y = 2; y < 16; y++) {
        for (let x = 22; x < 34; x++) {
          const c = at(px, x, y);
          if (c[0] !== HAIR[0] || c[1] !== HAIR[1] || c[2] !== HAIR[2]) n += 1;
        }
      }
      return n;
    };
    for (const kit of Object.values(TEAM)) {
      expect(moved(run(kit, { forbid: null }).px), kit).toBeGreaterThan(0); // reproduced
      expect(moved(run(kit).px), kit).toBe(0);                             // fenced off
    }
  });

  it('never touches skin: the panel pass moves nothing the tone pass claimed', () => {
    const px = atlas();
    const { mask } = recolorPixels(px, { kit: TEAM.GOLD, tone: 'deep', width: W, height: H });
    const beforePanels = [...px];
    inkKitPanels(px, { width: W, height: H, kit: TEAM.GOLD, mask, forbid: fence() });
    for (let y = 19; y < 27; y++) {
      for (let x = 23; x < 33; x++) {
        const p = (y * W + x) * 4;
        expect([px[p], px[p + 1], px[p + 2]], `skin at ${x},${y}`)
          .toEqual([beforePanels[p], beforePanels[p + 1], beforePanels[p + 2]]);
      }
    }
    // and the arm really did re-tone — this is not a test of an inert buffer
    expect(at(px, 28, 22)).not.toEqual(SKIN);
  });

  it('gives the anti-aliased kit/skin seam to the KIT, not to the skin rule', () => {
    // SEAM is a blend of white cloth and a warm arm: warm, barely saturated, and
    // the skin rule used to claim it and re-light it to near-white — a speckled
    // outline round every neckline and hem on a dark kit.
    expect(hsv(SEAM).s).toBeLessThan(SKIN_BLEND_SAT);
    expect(isSkinPixel(SEAM)).toBe(true);                  // the pure rule still claims it
    const px = atlas();
    const { mask, blend } = recolorPixels(px, { kit: TEAM.DARK, tone: 'deep', width: W, height: H });
    expect(blend).toBeGreaterThan(0);
    const i = 22 * W + 18;                                 // a seam texel beside the shorts
    expect(mask[i]).toBe(3);                               // taken off the skin border
    expect(luminance(at(px, 18, 22))).toBeLessThan(luminance(SEAM) * 0.5); // it went kit-dark
    // ...and only ever the BORDER: the middle of the arm is still skin
    expect(mask[22 * W + 28]).toBe(2);
  });

  it('without the mask the pass is blind to the plate — the shipped bug, pinned', () => {
    // Rebuilding the kit mask off the recoloured buffer finds no kit at all
    // (no team hex is a bright neutral), so nothing can prove it is ADJACENT to
    // the kit and the number plate stays black — which is what shipped.
    for (const kit of [TEAM.DARK, TEAM.GOLD]) {
      const px = atlas();
      recolorPixels(px, { kit, tone: 'brown', width: W, height: H });
      inkKitPanels(px, { width: W, height: H, kit, forbid: fence() });
      expect(at(px, 9, 8), kit).toEqual(PLATE);
    }
    // ...and with the mask the same atlas gives the plate up
    expect(at(run(TEAM.GOLD).px, 9, 8)).not.toEqual(PLATE);
  });
});
