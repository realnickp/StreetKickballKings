import { it, expect } from 'vitest';
import { edgeClamp, markerClamp, SAFE } from '../src/ui/runnerArrows.js';
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

// Markers are icons on the frame edge, not chips: a 56 px inset keeps the whole
// 40 px glyph on screen, and the SAFE box keeps it clear of the score bug (top)
// and the control row (bottom) — dev, 2026-08-27: "not off screen because it's
// getting cut off".
it('markerClamp keeps markers 56px inside the frame and out of the HUD safe zones', () => {
  const r = markerClamp({ x: 900, y: 20, w: 390, h: 844 });
  expect(r.x).toBeLessThanOrEqual(390 - 56); expect(r.y).toBeGreaterThanOrEqual(SAFE.top);
  const b = markerClamp({ x: 195, y: 900, w: 390, h: 844 });
  expect(b.y).toBeLessThanOrEqual(844 - SAFE.bottom);
  expect(markerClamp({ x: 195, y: 400, w: 390, h: 844 }).visible).toBe(true);
});
it('markerClamp keeps a left/behind marker clear of the left edge too', () => {
  const l = markerClamp({ x: -400, y: 400, w: 390, h: 844 });
  expect(l.visible).toBe(false);
  expect(l.x).toBeGreaterThanOrEqual(56 + SAFE.left);
  const behind = markerClamp({ x: 200, y: 400, w: 390, h: 844, behind: true });
  expect(behind.visible).toBe(false);
  expect(behind.x).toBeGreaterThanOrEqual(56 + SAFE.left);
  expect(behind.x).toBeLessThanOrEqual(390 - 56 - SAFE.right);
  expect(behind.y).toBeGreaterThanOrEqual(SAFE.top);
  expect(behind.y).toBeLessThanOrEqual(844 - SAFE.bottom);
});
