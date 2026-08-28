// THE CROWN (dev, 2026-08-27: "reset to zero every time it's used, and you can
// only build it up on offense"). One meter, offense feeds only, a full crown is
// one guaranteed-crown swing — the equipped Locker kick is that swing's look
// and power. Consuming it empties the meter. No charges, no minting.
const OFFENSE = new Set(['hit', 'run', 'steal', 'PERFECT', 'homerun', 'pickleEscape', 'shutout']);
export class Crown {
  constructor({ meter, gear = null }) { this.meter = meter; this.gear = gear ?? null; this.armed = false; this.play = false; }
  get name() { return this.gear?.name ?? 'CROWN KICK'; }
  get fill() { return (this.meter.value / this.meter.tuning.special.meterMax) * 100; }
  get ready() { return this.meter.ready; }
  /** @returns {boolean} true the moment the crown becomes full. Gated while
   *  `play` is true: the crown swing's own play (its hit/run/homerun events,
   *  fired synchronously off the SAME applyOutcome that just consumed the
   *  crown) must never refill the meter it just emptied — that read as
   *  "back to back crowns" (dev, 2026-08-27). */
  feed(event) {
    if (this.play) return false;
    if (!OFFENSE.has(event)) return false;
    const was = this.meter.ready;
    this.meter.add(event);
    return !was && this.meter.ready;
  }
  arm() { if (!this.ready || this.armed) return false; this.armed = true; return true; }
  disarm() { this.armed = false; }
  consume() {
    if (!this.armed || !this.ready) { this.armed = false; return null; }
    this.armed = false; this.meter.value = 0; this.play = true;
    return { gear: this.gear, powerMult: this.gear?.mods?.powerMult ?? this.meter.tuning.special.powerMult, label: this.gear?.name ?? this.meter.team.special.label };
  }
  /** Close out the crown swing's play — feeds are un-gated again. Call this
   *  AFTER the play's applyOutcome (and any of its synchronous 'score'
   *  listeners) has fully run. */
  endPlay() { this.play = false; }
  hudState() { return { name: this.name, fill: this.fill, ready: this.ready, armed: this.armed }; }
}
/** Does the match END after this half? Mirrors MatchState.endHalf(): the game
 *  is over once the BOTTOM of the last inning is done and somebody is ahead —
 *  a tie sends it to extra innings. halfEnd is emitted BEFORE endHalf flips
 *  state.phase to 'GAME_END', so a listener has to decide this for itself
 *  rather than read the phase (which is still the pre-game-over value).
 *  @param {{inning: number, half: 'top'|'bottom'}} e the halfEnd event
 *  @param {{home: number, away: number}} score the FINAL score for that half
 *  @param {number} innings cfg.innings — the same field endHalf reads */
export const isFinalHalf = ({ inning, half } = {}, score = {}, innings = Infinity) =>
  half === 'bottom' && inning >= innings && (score.home ?? 0) !== (score.away ?? 0);

/** Runs `side` scored between two score snapshots ({home, away}). */
export const halfRuns = (before, after, side) => Math.max(0, (after?.[side] ?? 0) - (before?.[side] ?? 0));
/** The offense events that feed the crown — the scene reuses this for its sfx
 *  gate. Frozen copy: the live Set stays private so no caller can widen it. */
export const CROWN_EVENTS = Object.freeze([...OFFENSE]);
