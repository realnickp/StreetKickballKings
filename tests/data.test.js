import { describe, it, expect } from 'vitest';
import teams from '../src/data/teams.json';
import fields from '../src/data/fields.json';
import tuning from '../src/data/tuning.json';

describe('teams.json', () => {
  it('has 10 teams with unique ids', () => {
    expect(teams.teams.length).toBe(10);
    const ids = teams.teams.map(t => t.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('Monarchs and Snappers have full 8-player rosters', () => {
    for (const id of ['monarchs', 'snappers']) {
      const team = teams.teams.find(t => t.id === id);
      expect(team.status).toBe('ready');
      expect(team.roster.length).toBe(8);
      const nicks = team.roster.map(p => p.nick);
      expect(new Set(nicks).size).toBe(8);
      for (const p of team.roster) {
        for (const s of ['power', 'speed', 'arm', 'glove']) {
          expect(p.stats[s]).toBeGreaterThanOrEqual(3);
          expect(p.stats[s]).toBeLessThanOrEqual(9);
        }
        expect(p.look.hair).toBeTruthy();
        expect(p.look.build).toBeTruthy();
      }
    }
  });

  it('every team has identity fields and a special move', () => {
    for (const t of teams.teams) {
      expect(t.city).toBeTruthy();
      expect(t.colors.primary).toMatch(/^#/);
      expect(t.logo).toMatch(/^assets\/logos\//);
      expect(t.special.id).toBeTruthy();
      expect(t.special.label).toBeTruthy();
    }
  });

  it('every homeField exists in fields.json', () => {
    const fieldIds = new Set(fields.fields.map(f => f.id));
    for (const t of teams.teams) expect(fieldIds.has(t.homeField)).toBe(true);
  });
});

describe('fields.json', () => {
  it('has 10 fields, blacktop ready', () => {
    expect(fields.fields.length).toBe(10);
    expect(fields.fields.find(f => f.id === 'blacktop').status).toBe('ready');
  });
});

describe('tuning.json', () => {
  it('has all required top-level sections', () => {
    for (const k of ['match', 'pitch', 'kick', 'running', 'throwing', 'fielding', 'special', 'ai']) {
      expect(tuning[k]).toBeTruthy();
    }
  });
  it('kick quality windows are ordered', () => {
    expect(tuning.kick.perfectWindowMs).toBeLessThan(tuning.kick.goodWindowMs);
    expect(tuning.kick.goodWindowMs).toBeLessThan(tuning.kick.okWindowMs);
  });
});
