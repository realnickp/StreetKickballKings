// Headless kickball rules engine. Knows nothing about 3D or input —
// matchScene resolves each live play into {type} and calls applyPlay().
import { EventBus } from '../engine/events.js';

const ADVANCE = { single: 1, double: 2, triple: 3, homerun: 4 };

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
      phase: 'PRE_PITCH', // PRE_PITCH | GAME_END
      kickerIdx: { home: 0, away: 0 },
    };
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

    if (this.state.outs >= this.cfg.outsPerHalf) this.endHalf();
  }

  advanceKicker(side) {
    this.state.kickerIdx[side] = (this.state.kickerIdx[side] + 1) % 8;
  }

  endHalf() {
    const finishedBottom = this.state.half === 'bottom';
    this.bus.emit('halfEnd', { inning: this.state.inning, half: this.state.half });

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
  }

  winner() {
    const { home, away } = this.state.score;
    if (home === away) return null;
    return home > away ? 'home' : 'away';
  }
}
