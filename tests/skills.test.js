import { describe, it, expect } from 'vitest';
import tuning from '../src/data/tuning.json';
import { SKILLS, skillsOf, skillMult, newSkills } from '../src/meta/skills.js';
import { kickPowerFor, runSpeedFor, throwArmFor, gloveFor, statMult } from '../src/game/playerStats.js';
import { rivalTeam } from '../src/meta/rivals.js';

const p = (stats) => ({ id: 'x', data: { stats }, stats });

describe('skills — earned at 8 in a stat', () => {
  it('one skill per stat, named, with a real edge', () => {
    expect(Object.keys(SKILLS)).toEqual(['power', 'speed', 'arm', 'glove']);
    expect(SKILLS.power).toMatchObject({ id: 'moonshot', name: 'MOONSHOT' });
    expect(SKILLS.speed).toMatchObject({ id: 'burner', name: 'BURNER' });
    expect(SKILLS.arm).toMatchObject({ id: 'cannon', name: 'CANNON' });
    expect(SKILLS.glove).toMatchObject({ id: 'vacuum', name: 'VACUUM' });
    for (const s of Object.values(SKILLS)) expect(s.mult).toBeGreaterThan(1);
  });
  it('a player has the skills of every stat at 8 or more', () => {
    expect(skillsOf({ stats: { power: 8, speed: 7, arm: 10, glove: 2 } }).map((s) => s.id)).toEqual(['moonshot', 'cannon']);
    expect(skillsOf({ stats: { power: 7, speed: 7, arm: 7, glove: 7 } })).toEqual([]);
  });
  it('newSkills names exactly what a change unlocked', () => {
    expect(newSkills({ stats: { power: 7, speed: 3, arm: 3, glove: 3 } }, { stats: { power: 8, speed: 3, arm: 3, glove: 3 } }).map((s) => s.id)).toEqual(['moonshot']);
    expect(newSkills({ stats: { power: 8, speed: 3, arm: 3, glove: 3 } }, { stats: { power: 9, speed: 3, arm: 3, glove: 3 } })).toEqual([]);
  });
  it('the edge only counts in story matches', () => {
    expect(skillMult({ stats: { power: 9 } }, 'power', true, tuning)).toBe(SKILLS.power.mult);
    expect(skillMult({ stats: { power: 9 } }, 'power', false, tuning)).toBe(1);
    expect(skillMult({ stats: { power: 7 } }, 'power', true, tuning)).toBe(1);
  });
  it('rides on top of the stat in every play helper', () => {
    expect(kickPowerFor(p({ power: 8 }), true, tuning)).toBeCloseTo(statMult('power', 8, tuning) * SKILLS.power.mult);
    expect(runSpeedFor(p({ speed: 8 }), true, tuning)).toBeCloseTo(statMult('speed', 8, tuning) * SKILLS.speed.mult);
    expect(gloveFor(p({ glove: 9 }), true, tuning)).toBeCloseTo(statMult('glove', 9, tuning) * SKILLS.glove.mult);
    // CANNON lifts the side by the share of fielders who have it
    const side = [p({ arm: 9 }), p({ arm: 3 })];
    expect(throwArmFor(side, true, tuning)).toBeCloseTo(statMult('arm', 6, tuning) * (1 + (SKILLS.arm.mult - 1) / 2));
    expect(kickPowerFor(p({ power: 10 }), false, tuning)).toBe(1); // Quick Play untouched
  });
});

describe('story difficulty — CHILL / STREET / KING', () => {
  const team = () => ({ id: 't', roster: [{ id: 'a', stats: { power: 5, speed: 5, arm: 5, glove: 5 } }] });
  it('STREET is the default curve', () => {
    expect(rivalTeam(team(), { progress01: 0.5 }, tuning)).toEqual(rivalTeam(team(), { progress01: 0.5 }, tuning, 'street'));
  });
  it('CHILL softens rivals a point and an AI tier; KING the reverse', () => {
    const street = rivalTeam(team(), { progress01: 0.5 }, tuning, 'street');
    const chill = rivalTeam(team(), { progress01: 0.5 }, tuning, 'chill');
    const king = rivalTeam(team(), { progress01: 0.5 }, tuning, 'king');
    expect(chill.team.roster[0].stats.power).toBe(street.team.roster[0].stats.power - 1);
    expect(king.team.roster[0].stats.power).toBe(street.team.roster[0].stats.power + 1);
    expect(street.difficulty).toBe('Street');
    expect(chill.difficulty).toBe('Rookie');
    expect(king.difficulty).toBe('King');
  });
  it('tiers clamp at the ends', () => {
    expect(rivalTeam(team(), { progress01: 0 }, tuning, 'chill').difficulty).toBe('Rookie');
    expect(rivalTeam(team(), { progress01: 1 }, tuning, 'king').difficulty).toBe('King');
  });
});
