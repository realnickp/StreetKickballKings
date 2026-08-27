// THE CROWN (dev, 2026-08-27: "reset to zero every time it's used, and you can
// only build it up on offense"). One meter, offense feeds only, a full crown is
// one guaranteed-crown swing — the equipped Locker kick is that swing's look
// and power. Consuming it empties the meter. No charges, no minting.
const OFFENSE = new Set(['hit', 'run', 'steal', 'PERFECT', 'homerun', 'pickleEscape', 'shutout']);
export class Crown {
  constructor({ meter, gear = null }) { this.meter = meter; this.gear = gear ?? null; this.armed = false; }
  get name() { return this.gear?.name ?? 'CROWN KICK'; }
  get fill() { return (this.meter.value / this.meter.tuning.special.meterMax) * 100; }
  get ready() { return this.meter.ready; }
  /** @returns {boolean} true the moment the crown becomes full */
  feed(event) {
    if (!OFFENSE.has(event)) return false;
    const was = this.meter.ready;
    this.meter.add(event);
    return !was && this.meter.ready;
  }
  arm() { if (!this.ready || this.armed) return false; this.armed = true; return true; }
  disarm() { this.armed = false; }
  consume() {
    if (!this.armed || !this.ready) { this.armed = false; return null; }
    this.armed = false; this.meter.value = 0;
    return { gear: this.gear, powerMult: this.gear?.mods?.powerMult ?? this.meter.tuning.special.powerMult, label: this.gear?.name ?? this.meter.team.special.label };
  }
  hudState() { return { name: this.name, fill: this.fill, ready: this.ready, armed: this.armed }; }
}
/** Runs `side` scored between two score snapshots ({home, away}). */
export const halfRuns = (before, after, side) => Math.max(0, (after?.[side] ?? 0) - (before?.[side] ?? 0));
/** The offense events that feed the crown — the scene reuses this for its sfx
 *  gate. Frozen copy: the live Set stays private so no caller can widen it. */
export const CROWN_EVENTS = Object.freeze([...OFFENSE]);
