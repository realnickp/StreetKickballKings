import { describe, it, expect, vi } from 'vitest';
import { newStory, currentStop, applyResult, markSeen, loadStory, saveStory, STORY_KEY } from '../src/meta/story.js';
import { SaveManager } from '../src/meta/save.js';

const map = {
  regions: ['east', 'midwest', 'south', 'southwest', 'west'].map((id) => ({
    id, name: id.toUpperCase(), ladder: [0, 1, 2, 3, 4].map((i) => `${id}${i}`),
  })),
  nationals: { finalField: 'the-crown' },
};
const crew = { name: 'EAST SIDE', primary: '#ff0000', secondary: '#000000', mark: 'mark-01' };
const roster = Array.from({ length: 8 }, (_, i) => ({ id: `b${i + 1}` }));

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
const play = (s, results) => {
  let events = [];
  for (const won of results) ({ story: s, events } = applyResult(s, map, { won }));
  return { s, events };
};
const W = (n) => Array(n).fill(true);

describe('story state machine', () => {
  it('starts on the first East rung', () => {
    const s = newStory({ crew, roster });
    expect(s).toMatchObject({ v: 1, region: 0, rung: 0, phase: 'ladder', king: false, bench: [], beaten: [] });
    expect(currentStop(s, map)).toMatchObject({ kind: 'ladder', regionId: 'east', teamId: 'east0', index: 0, total: 5 });
  });

  it('five ladder wins open the semi against rung 4, the final against rung 5', () => {
    let { s, events } = play(newStory({ crew, roster }), W(5));
    expect(events).toContain('bracket');
    expect(currentStop(s, map)).toMatchObject({ kind: 'semi', teamId: 'east3' });
    ({ s } = play(s, [false]));
    expect(currentStop(s, map).kind).toBe('semi');
    ({ s, events } = play(s, [true]));
    expect(events).toContain('final');
    expect(currentStop(s, map)).toMatchObject({ kind: 'final', teamId: 'east4' });
  });

  it('a final loss sends you back to the semi', () => {
    const { s } = play(newStory({ crew, roster }), [...W(6), false]);
    expect(currentStop(s, map)).toMatchObject({ kind: 'semi', teamId: 'east3' });
  });

  it('winning the final crowns the region and opens the next one', () => {
    const { s, events } = play(newStory({ crew, roster }), W(7));
    expect(events).toContain('regionChamp');
    expect(s.finals.east).toBe('east4');
    expect(currentStop(s, map)).toMatchObject({ kind: 'ladder', regionId: 'midwest', teamId: 'midwest0' });
  });

  it('nationals: rematches every regional final in order, the last on THE CROWN', () => {
    let { s } = play(newStory({ crew, roster }), W(35));
    expect(currentStop(s, map)).toMatchObject({ kind: 'nationals', teamId: 'east4', index: 0, total: 5, fieldId: null });
    ({ s } = play(s, W(4)));
    expect(currentStop(s, map)).toMatchObject({ kind: 'nationals', teamId: 'west4', index: 4, fieldId: 'the-crown' });
    const { s: end, events } = play(s, [true]);
    expect(events[events.length - 1]).toBe('king');
    expect(end.king).toBe(true);
    expect(currentStop(end, map).kind).toBe('king');
  });

  it('progress runs 0 → 1 across all 40 games', () => {
    const s0 = newStory({ crew, roster });
    expect(currentStop(s0, map).progress01).toBe(0);
    const { s } = play(s0, W(39));
    expect(currentStop(s, map).progress01).toBe(1);
  });

  it('a loss changes nothing but says so; beaten stays unique', () => {
    const s0 = newStory({ crew, roster });
    const { s, events } = play(s0, [false]);
    expect(events).toEqual(['loss']);
    expect(currentStop(s, map)).toEqual(currentStop(s0, map));
    const { s: s2 } = play(newStory({ crew, roster }), W(7)); // east3 + east4 beaten twice (ladder + bracket)
    expect(s2.beaten.filter((t) => t === 'east3').length).toBe(1);
  });

  it('applyResult and markSeen never mutate their input', () => {
    const s = deepFreeze(newStory({ crew, roster }));
    expect(() => applyResult(s, map, { won: true })).not.toThrow();
    expect(markSeen(s, 'east-open').seen).toEqual(['east-open']);
    expect(markSeen(markSeen(s, 'x'), 'x').seen).toEqual(['x']);
  });

  it('saves in one write and refuses a save from an unknown version', () => {
    const save = new SaveManager({ backend: 'memory' });
    const spy = vi.spyOn(save, 'set');
    const s = newStory({ crew, roster });
    saveStory(save, s);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(loadStory(save)).toEqual(s);
    save.set(STORY_KEY, { ...s, v: 99 });
    expect(loadStory(save)).toBeNull();
    expect(loadStory(new SaveManager({ backend: 'memory' }))).toBeNull();
  });
});
