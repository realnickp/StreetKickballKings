// Headless kickball rules engine. Knows nothing about 3D or input —
// matchScene resolves each live play into {type} and calls applyPlay().
import { EventBus } from '../engine/events.js';

const ADVANCE = { single: 1, double: 2, triple: 3, homerun: 4 };

// ---------- THE GAME ENDS WHEN IT'S WON (dev, 2026-08-28: "if you're winning
// in the bottom of the last inning, the game should end"). Two rules, both
// classic, both missing until now: the crew with LAST LICKS never has to kick a
// half it is already ahead in, and the run that puts them ahead in that half
// ends the game where it crosses — not at the end of the half.
//
// Sides, not halves: `firstKick` comes off the coin toss, so the bottom half is
// NOT always the home crew's. Whoever kicks in the BOTTOM has last licks, and
// the walk-off is theirs. With the default toss (away kicks first) that crew is
// 'home' and both rules read exactly as the book says.

/** The crew with LAST LICKS — whoever kicks in the bottom half. */
export const lastKickSide = (firstKick = 'away') => (firstKick === 'away' ? 'home' : 'away');

/** Is the last-licks crew AHEAD on this score? */
const lastLicksLead = (score = {}, firstKick = 'away') => {
  const last = lastKickSide(firstKick);
  const other = last === 'home' ? 'away' : 'home';
  return (score[last] ?? 0) > (score[other] ?? 0);
};

/** WALK-OFF: the bottom of the last (or any extra) inning and the last-licks
 *  crew is now ahead — over, on the run that did it. Pure; call after EVERY
 *  score. A tie stays live (extra innings); a lead they carried INTO the half
 *  can't walk off, which is what `topEndsGame` catches half an inning earlier. */
export function isWalkOff(state, cfg, firstKick = 'away') {
  if (!state || state.phase === 'GAME_END') return false;
  return state.half === 'bottom'
    && (state.inning ?? 0) >= (cfg?.innings ?? Infinity)
    && lastLicksLead(state.score, firstKick);
}

/** NO BOTTOM NEEDED: the top of the last inning is done and the last-licks crew
 *  is already ahead — they don't have to kick. A tie or a deficit sends the
 *  bottom half out as usual. */
export function topEndsGame(state, cfg, firstKick = 'away') {
  if (!state) return false;
  return state.half === 'top'
    && (state.inning ?? 0) >= (cfg?.innings ?? Infinity)
    && lastLicksLead(state.score, firstKick);
}

export class MatchEngine {
  /**
   * @param {{home: string, away: string}} sides team ids
   * @param {{innings: number, outsPerHalf: number}} cfg
   * @param {{firstKick?: 'home'|'away'}} opts coin toss result
   */
  constructor(sides, cfg, opts = {}) {
    this.sides = sides;
    this.cfg = cfg;
    this.firstKick = opts.firstKick ?? 'away';
    this.bus = new EventBus();
    this.state = {
      inning: 1,
      half: 'top', // 'top' = firstKick side kicks
      outs: 0,
      score: { home: 0, away: 0 },
      bases: [null, null, null], // 1st, 2nd, 3rd — hold kicker indices
      balls: 0, // sloppy-pitch count for the CURRENT at-bat; 4 = walk
      phase: 'PRE_PITCH', // PRE_PITCH | GAME_END
      kickerIdx: { home: 0, away: 0 },
    };
  }

  /** A pitch too sloppy to be legal. 4 of them walk the kicker. */
  noteBall() {
    if (this.state.phase === 'GAME_END') return null;
    this.state.balls += 1;
    this.bus.emit('ball', { balls: this.state.balls, side: this.kickingSide() });
    if (this.state.balls >= 4) { this.applyWalk(); return 'walk'; }
    return 'ball';
  }

  /** Free pass: kicker to 1st, forced runners push, forced-home scores. */
  applyWalk() {
    const side = this.kickingSide();
    const bases = this.state.bases;
    let carry = this.currentKickerIdx();
    for (let i = 0; i < 3 && carry !== null; i++) {
      const tmp = bases[i];
      bases[i] = carry;
      carry = tmp; // displaced runner keeps pushing only while the chain is forced
    }
    if (carry !== null) {
      this.state.score[side] += 1;
      this.bus.emit('score', { side, runs: 1, score: { ...this.state.score } });
    }
    this.advanceKicker(side);
    this.bus.emit('play', { type: 'walk', side });
    this.checkWalkOff(); // ball four can force in the winner
  }

  kickingSide() {
    const first = this.firstKick;
    const second = first === 'away' ? 'home' : 'away';
    return this.state.half === 'top' ? first : second;
  }

  fieldingSide() {
    return this.kickingSide() === 'home' ? 'away' : 'home';
  }

  currentKickerIdx() {
    return this.state.kickerIdx[this.kickingSide()];
  }

