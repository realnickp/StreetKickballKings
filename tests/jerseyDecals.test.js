import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  layoutFront, layoutBack, faceBoxes, stackFace, fitBox, decalKey, decalTexture,
  findChestBone, clearDecalCache, decalCacheSize, loadLogoImage, oppositeInk, fallOff,
  isShirtBone, percentile, attachJerseyDecals,
  DECAL_CACHE_MAX, DECAL_PX, PLANE_M, OUTLINE_RATIO, NUM_EDGE_RATIO, CHEST_DROP_M, BACK_HALF_W,
} from '../src/game/jerseyDecals.js';

// The decal canvas is the ONLY DOM this module touches. vitest runs in node,
// so stand up the smallest 2D context that exercises the real draw path
// (measureText has to answer in the CURRENT font size or the fit maths is
// meaningless, and actualBoundingBox* has to exist or the ink-box centring
// silently falls back to its estimate). Every op is recorded, in order — the
// ink outline is a DRAW ORDER, so that's the only way to assert it.
const canvases = [];
function stubCanvas() {
  const ops = [];
  const ctx = {
    _font: '900 100px Archivo',
    get font() { return this._font; },
    set font(v) { this._font = v; },
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', globalAlpha: 1,
    textAlign: '', textBaseline: '', globalCompositeOperation: 'source-over',
    ops,
    clearRect(...a) { ops.push({ op: 'clearRect', a }); },
    fillRect(...a) { ops.push({ op: 'fillRect', a, fill: this.fillStyle, gco: this.globalCompositeOperation }); },
    drawImage(src, ...a) { ops.push({ op: 'drawImage', src, a, gco: this.globalCompositeOperation }); },
    fillText(t, x, y) { ops.push({ op: 'fillText', t, x, y, fill: this.fillStyle, font: this._font }); },
    strokeText(t, x, y) { ops.push({ op: 'strokeText', t, x, y, stroke: this.strokeStyle, lineWidth: this.lineWidth, font: this._font }); },
    // Every way a 2D context can flood a REGION rather than a glyph. The old
    // conditional slab went down through beginPath/roundRect/fill; if any of
    // them ever comes back, the "no plate" tests below see it.
    beginPath(...a) { ops.push({ op: 'beginPath', a }); },
    closePath(...a) { ops.push({ op: 'closePath', a }); },
    moveTo(...a) { ops.push({ op: 'moveTo', a }); },
    lineTo(...a) { ops.push({ op: 'lineTo', a }); },
    quadraticCurveTo(...a) { ops.push({ op: 'quadraticCurveTo', a }); },
    rect(...a) { ops.push({ op: 'rect', a, fill: this.fillStyle }); },
    roundRect(...a) { ops.push({ op: 'roundRect', a, fill: this.fillStyle }); },
    arc(...a) { ops.push({ op: 'arc', a }); },
    fill(...a) { ops.push({ op: 'fill', a, fill: this.fillStyle, alpha: this.globalAlpha }); },
    save() {}, restore() {},
    measureText(s) {
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this._font)?.[1] ?? '100');
      return { width: String(s).length * px * 0.62, actualBoundingBoxAscent: px * 0.72, actualBoundingBoxDescent: 0 };
    },
  };
  const canvas = { getContext: () => ctx, ctx, width: 0, height: 0 };
  canvases.push(canvas);
  return canvas;
}

let hadDocument = false;
beforeAll(() => {
  hadDocument = 'document' in globalThis;
  if (!hadDocument) globalThis.document = { createElement: () => stubCanvas() };
});
afterAll(() => { if (!hadDocument) delete globalThis.document; });
beforeEach(() => { clearDecalCache(); canvases.length = 0; });

const img = (src) => ({ src, width: 1024, height: 1024, naturalWidth: 1024, naturalHeight: 1024 });
const mToPx = (m) => (m / PLANE_M) * DECAL_PX;
const toX = (x) => DECAL_PX / 2 + mToPx(x);
const toY = (y) => DECAL_PX / 2 - mToPx(y);
const fontPx = (f) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? '0');

