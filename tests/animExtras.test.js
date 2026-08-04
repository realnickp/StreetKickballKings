import { it, expect } from 'vitest';
import { pickDance, pickDances } from '../src/game/animExtras.js';

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
