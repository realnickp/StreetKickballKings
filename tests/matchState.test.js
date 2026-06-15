import { it, expect } from 'vitest';
import { MatchEngine } from '../src/game/matchState.js';

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
