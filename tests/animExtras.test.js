import { it, expect } from 'vitest';
import { pickDance, pickDances, DanceBag } from '../src/game/animExtras.js';

const X = ['thriller1', 'thriller2', 'thriller3', 'thriller4', 'danceLock',
  'danceTut', 'danceWave', 'danceChicken', 'danceStep', 'danceSilly'];
const BASE = ['dance1', 'dance2', 'dance3', 'dance4'];
const char = (extras = []) => ({ animator: { hasClip: (n) => extras.includes(n), addClips: () => {} } });

it('pickDance always lands on a playable name', () => {
  expect([...X, ...BASE]).toContain(pickDance(char(X)));
  expect(BASE).toContain(pickDance(char()));
});

it('pickDances hands every squad member a DISTINCT dance while the pool lasts', () => {
  const squad = Array.from({ length: 8 }, () => char(X));
  const picks = pickDances(squad);
  expect(picks).toHaveLength(8);
  expect(new Set(picks).size).toBe(8);
});

it('pickDances spreads the base four evenly when no extras have landed', () => {
  const squad = Array.from({ length: 8 }, () => char());
  const picks = pickDances(squad);
  expect(picks).toHaveLength(8);
  for (const p of picks) expect(BASE).toContain(p);
  expect(new Set(picks).size).toBe(4); // all four in use before any repeat
});

it('pickDances respects per-character clip availability', () => {
  const picks = pickDances([char(X), char()]);
  expect([...X, ...BASE]).toContain(picks[0]);
  expect(BASE).toContain(picks[1]);
});

it('DanceBag exhausts every loaded dance before any repeat', () => {
  const bag = new DanceBag(); const c = char(X);
  const draws = Array.from({ length: 14 }, () => bag.draw(c));
  expect(new Set(draws).size).toBe(14);
  expect(draws.sort()).toEqual([...X, ...BASE].sort());
});

it('DanceBag never repeats the last dance across a refill', () => {
  for (let trial = 0; trial < 50; trial++) {
    const bag = new DanceBag(); const c = char();
    const draws = Array.from({ length: 12 }, () => bag.draw(c));
    for (let i = 1; i < draws.length; i++) expect(draws[i]).not.toBe(draws[i - 1]);
  }
});

it('DanceBag keeps the saved recent list out of the first draws and reports draws', () => {
  const seen = [];
  const bag = new DanceBag({ recent: ['dance1', 'dance2', 'dance3'], onDraw: (r) => seen.push([...r]) });
  expect(bag.draw(char())).toBe('dance4');
  expect(seen[0]).toEqual(['dance1', 'dance2', 'dance3', 'dance4']);
});

it('DanceBag only hands a character clips it can play', () => {
  const bag = new DanceBag(); const rich = char(X), poor = char();
  bag.draw(rich);
  for (let i = 0; i < 10; i++) expect(BASE).toContain(bag.draw(poor));
});

// tiny seeded PRNG (mulberry32) — makes the mixed-roster refill test
// deterministic across runs instead of relying on Math.random luck
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// these 20 seeds are proven (by brute-force search over 3000 seeds against
// the pre-fix code) to hit the forced mid-cycle refill (tier 3) AND land the
// drawing character on the last-played slot — a real regression guard, not
// a lucky Math.random run
const MIXED_ROSTER_SEEDS = [110, 129, 322, 377, 607, 652, 676, 911, 1164, 1305,
  1360, 1489, 1663, 1710, 1714, 1715, 1739, 1815, 1982, 2161];

it('DanceBag never repeats the last dance across a refill for a shared, mixed roster', () => {
  for (const seed of MIXED_ROSTER_SEEDS) {
    const bag = new DanceBag({ random: mulberry32(seed) });
    const rich = char(X), poor = char();
    const draws = Array.from({ length: 60 }, (_, i) => bag.draw(i % 2 === 0 ? rich : poor));
    for (let i = 1; i < draws.length; i++) expect(draws[i]).not.toBe(draws[i - 1]);
  }
});
