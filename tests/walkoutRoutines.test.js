import { it, expect } from 'vitest';
import { TEAM_ROUTINES, routineFor } from '../src/game/walkoutRoutines.js';
import teamsData from '../src/data/teams.json';
import manifest from '../src/data/anims.manifest.json';

const clipNames = new Set(manifest.map((m) => m.name));

it('every crew has a two-part signature routine of real baked clips', () => {
  for (const t of teamsData.teams) {
    const r = TEAM_ROUTINES[t.id];
    expect(r, `${t.id} missing a routine`).toBeTruthy();
    expect(r).toHaveLength(2);
    for (const clip of r) expect(clipNames.has(clip), `${t.id}: ${clip} not baked`).toBe(true);
  }
});

it('unmapped crews still get two DIFFERENT shows per match (side-split thriller fallback)', () => {
  expect(routineFor('nope', 'away')).not.toEqual(routineFor('nope', 'home'));
  for (const clip of [...routineFor('nope', 'away'), ...routineFor('nope', 'home')]) {
    expect(clipNames.has(clip)).toBe(true);
  }
});

it('mapped crews dance their own routine regardless of side', () => {
  expect(routineFor('snappers', 'home')).toEqual(TEAM_ROUTINES.snappers);
  expect(routineFor('monarchs', 'away')).toEqual(TEAM_ROUTINES.monarchs);
});
