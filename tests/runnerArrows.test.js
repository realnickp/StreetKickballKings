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

// THE PHONE'S CONTROL ROW MOVES (dev, 2026-08-27). `.special-btn` (crown),
// `.go-btn` and `.throw-pad` are all positioned with
// `calc(... + env(safe-area-inset-bottom))`, so on an installed PWA the whole
// row rides ~34 px higher than a fixed band assumes — a bottom marker landed on
// the crown. `extraBottom` is that inset, added to the band.
it('extraBottom lifts the bottom band by exactly the phone inset', () => {
  const base = markerClamp({ x: 195, y: 900, w: 390, h: 844 });
  const inset = markerClamp({ x: 195, y: 900, w: 390, h: 844, extraBottom: 34 });
  expect(base.y).toBeCloseTo(844 - SAFE.bottom);
  expect(inset.y).toBeCloseTo(base.y - 34);
});
it('the default is unchanged — no inset means no extra lift', () => {
  const a = markerClamp({ x: 195, y: 900, w: 390, h: 844 });
  const b = markerClamp({ x: 195, y: 900, w: 390, h: 844, extraBottom: 0 });
  expect(b).toEqual(a);
  // a garbage/absent computed value must not shift the band either
  expect(markerClamp({ x: 195, y: 900, w: 390, h: 844, extraBottom: NaN }).y).toBeCloseTo(a.y);
});
it('the bottom band clears the GO button and the crown at any inset', () => {
  // .go-btn: bottom calc(150px + inset), ~46px tall -> its top edge is
  // h - 196 - inset. A 40px marker glyph reaches 20px below its centre.
  for (const inset of [0, 34]) {
    const c = markerClamp({ x: 195, y: 900, w: 390, h: 844, extraBottom: inset });
    expect(c.y + 20).toBeLessThanOrEqual(844 - 196 - inset);
  }
});
it('extraBottom never fights the top band on a short viewport', () => {
  const c = markerClamp({ x: 900, y: 20, w: 390, h: 844, extraBottom: 34 });
  expect(c.y).toBeGreaterThanOrEqual(SAFE.top);
});
