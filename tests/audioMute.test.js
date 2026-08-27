// ?mute — the silent-run flag the E2E harnesses boot with. The dev shares a
// machine with the agent browsers; a harness that plays the soundtrack is not
// runnable. audio.js is imported here in vitest's NODE environment, so the flag
// must be read lazily (there is no `location` at module scope).
import { it, expect, afterEach } from 'vitest';
import { AudioBus, isMuted } from '../src/engine/audio.js';

const stubBus = () => ({ on() {} });
const setSearch = (search) => { globalThis.location = { search }; };

afterEach(() => { delete globalThis.location; });

it('importing audio.js with no `location` at all is safe and unmuted', () => {
  expect(globalThis.location).toBeUndefined();
  expect(isMuted()).toBe(false);
  expect(new AudioBus(stubBus()).userVol.master).toBe(1);
});

it('a normal query string leaves the bus at full volume', () => {
  setSearch('?match&nosplash&e2e');
  expect(isMuted()).toBe(false);
  const a = new AudioBus(stubBus());
  expect(a.muted).toBe(false);
  expect(a.userVol.master).toBe(1);
});

it('?mute zeroes the master user volume at construction', () => {
  setSearch('?match&nosplash&mute');
  expect(isMuted()).toBe(true);
  const a = new AudioBus(stubBus());
  expect(a.muted).toBe(true);
  expect(a.userVol.master).toBe(0);
});

it('the sound editor cannot lift a muted master back up', () => {
  setSearch('?mute');
  const a = new AudioBus(stubBus());
  a.setVolume('master', 1);
  expect(a.userVol.master).toBe(0);
  expect(a.getVolume('master')).toBe(0);
  // ...and the graph, when a context does exist, is driven from that value
  a.ctx = {};
  a.master = { gain: { value: 1 } };
  a.userGains = {};
  a.setVolume('master', 0.8);
  expect(a.master.gain.value).toBe(0);
});

it('music/sfx channel volumes are still settable while muted (master gates them)', () => {
  setSearch('?mute');
  const a = new AudioBus(stubBus());
  a.setVolume('sfx', 0.5);
  expect(a.userVol.sfx).toBe(0.5);
  expect(a.userVol.master).toBe(0); // everything routes through the silent master
});
