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
    // repeat 10 (2026-07-25, dev: "all backgrounds seem huge compared to the
    // players") — more tiles = each painted scene covers less arc = buildings
    // read distant-city scale instead of looming. Height carries the aspect
    // rule (h = tileArc x ry / 0.75); rx/2 = 5 stays ODD so the scene center
    // faces home with no mirror seam behind the plate.
    expect(blacktop.backdropRepeat).toBe(10);
    // THE ring recipe (PR #55): every wall hugs the fence so the court-wall
    // junction hides behind the chain-link from every camera — never visible,
    // never "elevated" again
    expect(blacktop.backdropGeo.r).toBe(blacktop.fenceM + 7);
    expect(blacktop.backdropGeo.bottom).toBe(0.3);
    expect(blacktop.textures.sky).toBeUndefined(); // sky cap continues the dusk pano upward
    expect(blacktop.textures.backdropVideo).toBeTruthy();
  });
});
