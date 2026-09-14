import { it, expect, vi } from 'vitest';
import { Telemetry } from '../src/engine/telemetry.js';

// The game had no global error path: a thrown promise or a frame-callback
// error was console noise at best and a black screen at worst, and the dev
// learned about crashes from players. Telemetry is the one seam every error
// goes through — a bounded ring of recent events, a pluggable sink (Sentry
// later), and a 'stalled game' signal — with no vendor wired in yet.

it('records an error with its context and keeps only the most recent N', () => {
  const t = new Telemetry({ max: 3 });
  for (let i = 0; i < 5; i++) t.error(new Error('e' + i), { where: 'frame' });
  expect(t.recent().map((e) => e.message)).toEqual(['e2', 'e3', 'e4']);
  expect(t.recent()[0].where).toBe('frame');
});

it('forwards every event to the installed sink, and survives a sink that throws', () => {
  const t = new Telemetry();
  const sink = vi.fn();
  t.setSink(sink);
  t.error(new Error('boom'), { where: 'timer' });
  t.event('stalled', { phase: 'LIVE' });
  expect(sink).toHaveBeenCalledTimes(2);
  expect(sink.mock.calls[1][0]).toMatchObject({ type: 'stalled', phase: 'LIVE' });
  t.setSink(() => { throw new Error('sink down'); });
  expect(() => t.error(new Error('again'))).not.toThrow();
});

it('turns a non-Error rejection reason into a readable entry', () => {
  const t = new Telemetry();
  t.error('a string reason', { where: 'unhandledrejection' });
  t.error(undefined, { where: 'onerror' });
  expect(t.recent()[0].message).toBe('a string reason');
  expect(typeof t.recent()[1].message).toBe('string');
});
