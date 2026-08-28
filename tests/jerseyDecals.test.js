import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  layoutFront, layoutBack, faceBoxes, stackFace, fitBox, decalKey, decalTexture,
  findChestBone, clearDecalCache, decalCacheSize, loadLogoImage, oppositeInk,
  isShirtBone, isShoulderBone, attachJerseyDecals, CLOTH_HALF_W, NUM_INK_W_RATIO,
  patchWindow, projectUv, rigSlots, selectPatchTriangles, buildPatchGeometry,
  patchCoverage, MARK_COVER_MIN,
  DECAL_CACHE_MAX, DECAL_PX, PLANE_M, OUTLINE_RATIO, NUM_EDGE_RATIO, CHEST_DROP_M,
  PATCH_LIFT_M, WINDOW_PAD_M, MIN_PATCH_TRIS, SHOULDER_SHIRT_WEIGHT_MIN,
} from '../src/game/jerseyDecals.js';
import { disposeCharacter } from '../src/game/glbCharacters.js';

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
    expect(layoutFront()).toEqual({ logo: { w: 0.34, h: 0.34, y: 0.06 }, num: { w: 0.085, y: 0.14, x: 0.035 } });
    expect(layoutFront().num.x).toBeGreaterThan(0);
  });

  it('keeps every digit of the chest number ON the vest — the print cannot hang off cloth', () => {
    // Once the decal IS the shirt, ink drawn past the armhole is ink that does
    // not exist. Measured cloth reaches x ±0.115 on these rigs; the number was
    // drawn out to +0.19 and came back with its second digit sliced off
    // (decals-skinned/locker-bullies-puff-12-front.png, first pass).
    const n = faceBoxes('front').num;
    const reach = Math.abs(n.x) + (NUM_INK_W_RATIO * n.h) / 2;
    expect(reach, 'the outer digit’s edge').toBeLessThanOrEqual(CLOTH_HALF_W);
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
    expect(num.w).toBeCloseTo(0.085, 6);
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

  it('never runs off the SHIRT, however wide the digits', () => {
    // Not "off the plane" — off the CLOTH. A number wider than the back inks
    // onto the flank, where the planar projection smears it round the ribs.
    const { fill, size } = drawn('back', 88);
    const w = String(88).length * size * 0.62;
    expect(fill.x + w / 2).toBeLessThanOrEqual(DECAL_PX);
    expect(w).toBeLessThanOrEqual(mToPx(2 * CLOTH_HALF_W) + 1e-6);
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

// ---------------------------------------------------------------------------
// THE PATCH — the print is cut from the shirt, not hung in front of it.
// ---------------------------------------------------------------------------
// Dev, on his phone, 2026-08-28: "I need the logos and numbers to actually be
// on the players not hovering like this. its really bad." Everything below
// replaces the plane era's measure/bow/settle tests: there is nothing left to
// measure, because the decal IS the cloth.

/**
 * A synthetic body, as THREE sees one: a real Skeleton, a real SkinnedMesh,
 * an index buffer, and three regions —
 *  - a 10×10 grid quad on the CHEST, facing +z, weighted to the spine;
 *  - the same grid on the BACK, facing −z, weighted to the spine;
 *  - an ARM strip out at x ≈ 0.30 facing +z, weighted to a shoulder with NO
 *    trunk weight (which is what a braid looks like on these rigs too).
 * Everything sits in the decal window's own band so only the gates decide.
 *
 * The rig is built so that RIG space is WORLD space shifted down to the chest
 * bone: one bone chain, no scaling, the mesh bound with an identity bind
 * matrix. `chestY` is where the chest bone lands.
 */
const CHEST_Y = 1.5;
function bodyRig({
  chestZ = 0.16, backZ = -0.19, armX = 0.30, span = 0.22, grid = 10, withArm = true,
} = {}) {
  const group = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 1.0, 0);
  group.add(hips);
  const spine = new THREE.Bone(); spine.name = 'Spine02'; spine.position.set(0, 0.2, 0);
  hips.add(spine);
  const spine1 = new THREE.Bone(); spine1.name = 'Spine01'; spine1.position.set(0, 0.15, 0);
  spine.add(spine1);
  const chest = new THREE.Bone(); chest.name = 'Spine'; chest.position.set(0, 0.15, 0);
  spine1.add(chest);
  const shoulder = new THREE.Bone(); shoulder.name = 'LeftShoulder'; shoulder.position.set(0.1, 0, 0);
  chest.add(shoulder);
  group.updateMatrixWorld(true);
  const bones = []; group.traverse((o) => { if (o.isBone) bones.push(o); });
  const at = (b) => bones.indexOf(b);

  const P = []; const N = []; const SI = []; const SW = []; const IX = [];
  /** A `grid`×`grid` quad in the x/y plane at depth `z`, facing `nz`. */
  const quad = (cx, cy, z, nz, joint, weight, second = null) => {
    const base = P.length / 3;
    for (let r = 0; r <= grid; r++) {
      for (let c = 0; c <= grid; c++) {
        P.push(cx - span / 2 + (span * c) / grid, cy - span / 2 + (span * r) / grid, z);
        N.push(0, 0, nz);
        SI.push(joint, second?.[0] ?? 0, 0, 0);
        SW.push(weight, second?.[1] ?? 0, 0, 0);
      }
    }
    const w = grid + 1;
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const a = base + r * w + c; const b = a + 1; const d = a + w; const e = d + 1;
        // wound so the face normal agrees with `nz`
        if (nz > 0) IX.push(a, b, e, a, e, d);
        else IX.push(a, e, b, a, d, e);
      }
    }
  };
  const midY = CHEST_Y - CHEST_DROP_M;
  quad(0, midY, chestZ, 1, at(chest), 1);                          // the chest
  quad(0, midY, backZ, -1, at(chest), 1);                          // the back
  if (withArm) quad(armX, midY, chestZ, 1, at(shoulder), 1);       // the arm / a braid

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(IX);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = 'char1';
  group.add(mesh);
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  group.updateMatrixWorld(true);
  return { group, mesh, bones, chest, shoulder };
}

describe('what counts as shirt', () => {
  it('takes the trunk — the spine chain and the hips root', () => {
    for (const n of ['Spine', 'Spine01', 'Spine02', 'Spine2', 'Hips', 'chest_01', 'pelvis']) {
      expect(isShirtBone(n), n).toBe(true);
    }
  });

  it('throws out every joint that carries hair on these rigs, SHOULDERS included', () => {
    for (const n of ['Neck', 'Head', 'HairRoot', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'LeftUpLeg', 'Jaw']) {
      expect(isShirtBone(n), n).toBe(false);
    }
  });

  it('knows the shoulders by name, so the weight gate can let their CLOTH back in', () => {
    expect(isShoulderBone('LeftShoulder')).toBe(true);
    expect(isShoulderBone('clavicle_r')).toBe(true);
    expect(isShoulderBone('Spine'), 'the trunk is not a shoulder').toBe(false);
    expect(isShoulderBone('Head'), 'nor is anything that carries hair').toBe(false);
  });
});

describe('the window the print is cut from', () => {
  it('is the ink\'s own box, grown by the pad, in rig metres below the chest bone', () => {
    for (const side of ['front', 'back']) {
      const w = patchWindow(side);
      const b = faceBoxes(side);
      const lo = Math.min(b.logo.y - b.logo.h / 2, b.num.y - b.num.h / 2);
      const hi = Math.max(b.logo.y + b.logo.h / 2, b.num.y + b.num.h / 2);
      expect(w.loY, `${side} bottom`).toBeCloseTo(-CHEST_DROP_M + lo - WINDOW_PAD_M, 9);
      expect(w.hiY, `${side} top`).toBeCloseTo(-CHEST_DROP_M + hi + WINDOW_PAD_M, 9);
      // the canvas square itself never moves — the layouts are tuned to it
      expect(w.w).toBe(PLANE_M);
      expect(w.h).toBe(PLANE_M);
      expect(w.cy).toBe(-CHEST_DROP_M);
    }
  });

  it('lets the FRONT run the full width — the armhole is what cuts the chest mark, not a box', () => {
    // The mark is drawn 0.34 m wide on a torso that measures about 0.29 m
    // across: an x bound would slice it square, the arm joints trim it along
    // the armhole, which is what a printed vest does.
    expect(patchWindow('front').halfX).toBeCloseTo(PLANE_M / 2, 9);
  });

  it('holds the BACK to its own marks\' width', () => {
    const b = faceBoxes('back');
    const want = Math.max(b.logo.w, b.num.w) / 2 + WINDOW_PAD_M;
    expect(patchWindow('back').halfX).toBeCloseTo(want, 9);
    expect(patchWindow('back').halfX).toBeLessThan(PLANE_M / 2);
  });
});

describe('projectUv — the canvas square, straight onto the cloth', () => {
  const w = patchWindow('front');

  it('maps the window\'s corners to the canvas corners', () => {
    expect(projectUv(w.cx - w.w / 2, w.cy - w.h / 2, w, 'front')).toEqual([0, 0]);
    expect(projectUv(w.cx + w.w / 2, w.cy + w.h / 2, w, 'front')).toEqual([1, 1]);
    const [u, v] = projectUv(w.cx, w.cy, w, 'front');
    expect(u).toBeCloseTo(0.5, 9);
    expect(v).toBeCloseTo(0.5, 9);
  });

  it('MIRRORS u on the back, so the hero number reads the right way round', () => {
    const b = patchWindow('back');
    const x = b.cx + 0.1;
    const [uf] = projectUv(x, b.cy, b, 'front');
    const [ub] = projectUv(x, b.cy, b, 'back');
    expect(ub).toBeCloseTo(1 - uf, 9);
    // …and v is untouched: up the shirt is up the canvas on both faces
    expect(projectUv(x, b.cy + 0.1, b, 'back')[1]).toBeCloseTo(projectUv(x, b.cy + 0.1, b, 'front')[1], 9);
  });

  it('runs off the canvas rather than folding back — a patch may overhang the square', () => {
    expect(projectUv(w.cx + w.w, w.cy, w, 'front')[0]).toBeCloseTo(1.5, 9);
  });
});

describe('selectPatchTriangles — which of the body\'s triangles the print is', () => {
  it('takes the chest quad and NOTHING else on the front', () => {
    const { group, mesh } = bodyRig();
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const slots = rigSlots(mesh, rigInv);
    const sel = selectPatchTriangles(mesh, { side: 'front', slots });
    const tris = sel.triangles.length / 3;
    expect(tris, 'a 10×10 grid is 200 triangles').toBe(200);
    // every chosen vertex is on the chest quad: +z depth, inside the window
    for (const i of sel.triangles) {
      expect(sel.z[i], 'never the back').toBeGreaterThan(0);
      expect(Math.abs(sel.x[i]), 'never the arm').toBeLessThan(0.2);
    }
  });

  it('takes the back quad on the back, and turns its back on the chest', () => {
    const { mesh } = bodyRig();
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const sel = selectPatchTriangles(mesh, { side: 'back', slots: rigSlots(mesh, rigInv) });
    expect(sel.triangles.length / 3).toBe(200);
    for (const i of sel.triangles) expect(sel.z[i]).toBeLessThan(0);
  });

  it('throws out the ARM — a shoulder joint with no trunk weight is never shirt', () => {
    const { mesh } = bodyRig({ armX: 0.16 }); // inside the window's x bound, still an arm
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const sel = selectPatchTriangles(mesh, { side: 'front', slots: rigSlots(mesh, rigInv) });
    expect(sel.triangles.length / 3, 'the chest quad only').toBe(200);
    for (const i of sel.triangles) expect(sel.x[i]).toBeLessThan(0.12);
  });

  it('…but keeps blade cloth: a shoulder-dominant vertex that carries trunk weight IS shirt', () => {
    // The upper back and the upper chest are skinned to the SHOULDERS on these
    // rigs, blended with the spine. A braid on the same joint carries no spine
    // weight at all — that share is the only thing that tells them apart.
    const { group, mesh, bones, chest, shoulder } = bodyRig({ withArm: false });
    const si = mesh.geometry.getAttribute('skinIndex');
    const sw = mesh.geometry.getAttribute('skinWeight');
    // re-skin the chest quad: shoulder-DOMINANT, with a fifth of trunk weight
    for (let i = 0; i < si.count; i++) {
      si.setX(i, bones.indexOf(shoulder)); si.setY(i, bones.indexOf(chest));
      sw.setX(i, 0.8); sw.setY(i, 0.2);
    }
    si.needsUpdate = true; sw.needsUpdate = true;
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const kept = selectPatchTriangles(mesh, { side: 'front', slots: rigSlots(mesh, rigInv) });
    expect(kept.triangles.length / 3, '0.20 of trunk weight clears the gate').toBe(200);

    // drop the trunk share under the bar and the same cloth reads as hair
    for (let i = 0; i < sw.count; i++) { sw.setX(i, 0.97); sw.setY(i, 0.03); }
    sw.needsUpdate = true;
    const dropped = selectPatchTriangles(mesh, { side: 'front', slots: rigSlots(mesh, rigInv) });
    expect(dropped.triangles.length / 3, 'under the bar it is a braid').toBe(0);
    expect(SHOULDER_SHIRT_WEIGHT_MIN).toBe(0.10);
  });

  it('turns down cloth that faces the wrong way', () => {
    const { mesh } = bodyRig();
    const nor = mesh.geometry.getAttribute('normal');
    // everything near edge-on: (1, 0, 0.1) normalises to nz ~= 0.0995
    for (let i = 0; i < nor.count; i++) { nor.setX(i, 1); nor.setY(i, 0); nor.setZ(i, 0.1); }
    nor.needsUpdate = true;
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const slots = rigSlots(mesh, rigInv);
    expect(selectPatchTriangles(mesh, { side: 'front', slots }).triangles.length,
      'under FACE_MIN_Z nothing is claimed').toBe(0);
    expect(selectPatchTriangles(mesh, { side: 'back', slots }).triangles.length).toBe(0);
  });

  it('turns down cloth outside the window', () => {
    const { mesh } = bodyRig({ withArm: false });
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y - 1.0, 0); // slide the body a metre up
    const sel = selectPatchTriangles(mesh, { side: 'front', slots: rigSlots(mesh, rigInv) });
    expect(sel.triangles.length).toBe(0);
  });
});

