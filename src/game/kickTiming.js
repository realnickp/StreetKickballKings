// Timing-ring math: tap error (ms) vs the ball's plate arrival → kick quality,
// then quality + aim → a launch spec the physics layer turns into velocity.

/**
 * @param {number} errorMs tap time minus perfect-contact time (negative = early)
 * @returns {{quality: 'PERFECT'|'GOOD'|'OK'|'FOUL', power: number, cinematic: boolean, errorMs: number}}
 */
export function judgeKick(errorMs, tuning) {
  const abs = Math.abs(errorMs);
  const k = tuning.kick;
  let quality;
  if (abs <= k.perfectWindowMs) quality = 'PERFECT';
  else if (abs <= k.goodWindowMs) quality = 'GOOD';
  else if (abs <= k.okWindowMs) quality = 'OK';
  else quality = 'FOUL';
  return { quality, power: k.power[quality], cinematic: quality === 'PERFECT', errorMs };
}

/**
 * Meter power from raw timing error: 1.0 at perfect contact, falling linearly to
 * 0 at ±meterWindowMs. This is the value the on-screen power meter displays and
 * the magnitude that drives launch distance for a player kick.
 * @param {number} errMs release time minus plate arrival (sign ignored)
 * @returns {number} 0..1
 */
export function powerFromError(errMs, tuning) {
  const w = tuning.kick.meterWindowMs;
  return Math.max(0, Math.min(1, 1 - Math.abs(errMs) / w));
}

