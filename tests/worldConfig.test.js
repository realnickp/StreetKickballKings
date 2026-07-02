import { describe, it, expect } from 'vitest';
import fields from '../src/data/fields.json';

describe('3d world config', () => {
  it('the blacktop field opts into the 3d world with golden-hour light', () => {
    const blacktop = fields.fields.find((f) => f.id === 'blacktop');
    // the Higgsfield living-city world (real image->3D meshes, el train, sky
    // panorama) replaced the box-city v1 that got the flag reverted
    expect(blacktop.world3d).toBe(true);
    expect(blacktop.sky).toBe('golden-hour');
  });
});