describe('layouts', () => {
  it('the front is a big crew mark with a small number on the wearer\'s LEFT chest', () => {
    // +x is the wearer's left as you look at the front — viewer's right, which
    // is where a real jersey wears the chest number.
    expect(layoutFront()).toEqual({ logo: { w: 0.34, h: 0.34, y: 0.06 }, num: { w: 0.10, y: 0.16, x: 0.10 } });
    expect(layoutFront().num.x).toBeGreaterThan(0);
  });
  it('the back is a big number under a small crew mark', () => {
    expect(layoutBack()).toEqual({ num: { w: 0.26, y: 0.02 }, logo: { w: 0.16, y: 0.22 } });
  });
});

describe('placing the marks on a face', () => {
  for (const side of ['front', 'back']) {
    it(`${side}: both marks land inside the plane`, () => {
      const b = faceBoxes(side);
      for (const k of ['logo', 'num']) {
        expect(b[k].y + b[k].h / 2, `${k} top`).toBeLessThanOrEqual(PLANE_M / 2 + 1e-9);
        expect(b[k].y - b[k].h / 2, `${k} bottom`).toBeGreaterThanOrEqual(-PLANE_M / 2 - 1e-9);
        expect(Math.abs(b[k].x) + b[k].w / 2, `${k} side`).toBeLessThanOrEqual(PLANE_M / 2 + 1e-9);
      }
    });
  }

  it('the BACK stacks: the number is the hero and the crew mark clears it', () => {
    const { logo, num } = faceBoxes('back');
    const gap = Math.abs(logo.y - num.y) - (logo.h + num.h) / 2;
    expect(gap).toBeGreaterThan(0);
  });

  it('the FRONT keeps the spec sizes — a 0.34 m chest mark, the number badged onto its upper corner', () => {
    const { logo, num } = faceBoxes('front');
    expect(logo.w).toBeCloseTo(0.34, 6); // stacking used to shrink this to 0.29
    expect(num.w).toBeCloseTo(0.10, 6);
    // the badge sits high and to the wearer's left, overlapping the mark
    expect(num.x).toBeGreaterThan(0);
    expect(num.y).toBeGreaterThan(logo.y);
    const overlaps = Math.abs(num.x - logo.x) < (num.w + logo.w) / 2
      && Math.abs(num.y - logo.y) < (num.h + logo.h) / 2;
    expect(overlaps).toBe(true);
  });

  it('keeps the requested order down the face — front number above the mark, back mark above the number', () => {
    expect(faceBoxes('front').num.y).toBeGreaterThan(faceBoxes('front').logo.y);
    expect(faceBoxes('back').logo.y).toBeGreaterThan(faceBoxes('back').num.y);
  });

  it('stackFace leaves rects that already fit exactly where they were asked for', () => {
    const out = stackFace([{ key: 'a', w: 0.1, h: 0.1, x: 0, y: 0.10 }, { key: 'b', w: 0.1, h: 0.1, x: 0, y: -0.10 }]);
    expect(out.a.y).toBeCloseTo(0.10, 6);
    expect(out.b.y).toBeCloseTo(-0.10, 6);
  });

  it('fitBox slides a rect onto the plane without ever resizing it', () => {
    const b = fitBox({ w: 0.10, h: 0.10, x: 0.19, y: 0.30 });
    expect(b.w).toBeCloseTo(0.10, 6);
    expect(b.h).toBeCloseTo(0.10, 6);
    expect(b.x).toBeCloseTo(0.15, 6);
    expect(b.y).toBeCloseTo(0.15, 6);
    expect(fitBox({ w: 0.1, h: 0.1, x: 0, y: 0.05 })).toMatchObject({ x: 0, y: 0.05 });
  });
});