describe('buildPatchGeometry — the body\'s own cloth, re-indexed and re-printed', () => {
  const built = (side = 'front') => {
    const { mesh } = bodyRig();
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const sel = selectPatchTriangles(mesh, { side, slots: rigSlots(mesh, rigInv) });
    return { mesh, sel, geo: buildPatchGeometry(mesh, sel, side) };
  };

  it('copies skinIndex and skinWeight per selected vertex — the GPU skins it with the shirt', () => {
    const { mesh, sel, geo } = built();
    const bi = mesh.geometry.getAttribute('skinIndex');
    const bw = mesh.geometry.getAttribute('skinWeight');
    const gi = geo.getAttribute('skinIndex');
    const gw = geo.getAttribute('skinWeight');
    expect(gi, 'a patch with no weights is a patch that cannot deform').toBeTruthy();
    const ix = geo.getIndex();
    // walk the patch's own triangles back to the body's and compare
    for (let t = 0; t < sel.triangles.length; t++) {
      const old = sel.triangles[t];
      const now = ix.getX(t);
      expect(gi.getX(now)).toBe(bi.getX(old));
      expect(gw.getX(now)).toBeCloseTo(bw.getX(old), 6);
      expect(gw.getY(now)).toBeCloseTo(bw.getY(old), 6);
    }
  });

  it('pushes every position 4 mm out along its OWN normal, and nothing further', () => {
    const { mesh, sel, geo } = built();
    const bp = mesh.geometry.getAttribute('position');
    const bn = mesh.geometry.getAttribute('normal');
    const gp = geo.getAttribute('position');
    const ix = geo.getIndex();
    expect(PATCH_LIFT_M).toBe(0.004);
    for (let t = 0; t < sel.triangles.length; t++) {
      const old = sel.triangles[t]; const now = ix.getX(t);
      expect(gp.getX(now)).toBeCloseTo(bp.getX(old) + bn.getX(old) * PATCH_LIFT_M, 6);
      expect(gp.getY(now)).toBeCloseTo(bp.getY(old) + bn.getY(old) * PATCH_LIFT_M, 6);
      expect(gp.getZ(now)).toBeCloseTo(bp.getZ(old) + bn.getZ(old) * PATCH_LIFT_M, 6);
    }
  });

  it('quotes the lift in METRES however the GLB was authored', () => {
    // the archetypes park the armature at 1/100, so the body's own buffer is
    // not in metres and a raw 0.004 would be 0.4 mm or 40 cm
    const { mesh, sel } = built();
    const geo = buildPatchGeometry(mesh, sel, 'front', { scale: 0.01 });
    const bp = mesh.geometry.getAttribute('position');
    const bn = mesh.geometry.getAttribute('normal');
    const old = sel.triangles[0]; const now = geo.getIndex().getX(0);
    expect(geo.getAttribute('position').getZ(now))
      .toBeCloseTo(bp.getZ(old) + bn.getZ(old) * (PATCH_LIFT_M / 0.01), 6);
  });

  it('re-indexes: one patch vertex per body vertex used, not three per triangle', () => {
    const { geo } = built();
    expect(geo.getIndex().count).toBe(200 * 3);
    // an 11×11 grid of shared corners
    expect(geo.getAttribute('position').count).toBe(121);
  });

  it('gives it a NEW uv — the canvas square projected onto the cloth', () => {
    const { sel, geo } = built();
    const uv = geo.getAttribute('uv');
    const ix = geo.getIndex();
    for (let t = 0; t < sel.triangles.length; t++) {
      const old = sel.triangles[t]; const now = ix.getX(t);
      const [u, v] = projectUv(sel.x[old], sel.y[old], sel.window, 'front');
      expect(uv.getX(now)).toBeCloseTo(u, 6);
      expect(uv.getY(now)).toBeCloseTo(v, 6);
    }
    // the quad straddles the window's centre, so the print is centred on it
    let lo = Infinity; let hi = -Infinity;
    for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i)); }
    expect((lo + hi) / 2).toBeCloseTo(0.5, 6);
  });

  it('carries the owned tag so disposeCharacter frees it', () => {
    expect(built().geo.userData.owned).toBe(true);
  });
});

