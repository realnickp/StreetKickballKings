import { it, expect } from 'vitest';
import { MatchEngine, isWalkOff, topEndsGame, lastKickSide } from '../src/game/matchState.js';

const cfg = { innings: 5, outsPerHalf: 3 };
const newGame = () => new MatchEngine({ home: 'monarchs', away: 'snappers' }, cfg);

it('starts top of 1st, away kicks first by default', () => {
  const m = newGame();
  expect(m.state.inning).toBe(1);
  expect(m.state.half).toBe('top');
  expect(m.kickingSide()).toBe('away');
});

it('coin toss winner can elect to kick first', () => {
  const m = new MatchEngine({ home: 'monarchs', away: 'snappers' }, cfg, { firstKick: 'home' });
  expect(m.kickingSide()).toBe('home');
});

it('three outs flips the half and resets bases', () => {
  const m = newGame();
  m.applyPlay({ type: 'out' });
  m.applyPlay({ type: 'out' });
  m.applyPlay({ type: 'single' });
  m.applyPlay({ type: 'out' });
  expect(m.state.half).toBe('bottom');
  expect(m.state.outs).toBe(0);
  expect(m.state.bases).toEqual([null, null, null]);
});

it('home run scores runner + kicker', () => {
  const m = newGame();
  m.applyPlay({ type: 'single' });
  m.applyPlay({ type: 'homerun' });
  expect(m.state.score.away).toBe(2);
});

it('singles advance runners one base and force runs in from third', () => {
  const m = newGame();
  m.applyPlay({ type: 'single' });
  m.applyPlay({ type: 'single' });
  m.applyPlay({ type: 'single' });
  expect(m.state.bases.filter(v => v !== null).length).toBe(3);
  m.applyPlay({ type: 'single' });
  expect(m.state.score.away).toBe(1);
});

it('double advances runners two bases', () => {
  const m = newGame();
  m.applyPlay({ type: 'single' });
  m.applyPlay({ type: 'double' });
  // runner from 1st reaches 3rd, kicker on 2nd
  expect(m.state.bases[0]).toBe(null);
  expect(m.state.bases[1]).not.toBe(null);
  expect(m.state.bases[2]).not.toBe(null);
  expect(m.state.score.away).toBe(0);
});

it('game ends after configured innings with a winner', () => {
  const m = newGame();
  let first = true;
  while (m.state.phase !== 'GAME_END') {
    if (first) { m.applyPlay({ type: 'homerun' }); first = false; }
    m.applyPlay({ type: 'out' });
  }
  expect(m.state.phase).toBe('GAME_END');
  expect(m.winner()).toBe('away');
});

it('tied game goes to extra innings', () => {
  const m = newGame();
  for (let i = 0; i < cfg.innings * 2 * cfg.outsPerHalf; i++) m.applyPlay({ type: 'out' });
  expect(m.state.phase).not.toBe('GAME_END');
  expect(m.state.inning).toBe(cfg.innings + 1);
});

it('emits play events for cinematics', () => {
  const m = newGame();
  const seen = [];
  m.bus.on('play', p => seen.push(p.type));
  m.applyPlay({ type: 'homerun' });
  expect(seen).toEqual(['homerun']);
});

it('rotates the kicking order through the roster indices', () => {
  const m = newGame();
  expect(m.currentKickerIdx()).toBe(0);
  m.applyPlay({ type: 'out' });
  expect(m.currentKickerIdx()).toBe(1);
  for (let i = 0; i < 7; i++) m.applyPlay({ type: 'single' });
  expect(m.currentKickerIdx()).toBe(0);
});

// ---------- balls & walks (Fun Overhaul pillar E) ----------

it('counts balls and walks the kicker on the 4th', () => {
  const m = newGame();
  expect(m.noteBall()).toBe('ball');
  expect(m.state.balls).toBe(1);
  m.noteBall();
  m.noteBall();
  const k = m.currentKickerIdx();
  expect(m.noteBall()).toBe('walk');
  expect(m.state.balls).toBe(0);
  expect(m.state.bases[0]).toBe(k);
  expect(m.currentKickerIdx()).toBe(k + 1);
});

it('walk pushes only forced runners (1st+3rd: 3rd holds)', () => {
  const m = newGame();
  m.state.bases = [5, null, 6];
  m.state.balls = 3;
  const k = m.currentKickerIdx();
  m.noteBall();
  expect(m.state.bases).toEqual([k, 5, 6]);
});

it('walk with bases loaded forces in a run', () => {
  const m = newGame();
  m.state.bases = [1, 2, 3];
  m.state.balls = 3;
  const side = m.kickingSide();
  const before = m.state.score[side];
  const k = m.currentKickerIdx();
  m.noteBall();
  expect(m.state.score[side]).toBe(before + 1);
  expect(m.state.bases).toEqual([k, 1, 2]);
});

