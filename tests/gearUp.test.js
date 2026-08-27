import { it, expect } from 'vitest';
import { gearUpArgs } from '../src/ui/screens/lockerScreen.js';
it('GEAR UP hands the exact team-select choice to startMatchFlow', () => {
  const away = { id: 'monarchs' }, home = { id: 'snappers' }, kits = { away: '#f5b312', home: '#1d6fd8' };
  expect(gearUpArgs({ away, home, kits })).toEqual([away, home, kits]);
  expect(() => gearUpArgs({})).toThrow();
});
