// Crew Heat: per-team momentum (Street Rules pillar 2). Big plays build it,
// big defensive plays steal it, a full bar = ON FIRE for the next few plays.
// Headless — matchScene feeds events and multiplies the modifiers in.

// One channel per event: rules-engine outcomes arrive via match.bus 'play'
// labels, scene-only moments (PERFECT, robbed, peg, pickle) via call sites.
export const HEAT_EVENTS = {
  // offense builds
  PERFECT:           { gain: 15 },
  double:            { gain: 12 },
  triple:            { gain: 18 },
  homerun:           { gain: 30 },
  steal:             { gain: 10 },
  pickleEscape:      { gain: 25, steal: 10 },
  // defense builds AND steals from the kicking crew
  strikeout:         { gain: 12, steal: 6 },
  catch:             { gain: 8,  steal: 4 },
  'caught-stealing': { gain: 15, steal: 10 },
  doubleplay:        { gain: 25, steal: 15 },
  robbed:            { gain: 22, steal: 15 },
  rumbleKick:        { gain: 10 }, // el-train: clean contact THROUGH the rumble
  peg:               { gain: 15, steal: 8 },
  pickleWin:         { gain: 25, steal: 15 },
};

const FIRE_PLAYS = 4;      // ignition burns for the next 4 plays (either side's)
const AFTERGLOW = 25;      // where the bar lands when the fire dies
const DECAY_PER_S = 0.35;  // slow passive drain — momentum fades if nobody feeds it

export class CrewHeat {
  constructor() {
    this.value = { home: 0, away: 0 };
    this.firePlays = { home: 0, away: 0 };
  }

  onFire(side) {
    return this.firePlays[side] > 0;
  }

  /**
   * Apply a heat event for `side`. Defensive events also steal from the rival.
   * @returns {'ignited'|undefined} 'ignited' the moment a bar first hits 100
   */
  add(side, evt) {
    const def = HEAT_EVENTS[evt];
    if (!def) return;
    const other = side === 'home' ? 'away' : 'home';
    if (def.steal) this.value[other] = Math.max(0, this.value[other] - def.steal);
    if (this.onFire(side)) return; // a burning bar is pegged at 100 until it expires
    this.value[side] = Math.min(100, this.value[side] + def.gain);
    if (this.value[side] >= 100) {
      this.firePlays[side] = FIRE_PLAYS;
      return 'ignited';
    }
  }

  /** Every resolved play burns down active fires (a play is a play, either side). */
  notePlay() {
    for (const side of ['home', 'away']) {
      if (this.firePlays[side] > 0 && --this.firePlays[side] === 0) {
        this.value[side] = AFTERGLOW;
      }
    }
  }

  /** Passive decay; a burning bar holds at 100. */
  update(dt) {
    for (const side of ['home', 'away']) {
      if (!this.onFire(side)) this.value[side] = Math.max(0, this.value[side] - DECAY_PER_S * dt);
    }
  }

  // arcade-loud (Know It): a burning crew is unmistakably juiced
  kickPowerMult(side)     { return this.onFire(side) ? 1.25 : 1; }
  fielderSpeedScale(side) { return this.onFire(side) ? 1.2 : 1; }
  throwSpeedScale(side)   { return this.onFire(side) ? 1.25 : 1; }
}
