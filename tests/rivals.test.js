import { describe, it, expect } from 'vitest';
import tuning from '../src/data/tuning.json';
import { rivalTeam } from '../src/meta/rivals.js';

const team = () => ({ id: 'x', roster: [{ id: 'p1', stats: { power: 6, speed: 2, arm: 9, glove: 5 } }] });

describe('rival scaling', () => {
  it('the first rung is soft: −2 on every stat, Rookie AI', () => {
    const t = team();
    const { team: r, difficulty } = rivalTeam(t, { progress01: 0 }, tuning);
    expect(r.roster[0].stats).toEqual({ power: 4, speed: 1, arm: 7, glove: 3 });
    expect(difficulty).toBe('Rookie');
    expect(t.roster[0].stats.power).toBe(6); // the data isn't touched
  });
  it('the middle is Street, the top is +3 King, clamped at 10', () => {
    expect(rivalTeam(team(), { progress01: 0.5 }, tuning).difficulty).toBe('Street');
    const { team: r, difficulty } = rivalTeam(team(), { progress01: 1 }, tuning);
    expect(r.roster[0].stats).toEqual({ power: 9, speed: 5, arm: 10, glove: 8 });
    expect(difficulty).toBe('King');
  });
});
