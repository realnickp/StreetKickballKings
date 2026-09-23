import { it, expect } from 'vitest';
import * as THREE from 'three';
import { pickCasters, castersOf, applyCasters } from '../src/game/shadowBudget.js';

// Sixteen un-culled 25k-triangle rigs all cast into a 2048² soft shadow map
// (audit B17). Only the N rigs nearest the camera cast now; N is the tier's.
function fakeChar(x, z, { casts = true } = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const body = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  body.castShadow = casts;
  const patch = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  patch.castShadow = false; // a decal patch never casts — and must never be switched on
  group.add(body, patch);
  return { group, body, patch };
}

it('picks the n nearest characters to the camera', () => {
  const chars = [fakeChar(0, -30), fakeChar(0, -2), fakeChar(5, -5), fakeChar(-20, -20)];
  const picked = pickCasters(chars, new THREE.Vector3(0, 6, 8), 2);
  expect([...picked]).toEqual([chars[1], chars[2]]);
});

it('a budget at or above the roster picks everyone; zero picks nobody', () => {
  const chars = [fakeChar(0, 0), fakeChar(1, 1)];
  expect(pickCasters(chars, new THREE.Vector3(), 16).size).toBe(2);
  expect(pickCasters(chars, new THREE.Vector3(), 0).size).toBe(0);
});

it('castersOf lists only the meshes the build made casters, once', () => {
  const c = fakeChar(0, 0);
  expect(castersOf(c)).toEqual([c.body]);
  expect(castersOf(c)).toBe(c._casterMeshes);
});

it('applyCasters switches the budgeted rigs on and the rest off, leaving non-casters alone', () => {
  const chars = [fakeChar(0, -1), fakeChar(0, -40)];
  const on = applyCasters(chars, new Set([chars[0]]));
  expect(on).toBe(1);
  expect(chars[0].body.castShadow).toBe(true);
  expect(chars[1].body.castShadow).toBe(false);
  expect(chars[1].patch.castShadow).toBe(false);
  applyCasters(chars, new Set([chars[1]]));
  expect([chars[0].body.castShadow, chars[1].body.castShadow]).toEqual([false, true]);
});