it('walk emits ball + play events', () => {
  const m = newGame();
  const balls = [];
  const plays = [];
  m.bus.on('ball', (b) => balls.push(b.balls));
  m.bus.on('play', (p) => plays.push(p.type));
  m.state.balls = 3;
  m.noteBall();
  expect(balls).toEqual([4]);
  expect(plays).toEqual(['walk']);
});

it('count resets when the at-bat ends any other way', () => {
  const m = newGame();
  m.noteBall();
  m.applyPlay({ type: 'single' });
  expect(m.state.balls).toBe(0);
});

it('applyBaseEvent can revert a run on a dead ball (negative runs)', () => {
  const m = newGame();
  m.applyBaseEvent({ runs: 1 });
  expect(m.state.score.away).toBe(1);
  m.applyBaseEvent({ runs: -1 });
  expect(m.state.score.away).toBe(0);
});
// ---------- THE GAME ENDS WHEN IT'S WON (dev, 2026-08-28: "if you're winning
// in the bottom of the last inning, the game should end") ----------

/** Park a game in a given half with a given score. */
const at = (m, { inning, half, score, bases = [null, null, null] }) => {
  m.state.inning = inning; m.state.half = half;
  m.state.score = { ...score }; m.state.bases = [...bases];
  m.state.outs = 0; m.state.balls = 0;
  return m;
};
const ended = (m) => { const seen = []; m.bus.on('gameEnd', (e) => seen.push(e)); return seen; };

it('pure: isWalkOff only fires in the bottom of the last-or-later inning, with last licks ahead', () => {
  expect(isWalkOff({ half: 'bottom', inning: 5, score: { home: 4, away: 3 } }, cfg)).toBe(true);
  expect(isWalkOff({ half: 'bottom', inning: 9, score: { home: 4, away: 3 } }, cfg)).toBe(true); // extras
  expect(isWalkOff({ half: 'bottom', inning: 5, score: { home: 3, away: 3 } }, cfg)).toBe(false); // tied
  expect(isWalkOff({ half: 'bottom', inning: 4, score: { home: 4, away: 3 } }, cfg)).toBe(false); // early
  expect(isWalkOff({ half: 'top', inning: 5, score: { home: 4, away: 3 } }, cfg)).toBe(false);
  expect(isWalkOff({ half: 'bottom', inning: 5, phase: 'GAME_END', score: { home: 4, away: 3 } }, cfg)).toBe(false);
});

it('pure: topEndsGame skips the bottom when last licks are already ahead', () => {
  expect(topEndsGame({ half: 'top', inning: 5, score: { home: 4, away: 3 } }, cfg)).toBe(true);
  expect(topEndsGame({ half: 'top', inning: 5, score: { home: 3, away: 3 } }, cfg)).toBe(false); // tied: they kick
  expect(topEndsGame({ half: 'top', inning: 5, score: { home: 2, away: 3 } }, cfg)).toBe(false); // behind: they kick
  expect(topEndsGame({ half: 'top', inning: 4, score: { home: 4, away: 3 } }, cfg)).toBe(false);
  expect(topEndsGame({ half: 'bottom', inning: 5, score: { home: 4, away: 3 } }, cfg)).toBe(false);
  // the toss decides who has last licks — it is not always the home crew
  expect(lastKickSide('away')).toBe('home');
  expect(lastKickSide('home')).toBe('away');
  expect(topEndsGame({ half: 'top', inning: 5, score: { home: 4, away: 3 } }, cfg, 'home')).toBe(false);
  expect(topEndsGame({ half: 'top', inning: 5, score: { home: 3, away: 4 } }, cfg, 'home')).toBe(true);
});

it('case 1 — leading at the end of the TOP of the last inning ends it: no bottom needed', () => {
  const m = at(newGame(), { inning: 5, half: 'top', score: { home: 4, away: 2 } });
  const end = ended(m);
  for (let i = 0; i < 3; i++) m.applyPlay({ type: 'out' });
  expect(m.state.phase).toBe('GAME_END');
  expect(m.winner()).toBe('home');
  expect(end).toHaveLength(1);
  expect(m.state.half).toBe('top'); // the bottom never came up
});

