import { it, expect } from 'vitest';
import { cityTrackId } from '../src/engine/audioTracks.js';
import fieldsData from '../src/data/fields.json';
import teamsData from '../src/data/teams.json';

it('slugs a plain city name to its track id', () => {
  expect(cityTrackId('Chicago')).toBe('city-chicago');
});

it('slugs punctuation variants of the same city the same way', () => {
  expect(cityTrackId('Washington DC')).toBe('city-washington-dc');
  expect(cityTrackId('Washington, D.C.')).toBe('city-washington-dc');
});

it('falls back to the generic beat pool for an unknown or missing city', () => {
  expect(cityTrackId('Nowhere')).toBe('beat');
  expect(cityTrackId(undefined)).toBe('beat');
});

it('every field in fields.json resolves its home team city to a registered track', () => {
  const teamById = Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
  let checked = 0;
  for (const field of fieldsData.fields) {
    const homeTeam = teamById[field.homeTeam];
    expect(homeTeam, `${field.id} has no matching team for homeTeam "${field.homeTeam}"`).toBeTruthy();
    const id = cityTrackId(homeTeam.city);
    expect(id, `${field.id} (${homeTeam.city}) fell back to the generic beat`).not.toBe('beat');
    checked += 1;
  }
  expect(checked).toBe(10);
});
