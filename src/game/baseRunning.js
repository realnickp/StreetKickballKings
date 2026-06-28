// Tap-mash sprinting and swipe jukes. One RunnerSim per runner per base leg.

/** AI runners: taps-per-second → run speed (m/s), with a base cruise, capped. */
export function mashSpeed(tapsPerSec, tuning) {
  const r = tuning.running;
  return Math.min(r.maxSpeedMs, r.baseSpeedMs + tapsPerSec * r.speedPerTapHz);
}

/**
 * Human runner: speed comes PURELY from tapping — no taps = no movement (you
 * stop). A tiny creep keeps a tapping-but-slow runner from looking frozen.
 */
export function humanRunSpeed(tapsPerSec, tuning) {
  const r = tuning.running;
  if (tapsPerSec < 0.3) return 0;
  return Math.min(r.maxSpeedMs, tapsPerSec * r.speedPerTapHz * 2.4);
}

const LATERAL_DECAY_MS = 3; // m/s the juke offset relaxes back toward the base path

export class RunnerSim {
  constructor({ tuning, human = false }) {
    this.tuning = tuning;
    this.human = human;
    this.progressM = 0;
    this.lateral = 0;
    this.arrived = false;
    this.jukeCooldown = 0;
  }

  /** @param {number} dt seconds @param {number} tapsPerSec live mash rate */
  tick(dt, tapsPerSec) {
    if (this.arrived) return;
    this.jukeCooldown = Math.max(0, this.jukeCooldown - dt * 1000);

    const speed = this.human ? humanRunSpeed(tapsPerSec, this.tuning) : mashSpeed(tapsPerSec, this.tuning);
    this.progressM += speed * dt;
    if (this.progressM >= this.tuning.running.basePathM) {
      this.progressM = this.tuning.running.basePathM;
      this.arrived = true;
    }

    if (this.lateral !== 0) {
      const decay = LATERAL_DECAY_MS * dt;
      this.lateral = Math.abs(this.lateral) <= decay ? 0 : this.lateral - Math.sign(this.lateral) * decay;
    }
  }

  /** @param {'left'|'right'} dir @returns {boolean} whether the juke fired */
  juke(dir) {
    if (this.arrived || this.jukeCooldown > 0) return false;
    this.lateral = (dir === 'left' ? -1 : 1) * this.tuning.running.jukeOffsetM;
    this.jukeCooldown = this.tuning.running.jukeCooldownMs;
    return true;
  }
}
