import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  layoutFront, layoutBack, faceBoxes, stackFace, fitBox, decalKey, decalTexture,
  findChestBone, clearDecalCache, decalCacheSize, loadLogoImage, oppositeInk, fallOff,
  isShirtBone, percentile,
  DECAL_CACHE_MAX, DECAL_PX, PLANE_M, OUTLINE_RATIO,
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
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: 'source-over',
    ops,
    clearRect() {},
    fillRect(...a) { ops.push({ op: 'fillRect', a, fill: this.fillStyle, gco: this.globalCompositeOperation }); },
    drawImage(src, ...a) { ops.push({ op: 'drawImage', src, a, gco: this.globalCompositeOperation }); },
    fillText(t, x, y) { ops.push({ op: 'fillText', t, x, y, fill: this.fillStyle, font: this._font }); },
    strokeText(t, x, y) { ops.push({ op: 'strokeText', t, x, y, stroke: this.strokeStyle }); },
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

describe('the number\'s own outline', () => {
  it('reads in the kit ink over an outline in the OTHER ink', () => {
    expect(oppositeInk('#0b0c10')).toBe('#f4f4f6');
    expect(oppositeInk('#f4f4f6')).toBe('#0b0c10');
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