describe('patchCoverage — can this shirt actually carry the mark?', () => {
  const patchOf = (side, opts) => {
    const { mesh } = bodyRig(opts);
    const rigInv = new THREE.Matrix4().makeTranslation(0, -CHEST_Y, 0);
    const sel = selectPatchTriangles(mesh, { side, slots: rigSlots(mesh, rigInv) });
    return buildPatchGeometry(mesh, sel, side);
  };

  it('is 1 where the cloth covers the whole box and 0 where there is none', () => {
    // the synthetic quad is 0.22 m square about the window centre
    const geo = patchOf('front');
    const inside = { x: 0, y: 0, w: 0.10, h: 0.10 };
    const outside = { x: 0, y: 0.18, w: 0.02, h: 0.02 };
    expect(patchCoverage(geo, inside, 'front')).toBeGreaterThan(0.99);
    expect(patchCoverage(geo, outside, 'front')).toBe(0);
  });

  it('reads the BACK through its own mirrored uv, so a box is where it says it is', () => {
    // an off-centre box must read the same on both faces of the same cloth
    const box = { x: 0.06, y: 0, w: 0.06, h: 0.06 };
    expect(patchCoverage(patchOf('back'), box, 'back')).toBeCloseTo(
      patchCoverage(patchOf('front'), box, 'front'), 2,
    );
  });

  it('counts a half-covered box as about a half', () => {
    // the quad reaches x +0.11; a box from +0.06 to +0.16 is half on cloth
    const geo = patchOf('front');
    const half = patchCoverage(geo, { x: 0.11, y: 0, w: 0.10, h: 0.06 }, 'front');
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });
});

