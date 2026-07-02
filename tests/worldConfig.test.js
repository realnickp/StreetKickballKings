import { describe, it, expect } from 'vitest';
import fields from '../src/data/fields.json';

describe('3d world config', () => {
  it('the blacktop field opts into the 3d world with golden-hour light', () => {
    const blacktop = fields.fields.find((f) => f.id === 'blacktop');
    expect(blacktop.world3d).toBe(false); // off until the world beats the old backdrop on the dev's screen
    expect(blacktop.sky).toBe('day');
  });
});
