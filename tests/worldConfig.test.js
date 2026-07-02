import { describe, it, expect } from 'vitest';
import fields from '../src/data/fields.json';

describe('3d world config', () => {
  it('the blacktop field opts into the 3d world with golden-hour light', () => {
    const blacktop = fields.fields.find((f) => f.id === 'blacktop');
    // the dev chose the ONE-COHESIVE-SCENE video world (Seedance loop of a
    // dense dusk city, wrapped 2x mirrored) over the assembled 3D meshes —
    // world3d stays off; the city lives in backdrop + backdropVideo
    expect(blacktop.world3d).toBe(false);
    expect(blacktop.sky).toBe('golden-hour');
    expect(blacktop.backdropRepeat).toBe(2);
    expect(blacktop.textures.sky).toBeUndefined(); // sky cap continues the dusk pano upward
    expect(blacktop.textures.backdropVideo).toBeTruthy();
  });
});
