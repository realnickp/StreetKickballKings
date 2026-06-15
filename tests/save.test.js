import { it, expect } from 'vitest';
import { EventBus } from '../src/engine/events.js';
import { SaveManager } from '../src/meta/save.js';

it('bus subscribes/emits/unsubscribes', () => {
  const bus = new EventBus();
  let got = null;
  const off = bus.on('x', v => (got = v));
  bus.emit('x', 42);
  expect(got).toBe(42);
  off();
  bus.emit('x', 7);
  expect(got).toBe(42);
});

it('bus supports multiple listeners per event', () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('y', v => seen.push(['a', v]));
  bus.on('y', v => seen.push(['b', v]));
  bus.emit('y', 1);
  expect(seen).toEqual([['a', 1], ['b', 1]]);
});

it('save roundtrips through memory backend and export codes', () => {
  const sm = new SaveManager({ backend: 'memory' });
  sm.set('xp', 120);
  sm.set('crowns', 35);
  expect(sm.get('xp')).toBe(120);
  const code = sm.exportCode();
  const sm2 = new SaveManager({ backend: 'memory' });
  sm2.importCode(code);
  expect(sm2.get('crowns')).toBe(35);
  expect(sm2.get('xp')).toBe(120);
});

it('save get returns fallback for missing keys', () => {
  const sm = new SaveManager({ backend: 'memory' });
  expect(sm.get('nope', 0)).toBe(0);
});
