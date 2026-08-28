// THE CONTACT SOUND. The dev, 2026-08-28: "there's no sound effect when the
// kick meets the ball." Nothing in the code path was broken — the emit fires,
// the alias resolves, the file is warmed at boot. The ASSET was the bug:
// kick.mp3 peaks at -23.5 dBFS, ~23 dB under every other cue in the table and
// ~32 dB under the beat's mean level, so the thump was played and never heard.
// These pin the fix: a loud dedicated 'strike' that out-guns the old thump, a
// 'bigwhoosh' for the LOCKER special swing, and a music duck that gets the bed
// out of the way for a quarter second.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { AudioBus, SFX_ALIAS, SFX_FILES, WARM_LIST } from '../src/engine/audio.js';

const stubBus = () => ({ on() {} });
afterEach(() => { delete globalThis.location; });

/** A GainNode's automation calls, recorded in order. */
function stubCtx(bus, { musicGain = 0.65 } = {}) {
  const calls = [];
  const param = {
    value: musicGain,
    cancelScheduledValues: (t) => calls.push(['cancel', null, t]),
    setValueAtTime: (v, t) => calls.push(['set', v, t]),
    linearRampToValueAtTime: (v, t) => calls.push(['ramp', v, t]),
  };
  bus.ctx = { currentTime: 10, state: 'running' };
  bus.gains = { music: { gain: param }, sfx: { gain: { value: 0.9 } }, vo: { gain: { value: 1 } } };
  return calls;
}

it('the contact sounds are registered, on disk, and warmed at boot', () => {
  for (const n of ['strike', 'bigwhoosh']) {
    const a = SFX_ALIAS[n];
    expect(a, n).toBeTruthy();
    expect(SFX_FILES[a.file], n).toBeTruthy();
    expect(fs.existsSync(`public/${SFX_FILES[a.file]}`), `${n} -> ${SFX_FILES[a.file]}`).toBe(true);
    expect(WARM_LIST, `${n} must decode before the first kick, not during it`).toContain(a.file);
  }
});

it('strike out-guns the buried kick thump and ducks the music', () => {
  expect(SFX_ALIAS.strike.gain).toBe(1.6);
  expect(SFX_ALIAS.strike.gain).toBeGreaterThan(SFX_ALIAS.kick.gain);
  expect(SFX_ALIAS.strike.gain).toBeGreaterThan(SFX_ALIAS.crush.gain);
  expect(SFX_ALIAS.strike.duck, 'the contact is the ONLY cue that ducks the bed').toBe(true);
  // ...and it is the only one: a duck on every sound is a pumping bed
  expect(Object.entries(SFX_ALIAS).filter(([, a]) => a.duck).map(([n]) => n)).toEqual(['strike']);
});

it('the special swing whoosh is its own file, not another swish', () => {
  expect(SFX_ALIAS.bigwhoosh.file).toBe('bigwhoosh');
  expect(SFX_FILES.bigwhoosh).not.toBe(SFX_FILES[SFX_ALIAS.swing.file]);
});

it('duck() dips the music bed -6 dB, HOLDS it, and brings it back', () => {
  const a = new AudioBus(stubBus());
  const calls = stubCtx(a);
  a.duck();
  const [cancel, anchor, down, hold, up] = calls;
  expect(cancel[0]).toBe('cancel');
  expect(anchor).toEqual(['set', 0.65, 10]);
  expect(down[0]).toBe('ramp');
  expect(down[1]).toBeCloseTo(0.65 * 10 ** (-6 / 20), 4); // -6 dB of the bed
  expect(down[2]).toBeCloseTo(10.02, 4);                  // 20 ms down
  expect(hold[0], 'without a hold anchor the bed just slides back').toBe('set');
  expect(hold[2]).toBeCloseTo(10.27, 4);                  // 250 ms plateau
  expect(up).toEqual(['ramp', 0.65, expect.closeTo(10.39, 4)]); // 120 ms back up
});

it('the booth outranks the duck — a live line owns the music level', () => {
  const a = new AudioBus(stubBus());
  const calls = stubCtx(a);
  a._voLive = true;
  a.duck();
  expect(calls, 'a second ramp would fight _playAnnouncer and strand the bed').toEqual([]);
});

it("sfx('strike') ducks; the other cues leave the bed alone", () => {
  const a = new AudioBus(stubBus());
  const calls = stubCtx(a);
  a.playBuffer = () => Promise.resolve(null); // no fetch/decode in node
  a.sfx('strike');
  expect(calls.length).toBeGreaterThan(0);
  calls.length = 0;
  for (const n of ['kick', 'crush', 'swing', 'bigwhoosh', 'catchpop']) a.sfx(n);
  expect(calls).toEqual([]);
});

it('a dead AudioContext never throws out of duck()', () => {
  const a = new AudioBus(stubBus());
  a.ctxDead = true; // iOS: the context refused to construct
  expect(() => a.duck()).not.toThrow();
});
