// Frame-time watchdog for the MSAA budget. A phone that can't hold 4x MSAA
// steps down 4 -> 2 -> 0 (one step per window, never back up) so smooth edges
// never cost the game its frame rate. Pure — no DOM, unit-tested.
export class PerfWatchdog {
  constructor({ windowS = 3, thresholdMs = 24, steps = [4, 2, 0], warmupS = 5 } = {}) {
    this.windowS = windowS; this.thresholdMs = thresholdMs; this.steps = steps; this.warmupS = warmupS;
    this.level = steps[0];
    this._i = 0; this._t = 0; this._acc = 0; this._n = 0;
  }
  /** @param {number} rawDt seconds @returns {number|null} the new level when a downgrade fires */
  tick(rawDt) {
    this._t += rawDt;
    if (this._t < this.warmupS) return null;
    this._acc += rawDt; this._n += 1;
    if (this._acc < this.windowS) return null;
    const avgMs = (this._acc / this._n) * 1000;
    this._acc = 0; this._n = 0;
    if (avgMs <= this.thresholdMs || this._i >= this.steps.length - 1) return null;
    this._i += 1;
    this.level = this.steps[this._i];
    return this.level;
  }
}
