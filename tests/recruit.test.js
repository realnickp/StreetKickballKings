import { describe, it, expect } from 'vitest';
import { recruitOffer, acceptRecruit, declineRecruit, swapBench } from '../src/meta/recruit.js';
import { makeBlockRoster } from '../src/meta/yourCrew.js';

const rival = {
  id: 'bullies',
  roster: [
    { id: 'r1', nick: 'Mid', stats: { power: 6, speed: 6, arm: 6, glove: 6 } },
    { id: 'r2', nick: 'Rocket', stats: { power: 5, speed: 9, arm: 5, glove: 5 } },
    { id: 'r3', nick: 'Cannon', stats: { power: 5, speed: 5, arm: 9, glove: 5 } },
    { id: 'r4', nick: 'Low', stats: { power: 3, speed: 3, arm: 3, glove: 3 } },
  ],
};
const fresh = () => ({ roster: makeBlockRoster(4), bench: [], recruited: [] });

describe('recruiting', () => {
  it('offers their best player, breaking a tie toward what your crew lacks most', () => {
    const s = fresh();
    s.roster = s.roster.map((p) => ({ ...p, stats: { power: 4, speed: 5, arm: 2, glove: 4 } })); // weakest: arm
    const o = recruitOffer(s, rival);
    expect(o).toMatchObject({ id: 'bullies:r3', nick: 'Cannon', from: 'bullies' });
    expect(o.cast).toBeTruthy(); // keeps their own body
  });

  it('never re-offers a player you took or turned down', () => {
    let s = fresh();
    const first = recruitOffer(s, rival);
    s = declineRecruit(s, first);
    const second = recruitOffer(s, rival);
    expect(second.id).not.toBe(first.id);
    s = acceptRecruit(s, second, 'b1');
    const third = recruitOffer(s, rival);
    expect([first.id, second.id]).not.toContain(third.id);
  });

  it('accepting swaps one block player to the bench; roster stays 8', () => {
    const s = fresh();
    const o = recruitOffer(s, rival);
    const n = acceptRecruit(s, o, 'b3');
    expect(n.roster.length).toBe(8);
    expect(n.roster[2]).toEqual(o);
    expect(n.bench.map((p) => p.id)).toEqual(['b3']);
    expect(n.recruited).toContain(o.id);
    expect(s.roster[2].id).toBe('b3'); // input untouched
  });

  it('declining keeps the roster as is', () => {
    const s = fresh();
    const n = declineRecruit(s, recruitOffer(s, rival));
    expect(n.roster).toEqual(s.roster);
    expect(n.bench).toEqual([]);
  });

  it('a benched player can come back', () => {
    const s = fresh();
    const o = recruitOffer(s, rival);
    const n = acceptRecruit(s, o, 'b3');
    const back = swapBench(n, o.id, 'b3');
    expect(back.roster.map((p) => p.id)).toEqual(s.roster.map((p) => p.id));
    expect(back.bench.map((p) => p.id)).toEqual([o.id]);
    expect(back.roster.length).toBe(8);
  });

  it('runs dry: null once everyone was offered', () => {
    let s = fresh();
    for (let i = 0; i < 4; i++) s = declineRecruit(s, recruitOffer(s, rival));
    expect(recruitOffer(s, rival)).toBeNull();
  });
});
