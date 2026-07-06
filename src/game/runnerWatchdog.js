// Phase-independent runner stall detector (P0: AI stealers ran forever because
// the old watchdog only guarded phase==='LIVE'; steals run in SETUP/PITCH).
// A runner 'running' whose progress hasn't meaningfully changed for stallS
// seconds is stuck — whatever phase the match is in — and must be settled.

const EPSILON_M = 0.35; // movement below this doesn't count as progress

export class RunnerWatchdog {
  constructor(stallS = 6) {
    this.stallS = stallS;
    this.map = new Map();
  }

  /** @returns {boolean} true = this runner is stuck; force-settle him NOW */
  check(key, progressM, state, elapsed) {
    if (state !== 'running') {
      this.map.delete(key);
      return false;
    }
    const rec = this.map.get(key);
    if (!rec || Math.abs(progressM - rec.p) > EPSILON_M) {
      this.map.set(key, { p: progressM, t: elapsed });
      return false;
    }
    return elapsed - rec.t > this.stallS;
  }

  clear(key) { this.map.delete(key); }
  reset() { this.map.clear(); }
}
