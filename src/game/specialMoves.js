// Per-team signature super kick. Meter charges from good plays; a full meter
// buys one special kick with boosted power and a team-themed cinematic.

export class SpecialMeter {
  /** @param {object} teamData entry from teams.json @param {object} tuning */
  constructor(teamData, tuning) {
    this.team = teamData;
    this.tuning = tuning;
    this.value = 0;
  }

  get ready() {
    return this.value >= this.tuning.special.meterMax;
  }

  /** @param {'PERFECT'|'catch'|'peg'|'homerun'} event */
  add(event) {
    const gain = this.tuning.special.gain[event] ?? 0;
    this.value = Math.min(this.tuning.special.meterMax, this.value + gain);
  }

  /** @returns {{id: string, label: string, powerMult: number} | null} */
  consume() {
    if (!this.ready) return null;
    this.value = 0;
    return { ...this.team.special, powerMult: this.tuning.special.powerMult };
  }
}
