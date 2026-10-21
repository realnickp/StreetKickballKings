import { describe, it, expect } from 'vitest';
import { beforeScene, resultPlan, storyMenuLabel, newStory } from '../src/meta/story.js';

const lad = { kind: 'ladder', regionId: 'east', teamId: 'bullies', index: 3 };
const semi = { kind: 'semi', regionId: 'east', teamId: 'bullies' };
const fin = { kind: 'final', regionId: 'west', teamId: 'portland' };
const nat = { kind: 'nationals', regionId: 'south', teamId: 'miami', index: 2 };

describe('which scenes play', () => {
  it('before every game: the rival calls you out', () => {
    expect(beforeScene(lad)).toBe('east-bullies-before');
    expect(beforeScene(semi)).toBe('east-semi-before');
    expect(beforeScene(fin)).toBe('west-final-before');
    expect(beforeScene(nat)).toBe('nationals-miami-before');
  });
  it('a loss is just the loss scene', () => {
    expect(resultPlan(['loss'], lad, true)).toEqual(['east-bullies-loss']);
    expect(resultPlan(['loss'], fin, false)).toEqual(['west-final-loss']);
  });
  it('a ladder win: the chat, then the recruit DM when someone wants in', () => {
    expect(resultPlan(['win', 'rungUp'], lad, true)).toEqual(['east-bullies-win', 'east-bullies-recruit']);
    expect(resultPlan(['win', 'rungUp'], lad, false)).toEqual(['east-bullies-win']);
  });
  it('the last rung opens the bracket; a bracket win still recruits from that crew', () => {
    expect(resultPlan(['win', 'bracket'], { ...lad, teamId: 'funk', index: 4 }, true))
      .toEqual(['east-funk-win', 'east-funk-recruit', 'east-bracket']);
    expect(resultPlan(['win', 'final'], semi, true)).toEqual(['east-semi-win', 'east-bullies-recruit']);
  });
  it('the final crowns the region (the next chapter opens on the hub)', () => {
    expect(resultPlan(['win', 'regionChamp', 'nationals'], fin, false)).toEqual(['west-final-win', 'west-champ']);
  });
  it('nationals: no recruits; the last one is the ending', () => {
    expect(resultPlan(['win'], nat, true)).toEqual(['nationals-miami-win']);
    expect(resultPlan(['win', 'king'], { ...nat, teamId: 'portland' }, false)).toEqual(['nationals-portland-win', 'ending']);
  });
});

describe('the menu card', () => {
  const map = { regions: ['east', 'midwest', 'south', 'southwest', 'west'].map((id) => ({ id, name: `THE ${id.toUpperCase()}`, ladder: [1, 2, 3, 4, 5].map((i) => id + i) })), nationals: { finalField: 'the-crown' } };
  it('reads where you are', () => {
    expect(storyMenuLabel(null, map)).toBe('NEW CREW');
    const s = newStory({ crew: {}, roster: [] });
    expect(storyMenuLabel({ ...s, rung: 2 }, map)).toBe('THE EAST · RUNG 3/5');
    expect(storyMenuLabel({ ...s, phase: 'final' }, map)).toBe('THE EAST · FINAL');
    expect(storyMenuLabel({ ...s, phase: 'nationals', rung: 1, finals: {} }, map)).toBe('NATIONALS 2/5');
    expect(storyMenuLabel({ ...s, king: true }, map)).toBe('👑 KING OF THE COURT');
  });
});
