// The two PIXEL RULES the archetype recolour runs on (spec §4). Both are pure
// maths over one texel, so they get tested here instead of by eyeballing a
// 2048² atlas: the kit rule decides what turns the team's colour, the skin rule
// decides what turns the player's tone — and NOTHING may satisfy both, or a
// cheekbone ends up gold.
import { describe, it, expect } from 'vitest';
import {
  SKIN_TONES, KIT_SAT_MAX, KIT_VAL_MIN, SKIN_MIX, KIT_LIFT,
  hsv, luminance, isSkinPixel, isKitPixel, toneRgb, skinTintPixel, kitTintPixel, recolorPixels, skinMeanLuminance, inkKitPanels,
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

  it('agrees with kitTintPixel + skinTintPixel over the colour cube', () => {
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

  it('is a no-op when nothing is asked for', () => {
    const px = cube(51);
    const before = new Uint8ClampedArray(px);
    expect(recolorPixels(px, {})).toEqual({ kit: 0, skin: 0, refL: 0 });
    expect(px).toEqual(before);
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
