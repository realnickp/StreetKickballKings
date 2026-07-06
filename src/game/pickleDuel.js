// Pickle v4 "THE DUEL" — headless decision brain for the rundown mini-game.
// ONE machine serves both sides (mine=true: player offense, false: player
// defense). All positions are t along the contested lane: 0 = the BACK bag
// (the runner's retreat/safety), 1 = the FORWARD bag (the steal). The
// conductor (matchScene) executes effects; this owns windows and timers.

/** Which way the trapped runner drifts RIGHT NOW: always away from the ball. */
export function shuttleDir({ runnerT, ballT }) {
  return ballT > runnerT ? -1 : 1;
}

export class PickleDuel {
  constructor({ mine, difficulty, tuning, rng = Math.random }) {
    this.mine = mine;
    this.D = tuning.duel;
    this.difficulty = difficulty;
    this.rng = rng;
    this.committed = false;
    this.commitDir = 0;
    this.goGrade = 0;
    this.spinT = 0;
    this.spinCd = 0;
    this.recoverT = 0;
    this.pegWindupT = 0;
    this.relays = 0;
    this.outcome = null;
    this._spinDodged = false;
    this._aiT = this.D.aiRelayS[difficulty] ?? 1.0;
    this._aiGoT = 0;      // >0: AI runner is reacting to a live throw
    this._aiSpinAt = -1;  // scheduled AI spin inside a peg windup
  }

  tick(dt) {
    const wasSpinning = this.spinT > 0;
    this.spinT = Math.max(0, this.spinT - dt);
    this.spinCd = Math.max(0, this.spinCd - dt);
    this.recoverT = Math.max(0, this.recoverT - dt);
    this.pegWindupT = Math.max(0, this.pegWindupT - dt);
    if (wasSpinning && this.spinT === 0 && !this._spinDodged) {
      this.recoverT = this.D.spinRecoverS; // whiffed spin = vulnerable
    }
  }

  // ---------- offense verbs ----------
  canGo(ballFlying) {
    return !!ballFlying && !this.committed && this.recoverT <= 0;
  }

  /** @param {{flightFrac:number, throwToEnd:0|1}} o break away from the throw */
  go({ flightFrac, throwToEnd }) {
    if (!this.canGo(true)) return false;
    this.committed = true;
    this.commitDir = throwToEnd === 1 ? -1 : 1;
    this.goGrade = Math.max(0, Math.min(1, 1 - flightFrac));
    return true;
  }

  spin() {
    if (this.spinCd > 0 || this.recoverT > 0) return false;
    this.spinT = this.D.spinIframeS;
    this.spinCd = this.D.spinCooldownS;
    this._spinDodged = false;
    return true;
  }

  /** taps/s fed to RunnerSim: modest shuttle, or a graded committed burst */
  runRate() {
    if (!this.committed) return this.D.shuttleRate;
    return this.D.goRateBase + this.D.goRateGradeBonus * this.goGrade;
  }

  // ---------- resolution ----------
  tagAttempt() {
    if (this.spinT > 0) {
      this.spinT = 0;
      this._spinDodged = true;
      return 'dodged';
    }
    return 'tagged';
  }

  /** spins OR a live juke offset dodge a peg (dev requirement) */
  pegImpact({ lateralM = 0 } = {}) {
    if (this.spinT > 0) {
      this.spinT = 0;
      this._spinDodged = true;
      return 'dodged';
    }
    if (Math.abs(lateralM) >= this.D.pegJukeDodgeM) return 'dodged';
    return 'hit';
  }
}
