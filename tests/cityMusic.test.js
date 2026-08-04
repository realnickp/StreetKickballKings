import { it, expect } from 'vitest';
import { CITY_TRACKS, cityTrackId } from '../src/engine/audioTracks.js';
import teamsData from '../src/data/teams.json';

it('every crew city has a hip hop track wired', () => {
  for (const t of teamsData.teams) {
    const id = cityTrackId(t.city);
    expect(id.startsWith('city-'), `${t.city} → ${id}`).toBe(true);
    expect(CITY_TRACKS[id], `${t.city} has no track`).toBeTruthy();
  }
});

it('unknown or missing cities fall back to the generic beat', () => {
  expect(cityTrackId('Nowhere')).toBe('beat');
  expect(cityTrackId(undefined)).toBe('beat');
});
