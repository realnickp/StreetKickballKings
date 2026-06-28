// Pitch-pattern tracing (PITCH role). Each of the 5 pitches has a signature
// swipe shape the player traces; scoreTrace() grades how faithfully they drew
// it into a 0..1 quality that drives the pitch's speed/accuracy/break.
//
// Pure + headless (no DOM, no THREE) so it unit-tests with the rest of /game.
// Patterns are normalized: x,y in [0..1], y-UP (0 = bottom = start, 1 = top).
// The HUD flips y to screen space when it draws them.

export const PITCH_PATTERNS = {
  // HEAT — straight, vertical lines (small lateral variation so they read distinct)
  fastball:   [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }],                                              // dead straight up
  riser:      [{ x: 0.5, y: 0 }, { x: 0.48, y: 0.5 }, { x: 0.57, y: 1 }],                         // straight, leans late
  fourSeam:   [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 1 }],                           // dead straight
  highCheese: [{ x: 0.5, y: 0 }, { x: 0.52, y: 0.5 }, { x: 0.5, y: 1 }],                          // tall straight
  // BREAK — up then hook
  curveLeft:  [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.55 }, { x: 0.18, y: 1 }],                         // up, hook left
  curveRight: [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.55 }, { x: 0.82, y: 1 }],                         // up, hook right
  slurve:     [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.45 }, { x: 0.26, y: 0.8 }, { x: 0.12, y: 1 }],    // sweeping hook left
  backdoor:   [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.6 }, { x: 0.68, y: 0.85 }, { x: 0.86, y: 1 }],    // late hook right
  // JUNK — loopy / wiggly / off-speed
  changeup:   [{ x: 0.3, y: 0 }, { x: 0.62, y: 0.34 }, { x: 0.38, y: 0.66 }, { x: 0.7, y: 1 }],   // smooth S
  bouncy:     [{ x: 0.3, y: 0 }, { x: 0.62, y: 0.25 }, { x: 0.35, y: 0.5 }, { x: 0.65, y: 0.75 }, { x: 0.4, y: 1 }], // zigzag
  eephus:     [{ x: 0.36, y: 0 }, { x: 0.62, y: 0.45 }, { x: 0.56, y: 0.82 }, { x: 0.42, y: 1 }], // lobbing arc
  knuckle:    [{ x: 0.5, y: 0 }, { x: 0.38, y: 0.25 }, { x: 0.6, y: 0.5 }, { x: 0.4, y: 0.75 }, { x: 0.58, y: 1 }], // wobble
};

// Display order + presentation (label + button color) for the pitch picker.
// Legacy flat menu (kept for back-compat tests); the HUD now uses PITCH_FAMILY_MENU.
export const PITCH_MENU = [
  { id: 'fastball',   label: 'FASTBALL',    color: '#e6483d' },
  { id: 'curveLeft',  label: 'LEFT CURVE',  color: '#3b7dd8' },
  { id: 'curveRight', label: 'RIGHT CURVE', color: '#3bb0c9' },
  { id: 'changeup',   label: 'CHANGEUP',    color: '#56c06a' },
  { id: 'bouncy',     label: 'BOUNCY',      color: '#b06ad0' },
];

// Three pitch families; each picker button rolls a random variant from its family.
export const PITCH_FAMILIES = {
  HEAT:  ['fastball', 'riser', 'fourSeam', 'highCheese'],
  BREAK: ['curveLeft', 'curveRight', 'slurve', 'backdoor'],
  JUNK:  ['changeup', 'bouncy', 'eephus', 'knuckle'],
};

// Display order + presentation for the 3-button family picker.
export const PITCH_FAMILY_MENU = [
  { id: 'HEAT',  label: 'HEAT',  color: '#e6483d' },
  { id: 'BREAK', label: 'BREAK', color: '#3b7dd8' },
  { id: 'JUNK',  label: 'JUNK',  color: '#b06ad0' },
];

/** Pick a random variant pitch id from a family (returns null for unknown family). */
export function pickVariant(family, rng = Math.random) {
  const ids = PITCH_FAMILIES[family];
  if (!ids || !ids.length) return null;
  return ids[Math.floor(rng() * ids.length)];
}

const RESAMPLE_N = 24;

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Resample a polyline to exactly n points evenly spaced by arc length. */
export function resample(pts, n = RESAMPLE_N) {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const total = pathLength(pts);
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = total / (n - 1);
  const out = [{ ...pts[0] }];
  let i = 1;
  let prev = pts[0];
  let acc = 0;
  while (out.length < n && i < pts.length) {
    const seg = Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y);
    if (acc + seg >= step && seg > 1e-9) {
      const t = (step - acc) / seg;
      const np = { x: prev.x + (pts[i].x - prev.x) * t, y: prev.y + (pts[i].y - prev.y) * t };
      out.push(np);
      prev = np;
      acc = 0;
    } else {
      acc += seg;
      prev = pts[i];
      i++;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out;
}

/** Normalize into a unit box by bounding box, scaled uniformly (aspect-preserving). */
function normalize(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const ext = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return pts.map(p => ({ x: (p.x - cx) / ext + 0.5, y: (p.y - cy) / ext + 0.5 }));
}

/**
 * Grade a traced stroke against a pitch pattern.
 * @param {{x,y}[]} stroke  raw player points (screen space; y-down is fine, normalized away)
 * @param {{x,y}[]} pattern one of PITCH_PATTERNS (normalized, y-up)
 * @param {{tolerance?:number, durMs?:number, speedFastMs?:number, speedSlowMs?:number}} [opts]
 * @returns {{quality:number, completion:number, accuracy:number, speed:number}}
 *   Forgiving by design: clean ≈ 0.95+, sloppy-but-complete ≈ 0.75, gave-up ≈ 0.45.
 */
export function scoreTrace(stroke, pattern, opts = {}) {
  const tol = opts.tolerance ?? 0.16;
  if (!stroke || stroke.length < 2) return { quality: 0, completion: 0, accuracy: 0, speed: 0 };

  // Pattern y-up → flip to y-down so it matches raw screen strokes before normalizing.
  const pat = normalize(resample(pattern.map(p => ({ x: p.x, y: 1 - p.y }))));
  const usr = normalize(resample(stroke));

  // accuracy: mean nearest-point distance in unit space
  let dsum = 0;
  for (const u of usr) {
    let best = Infinity;
    for (const p of pat) best = Math.min(best, Math.hypot(u.x - p.x, u.y - p.y));
    dsum += best;
  }
  const meanDist = dsum / usr.length;
  const accuracy = Math.max(0, 1 - meanDist / tol);

  // completion: how much of the shape's extent the player actually drew
  const completion = Math.min(1, pathLength(usr) / (pathLength(pat) || 1));

  // speed: how briskly the shape was drawn — a big part of pitch quality now
  const fast = opts.speedFastMs ?? 600;
  const slow = opts.speedSlowMs ?? 2600;
  const dur = opts.durMs ?? slow;
  const speed = Math.max(0, Math.min(1, (slow - dur) / (slow - fast)));

  // Pitch quality = how WELL you traced (accuracy) AND how FAST (speed), both
  // heavily weighted, gated by completion. Clean+fast ≈ nasty; sloppy or slow ≈ meatball.
  const quality = completion * (0.18 + 0.45 * accuracy + 0.37 * speed);
  return { quality: Math.max(0, Math.min(1, quality)), completion, accuracy, speed };
}