it('case 1b — NOT leading after the top: the bottom half is played', () => {
  const m = at(newGame(), { inning: 5, half: 'top', score: { home: 2, away: 4 } });
  for (let i = 0; i < 3; i++) m.applyPlay({ type: 'out' });
  expect(m.state.phase).toBe('PRE_PITCH');
  expect(m.state.half).toBe('bottom');
  // ...and tied is live too
  const t = at(newGame(), { inning: 5, half: 'top', score: { home: 3, away: 3 } });
  for (let i = 0; i < 3; i++) t.applyPlay({ type: 'out' });
  expect(t.state.half).toBe('bottom');
  expect(t.state.phase).toBe('PRE_PITCH');
});

it('case 2 — WALK-OFF: the run that takes the lead ends it right there', () => {
  const m = at(newGame(), { inning: 5, half: 'bottom', score: { home: 3, away: 3 }, bases: [null, null, 7] });
  const end = ended(m);
  const order = [];
  m.bus.on('score', () => order.push('score'));
  m.bus.on('gameEnd', () => order.push('gameEnd'));
  m.applyPlay({ type: 'single' }); // the runner on 3rd walks it off
  expect(m.state.score).toEqual({ home: 4, away: 3 });
  expect(m.state.phase).toBe('GAME_END');
  expect(m.winner()).toBe('home');
  expect(end[0].walkOff).toBe(true);
  expect(order).toEqual(['score', 'gameEnd']); // on the run, not at the end of the half
  expect(m.state.outs).toBe(0);
});

it('case 2b — every scoring path can walk it off: outcome, walk, steal of home', () => {
  const outcome = at(newGame(), { inning: 5, half: 'bottom', score: { home: 3, away: 3 } });
  outcome.applyOutcome({ outsAdded: 2, runs: 1, finalBases: [null, null, null], label: 'single' });
  expect(outcome.state.phase).toBe('GAME_END'); // the winning run beat the outs on the same play

  const walk = at(newGame(), { inning: 6, half: 'bottom', score: { home: 3, away: 3 }, bases: [1, 2, 3] });
  walk.state.balls = 3;
  walk.noteBall(); // ball four forces in the winner
  expect(walk.state.score.home).toBe(4);
  expect(walk.state.phase).toBe('GAME_END');

  const steal = at(newGame(), { inning: 5, half: 'bottom', score: { home: 3, away: 3 } });
  steal.applyBaseEvent({ bases: [null, null, null], runs: 1 }); // stole home
  expect(steal.state.phase).toBe('GAME_END');
});

it('case 3 — a tie stays live: the run that only TIES it sends the game to extras', () => {
  const m = at(newGame(), { inning: 5, half: 'bottom', score: { home: 2, away: 3 }, bases: [null, null, 7] });
  m.applyPlay({ type: 'single' });
  expect(m.state.score).toEqual({ home: 3, away: 3 });
  expect(m.state.phase).toBe('PRE_PITCH');
  for (let i = 0; i < 3; i++) m.applyPlay({ type: 'out' });
  expect(m.state.phase).toBe('PRE_PITCH');
  expect(m.state.inning).toBe(6);
  expect(m.state.half).toBe('top');
});

it('case 4 — the away side leading at the end of the bottom still ends it, as always', () => {
  const m = at(newGame(), { inning: 5, half: 'bottom', score: { home: 1, away: 4 } });
  const end = ended(m);
  for (let i = 0; i < 3; i++) m.applyPlay({ type: 'out' });
  expect(m.state.phase).toBe('GAME_END');
  expect(m.winner()).toBe('away');
  expect(end).toHaveLength(1);
  expect(end[0].walkOff).toBeUndefined();
});

it('extra innings walk off too — and nothing scores after the game is over', () => {
  const m = at(newGame(), { inning: 8, half: 'bottom', score: { home: 5, away: 5 }, bases: [null, null, 4] });
  m.applyPlay({ type: 'homerun' });
  expect(m.state.phase).toBe('GAME_END');
  expect(m.state.score.home).toBe(7);
  m.applyPlay({ type: 'homerun' }); // the books are closed
  expect(m.state.score.home).toBe(7);
});

it('the toss, not the label, owns the walk-off: home kicking first hands last licks to away', () => {
  const m = new MatchEngine({ home: 'monarchs', away: 'snappers' }, cfg, { firstKick: 'home' });
  at(m, { inning: 5, half: 'top', score: { home: 6, away: 2 } }); // home is the crew KICKING here
  for (let i = 0; i < 3; i++) m.applyPlay({ type: 'out' });
  expect(m.state.phase).toBe('PRE_PITCH'); // away has not had its last licks
  expect(m.state.half).toBe('bottom');
  at(m, { inning: 5, half: 'bottom', score: { home: 6, away: 6 } });
  m.applyOutcome({ outsAdded: 0, runs: 1, finalBases: [null, null, null], label: 'single' });
  expect(m.state.phase).toBe('GAME_END');
  expect(m.winner()).toBe('away');
});