describe('the ink outline — every mark wears one', () => {
  const paint = (side = 'front', ink = '#f4f4f6') => {
    decalTexture(img('/assets/logos/monarchs.png'), 23, ink, side);
    return { face: canvases[0].ctx, sil: canvases[1]?.ctx, silCanvas: canvases[1] };
  };

  it('cuts the mark\'s own silhouette and floods it with the kit ink', () => {
    const { sil } = paint();
    expect(sil, 'a second canvas is cut for the silhouette').toBeTruthy();
    const drawn = sil.ops.find((o) => o.op === 'drawImage');
    const flood = sil.ops.find((o) => o.op === 'fillRect');
    expect(drawn.gco).toBe('source-over');           // the mark's alpha first
    expect(flood.gco).toBe('source-in');             // then paint only inside it
    expect(flood.fill).toBe('#f4f4f6');
  });

  it('stamps that silhouette all round the mark, then draws the mark ON TOP', () => {
    const { face, silCanvas } = paint();
    const draws = face.ops.filter((o) => o.op === 'drawImage');
    const stamps = draws.filter((o) => o.src === silCanvas);
    expect(stamps.length).toBeGreaterThanOrEqual(8);
    expect(draws.at(-1).src, 'the real mark is drawn LAST, over its own outline').not.toBe(silCanvas);
    expect(draws.at(-1).src.src).toBe('/assets/logos/monarchs.png');
    expect(draws.slice(0, -1).every((o) => o.src === silCanvas), 'nothing but outline before it').toBe(true);
  });

  it('dilates by ~2.5 % of the drawn mark\'s width and no further', () => {
    const { face, silCanvas } = paint();
    const mark = face.ops.filter((o) => o.op === 'drawImage').at(-1);
    const [mx, my, mw] = mark.a;
    const r = mw * OUTLINE_RATIO;
    const offs = face.ops.filter((o) => o.op === 'drawImage' && o.src === silCanvas)
      .map((o) => Math.hypot(o.a[0] - mx, o.a[1] - my));
    expect(Math.max(...offs)).toBeLessThanOrEqual(r + 1e-6);
    expect(Math.max(...offs)).toBeCloseTo(r, 6); // the outer ring reaches it
    expect(Math.min(...offs)).toBeGreaterThan(0); // nothing stamped dead centre
  });

  it('is UNCONDITIONAL — the same on both faces and on any ink', () => {
    for (const [side, ink] of [['front', '#f4f4f6'], ['back', '#0b0c10']]) {
      clearDecalCache(); canvases.length = 0;
      const { face, sil, silCanvas } = paint(side, ink);
      expect(sil.ops.find((o) => o.op === 'fillRect').fill).toBe(ink);
      expect(face.ops.filter((o) => o.op === 'drawImage' && o.src === silCanvas).length).toBeGreaterThanOrEqual(8);
    }
  });

  it('a mark that could not be silhouetted still draws — bare, never missing', () => {
    // one canvas only: the face. inkSilhouette gets nothing to draw into.
    const real = globalThis.document.createElement;
    globalThis.document.createElement = () => (canvases.length ? { getContext: () => null } : stubCanvas());
    try {
      decalTexture(img('/x.png'), 9, '#f4f4f6', 'front');
      const draws = canvases[0].ctx.ops.filter((o) => o.op === 'drawImage');
      expect(draws.length).toBe(1);
      expect(draws[0].src.src).toBe('/x.png');
    } finally { globalThis.document.createElement = real; }
  });
});

describe('the number', () => {
  const drawn = (side, number = 23) => {
    decalTexture(null, number, '#f4f4f6', side);
    const face = canvases[0].ctx;
    const fill = face.ops.find((o) => o.op === 'fillText');
    return { face, fill, size: fontPx(fill.font) };
  };

  it('is centred on its real INK box, not the em box', () => {
    const { fill, size } = drawn('back');
    const b = faceBoxes('back').num;
    const asc = size * 0.72; // what the stub font inks above the baseline
    // ink top = baseline − ascent, ink bottom = baseline; their midpoint is the box
    expect(fill.y - asc / 2).toBeCloseTo(toY(b.y), 3);
  });

  it('so the back number\'s top stroke clears the crew mark above it', () => {
    const { fill, size } = drawn('back');
    const { logo } = faceBoxes('back');
    const inkTop = fill.y - size * 0.72;
    expect(inkTop, 'lower on the canvas than the mark\'s bottom edge')
      .toBeGreaterThan(toY(logo.y - logo.h / 2));
  });

  it('sits on the wearer\'s LEFT chest on the front — viewer\'s right of centre', () => {
    const { fill } = drawn('front');
    expect(fill.x).toBeGreaterThan(DECAL_PX / 2);
    expect(fill.x).toBeCloseTo(toX(faceBoxes('front').num.x), 6);
  });

  it('never runs off the plane, however wide the digits', () => {
    const { fill, size } = drawn('back', 88);
    const w = String(88).length * size * 0.62;
    expect(fill.x + w / 2).toBeLessThanOrEqual(DECAL_PX);
    expect(w).toBeLessThanOrEqual(mToPx(PLANE_M * 0.86) + 1e-6);
  });
});

