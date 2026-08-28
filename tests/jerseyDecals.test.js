import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  layoutFront, layoutBack, faceBoxes, stackFace, decalKey, decalTexture,
  findChestBone, clearDecalCache, decalCacheSize, needsPatch, oppositeInk, fallOff,
  DECAL_CACHE_MAX, PLANE_M, PATCH_DELTA_L,
} from '../src/game/jerseyDecals.js';
import { contrastDeltaL } from '../src/game/kits.js';

// The decal canvas is the ONLY DOM this module touches. vitest runs in node,
// so stand up the smallest 2D context that exercises the real draw path
// (measureText has to answer in the CURRENT font size or the fit maths is
// meaningless).
function stubCanvas() {
  const ctx = {
    _font: '900 100px Archivo',
    get font() { return this._font; },
    set font(v) { this._font = v; },
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', textAlign: '', textBaseline: '',
    clearRect() {}, fillRect() {}, drawImage() {}, fillText() {}, strokeText() {},
    save() {}, restore() {},
    measureText(s) {
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this._font)?.[1] ?? '100');
      return { width: String(s).length * px * 0.62, actualBoundingBoxAscent: px * 0.72, actualBoundingBoxDescent: 0 };
    },
  };
  return { getContext: () => ctx, width: 0, height: 0 };
}

let hadDocument = false;
beforeAll(() => {
  hadDocument = 'document' in globalThis;
  if (!hadDocument) globalThis.document = { createElement: () => stubCanvas() };
});
afterAll(() => { if (!hadDocument) delete globalThis.document; });
beforeEach(() => clearDecalCache());

const img = (src) => ({ src, width: 1024, height: 1024, naturalWidth: 1024, naturalHeight: 1024 });

describe('layouts', () => {
  it('the front is a big crew mark with a small number up on the left chest', () => {
    expect(layoutFront()).toEqual({ logo: { w: 0.34, h: 0.34, y: 0.06 }, num: { w: 0.10, y: 0.16, x: -0.10 } });
  });
  it('the back is a big number under a small crew mark', () => {
    expect(layoutBack()).toEqual({ num: { w: 0.26, y: 0.02 }, logo: { w: 0.16, y: 0.22 } });
  });
});

describe('stackFace', () => {
  // The two rects asked for on each face add up to MORE than the 0.40 m plane
  // (front .34 + .10, back .26 + .16). Left alone they'd overlap and spill off
  // the top — the crew mark cut in half by the number is exactly the thing the
  // dev would see first. Stacking squeezes them onto the plane, in order.
  for (const side of ['front', 'back']) {
    it(`${side}: both marks land inside the plane`, () => {
      const b = faceBoxes(side);
      for (const k of ['logo', 'num']) {
        expect(b[k].y + b[k].h / 2, `${k} top`).toBeLessThanOrEqual(PLANE_M / 2 + 1e-9);
        expect(b[k].y - b[k].h / 2, `${k} bottom`).toBeGreaterThanOrEqual(-PLANE_M / 2 - 1e-9);
        expect(Math.abs(b[k].x) + b[k].w / 2, `${k} side`).toBeLessThanOrEqual(PLANE_M / 2 + 1e-9);
      }
    });
    it(`${side}: the number never overlaps the crew mark`, () => {
      const { logo, num } = faceBoxes(side);
      const gap = Math.abs(logo.y - num.y) - (logo.h + num.h) / 2;
      expect(gap).toBeGreaterThan(0);
    });
  }
  it('keeps the requested order down the face — front number above the mark, back mark above the number', () => {
    expect(faceBoxes('front').num.y).toBeGreaterThan(faceBoxes('front').logo.y);
    expect(faceBoxes('back').logo.y).toBeGreaterThan(faceBoxes('back').num.y);
  });
  it('leaves rects that already fit exactly where they were asked for', () => {
    const out = stackFace([{ key: 'a', w: 0.1, h: 0.1, x: 0, y: 0.10 }, { key: 'b', w: 0.1, h: 0.1, x: 0, y: -0.10 }]);
    expect(out.a.y).toBeCloseTo(0.10, 6);
    expect(out.b.y).toBeCloseTo(-0.10, 6);
  });
});

describe('decal texture cache', () => {
  it('keys on the logo, the number, the ink and the side', () => {
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

describe('needsPatch — a mark that would vanish into its own kit', () => {
  it('patches a mark that sits ~15 L* from the shirt', () => {
    expect(contrastDeltaL('#808080', '#a8a8a8')).toBeCloseTo(15.3, 1);
    expect(needsPatch('#808080', '#a8a8a8')).toBe(true);
  });
  it('leaves a mark that sits ~40 L* from the shirt alone', () => {
    expect(contrastDeltaL('#808080', '#ededed')).toBeCloseTo(40.2, 1);
    expect(needsPatch('#808080', '#ededed')).toBe(false);
  });
  it('catches the three crews whose light mark is a plain copy of the dark one', () => {
    // monarchs gold-on-gold, marauders orange-on-orange, hustlers white-on-white
    for (const [mark, kit] of [['#f5b312', '#f5b312'], ['#e0701a', '#e0701a'], ['#f1f4f8', '#f1f4f8']]) {
      expect(contrastDeltaL(mark, kit)).toBeLessThan(PATCH_DELTA_L);
      expect(needsPatch(mark, kit)).toBe(true);
    }
  });
  it('never patches when the mark could not be read', () => {
    expect(needsPatch(null, '#f5b312')).toBe(false);
    expect(needsPatch('#f5b312', null)).toBe(false);
  });
  it('the patch is the kit ink, so it always separates the mark from the shirt', () => {
    expect(oppositeInk('#0b0c10')).toBe('#f4f4f6');
    expect(oppositeInk('#f4f4f6')).toBe('#0b0c10');
  });
  it('a patched mark is a DIFFERENT cache entry from an unpatched one', () => {
    const url = '/assets/logos/monarchs-light.png';
    expect(decalKey(url, 23, '#0b0c10', 'front', true)).not.toBe(decalKey(url, 23, '#0b0c10', 'front', false));
    expect(decalKey(url, 23, '#0b0c10', 'front', false)).toBe(`${url}|23|#0b0c10|front`);
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
