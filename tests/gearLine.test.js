import { it, expect } from 'vitest';
import { gearLine } from '../src/meta/gearLine.js';

it('names the three slots, stock where empty', () => {
  expect(gearLine({ kick: null, cleats: null, uniform: null })).toBe('STOCK KICK · STOCK CLEATS · STOCK KIT');
  expect(gearLine({ kick: { name: 'THE FLAIR' }, cleats: { name: 'FIRE REDS' }, uniform: { name: 'BLACKOUT KIT' } }))
    .toBe('THE FLAIR · FIRE REDS · BLACKOUT KIT');
  expect(gearLine(null)).toBe('STOCK KICK · STOCK CLEATS · STOCK KIT');
});