describe('decal texture cache', () => {
  it('keys on the logo, the number, the ink and the side — nothing else', () => {
    expect(decalKey('/assets/logos/monarchs.png', 23, '#f4f4f6', 'front'))
      .toBe('/assets/logos/monarchs.png|23|#f4f4f6|front');
  });

  it('hands the SAME texture back for the same key', () => {
    const a = decalTexture(img('/assets/logos/monarchs.png'), 23, '#f4f4f6', 'front');
    const b = decalTexture(img('/assets/logos/monarchs.png'), 23, '#f4f4f6', 'front');
    expect(b).toBe(a);
    expect(decalCacheSize()).toBe(1);
  });

  it('draws a new one for a different number, ink, side or crew', () => {
    const base = decalTexture(img('/assets/logos/monarchs.png'), 23, '#f4f4f6', 'front');
    expect(decalTexture(img('/assets/logos/monarchs.png'), 7, '#f4f4f6', 'front')).not.toBe(base);
    expect(decalTexture(img('/assets/logos/monarchs.png'), 23, '#0b0c10', 'front')).not.toBe(base);
    expect(decalTexture(img('/assets/logos/monarchs.png'), 23, '#f4f4f6', 'back')).not.toBe(base);
    expect(decalTexture(img('/assets/logos/bullies.png'), 23, '#f4f4f6', 'front')).not.toBe(base);
    expect(decalCacheSize()).toBe(5);
  });

  it('a missing logo still gets a numbered jersey', () => {
    const tex = decalTexture(null, 44, '#f4f4f6', 'back');
    expect(tex).toBeTruthy();
    expect(decalKey('', 44, '#f4f4f6', 'back')).toBe('|44|#f4f4f6|back');
  });

  it('stays bounded and disposes what it evicts', () => {
    let first = null;
    for (let i = 0; i < DECAL_CACHE_MAX; i++) {
      const t = decalTexture(img('/assets/logos/monarchs.png'), i, '#f4f4f6', 'front');
      if (i === 0) first = t;
    }
    expect(decalCacheSize()).toBe(DECAL_CACHE_MAX);
    let freed = false;
    first.addEventListener('dispose', () => { freed = true; });
    decalTexture(img('/assets/logos/monarchs.png'), 999, '#f4f4f6', 'front');
    expect(decalCacheSize()).toBe(DECAL_CACHE_MAX);
    expect(freed).toBe(true);
  });

  it('clearing lets go of the crew MARK images too, not just the textures', () => {
    const a = loadLogoImage('/assets/logos/monarchs.png');
    expect(loadLogoImage('/assets/logos/monarchs.png')).toBe(a);
    clearDecalCache();
    expect(loadLogoImage('/assets/logos/monarchs.png')).not.toBe(a);
  });
});

