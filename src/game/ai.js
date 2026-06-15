// Opponent brains: pitch selection, AI kick timing, fielder reactions,
// and AI base-running aggression. All knobs come from tuning.json.

export function pickPitch(tuning, rng = Math.random) {
  const types = Object.keys(tuning.pitch.types);
  const id = types[Math.floor(rng() * types.length)];
  const def = tuning.pitch.types[id];
  const speedMph = Math.round(def.speedMph[0] + rng() * (def.speedMph[1] - def.speedMph[0]));
  return { id, speedMph, curveM: def.curveM, ease: def.ease, bounce: def.bounce };
}

/**
 * Timing error (ms) an AI kicker produces at a difficulty level. A faster /
 * sharper-breaking pitch inflates the error, so good pitching actually makes
 * the CPU foul and whiff more (pitch is optional → backward compatible).
 */
export function aiKickError(difficulty, tuning, pitch, rng = Math.random) {
  const [lo, hi] = tuning.ai[difficulty].kickTimingErrMs;
  let mag = lo + rng() * (hi - lo);
  if (pitch) {
    // gentle: a good pitch nudges the error up (more fouls/whiffs) but the CPU still
    // makes contact most of the time — combined multiplier tops out around 1.5x
    const speedF = 1 + Math.max(0, (pitch.speedMph - 72) / 110);          // ~+0.16 at 90mph
    const breakF = 1 + Math.min(0.30, Math.abs(pitch.curveM ?? 0) * 0.13); // up to +0.30
    mag *= speedF * breakF;
  }
  return rng() < 0.5 ? -mag : mag;
}

/** AI aim choice — slight pull tendency, occasional bunt on King. */
export function aiAim(difficulty, rng = Math.random) {
  const r = rng();
  if (difficulty === 'King' && r > 0.92) return 'bunt';
  if (r < 0.38) return 'left';
  if (r < 0.62) return 'center';
  return 'right';
}

/** Should the AI defense try a peg instead of a base throw? */
export function aiWantsPeg(difficulty, rng = Math.random) {
  const chance = { Rookie: 0.25, Street: 0.45, King: 0.6 }[difficulty] ?? 0.4;
  return rng() < chance;
}

/** Synthetic mash rate for AI runners (taps/sec). */
export function aiMashRate(difficulty, rng = Math.random) {
  const base = { Rookie: 2.5, Street: 4, King: 5.5 }[difficulty] ?? 4;
  return base + rng() * 1.5;
}

/** Does the AI runner juke when a peg is incoming? */
export function aiJukes(difficulty, tuning, rng = Math.random) {
  return rng() < tuning.ai[difficulty].jukeChance;
}