describe('attachJerseyDecals — two skinned patches on the player', () => {
  it('hands back SkinnedMeshes bound to the BODY\'s own skeleton', async () => {
    const { group, mesh } = bodyRig();
    const acc = attachJerseyDecals({ group }, { number: 23, ink: '#f4f4f6' });
    expect(acc).toBeTruthy();
    await acc.ready;
    for (const side of ['front', 'back']) {
      const p = acc[side];
      expect(p?.isSkinnedMesh, `${side} is skinned`).toBe(true);
      expect(p.skeleton, 'the SAME skeleton — one set of bone matrices').toBe(mesh.skeleton);
      expect(p.bindMode).toBe(mesh.bindMode);
      expect(p.parent, 'next to the body, not on a bone').toBe(mesh.parent);
      expect(p.matrixWorld.equals(mesh.matrixWorld), 'and with the body\'s transform').toBe(true);
      expect(p.geometry.getAttribute('skinIndex')).toBeTruthy();
      expect(p.frustumCulled).toBe(false);
      expect(p.renderOrder).toBe(2);
      expect(p.visible, 'painted, so it shows').toBe(true);
    }
    expect(acc.front.name).toBe('jersey-front');
    expect(acc.back.name).toBe('jersey-back');
    acc.dispose();
  });

  it('draws the print with the depth TEST on and no depth WRITE — that is what puts the arm in front', async () => {
    const acc = attachJerseyDecals({ group: bodyRig().group }, { number: 5, ink: '#f4f4f6' });
    await acc.ready;
    const m = acc.front.material;
    expect(m.depthWrite).toBe(false);
    expect(m.depthTest, 'the arm writes depth first; the print loses to it').toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.polygonOffset).toBe(true);
    expect(m.polygonOffsetFactor).toBeLessThan(0);
    expect(m.toneMapped).toBe(false);
    acc.dispose();
  });

  it('paints each face once and SHARES the cached texture between players', async () => {
    const a = attachJerseyDecals({ group: bodyRig().group }, { number: 9, ink: '#f4f4f6' });
    const b = attachJerseyDecals({ group: bodyRig().group }, { number: 9, ink: '#f4f4f6' });
    await Promise.all([a.ready, b.ready]);
    expect(a.front.material.map).toBe(b.front.material.map);
    expect(a.front.material.map).not.toBe(a.back.material.map);
    a.dispose(); b.dispose();
  });

  it('reports what it cut, per face', async () => {
    const acc = attachJerseyDecals({ group: bodyRig().group }, { number: 1, ink: '#f4f4f6' });
    await acc.ready;
    expect(acc.triangles).toEqual({ front: 200, back: 200 });
    expect(acc.front.userData.decal.triangles).toBe(200);
    acc.dispose();
  });

  it('prints the crew mark only where the shirt can carry it', async () => {
    // These vests are tank tops: on half the archetype set the back crest's box
    // is bare skin above a racerback, and a badge four fifths eaten reads as a
    // glitch (locker-monarchs-dark-back, first pass — 15 % of the box).
    // a shirt wide and long enough to hold both marks' boxes
    const full = attachJerseyDecals({ group: bodyRig({ span: 0.44, grid: 16 }).group },
      { number: 2, ink: '#f4f4f6' });
    await full.ready;
    expect(full.marks, 'a shirt that covers both boxes carries both marks').toEqual({ front: true, back: true });
    expect(full.cover.front).toBeGreaterThanOrEqual(MARK_COVER_MIN);
    full.dispose();

    // …now a body with only a narrow strip of cloth: the number still goes on,
    // the mark does not
    const thin = attachJerseyDecals({ group: bodyRig({ span: 0.09 }).group }, { number: 2, ink: '#f4f4f6' });
    await thin.ready;
    expect(thin.cover.front).toBeLessThan(MARK_COVER_MIN);
    expect(thin.marks, 'no crest on a shirt that cannot hold one').toEqual({ front: false, back: false });
    expect(thin.front.visible, 'the NUMBER is never gated — it is who the player is').toBe(true);
    thin.dispose();
  });

  it('ships NOTHING rather than confetti when a rig has no cloth to cut', async () => {
    // a body whose whole front is hair: shoulder-dominant, no trunk weight
    const { group, mesh, bones, shoulder } = bodyRig({ withArm: false });
    const si = mesh.geometry.getAttribute('skinIndex');
    for (let i = 0; i < si.count; i++) si.setX(i, bones.indexOf(shoulder));
    si.needsUpdate = true;
    const acc = attachJerseyDecals({ group }, { number: 1, ink: '#f4f4f6' });
    expect(acc, 'no face made the bar, so no decals at all').toBe(null);
    expect(MIN_PATCH_TRIS).toBe(12);
  });

  it('is null on a character with no skinned body at all', () => {
    const group = new THREE.Group();
    const bone = new THREE.Bone(); bone.name = 'Spine'; group.add(bone);
    group.updateMatrixWorld(true);
    expect(attachJerseyDecals({ group }, { number: 4 })).toBe(null);
  });

  it('dispose() takes both patches off and frees what they OWN — never the shared texture or skeleton', async () => {
    const { group, mesh } = bodyRig();
    const acc = attachJerseyDecals({ group }, { number: 8, ink: '#f4f4f6' });
    await acc.ready;
    const tex = acc.front.material.map;
    let texFreed = 0; const realDispose = tex.dispose.bind(tex);
    tex.dispose = () => { texFreed += 1; realDispose(); };
    let geoFreed = 0; let matFreed = 0; let skelFreed = 0;
    for (const p of [acc.front, acc.back]) {
      const g = p.geometry.dispose.bind(p.geometry);
      p.geometry.dispose = () => { geoFreed += 1; g(); };
      const m = p.material.dispose.bind(p.material);
      p.material.dispose = () => { matFreed += 1; m(); };
    }
    mesh.skeleton.dispose = () => { skelFreed += 1; };

    acc.dispose();
    expect(acc.front.parent, 'off the graph').toBe(null);
    expect(acc.back.parent).toBe(null);
    expect(geoFreed, 'both patch geometries').toBe(2);
    expect(matFreed, 'both patch materials').toBe(2);
    expect(texFreed, 'the cache owns the texture — the player does not').toBe(0);
    expect(skelFreed, 'and the skeleton is the PLAYER\'s').toBe(0);
    expect(decalCacheSize(), 'still cached for the next player in this kit').toBeGreaterThan(0);
  });

  // THE TEARDOWN. `disposeCharacter` is what matchScene.destroy() calls, and it
  // must free only what a character OWNS: the recoloured atlas is shared out of
  // glbCharacters' cache with every player in the same kit and carries no
  // `userData.owned`, so disposing one man must not blank the rest — and the
  // patches' skeleton is the body's, which the traverse frees exactly once.
  it('disposeCharacter takes the patches with the player and leaves the SHARED atlas alone', async () => {
    const squad = [];
    for (let i = 0; i < 4; i++) {
      const { group } = bodyRig();
      const decals = attachJerseyDecals({ group }, { number: i, ink: '#f4f4f6' });
      await decals.ready;
      squad.push({ group, decals });
    }
    let ownedFreed = 0; let sharedFreed = 0;
    const owned = { userData: { owned: true }, dispose: () => { ownedFreed += 1; } };
    const shared = { userData: {}, dispose: () => { sharedFreed += 1; } };
    squad[0].group.traverse((o) => { if (o.isMesh && o.name === 'char1') o.material.map = owned; });
    squad[1].group.traverse((o) => { if (o.isMesh && o.name === 'char1') o.material.map = shared; });

    for (const c of squad) disposeCharacter(c);
    expect(squad[0].decals.front.parent, 'the patches came off with the player').toBe(null);
    expect(ownedFreed, 'what the build allocated is freed').toBe(1);
    expect(sharedFreed, 'the shared recolour survives for the next character').toBe(0);
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
