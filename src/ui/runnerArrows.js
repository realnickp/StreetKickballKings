// Off-screen runner arrows (dev, 2026-08-25: "better indicators for where the
// runner is when you can't see them"). Pure math: clamp a projected point to
// the inset frame along the ray from screen centre and report the arrow angle.
export function edgeClamp({ x, y, w, h, inset = 24, behind = false }) {
  const cx = w / 2, cy = h / 2;
  let dx = x - cx, dy = y - cy;
  if (behind) { dx = -dx; dy = -dy; }
  const inside = !behind && x >= inset && x <= w - inset && y >= inset && y <= h - inset;
  if (inside) return { visible: true, x, y, angle: 0 };
  const hw = cx - inset, hh = cy - inset;
  const s = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  return { visible: false, x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}

// The markers are 40 px icons, not text chips, and the HUD owns the top strip
// (score bug) and the bottom strip (throw pad / GO). A 56 px inset keeps the
// whole glyph on screen; SAFE then pushes it out of those two strips so nothing
// is ever cut off or buried (dev, 2026-08-27: "not off screen because it's
// getting cut off").
export const SAFE = { top: 96, bottom: 216, left: 12, right: 20 };
export function markerClamp({ x, y, w, h, behind = false }) {
  const r = edgeClamp({ x, y, w, h, inset: 56, behind });
  if (r.visible) return r; // never move an on-screen point
  r.x = Math.min(Math.max(r.x, 56 + SAFE.left), w - 56 - SAFE.right);
  r.y = Math.min(Math.max(r.y, SAFE.top), h - SAFE.bottom);
  return r;
}
