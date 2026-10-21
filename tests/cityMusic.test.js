import { it, expect } from 'vitest';
import { CITY_TRACKS, cityTrackId } from '../src/engine/audioTracks.js';
import teamsData from '../src/data/teams.json';

it('every Quick Play crew city has a hip hop track wired', () => {
  // story crews (status 'story') have no city loop yet — they play the generic
  // beat (cityTrackId falls back), checked below
  for (const t of teamsData.teams.filter((x) => x.status === 'ready')) {
    const id = cityTrackId(t.city);
    expect(id.startsWith('city-'), `${t.city} → ${id}`).toBe(true);
    expect(CITY_TRACKS[id], `${t.city} has no track`).toBeTruthy();
  }
});

it('every story crew city resolves to a track — its own, or the generic beat', () => {
  for (const t of teamsData.teams.filter((x) => x.status !== 'ready')) {
    const id = cityTrackId(t.city);
    expect(id === 'beat' || Boolean(CITY_TRACKS[id]), `${t.city} → ${id}`).toBe(true);
  }
});

it('unknown or missing cities fall back to the generic beat', () => {
  expect(cityTrackId('Nowhere')).toBe('beat');
  expect(cityTrackId(undefined)).toBe('beat');
});
