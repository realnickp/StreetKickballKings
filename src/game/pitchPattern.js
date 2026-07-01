// Pitch-pattern tracing (PITCH role). Each of the 5 pitches has a signature
// swipe shape the player traces; scoreTrace() grades how faithfully they drew
// it into a 0..1 quality that drives the pitch's speed/accuracy/break.
//
// Pure + headless (no DOM, no THREE) so it unit-tests with the rest of /game.
// Patterns are normalized: x,y in [0..1], y-UP (0 = bottom = start, 1 = top).
// The HUD flips y to screen space when it draws them.

export const PITCH_PATTERNS = {
  // HEAT — quick, straight strokes but in DISTINCT directions so each reads/feels different.
  fastball:   [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }],                                              // dead straight up
  riser:      [{ x: 0.28, y: 0 }, { x: 0.72, y: 1 }],                                            // diagonal up-right
  fourSeam:   [{ x: 0.72, y: 0 }, { x: 0.28, y: 1 }],                                            // diagonal up-left
  highCheese: [{ x: 0.5, y: 0 }, { x: 0.5, y: 0.68 }, { x: 0.78, y: 1 }],                        // up, snap right at the top
  // BREAK — big pronounced hooks/arcs in different directions.
  curveLeft:  [{ x: 0.5, y: 0 }, { x: 0.56, y: 0.55 }, { x: 0.14, y: 1 }],                       // up, hard hook left
  curveRight: [{ x: 0.5, y: 0 }, { x: 0.44, y: 0.55 }, { x: 0.86, y: 1 }],                       // up, hard hook right
  slurve:     [{ x: 0.74, y: 0 }, { x: 0.46, y: 0.5 }, { x: 0.18, y: 1 }],                       // sweeping C-arc, right→left
  backdoor:   [{ x: 0.5, y: 0 }, { x: 0.26, y: 0.42 }, { x: 0.5, y: 0.72 }, { x: 0.82, y: 1 }],  // reverse-S, left then back right
  // JUNK — loopy / wiggly / off-speed, the most exaggerated shapes.
  changeup:   [{ x: 0.3, y: 0 }, { x: 0.66, y: 0.34 }, { x: 0.34, y: 0.66 }, { x: 0.7, y: 1 }],  // smooth S
  bouncy:     [{ x: 0.28, y: 0 }, { x: 0.74, y: 0.25 }, { x: 0.28, y: 0.5 }, { x: 0.74, y: 0.75 }, { x: 0.38, y: 1 }], // sharp zigzag
  eephus:     [{ x: 0.4, y: 0 }, { x: 0.74, y: 0.42 }, { x: 0.58, y: 0.82 }, { x: 0.26, y: 1 }], // big looping arch over the top
  knuckle:    [{ x: 0.5, y: 0 }, { x: 0.36, y: 0.2 }, { x: 0.62, y: 0.4 }, { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.8 }, { x: 0.46, y: 1 }], // tight wobble
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

const _clamp01 = (v) => Math.max(0.06, Math.min(0.94, v));
const _rr = (rng, a, b) => a + rng() * (b - a);
const _pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const _P = (x, y) => ({ x: _clamp01(x), y });

/**
 * Generate a FRESH random pitch for a family every time — so the traced shape is
 * almost never the same twice. Returns the trace `points` (normalized, y-up) PLUS the
 * pitch physics (speed/break/ease/bounce/durScale) derived from the same shape, and a
 * flavor `label` for the HUD readout. Replaces the old fixed 4-per-family pool.
 *
 * Family styles: HEAT = quick straight-ish strokes in varied directions; BREAK = up
 * then a hook/arc (direction + sharpness randomized → curveM); JUNK = exaggerated
 * S / zigzag / arch / wobble (off-speed, ease/bounce).
 *
 * @param {string} family one of PITCH_FAMILIES
 * @param {object} tuning the tuning.json object (reads tuning.pitch.families[family])
 * @param {() => number} [rng]
 * @returns {{family:string, label:string, points:{x:number,y:number}[], speedMph:number, durScale:number, curveM:number, ease:number, bounce:number}}
 */
export function makePitch(family, tuning, rng = Math.random) {
  const fam = tuning.pitch.families?.[family];
  if (!fam) return null;
  const speedMph = Math.round(_rr(rng, fam.speedMph[0], fam.speedMph[1]));
  const durScale = Math.round(_rr(rng, fam.durScale[0], fam.durScale[1]) * 1000) / 1000;
  const label = _pick(rng, fam.names);
  let points, curveM = 0, ease = 1, bounce = 0;

  if (family === 'HEAT') {
    const bx = _rr(rng, 0.3, 0.7), tx = _rr(rng, 0.3, 0.7);
    if (rng() < 0.45) {
      const my = _rr(rng, 0.5, 0.72);
      const mx = (bx + tx) / 2 + _rr(rng, -0.14, 0.14);
      points = [_P(bx, 0), _P(mx, my), _P(tx, 1)]; // straight then a late snap
    } else {
      points = [_P(bx, 0), _P(tx, 1)]; // clean line in a random direction
    }
    curveM = Math.max(-1, Math.min(1, (tx - bx) * 1.6)); // a leaning fastball tails a touch
  } else if (family === 'BREAK') {
    const dir = rng() < 0.5 ? -1 : 1;
    const breakY = _rr(rng, 0.42, 0.62);
    const startX = 0.5 - dir * _rr(rng, 0, 0.22);                 // opposite-side start = sweeping C
    const midX = 0.5 + dir * _rr(rng, -0.06, 0.08);
    const endX = 0.5 + dir * _rr(rng, 0.28, 0.4);                 // big hook to one side
    if (rng() < 0.5) {
      points = [_P(startX, 0), _P(midX, breakY), _P(endX, 1)];
    } else {
      points = [_P(startX, 0), _P(midX, breakY), _P((midX + endX) / 2, (breakY + 1) / 2), _P(endX, 1)];
    }
    curveM = dir * _rr(rng, 1.7, 2.6);
  } else { // JUNK
    const kind = _pick(rng, ['s', 'zig', 'arch', 'wobble']);
    if (kind === 's') {
      points = [_P(_rr(rng, 0.26, 0.36), 0), _P(_rr(rng, 0.62, 0.72), 0.34), _P(_rr(rng, 0.28, 0.38), 0.66), _P(_rr(rng, 0.64, 0.74), 1)];
      ease = 0.5;
    } else if (kind === 'zig') {
      const n = 3 + Math.floor(rng() * 2);
      points = [];
      for (let i = 0; i <= n; i++) points.push(_P(i % 2 === 0 ? _rr(rng, 0.24, 0.34) : _rr(rng, 0.66, 0.76), i / n));
      bounce = _rr(rng, 1.2, 1.5);
    } else if (kind === 'arch') {
      const dir = rng() < 0.5 ? -1 : 1;
      points = [_P(0.5 - dir * 0.1, 0), _P(0.5 + dir * _rr(rng, 0.22, 0.32), 0.42), _P(0.5 + dir * _rr(rng, 0.06, 0.16), 0.82), _P(0.5 - dir * _rr(rng, 0.18, 0.28), 1)];
      ease = 0.5;
    } else { // wobble
      const n = 4 + Math.floor(rng() * 2);
      points = [];
      for (let i = 0; i <= n; i++) points.push(_P(0.5 + (i % 2 === 0 ? -1 : 1) * _rr(rng, 0.08, 0.16), i / n));
      bounce = _rr(rng, 1.2, 1.4);
    }
  }
  return { family, label, points, speedMph, durScale, curveM, ease, bounce };
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
