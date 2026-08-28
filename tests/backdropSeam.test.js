import { it, expect } from 'vitest';
import {
  SEAM_EDGE_DEG, overlapArcs, seamEdge01, seamAlpha, seamAlphaData, seamWrap,
  horizonWorldY, solveBackOy,
} from '../src/game/backdropSeam.js';
import fieldsData from '../src/data/fields.json';

const D = Math.PI / 180;

it('the two half-cylinders each overrun the join by the edge angle', () => {
  const e = 12 * D;
  const { front, back } = overlapArcs(12);
  expect(front.start).toBeCloseTo(Math.PI / 2 - e, 12);
  expect(front.length).toBeCloseTo(Math.PI + 2 * e, 12);
  expect(back.start).toBeCloseTo(-Math.PI / 2 - e, 12);
  expect(back.length).toBeCloseTo(Math.PI + 2 * e, 12);
});

it('the halves overlap by exactly 2e at BOTH joins and still cover the whole ring', () => {
  const e = 12 * D;
  const { front, back } = overlapArcs(12);
  // join at +90 deg (world +x): back ends at pi/2 + e, front starts at pi/2 - e
  const backEnd = back.start + back.length;
  expect(backEnd - front.start).toBeCloseTo(2 * e, 12);
  // join at -90 deg (world -x): front ends at 3pi/2 + e == -pi/2 + e (mod 2pi)
  const frontEnd = front.start + front.length;
  expect(frontEnd - (back.start + 2 * Math.PI)).toBeCloseTo(2 * e, 12);
  // total covered arc = a full ring plus the two overlaps
  expect(front.length + back.length).toBeCloseTo(2 * Math.PI + 4 * e, 12);
});

it('defaults to the shipped 12 degree edge', () => {
  expect(SEAM_EDGE_DEG).toBe(12);
  expect(overlapArcs()).toEqual(overlapArcs(SEAM_EDGE_DEG));
});

it('edge01 is the overlap band as a fraction of the back half arc', () => {
  const e = 12 * D;
  expect(seamEdge01(12)).toBeCloseTo((2 * e) / (Math.PI + 2 * e), 12);
  expect(seamEdge01()).toBe(seamEdge01(SEAM_EDGE_DEG));
});

it('the alpha ramp is 0 at both arc ends and 1 across the middle', () => {
  const edge01 = seamEdge01();
  expect(seamAlpha(0, edge01)).toBe(0);
  expect(seamAlpha(edge01, edge01)).toBeCloseTo(1, 12);
  expect(seamAlpha(0.5, edge01)).toBe(1);
  expect(seamAlpha(1 - edge01, edge01)).toBeCloseTo(1, 12);
  expect(seamAlpha(1, edge01)).toBe(0);
});

it('the alpha ramp rises and falls monotonically inside the two bands', () => {
  const edge01 = seamEdge01();
  for (let i = 1; i <= 20; i++) {
    const u0 = ((i - 1) / 20) * edge01;
    const u1 = (i / 20) * edge01;
    expect(seamAlpha(u1)).toBeGreaterThan(seamAlpha(u0));           // rising band
    expect(seamAlpha(1 - u1)).toBeGreaterThan(seamAlpha(1 - u0));   // falling band (mirrored)
  }
  expect(seamAlpha(edge01 / 2)).toBeCloseTo(0.5, 12);
  expect(seamAlpha(1 - edge01 / 2)).toBeCloseTo(0.5, 12);
});

it('the ramp clamps outside [0,1] instead of going negative', () => {
  expect(seamAlpha(-0.4)).toBe(0);
  expect(seamAlpha(1.4)).toBe(0);
  expect(seamAlpha(0.5, 0)).toBe(1); // no edge = a hard-edged opaque half
});

it('seamAlphaData is an RGBA byte ramp whose green channel carries the alpha', () => {
  const w = 256;
  const d = seamAlphaData(w);
  expect(d).toBeInstanceOf(Uint8Array);
  expect(d.length).toBe(w * 4);
  const at = (i) => d[i * 4 + 1] / 255;
  expect(at(0)).toBeLessThan(0.02);
  expect(at(w - 1)).toBeLessThan(0.02);
  expect(at(Math.floor(w / 2))).toBeGreaterThan(0.99);
  for (let i = 0; i < w; i++) {
    // every channel carries the same value (three samples .g for alphaMap,
    // but a future material flag might sample .r or .a)
    expect(d[i * 4]).toBe(d[i * 4 + 1]);
    expect(d[i * 4 + 2]).toBe(d[i * 4 + 1]);
    expect(d[i * 4 + 3]).toBe(d[i * 4 + 1]);
  }
});

it('seamWrap keeps the painted scale and phase: the old arc maps to the old texels', () => {
  const tiles = 5, e = 12 * D;
  const { repeat, offset } = seamWrap(tiles, 0, 12);
  // widening the arc by 2e widens the repeat by the same factor -> same texels/degree
  expect(repeat).toBeCloseTo(tiles * (Math.PI + 2 * e) / Math.PI, 12);
  // ...and the offset backs up by exactly the flap that was added at the start
  expect(offset).toBeCloseTo(-(e * tiles) / Math.PI, 12);
  // the OLD half arc [0..1] in old-u still lands on old texels [0..tiles]
  const uNew = (uOld) => (uOld * Math.PI) / (Math.PI + 2 * e) + e / (Math.PI + 2 * e);
  for (const uOld of [0, 0.25, 0.5, 1]) {
    expect(offset + uNew(uOld) * repeat).toBeCloseTo(uOld * tiles, 12);
  }
});

it('seamWrap carries a non-zero base offset through untouched', () => {
  const { offset } = seamWrap(3, 0.25, 12);
  expect(offset).toBeCloseTo(0.25 - (12 * D * 3) / Math.PI, 12);
});

it('horizonWorldY maps an image horizon fraction onto the cylinder', () => {
  // window shows image v in [oy, oy+ry]; the cylinder spans bottom..bottom+h
  expect(horizonWorldY({ bottom: 0.3, h: 20, oy: 0.3, ry: 0.6, hFrac: 0.6 })).toBeCloseTo(0.3 + 20 * 0.5, 10);
  expect(horizonWorldY({ bottom: 0, h: 10, oy: 0.2, ry: 0.8, hFrac: 0.2 })).toBe(0);
});

it('solveBackOy is the inverse: it puts the back horizon on the front horizon', () => {
  const front = { bottom: 0.3, h: 26.6, oy: 0.31, ry: 0.69, hFrac: 0.52 };
  const targetY = horizonWorldY(front);
  const oy = solveBackOy({ targetY, bottom: 0.3, h: 26.6, ry: 0.69, hFrac: 0.44 });
  expect(horizonWorldY({ bottom: 0.3, h: 26.6, oy, ry: 0.69, hFrac: 0.44 })).toBeCloseTo(targetY, 10);
});

it('every shipped split-ring field keeps its back window inside the image', () => {
  for (const f of fieldsData.fields) {
    if (!f.backdropBack) continue;
    const oy = f.backdropBack.oy ?? f.backdropWindow?.oy ?? 0.18;
    const ry = f.backdropBack.ry ?? f.backdropWindow?.ry ?? 0.82;
    expect(oy, `${f.id} back oy`).toBeGreaterThanOrEqual(0);
    expect(oy + ry, `${f.id} back oy+ry`).toBeLessThanOrEqual(1.0001);
  }
});
