import { describe, it, expect } from 'vitest';
import map from '../src/data/story/regions.json';
import teamsData from '../src/data/teams.json';

const teams = Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
const avg = (t) => t.roster.reduce((a, p) => a + p.stats.power + p.stats.speed + p.stats.arm + p.stats.glove, 0) / (t.roster.length * 4);
const IDS = ['east', 'midwest', 'south', 'southwest', 'west'];
// the four regions built from the new crews — their cross-checks go live with Task 12
const BUILT = new Set(['east']);

describe('story map (regions.json)', () => {
  it('has five regions in climb order, five crews each, no crew twice', () => {
    expect(map.regions.map((r) => r.id)).toEqual(IDS);
    expect(map.regions.map((r) => r.name)).toEqual(['THE EAST', 'THE MIDWEST', 'THE SOUTH', 'THE SOUTHWEST', 'THE WEST COAST']);
    const all = map.regions.flatMap((r) => r.ladder);
    for (const r of map.regions) expect(r.ladder.length).toBe(5);
    expect(new Set(all).size).toBe(25);
    expect(map.nationals.finalField).toBe('the-crown');
  });

  for (const id of IDS) {
    const check = BUILT.has(id) ? it : it.todo;
    check(`${id}: every crew exists, belongs to the region, and the ladder climbs weakest to strongest`, () => {
      const r = map.regions.find((x) => x.id === id);
      const crews = r.ladder.map((t) => teams[t]);
      for (const [i, t] of crews.entries()) {
        expect(t, r.ladder[i]).toBeTruthy();
        expect(t.region).toBe(id);
      }
      for (let i = 1; i < crews.length; i++) expect(avg(crews[i])).toBeGreaterThanOrEqual(avg(crews[i - 1]));
    });
  }
});
