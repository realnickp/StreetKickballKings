// POWER KICK (dev, 2026-08-25: "you can't use what you unlock"). One button,
// one rule: CHARGES. An equipped locker kick brings two per game; a full crown
// meter mints one more and resets. Arm on your at-bat, spend at launch.
export class PowerKicks {
  constructor({ meter, gear = null }) {
    this.meter = meter; this.gear = gear ?? null;
    this.charges = this.gear ? 2 : 0; this.armed = false;
  }
  get name() { return this.gear?.name ?? 'CROWN KICK'; }
  get lit() { return this.charges > 0; }
  /** Crown-meter gain. @returns {boolean} true when the meter filled and minted a charge */
  feed(event) {
    this.meter.add(event);
    if (!this.meter.ready) return false;
    this.meter.value = 0; this.charges += 1; return true;
  }
  arm() { if (!this.lit || this.armed) return false; this.armed = true; return true; }
  /** Un-arm without spending — the kick never happened. */
  disarm() { this.armed = false; }
  consume() {
    if (!this.armed || this.charges <= 0) { this.armed = false; return null; }
    this.charges -= 1; this.armed = false;
    return {
      gear: this.gear,
      powerMult: this.gear?.mods?.powerMult ?? this.meter.tuning.special.powerMult,
      label: this.gear?.name ?? this.meter.team.special.label,
    };
  }
  hudState() {
    return { name: this.name, charges: this.charges, armed: this.armed,
      meterFill: (this.meter.value / this.meter.tuning.special.meterMax) * 100 };
  }
}