describe('the number\'s own outline — a glyph edge, NEVER a plate', () => {
  // Every op that floods a REGION instead of a glyph. `strokeText`/`fillText`
  // ink the letterform; `drawImage` of the silhouette canvas is the mark's own
  // alpha. Anything else laid down on a face canvas is a slab.
  const REGION_OPS = ['fillRect', 'roundRect', 'rect', 'arc', 'fill', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo'];
  const faceOf = () => canvases[0].ctx;

  it('reads in the kit ink over an outline in the OTHER ink', () => {
    expect(oppositeInk('#0b0c10')).toBe('#f4f4f6');
    expect(oppositeInk('#f4f4f6')).toBe('#0b0c10');
  });

  it('a number-only jersey draws EXACTLY two ops — the edge, then the ink', () => {
    // No mark to outline, so this is the whole of what the number costs. If a
    // backing slab ever creeps back in, it lands here first.
    for (const side of ['front', 'back']) {
      clearDecalCache(); canvases.length = 0;
      decalTexture(null, 7, '#f4f4f6', side);
      const ops = faceOf().ops;
      expect(ops.map((o) => o.op), side).toEqual(['strokeText', 'fillText']);
      expect(ops[0].stroke).toBe('#0b0c10');   // the edge, in the OTHER ink
      expect(ops[1].fill).toBe('#f4f4f6');     // the number, in the kit ink
      expect(ops[1].x).toBe(ops[0].x);
      expect(ops[1].y).toBe(ops[0].y);
    }
  });

  it('fills no region ANYWHERE on the face — the mark\'s outline is its own alpha', () => {
    for (const [side, ink] of [['front', '#f4f4f6'], ['back', '#0b0c10']]) {
      clearDecalCache(); canvases.length = 0;
      decalTexture(img('/assets/logos/bullies.png'), 7, ink, side);
      const face = faceOf();
      for (const op of REGION_OPS) {
        expect(face.ops.filter((o) => o.op === op).length, `${side} ${op} on the face`).toBe(0);
      }
      // every mark the face lays down is a glyph or the mark's own silhouette
      expect(face.ops.every((o) => ['drawImage', 'strokeText', 'fillText'].includes(o.op))).toBe(true);
      // the ONE fillRect in the run is the source-in flood that CUTS the
      // silhouette, on its own scratch canvas — never on the face
      const floods = canvases.flatMap((c, i) => c.ctx.ops.filter((o) => o.op === 'fillRect').map((o) => ({ i, o })));
      expect(floods.length, `${side} fillRect count`).toBe(1);
      expect(floods[0].i, 'not the face canvas').toBeGreaterThan(0);
      expect(floods[0].o.gco).toBe('source-in');
    }
  });

  it('wears the SAME edge weight on both faces — proportional, not a fixed 10 px', () => {
    // The back number is drawn ~2.3× the chest badge. A fixed stroke made the
    // hero number's edge less than half as heavy as the little one's.
    const weight = (side) => {
      clearDecalCache(); canvases.length = 0;
      decalTexture(null, 7, '#f4f4f6', side);
      const s = faceOf().ops.find((o) => o.op === 'strokeText');
      return { lw: s.lineWidth, size: fontPx(s.font) };
    };
    const f = weight('front'); const b = weight('back');
    expect(b.size).toBeGreaterThan(f.size * 2);            // the back IS the hero
    expect(f.lw / f.size).toBeCloseTo(NUM_EDGE_RATIO, 9);
    expect(b.lw / b.size).toBeCloseTo(NUM_EDGE_RATIO, 9);
  });

  it('keeps that edge ON the canvas — the back number settles flush to the plane', () => {
    // stackFace pushes the back run against the plane's bottom edge, so a
    // number fitted on its ink alone put its baseline on the last row and the
    // canvas sliced the edge off along its foot.
    clearDecalCache(); canvases.length = 0;
    decalTexture(null, 7, '#f4f4f6', 'back');
    const s = faceOf().ops.find((o) => o.op === 'strokeText');
    const size = fontPx(s.font);
    const half = s.lineWidth / 2;
    expect(s.y + half, 'the foot of the edge').toBeLessThanOrEqual(DECAL_PX + 1e-6);
    expect(s.y - size * 0.72 - half, 'the top of the edge').toBeGreaterThanOrEqual(0);
    // and the whole drawn mark still fits the box it was given
    const b = faceBoxes('back').num;
    expect(size * 0.72 + s.lineWidth).toBeCloseTo(mToPx(b.h), 6);
  });
});

describe('fallOff — how hard the decal bows onto the chest', () => {
  const edgeDrop = (c) => c * (PLANE_M / 2) ** 2; // how far the decal's own edge falls back
  it('solves the bow from the shirt: a 2 cm drop out at the ribs', () => {
    expect(fallOff(0.16, 0.14)).toBeCloseTo(2.0, 6);
  });
  it('never leaves it flat — a flat card stands proud of its own edges', () => {
    expect(edgeDrop(fallOff(0.16, 0.16))).toBeGreaterThan(0.015);
  });
  it('never curls the mark round the ribs and out of sight', () => {
    expect(edgeDrop(fallOff(0.16, 0.02))).toBeLessThan(0.10);
  });
  it('falls back to a chest-shaped bow when the shirt could not be measured', () => {
    const d = edgeDrop(fallOff(0.16, NaN));
    expect(d).toBeGreaterThan(0.015);
    expect(d).toBeLessThan(0.10);
  });
  it('solves at a caller-given x, not just RIB_X — the back samples its own half-width', () => {
    // same 3 cm centre-to-rib gap, but read at the number's own edge (0.13)
    // instead of the fixed 0.10 sample: a gentler curve, because x² grows
    // faster than a real chest's fall-off actually does past the rib sample.
    expect(fallOff(0.19, 0.16, 0.13)).toBeCloseTo(0.03 / (0.13 * 0.13), 6);
    expect(fallOff(0.19, 0.16, 0.13)).toBeLessThan(fallOff(0.19, 0.16)); // vs the RIB_X default
    expect(fallOff(0.19, 0.16)).toBeCloseTo(fallOff(0.19, 0.16, undefined), 9); // RIB_X is still the default
  });
});

describe('the back solves its fall-off at its OWN half-width, not RIB_X extrapolated', () => {
  // Bug: the back plane was bowed by a curve fit at RIB_X (0.10) and then read
  // out at the number's real half-width (0.13, BACK_HALF_W) — pure
  // extrapolation, and on a broad back (arch-bald/bullies) it clamped to
  // CURVE_MAX and buried the number 2+ cm deeper than the real shirt
  // (`.superpowers/sdd/2026-08-27-crews-kits-walkout/casts/back-bullies-dark.png`).
  // This stands up a synthetic shirt — a real THREE skeleton + skinned mesh,
  // not a stand-in — with a "strongly curved back": 3 cm behind centre at
  // ±0.10 (the OLD sample point), but only 1.5 cm behind centre at ±0.13 (the
  // NEW one, and the number's actual edge) — a broad back that decelerates
  // toward the flank instead of digging in harder, which is what real
  // anatomy does and a fixed-x² extrapolation cannot capture.
  function syntheticShirtRig() {
    const group = new THREE.Group();
    const hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 1.0, 0);
    group.add(hips);
    const spine = new THREE.Bone(); spine.name = 'Spine'; spine.position.set(0, 0.2, 0);
    hips.add(spine);
    const spine1 = new THREE.Bone(); spine1.name = 'Spine1'; spine1.position.set(0, 0.15, 0);
    spine.add(spine1);
    const chest = new THREE.Bone(); chest.name = 'Spine2'; chest.position.set(0, 0.15, 0);
    spine1.add(chest);
    group.updateMatrixWorld(true);

    const bones = []; group.traverse((o) => { if (o.isBone) bones.push(o); });
    const chestIdx = bones.indexOf(chest);
    const chestWorldY = 1.0 + 0.2 + 0.15 + 0.15; // 1.5

    // Every point sits at chestWorldY − CHEST_DROP_M, dead centre of the band
    // `measureShirt` reads, so only x (the flank) and z (the depth) matter.
    const Y = chestWorldY - CHEST_DROP_M;
    const pts = [];
    const band = (x, z, n) => { for (let i = 0; i < n; i++) pts.push(x, Y, z); };
    band(0, 0.16, 30);           // front, centre
    band(0, -0.19, 30);          // back, centre — the deepest point
    band(0.10, 0.14, 30);        // front, RIB_X
    band(0.10, -0.16, 30);       // back, RIB_X — 3 cm shallower than centre
    band(BACK_HALF_W, -0.175, 30); // back, the number's real edge — only
                                    // 1.5 cm shallower than centre

    const n = pts.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(
      new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? chestIdx : 0)), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(
      new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    const skeleton = new THREE.Skeleton(bones);
    group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    group.updateMatrixWorld(true);
    return group;
  }

  it('produces a plane whose edge at ±0.13 is within 1 cm of the measured shirt there, never behind it', async () => {
    const group = syntheticShirtRig();
    const acc = attachJerseyDecals({ group }, { number: 7, ink: '#f4f4f6' });
    expect(acc).toBeTruthy();
    await acc.ready;

    // Read the decal's own bow straight off its geometry: z = −curve·x² in the
    // plane's own local space, untouched by the mesh's own 180° rotation.
    const pos = acc.back.geometry.attributes.position;
    let curve = null;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i) - 0.125) < 1e-6) { curve = -pos.getZ(i) / (0.125 * 0.125); break; }
    }
    expect(curve, 'a vertex at x=0.125 (a grid point on the 16-segment plane)').not.toBe(null);

    const predictedDrop = curve * BACK_HALF_W * BACK_HALF_W;
    const trueDrop = 0.015; // -0.19 → -0.175 measured directly off the synthetic shirt
    expect(Math.abs(predictedDrop - trueDrop), 'within 1 cm of the real shirt at 0.13').toBeLessThanOrEqual(0.01);
    expect(predictedDrop, 'never MORE recessed than the real shirt — never behind it')
      .toBeLessThanOrEqual(trueDrop + 1e-6);

    // The OLD behaviour (fit at RIB_X, read out at 0.13) is what broke this:
    // it clamps to CURVE_MAX and overshoots the real shirt by well over 1 cm.
    const oldCurve = fallOff(0.19, 0.16); // the RIB_X-only read of this same shirt
    const oldPredictedDrop = oldCurve * BACK_HALF_W * BACK_HALF_W;
    expect(oldPredictedDrop - trueDrop, 'the bug this test guards against').toBeGreaterThan(0.01);

    acc.dispose();
  });
});