const AIM_DIR = { left: -1, center: 0, right: 1 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Flick control (dev: "we don't have the ability to control the height or
// distance of the kick... I'd like more control of where the ball goes"):
// the flick's LENGTH picks the loft — short flick = low line drive, long
// flick = high sky ball — and its SNAP (rise speed) scales distance inside a
// band the timing meter still owns. Timing stays the skill core; the flick
// is intent.
export const FLICK = {
  minRisePx: 48, maxRisePx: 300,   // vertical rise from flick start to peak
  minLoftDeg: 15, maxLoftDeg: 52,
  lazyPxMs: 0.25, snapPxMs: 1.6,   // rise speed (px/ms) mapped to the scale band
  speedScale: [0.85, 1.12],
  hrMinLoftDeg: 28,                // a bomb needs air under it — liners can't clear
  steerFullPx: 110,                // sideways drift for a full pull to the line
};

/** Deliberate direction from the flick's sideways DRIFT (dev: "how can we
 *  control the direction of the ball") — curl the stroke left/right and the
 *  ball follows, up to the full aim spread at ±steerFullPx. Returns degrees;
 *  0 when there's no usable drift (AI kicks, straight flicks). */
export function flickSteerDeg(flick, tuning) {
  if (!flick || !Number.isFinite(flick.driftPx)) return 0;
  return clamp(flick.driftPx / FLICK.steerFullPx, -1, 1) * tuning.kick.aimSpreadDeg;
}

/** Map raw flick metrics {risePx, durMs} to {loftDeg, speedScale}. Returns
 *  null when there are no usable metrics (AI kicks, buttons, degenerate input). */
export function flickShape(flick) {
  if (!flick || !(flick.risePx > 0)) return null;
  const len01 = clamp((flick.risePx - FLICK.minRisePx) / (FLICK.maxRisePx - FLICK.minRisePx), 0, 1);
  const spd = flick.risePx / Math.max(flick.durMs ?? 1, 1);
  const spd01 = clamp((spd - FLICK.lazyPxMs) / (FLICK.snapPxMs - FLICK.lazyPxMs), 0, 1);
  return {
    loftDeg: FLICK.minLoftDeg + len01 * (FLICK.maxLoftDeg - FLICK.minLoftDeg),
    speedScale: FLICK.speedScale[0] + spd01 * (FLICK.speedScale[1] - FLICK.speedScale[0]),
    len01, spd01,
  };
}

/**
 * @param {ReturnType<typeof judgeKick>} judged
 * @param {object} opts aim as a string (`'left'|'center'|'right'|'bunt'`, the AI
 *   path) OR a continuous swipe angle via `aimDeg` (+ optional `bunt:true`, the
 *   player swipe-to-kick path). `powerMult` scales special-move kicks.
 * @returns {{speed: number, loftDeg: number, directionDeg: number}}
 */
export function launchParams(judged, opts, tuning) {
  const k = tuning.kick;
  const mult = opts.powerMult ?? 1;

  if (opts.bunt || opts.aim === 'bunt') {
    const dir = opts.aimDeg != null ? clamp(opts.aimDeg, -k.aimSpreadDeg, k.aimSpreadDeg) * 0.4 : 0;
    return { speed: k.maxBallSpeedMs * 0.25 * mult, loftDeg: k.loftDeg.OK, directionDeg: dir };
  }

  // Player swipe (aimDeg) can pull all the way to the foul pole — a skill risk.
  // Discrete AI aims use a tighter, always-fair spread — and a RANDOM magnitude
  // (30-100% of the max pull), so CPU kicks range from right at a fielder to
  // the gap instead of always splitting the exact same seams (dev callout).
  const rng = opts.rng ?? Math.random;
  const base = opts.aimDeg != null
    ? clamp(opts.aimDeg, -k.aimSpreadDeg, k.aimSpreadDeg)
    // ?? 0: an aimless spec kicks dead-centre — a NaN heading sends the ball
    // (and everything reading its position) into the void
    : (AIM_DIR[opts.aim] ?? 0) * (k.aiAimDeg ?? 30) * (0.3 + rng() * 0.7);
  // mistimed contact pushes the ball off the aim line: late opens right, early pulls left
  const timingBias = judged.quality === 'PERFECT' ? 0 : Math.sign(judged.errorMs) * 8;
  // Distance scales with the meter power (player) or the per-band power (AI fallback).
  const power01 = opts.power01 ?? k.power[judged.quality];
  // Player flick shape: loft from flick length, distance band from flick snap.
  const shape = opts.shape ?? null;
  return {
    speed: (k.baseBallSpeedMs + power01 * (k.maxBallSpeedMs - k.baseBallSpeedMs)) * mult * (shape?.speedScale ?? 1),
    loftDeg: shape ? shape.loftDeg : k.loftDeg[judged.quality],
    // windBiasDeg: city-element wind awareness (CPU kicks downwind on windy fields)
    directionDeg: base + timingBias + (opts.windBiasDeg ?? 0),
  };
}

/**
 * A player kick can leave the park only when the power meter is locked in the
 * sweet zone AND the kicker was lined up under the ball. Both axes required.
 * @param {{power01:number, alignErrM:number}} k
 * @returns {boolean}
 */
export function isHrEligible({ power01, alignErrM }, tuning) {
  const c = tuning.kick;
  return power01 >= c.hrPower && alignErrM <= c.hrAlignM;
}

/**
 * When the AI kicker's swing CLIP must start so its contact frame lands on the
 * judged moment (arrival + clamped timing error). Back-timing the windup keeps
 * the foot meeting a LIVE ball — the ball no longer dies at the plate while
 * the kicker starts his wind-up (dev, 2026-08-04).
 * @param {{pitchFlightS:number, errMs:number, windupS:number}} s
 * @returns {number} seconds after the serve to play the kick clip
 */
export function aiSwingStartS({ pitchFlightS, errMs, windupS }) {
  const err = Number.isFinite(errMs) ? errMs : 0;
  const contactAt = pitchFlightS + Math.max(-0.25, Math.min(0.45, err / 1000));
  return Math.max(0.05, contactAt - (windupS || 0));
}

/** The kick beat runs at engine.timeScale (0.3 on the cinematic hit) but scene
 *  timers tick on REAL time — a fallback measured in scene seconds fired at
 *  ~half the wind-up on every special kick (dev, 2026-08-27). Convert. */
export function safetyLaunchDelayS(holdS, timeScale) {
  return holdS / Math.max(0.05, timeScale ?? 1) + 0.35;
}
/** Bone-name matcher for the striking foot ('L'|'R', default R). */
export function footBoneRegex(foot) {
  return foot === 'L' ? /LeftFoot|LeftToe/i : /RightFoot|RightToe/i;
}

/**
 * A CONSUMED CROWN IS NEVER A DRIBBLER (dev, 2026-08-27: "I just did a crowned
 * kick and it was a normal kick"). The judge runs on an EFFECTIVE error —
 * timing plus alignment (1 m off ≈ 175 ms) — so a well-timed super kick taken
 * ~0.8 m off the ball judged 'FOUL' and the weak-contact path overrode the
 * floored crown launch. Floor the judge at OK so `launchParams` still gets a
 * real swing. A whiff (effective error past the FOUL band) never reaches here —
 * it strikes and keeps the crown armed.
 * @param {ReturnType<typeof judgeKick>} judged
 * @returns {ReturnType<typeof judgeKick>} the promoted judge (same object when nothing to promote)
 */
export function crownJudge(judged, tuning) {
  if (judged.quality !== 'FOUL') return judged;
  return { ...judged, quality: 'OK', power: tuning.kick.power.OK };
}
