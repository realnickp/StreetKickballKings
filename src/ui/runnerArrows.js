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