describe('measuring the shirt, not the hair', () => {
  it('counts the trunk — the spine chain and the hips root — as shirt', () => {
    // arch-twists weights the whole lower back of the vest to `Hips`; leaving it
    // out pulled the back plane 3 cm forward and sank the number into the shirt.
    for (const n of ['Spine', 'Spine01', 'Spine02', 'Spine2', 'mixamorigSpine1', 'chest_01', 'Hips', 'pelvis']) {
      expect(isShirtBone(n), n).toBe(true);
    }
  });
  it('throws out every joint that carries hair on these rigs — SHOULDERS included', () => {
    // Measured across the archetype set: arch-braids skins 2865 braid vertices
    // to `RightShoulder`, reaching 16 cm behind the shirt; arch-locs hangs the
    // dreadlocks off `LeftShoulder`; arch-pony rides the ponytail on `neck`.
    // Spine-plus-shoulders read arch-braids' back at −0.275 against a shirt at
    // about −0.14 — i.e. it does not fix the bug.
    for (const n of ['LeftShoulder', 'RightShoulder', 'neck', 'Neck', 'Head', 'hair_root', 'HairTie02', 'jaw', 'LeftEye', 'LeftUpLeg', 'LeftArm', '']) {
      expect(isShirtBone(n), n).toBe(false);
    }
  });
  it('reads a column at a percentile, so one stray vertex cannot move the plane', () => {
    const shirt = Array(99).fill(-0.13);
    shirt.push(-0.30); // one braid tip
    expect(Math.min(...shirt)).toBeCloseTo(-0.30, 6);   // what min/max used to read
    expect(percentile(shirt, 0.02)).toBeCloseTo(-0.13, 6);
    expect(percentile(shirt, 0.98)).toBeCloseTo(-0.13, 6);
  });
  it('percentile is empty-safe', () => {
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
    expect(Number.isNaN(percentile(null, 0.5))).toBe(true);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5);
  });
});

