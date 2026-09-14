import { it, expect } from 'vitest';
import { matchOverHold, MATCH_OVER_HOLD_MAX_S } from '../src/game/matchState.js';

// The GAME OVER hand-off polls this rule every 0.3 s. `true` = keep waiting,
// `false` = throw the dance party and emit matchOver. The 2026-08-28 gate held
// while phase was RESOLVE — and after a game-ending play NOTHING leaves
// RESOLVE (nextAtBat bails on GAME_END), so every final out hung forever.

const base = { cinematicLock: false, phase: 'RESOLVE', ballMode: 'idle', playFinalized: true, waitedS: 1 };

it('fires once the final play is booked, even though the phase is still RESOLVE', () => {
  expect(matchOverHold(base)).toBe(false);
});

it('fires from PITCH after a caught-stealing final out (no play to finalize)', () => {
  expect(matchOverHold({ ...base, phase: 'PITCH', playFinalized: false })).toBe(false);
});

it('holds while a cinematic is running', () => {
  expect(matchOverHold({ ...base, cinematicLock: true })).toBe(true);
});

it('holds while the ball is still in the air or rolling in', () => {
  expect(matchOverHold({ ...base, ballMode: 'flying' })).toBe(true);
  expect(matchOverHold({ ...base, phase: 'PITCH', playFinalized: false, ballMode: 'rolling-pitch' })).toBe(true);
});

it('holds while a live play has not been booked yet', () => {
  expect(matchOverHold({ ...base, phase: 'LIVE', playFinalized: false })).toBe(true);
  expect(matchOverHold({ ...base, phase: 'RESOLVE', playFinalized: false })).toBe(true);
});

it('never holds past the hard cap, whatever the scene says', () => {
  const stuck = { cinematicLock: true, phase: 'LIVE', ballMode: 'flying', playFinalized: false };
  expect(matchOverHold({ ...stuck, waitedS: MATCH_OVER_HOLD_MAX_S - 0.1 })).toBe(true);
  expect(matchOverHold({ ...stuck, waitedS: MATCH_OVER_HOLD_MAX_S })).toBe(false);
});