  /**
   * Apply exactly what happened on the field (multi-runner sim outcome).
   * @param {{outsAdded: number, runs: number, finalBases: (number|null)[], label?: string}} o
   */
  applyOutcome(o) {
    if (this.state.phase === 'GAME_END') return;
    const side = this.kickingSide();
    this.state.outs += o.outsAdded;
    this.state.bases = [...o.finalBases];
    if (o.runs > 0) {
      this.state.score[side] += o.runs;
      this.bus.emit('score', { side, runs: o.runs, score: { ...this.state.score } });
    }
    this.advanceKicker(side);
    this.bus.emit('play', { type: o.label ?? (o.outsAdded ? 'out' : 'advance'), side });
    if (this.checkWalkOff()) return; // the winning run beat the third out
    if (this.state.outs >= this.cfg.outsPerHalf) this.endHalf();
  }

  /**
   * Mid-at-bat base event (steal / caught stealing / pickoff): outs and bases
   * change but the SAME kicker stays up — the kicker index does not advance.
   * @param {{outsAdded?: number, bases?: (number|null)[], runs?: number}} e
   */
  applyBaseEvent({ outsAdded = 0, bases = null, runs = 0 } = {}) {
    if (this.state.phase === 'GAME_END') return;
    const side = this.kickingSide();
    this.state.outs += outsAdded;
    if (bases) this.state.bases = [...bases];
    if (runs) { // negative = a dead ball reverting a run (foul kills the steal)
      this.state.score[side] = Math.max(0, this.state.score[side] + runs);
      this.bus.emit('score', { side, runs, score: { ...this.state.score } });
    }
    this.bus.emit('play', { type: outsAdded ? 'caught-stealing' : 'steal', side });
    if (this.checkWalkOff()) return; // stealing home can win it
    if (this.state.outs >= this.cfg.outsPerHalf) this.endHalf();
  }

  /** @param {{type: 'out'|'single'|'double'|'triple'|'homerun'}} play */
  applyPlay(play) {
    if (this.state.phase === 'GAME_END') return;
    const side = this.kickingSide();

    if (play.type === 'out') {
      this.state.outs += 1;
    } else {
      const adv = ADVANCE[play.type];
      let runs = 0;
      const bases = this.state.bases;
      const next = [null, null, null];
      for (let i = 2; i >= 0; i--) {
        if (bases[i] === null) continue;
        const dest = i + adv;
        if (dest >= 3) runs += 1;
        else next[dest] = bases[i];
      }
      if (adv >= 4) runs += 1; // kicker scores on a home run
      else next[adv - 1] = this.currentKickerIdx();
      this.state.bases = next;
      if (runs > 0) {
        this.state.score[side] += runs;
        this.bus.emit('score', { side, runs, score: { ...this.state.score } });
      }
    }

    this.advanceKicker(side);
    this.bus.emit('play', { ...play, side });

    if (this.checkWalkOff()) return;
    if (this.state.outs >= this.cfg.outsPerHalf) this.endHalf();
  }

  /** End the game ON the run that won it. Called after every score; returns
   *  true when it fired, so the caller stops — there is no half left to end. */
  checkWalkOff() {
    if (!isWalkOff(this.state, this.cfg, this.firstKick)) return false;
    this.state.phase = 'GAME_END';
    this.bus.emit('gameEnd', { winner: this.winner(), score: { ...this.state.score }, walkOff: true });
    return true;
  }

  advanceKicker(side) {
    this.state.kickerIdx[side] = (this.state.kickerIdx[side] + 1) % 8;
    this.state.balls = 0; // fresh count for the next kicker
  }

  endHalf() {
    const finishedBottom = this.state.half === 'bottom';
    this.bus.emit('halfEnd', { inning: this.state.inning, half: this.state.half });

    // NO BOTTOM NEEDED: last licks are already ahead, so they never come up.
    if (!finishedBottom && topEndsGame(this.state, this.cfg, this.firstKick)) {
      this.state.phase = 'GAME_END';
      this.bus.emit('gameEnd', { winner: this.winner(), score: { ...this.state.score } });
      return;
    }
    if (finishedBottom) {
      const { home, away } = this.state.score;
      if (this.state.inning >= this.cfg.innings && home !== away) {
        this.state.phase = 'GAME_END';
        this.bus.emit('gameEnd', { winner: this.winner(), score: { ...this.state.score } });
        return;
      }
      this.state.inning += 1;
      this.state.half = 'top';
    } else {
      this.state.half = 'bottom';
    }
    this.state.outs = 0;
    this.state.bases = [null, null, null];
    this.state.balls = 0;
  }

  winner() {
    const { home, away } = this.state.score;
    if (home === away) return null;
    return home > away ? 'home' : 'away';
  }
}
