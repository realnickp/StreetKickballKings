import { it, expect } from 'vitest';
import { TIERS, detectTier } from '../src/engine/deviceTier.js';

// ONE decision at boot about how much phone there is (audit 2026-09-12 §04:
// the render pipeline ran at desktop settings on every device and the
// PerfWatchdog only ever stepped MSAA down after 8 s). iOS never lands on
// `high` — the memory ceiling is the whole problem.
const SE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

it('the table itself: low sheds everything, mid keeps the look, high is today', () => {
  expect(TIERS.low).toMatchObject({ dpr: 1.5, msaa: 0, bloom: false, grade: false, shadowMap: 1024, video: 'none', casters: 6 });
  expect(TIERS.mid).toMatchObject({ dpr: 2, msaa: 2, bloom: true, grade: true, shadowMap: 1024, video: 'front', casters: 8 });
  expect(TIERS.high).toMatchObject({ dpr: 2, msaa: 4, bloom: true, grade: true, shadowMap: 2048, video: 'both', casters: 16 });
});

it('an iPhone SE / mini (≤ 380 CSS px wide) is low; a 390+ iPhone is mid; no iPhone is ever high', () => {
  expect(detectTier({ ua: SE, screenW: 375, screenH: 667 }).name).toBe('low');
  expect(detectTier({ ua: SE, screenW: 390, screenH: 844 }).name).toBe('mid');
  expect(detectTier({ ua: SE, screenW: 430, screenH: 932, deviceMemory: 8 }).name).toBe('mid');
});

it('iOS 15 is low whatever the screen', () => {
  expect(detectTier({ ua: IOS15, screenW: 414, screenH: 896 }).name).toBe('low');
});

it('an iPad (Macintosh UA + touch) is iOS: mid', () => {
  expect(detectTier({ ua: IPAD, platform: 'MacIntel', maxTouchPoints: 5, screenW: 820, screenH: 1180 }).name).toBe('mid');
  expect(detectTier({ ua: IPAD, platform: 'MacIntel', maxTouchPoints: 0, screenW: 1440, screenH: 900 }).name).toBe('high'); // a real Mac
});

it('Android tiers by memory (Chrome rounds 6 GB down to 4) and by cores', () => {
  expect(detectTier({ ua: ANDROID, deviceMemory: 2, hardwareConcurrency: 8 }).name).toBe('low');
  expect(detectTier({ ua: ANDROID, deviceMemory: 4, hardwareConcurrency: 8 }).name).toBe('mid');
  expect(detectTier({ ua: ANDROID, deviceMemory: 8, hardwareConcurrency: 8 }).name).toBe('high');
  expect(detectTier({ ua: ANDROID, deviceMemory: 4, hardwareConcurrency: 4 }).name).toBe('low');
});

it('no memory or core signal at all (Firefox, WebViews) lands on the safe middle', () => {
  expect(detectTier({ ua: ANDROID }).name).toBe('mid');
  expect(detectTier({ ua: '' }).name).toBe('high'); // an unknown desktop-ish UA: nothing says phone
});

it('desktop is high; the ?tier override wins over everything', () => {
  expect(detectTier({ ua: DESKTOP, deviceMemory: 8 }).name).toBe('high');
  expect(detectTier({ ua: SE, screenW: 375, screenH: 667, override: 'high' })).toMatchObject({ name: 'high', reason: 'override' });
  expect(detectTier({ ua: DESKTOP, override: 'nonsense' }).name).toBe('high');
});
