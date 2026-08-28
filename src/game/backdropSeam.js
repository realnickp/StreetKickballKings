// The backdrop corner seam — pure geometry/uv math for the two half-cylinder
// backdrop rings (field.js).
//
// THE BUG (dev, 2026-08-27, screenshot 2): the backdrop is two OPEN half
// cylinders — the outfield half (theta pi/2 .. 3pi/2) and the home half
// (theta -pi/2 .. pi/2) — that butt together at theta = +-90 deg, i.e. world
// x = +-R, z = 0. That is exactly behind the side fences, in frame on most
// shots, and the two halves are DIFFERENT paintings with DIFFERENT vertical
// crops, so the join reads as a hard vertical edge with the two horizons at
// different heights.
//
// THE FIX, two parts:
//  (a) both halves are widened by `edgeDeg` past the join at BOTH ends, so
//      they overlap by 2*edgeDeg of arc there (overlapArcs), and the home
//      half fades out across those bands (seamAlpha / seamAlphaData) — an
//      8-10 m soft cross-fade instead of a cut.
//  (b) the widened arc must NOT rescale the painting: seamWrap widens the
//      texture repeat by the same factor and backs the offset up by the flap
//      it added, so every texel that used to sit at a given world angle still
//      sits there and only the two flaps are new content.
//
// Horizon matching (horizonWorldY / solveBackOy) is the per-field half of the
// fix and lives in fields.json as `backdropBack.oy`.

/** Arc overrun past each join, in degrees. 12 deg at r ~= 47 m is ~10 m of
 *  blend on each side — wide enough to hide a scene change, narrow enough
 *  that neither painting loses its framing. */
export const SEAM_EDGE_DEG = 12;

const DEG = Math.PI / 180;

/** CylinderGeometry (thetaStart, thetaLength) for both halves, each overrunning
 *  the two joins at theta = +-pi/2 by `edgeDeg`. */
export function overlapArcs(edgeDeg = SEAM_EDGE_DEG) {
  const e = edgeDeg * DEG;
  return {
    edge: e,
    front: { start: Math.PI / 2 - e, length: Math.PI + 2 * e },
    back: { start: -Math.PI / 2 - e, length: Math.PI + 2 * e },
  };
}

/** The overlap band as a fraction of a half's own u in [0,1]. */
export function seamEdge01(edgeDeg = SEAM_EDGE_DEG) {
  const e = edgeDeg * DEG;
  return (2 * e) / (Math.PI + 2 * e);
}

/** Alpha along the HOME half's u: 0 at both arc ends, 1 from `edge01` to
 *  `1 - edge01`, linear in the two bands. */
export function seamAlpha(u, edge01 = seamEdge01()) {
  const x = Math.min(1, Math.max(0, u));
  const e = Math.min(0.5, Math.max(0, edge01));
  if (e <= 0) return 1;
  if (x <= e) return x / e;
  if (x >= 1 - e) return (1 - x) / e;
  return 1;
}

/** The ramp as RGBA bytes for a `width` x 1 DataTexture. three samples the
 *  GREEN channel for `alphaMap`; every channel carries the same value so the
 *  same buffer works as a map/alpha/roughness ramp if it is ever reused. */
export function seamAlphaData(width = 256, edge01 = seamEdge01()) {
  const d = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    // sample at the texel CENTRE so the first and last texels really are the
    // arc ends after LinearFilter (a 0.5/width bias either way would leave a
    // sliver of opaque paint at the join)
    const u = width > 1 ? i / (width - 1) : 0.5;
    const a = Math.round(255 * seamAlpha(u, edge01));
    d[i * 4] = a; d[i * 4 + 1] = a; d[i * 4 + 2] = a; d[i * 4 + 3] = a;
  }
  return d;
}

/** Texture repeat.x / offset.x for a half whose arc grew from pi to pi + 2e.
 *  Keeps the painted scale (texels per degree) AND the mirror phase: the arc
 *  that used to be u in [0,1] over `tiles` tiles still lands on texels
 *  [0, tiles], so nothing a field tuned by eye moves. */
export function seamWrap(tiles, offsetX = 0, edgeDeg = SEAM_EDGE_DEG) {
  const e = edgeDeg * DEG;
  const grow = (Math.PI + 2 * e) / Math.PI;
  return { repeat: tiles * grow, offset: offsetX - (e * tiles) / Math.PI };
}

/** World Y of a painting's horizon line on the backdrop cylinder.
 *  The texture window shows image v in [oy, oy + ry] (v = 0 is the image's
 *  BOTTOM row, three flips on upload), stretched over bottom .. bottom + h. */
export function horizonWorldY({ bottom = 0, h, oy, ry, hFrac }) {
  return bottom + (h * (hFrac - oy)) / ry;
}

/** The inverse: the `oy` that puts this painting's horizon at `targetY`.
 *  Both halves share a radius in every shipped field, so equal world Y is
 *  equal screen height at the join. */
export function solveBackOy({ targetY, bottom = 0, h, ry, hFrac }) {
  return hFrac - (ry * (targetY - bottom)) / h;
}
