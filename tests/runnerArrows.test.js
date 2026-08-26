import { it, expect } from 'vitest';
import { edgeClamp } from '../src/ui/runnerArrows.js';
const W = 390, H = 844;

it('a point inside the inset frame is visible and untouched', () => {
  expect(edgeClamp({ x: 200, y: 400, w: W, h: H })).toEqual({ visible: true, x: 200, y: 400, angle: 0 });
});
it('a point off the right edge clamps to the right inset, arrow right', () => {
  const r = edgeClamp({ x: 900, y: 422, w: W, h: H });
  expect(r.visible).toBe(false); expect(r.x).toBeCloseTo(W - 24); expect(r.y).toBeCloseTo(422); expect(r.angle).toBeCloseTo(0);
});
it('a point above the frame clamps to the top edge, arrow up', () => {
  const r = edgeClamp({ x: 195, y: -300, w: W, h: H });
  expect(r.y).toBeCloseTo(24); expect(r.angle).toBeCloseTo(-Math.PI / 2);
});
it('behind the camera mirrors the projection and always clamps', () => {
  const r = edgeClamp({ x: 100, y: 300, w: W, h: H, behind: true });
  expect(r.visible).toBe(false); expect(r.x).toBeGreaterThan(W / 2); expect(r.y).toBeGreaterThan(H / 2);
});
