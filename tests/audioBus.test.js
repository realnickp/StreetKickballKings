import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioBus } from '../src/engine/audio.js';
import { EventBus } from '../src/engine/events.js';

// A WebAudio stand-in small enough to read: gains, buffer sources, a decode
// that resolves on demand (so a test can order a stop BEFORE the decode lands,
// which is the race iOS loses every match start), and a settable state so the
// WebKit-only 'interrupted' state can be exercised without a phone call.
class FakeNode {
  constructor() { this.gain = { value: 1, cancelScheduledValues() {}, linearRampToValueAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
  connect() {}
}
class FakeSource extends FakeNode {
  constructor(ctx) { super(); this.ctx = ctx; this.started = false; this.stopped = false; this.buffer = null; this.loop = false; }
  start() { this.started = true; this.ctx.started.push(this); }
  stop() { this.stopped = true; }
}
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.started = []; this.resumes = 0; this.pendingDecodes = []; }
  createGain() { return new FakeNode(); }
  createBufferSource() { return new FakeSource(this); }
  createOscillator() { const o = new FakeNode(); o.frequency = o.gain; o.start = () => {}; o.stop = () => {}; return o; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  decodeAudioData(ab) { return new Promise((res) => this.pendingDecodes.push(() => res({ duration: 1, bytes: ab.byteLength }))); }
  settleDecodes() { for (const d of this.pendingDecodes.splice(0)) d(); }
}

let ctx;
beforeEach(() => {
  ctx = null;
  globalThis.window = { AudioContext: function () { ctx = new FakeCtx(); return ctx; } };
  globalThis.fetch = vi.fn(async (url) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(url.length), json: async () => ({}) }));
});
afterEach(() => { delete globalThis.window; delete globalThis.fetch; });

const flush = () => new Promise((res) => setTimeout(res, 0));

it("resumes a context WebKit left 'interrupted' (a call, Siri, Control Center)", () => {
  const bus = new AudioBus(new EventBus());
  bus.ensureCtx();
  ctx.state = 'interrupted';
  bus.ensureCtx();
  expect(ctx.resumes).toBe(1);
  expect(ctx.state).toBe('running');
});

it('a stop that lands while the track is still decoding wins — the theme must not restart over the intro video', async () => {
  const bus = new AudioBus(new EventBus());
  const p = bus.music('theme');
  await flush();
  bus.stopMusic();          // the intro video starts: kill the theme NOW
  ctx.settleDecodes();      // ...and only then does the theme's decode land
  await p; await flush();
  expect(ctx.started.filter((s) => s.loop).length).toBe(0);
  expect(bus.musicSrc).toBeNull();
});

it('a failed decode is not remembered as silence — the next play retries the file', async () => {
  const bus = new AudioBus(new EventBus());
  bus.ensureCtx();
  ctx.decodeAudioData = () => Promise.reject(new Error('EncodingError'));
  expect(await bus.buffer('assets/audio/sfx/kick.mp3')).toBeNull();
  ctx.decodeAudioData = () => Promise.resolve({ duration: 1 });
  expect(await bus.buffer('assets/audio/sfx/kick.mp3')).toEqual({ duration: 1 });
});

it('switching tracks lets go of the previous decoded music buffer', async () => {
  const bus = new AudioBus(new EventBus());
  const p1 = bus.music('theme');
  await flush(); ctx.settleDecodes(); await p1; await flush();
  const themeUrl = [...bus.buffers.keys()].find((u) => u.includes('theme'));
  expect(themeUrl).toBeTruthy();
  const p2 = bus.music('beat');
  await flush(); ctx.settleDecodes(); await p2; await flush();
  expect(bus.buffers.has(themeUrl)).toBe(false);
});
