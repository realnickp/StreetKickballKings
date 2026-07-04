import { describe, it, expect } from 'vitest';
import { DRILLS } from '../src/game/tutorialDirector.js';

describe('playable tutorial drills', () => {
  it('runs the skills in teaching order', () => {
    expect(DRILLS.map((d) => d.id)).toEqual(['kick', 'run', 'steal', 'go', 'pitch', 'field']);
  });

  it('every drill has a goal, a target, and a tick scorer', () => {
    for (const d of DRILLS) {
      expect(d.title.length).toBeGreaterThan(2);
      expect(d.goal.length).toBeGreaterThan(15);
      expect(d.target).toBeGreaterThanOrEqual(1);
      expect(typeof d.tick).toBe('function');
    }
  });

  it('staged drills bring their own setup', () => {
    const byId = Object.fromEntries(DRILLS.map((d) => [d.id, d]));
    expect(typeof byId.steal.setup).toBe('function');
    expect(typeof byId.steal.ensure).toBe('function'); // re-arms after a caught stealing
    expect(typeof byId.go.setup).toBe('function');
    expect(typeof byId.go.teardown).toBe('function');  // clears the forced GO flag
    expect(typeof byId.pitch.setup).toBe('function');  // flips the player onto defense
  });

  it('kick drill scores a fair ball exactly once per play', () => {
    const drill = DRILLS[0];
    const st = {};
    const scene = { phase: 'PITCH' };
    expect(drill.tick(scene, st)).toBe(false);
    scene.phase = 'LIVE';
    expect(drill.tick(scene, st)).toBe(true);   // counts on going live...
    expect(drill.tick(scene, st)).toBe(false);  // ...but only once
    scene.phase = 'RESOLVE';
    expect(drill.tick(scene, st)).toBe(false);  // resolving the same play — still once
    scene.phase = 'SETUP';
    drill.tick(scene, st);
    scene.phase = 'LIVE';
    expect(drill.tick(scene, st)).toBe(true);   // fresh play, fresh count
  });
});
