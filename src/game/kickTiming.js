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

const AIM_DIR = { left: -1, center: 0, right: 1 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  // Discrete AI aims use a tighter, always-fair spread so the AI puts it in play.
  const base = opts.aimDeg != null
    ? clamp(opts.aimDeg, -k.aimSpreadDeg, k.aimSpreadDeg)
    : AIM_DIR[opts.aim] * (k.aiAimDeg ?? 30);
  // mistimed contact pushes the ball off the aim line: late opens right, early pulls left
  const timingBias = judged.quality === 'PERFECT' ? 0 : Math.sign(judged.errorMs) * 8;
  return {
    speed: k.maxBallSpeedMs * judged.power * mult,
    loftDeg: k.loftDeg[judged.quality],
    directionDeg: base + timingBias,
  };
}
