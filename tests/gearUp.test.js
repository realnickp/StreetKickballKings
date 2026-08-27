import { it, expect } from 'vitest';
import { gearUpArgs } from '../src/ui/screens/lockerScreen.js';
it('GEAR UP hands the exact team-select choice to startMatchFlow', () => {
  const away = { id: 'monarchs' }, home = { id: 'snappers' }, kits = { away: '#f5b312', home: '#1d6fd8' };
  expect(gearUpArgs({ away, home, kits })).toEqual([away, home, kits]);
  expect(() => gearUpArgs({})).toThrow();
});

it('the team-select cursor rides along without leaking into the match args', () => {
  // ← TEAMS restores the matchup from `pick`, so START carries it in the route
  // params — startMatchFlow must still get exactly (away, home, kits).
  const away = { id: 'monarchs' }, home = { id: 'snappers' }, kits = { away: '#f5b312', home: '#1d6fd8' };
  const pick = { sel: { away: 0, home: 3 }, kit: { away: 'dark', home: 'light' } };
  expect(gearUpArgs({ away, home, kits, pick })).toEqual([away, home, kits]);
});
