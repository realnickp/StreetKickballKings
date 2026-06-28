// Opponent brains: pitch selection, AI kick timing, fielder reactions,
// and AI base-running aggression. All knobs come from tuning.json.
import { PITCH_FAMILIES, makePitch } from './pitchPattern.js';

export function pickPitch(tuning, rng = Math.random) {
  // Generate a fresh pitch from a random family (the CPU's own pitches vary too).
  const fams = Object.keys(PITCH_FAMILIES);
  const family = fams[Math.floor(rng() * fams.length)];
  const p = makePitch(family, tuning, rng);
  return { id: p.label, speedMph: p.speedMph, durScale: p.durScale, curveM: p.curveM, ease: p.ease, bounce: p.bounce };
}

/**
 * Timing error (ms) an AI kicker produces at a difficulty level. A faster /
 * sharper-breaking pitch inflates the error, so good pitching actually makes
 * the CPU foul and whiff more (pitch is optional → backward compatible).
 */
export function aiKickError(difficulty, tuning, pitch, rng = Math.random) {
  const ai = tuning.ai[difficulty];
  // Pitch quality (0..1) is the DOMINANT lever: a nasty pitch (well + fast traced)
  // makes the CPU flail; a wobbler meatball gets crushed. Falls back to 0.5 when
  // there's no quality info (e.g. the AI's own pitches), staying backward-compatible.
  const q = Math.max(0, Math.min(1, pitch?.q ?? 0.5));
  // A nasty pitch should mostly produce WEAK contact (foul / soft grounder), not a
  // whiff — the CPU still kicks it, just badly. Only a SMALL extra whiff chance on
  // top pitches keeps the occasional swing-and-miss.
  const whiff = (ai.whiffChance ?? 0) + q * 0.10;
  if (rng() < whiff) {
    return (rng() < 0.5 ? -1 : 1) * (tuning.kick.okWindowMs * 1.6 + 30 + rng() * 120);
  }
  const [lo, hi] = ai.kickTimingErrMs;
  let mag = lo + rng() * (hi - lo);
  // quality widens the timing error: q=0 → 0.55x (meatball, crushed), q=1 → 1.05x (nasty).
  // Capped near 1x so a great pitch makes the CPU flail to WEAK/foul contact, not auto-foul
  // every pitch — a nasty HEAT was pushing error past the foul line ~100% of the time.
  mag *= 0.55 + q * 0.5;
  if (pitch) {
    const speedF = 1 + Math.max(0, (pitch.speedMph - 72) / 150);
    const breakF = 1 + Math.min(0.18, Math.abs(pitch.curveM ?? 0) * 0.08);
    mag *= speedF * breakF;
  }
  // Cap it so pitch quality ALONE can't force a whiff — keep the kick in play
  // (fair-to-weak). Whiffs come from the small explicit roll above, not from here.
  mag = Math.min(mag, tuning.kick.okWindowMs * 1.45);
  return rng() < 0.5 ? -mag : mag;
}

/** Does the CPU ignite this pitch? Per-difficulty chance lives in tuning.pitch.cpuFireChance. */
export function aiThrowsFire(difficulty, tuning, rng = Math.random) {
  return rng() < (tuning.pitch.cpuFireChance?.[difficulty] ?? 0);
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

/** Synthetic mash rate for AI runners (taps/sec). Kept modest so the CPU doesn't
 *  blaze around the bases faster than a human can realistically mash. */
export function aiMashRate(difficulty, rng = Math.random) {
  const base = { Rookie: 1.0, Street: 1.8, King: 2.8 }[difficulty] ?? 1.8;
  return base + rng() * 1.2;
}

/** Does the AI runner juke when a peg is incoming? */
export function aiJukes(difficulty, tuning, rng = Math.random) {
  return rng() < tuning.ai[difficulty].jukeChance;
}
