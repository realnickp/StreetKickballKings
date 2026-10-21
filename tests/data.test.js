import { describe, it, expect } from 'vitest';
import teams from '../src/data/teams.json';
import fields from '../src/data/fields.json';
import tuning from '../src/data/tuning.json';

describe('teams.json', () => {
  it('has 25 teams with unique ids: 10 Quick Play crews + 15 story crews', () => {
    expect(teams.teams.length).toBe(25);
    const ids = teams.teams.map(t => t.id);
    expect(new Set(ids).size).toBe(25);
    expect(teams.teams.filter(t => t.status === 'ready').length).toBe(10);
    expect(teams.teams.filter(t => t.status === 'story').length).toBe(15);
  });

  it('every crew shares one key set and order, and lives in a story region', () => {
    const keys = Object.keys(teams.teams.find(t => t.id === 'monarchs'));
    for (const t of teams.teams) {
      expect(Object.keys(t), t.id).toEqual(keys);
      expect(['east', 'midwest', 'south', 'southwest', 'west'], t.id).toContain(t.region);
    }
  });

  it('every crew fields 8 players with unique ids and nicks, stats 3-9', () => {
    const pids = new Set();
    for (const t of teams.teams) {
      expect(t.roster.length, t.id).toBe(8);
      expect(new Set(t.roster.map(p => p.nick)).size, t.id).toBe(8);
      for (const p of t.roster) {
        expect(pids.has(p.id), `${t.id} ${p.id}`).toBe(false);
        pids.add(p.id);
        for (const s of ['power', 'speed', 'arm', 'glove']) {
          expect(Number.isInteger(p.stats[s]), `${p.id}.${s}`).toBe(true);
          expect(p.stats[s]).toBeGreaterThanOrEqual(3);
          expect(p.stats[s]).toBeLessThanOrEqual(9);
        }
      }
    }
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