describe('findChestBone', () => {
  const node = (name, children = []) => ({ name, isBone: true, children });

  it('takes Spine2 over Spine', () => {
    const root = node('Hips', [node('Spine', [node('Spine1', [node('Spine2', [node('Neck')])])])]);
    expect(findChestBone(root).name).toBe('Spine2');
  });

  it('takes the LAST link of a rig that numbers its spine downward (Spine02 → Spine01 → Spine)', () => {
    // The archetype GLBs (arch-*.glb) name the belly joint Spine02 and the
    // collarbone joint plain `Spine` — digits alone would put the crew mark on
    // the navel, so depth in the chain decides.
    const chest = node('Spine', [node('neck'), node('LeftShoulder')]);
    const root = node('Hips', [node('LeftUpLeg'), node('Spine02', [node('Spine01', [chest])])]);
    expect(findChestBone(root)).toBe(chest);
  });

  it('ignores meshes and groups that happen to be in the tree', () => {
    const root = { name: 'Armature', children: [{ name: 'spine_mesh', isMesh: true, children: [] }, node('Hips', [node('Spine')])] };
    expect(findChestBone(root).name).toBe('Spine');
  });

  it('is null on a rig with no spine at all', () => {
    expect(findChestBone(node('Hips', [node('LeftUpLeg')]))).toBe(null);
  });
});
