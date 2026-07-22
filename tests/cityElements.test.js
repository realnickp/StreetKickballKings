import { describe, it, expect } from 'vitest';
import { ELEMENTS, CityElements } from '../src/game/cityElements.js';
import fieldsData from '../src/data/fields.json';

// Deterministic rng from a fixed sequence (loops if exhausted).
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

const EXPECTED = {
  'blacktop': 'el-train',
  'subway-yard': 'steam-vents',
  'block-party': 'dj-drop',
  'neon-night-court': 'night-hustle',
  'boardwalk-kings': 'sea-breeze',
  'the-underpass': 'motorcade',
  'rubber-yard': 'extra-bounce',
  'winter-classic': 'the-hawk',
  'scorchyard': 'heat-wave',
  'the-crown': 'heavy-air',
};

describe('city element data', () => {
  const fields = fieldsData.fields ?? fieldsData;
  it('every field has its spec-approved element', () => {
    for (const f of fields) expect(f.element, f.id).toBe(EXPECTED[f.id]);
  });
  it('every element id resolves in the registry with label + blurb', () => {
    for (const f of fields) {
      const el = ELEMENTS[f.element];
      expect(el, f.element).toBeTruthy();
      expect(el.label.length).toBeGreaterThan(0);
      expect(el.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('CityElements engine', () => {
  it('rollInning returns identity + rolled intensity in [0.3, 1]', () => {
    const el = new CityElements({ elementId: 'the-hawk', rng: seq([0.5, 0.5]) });
    const r = el.rollInning(1);
    expect(r.id).toBe('the-hawk');
    expect(r.intensity).toBeGreaterThanOrEqual(0.3);
    expect(r.intensity).toBeLessThanOrEqual(1);
  });

  it('the-hawk wind direction re-rolls per inning and bends the ball', () => {
    const el = new CityElements({ elementId: 'the-hawk', rng: seq([0.9, 0.1, 0.2, 0.8]) });
    const a = el.rollInning(1).windDirDeg;
    const b = el.rollInning(2).windDirDeg;
    expect(a).not.toBe(b);
    const w = el.windAccel();
    expect(Math.hypot(w.x, w.z)).toBeGreaterThan(0.5);
  });

  it('sea-breeze always blows toward the outfield (negative z)', () => {
    const el = new CityElements({ elementId: 'sea-breeze', rng: seq([0.7]) });
    el.rollInning(1);
    expect(el.windAccel().z).toBeLessThan(0);
    expect(Math.abs(el.windAccel().x)).toBeLessThan(0.01);
  });

  it('heat-wave carries the ball and tires fielders late', () => {
    const el = new CityElements({ elementId: 'heat-wave', rng: seq([1]) });
    el.rollInning(1);
    expect(el.carryScale()).toBeGreaterThan(1.05);
    expect(el.fielderSpeedScale(1)).toBe(1);
    expect(el.fielderSpeedScale(5)).toBeLessThan(0.9);
    expect(el.fielderSpeedScale(9)).toBeGreaterThanOrEqual(0.82); // floor
  });

  it('heavy-air kills carry', () => {
    const el = new CityElements({ elementId: 'heavy-air', rng: seq([1]) });
    el.rollInning(1);
    expect(el.carryScale()).toBeLessThan(0.95);
  });

  it('extra-bounce raises restitution, others do not', () => {
    const eb = new CityElements({ elementId: 'extra-bounce', rng: seq([1]) });
    eb.rollInning(1);
    expect(eb.bounceScale()).toBeGreaterThan(1.2);
    const hw = new CityElements({ elementId: 'heat-wave', rng: seq([1]) });
    hw.rollInning(1);
    expect(hw.bounceScale()).toBe(1);
  });

  it('el-train proc cycles start→end and wobbles timing only while active', () => {
    const el = new CityElements({ elementId: 'el-train', rng: seq([0.5]) });
    el.rollInning(1);
    expect(el.procActive).toBe(false);
    expect(el.kickMods(0).wobbleMs).toBe(0);
    let started = false, ended = false;
    for (let t = 0; t < 50 && !ended; t += 0.1) {
      const ev = el.update(0.1);
      if (ev?.proc === 'start') started = true;
      if (ev?.proc === 'end') ended = true;
    }
    expect(started).toBe(true);
    expect(ended).toBe(true);
    expect(el.procActive).toBe(false);
  });

  it('motorcade throw zip drops only during the proc', () => {
    const el = new CityElements({ elementId: 'motorcade', rng: seq([0.5]) });
    el.rollInning(1);
    expect(el.throwZipScale()).toBe(1);
    let sawDrop = false;
    for (let t = 0; t < 50; t += 0.1) {
      el.update(0.1);
      if (el.procActive) { sawDrop = el.throwZipScale() < 1; break; }
    }
    expect(sawDrop).toBe(true);
  });

  it('dj-drop pays bonus on the beat, nothing off-beat (100 BPM = 0.6s)', () => {
    const el = new CityElements({ elementId: 'dj-drop', rng: seq([1]) });
    el.rollInning(1);
    expect(el.kickMods(1.2).beatBonus01).toBeCloseTo(0.08); // exactly on beat 2
    expect(el.kickMods(1.5).beatBonus01).toBe(0);           // half-beat = off
  });

  it('night-hustle grants a steal head start, others none', () => {
    const nh = new CityElements({ elementId: 'night-hustle', rng: seq([1]) });
    nh.rollInning(1);
    expect(nh.stealHeadStartM()).toBeCloseTo(2.2);
    const sb = new CityElements({ elementId: 'sea-breeze', rng: seq([1]) });
    sb.rollInning(1);
    expect(sb.stealHeadStartM()).toBe(0);
  });

  it('steam-vents rolls 2 outfield clouds and inSteam hits inside them', () => {
    const el = new CityElements({ elementId: 'steam-vents', rng: seq([0.2, 0.6, 0.8, 0.3]) });
    el.rollInning(1);
    const clouds = el.steamClouds();
    expect(clouds.length).toBe(2);
    for (const c of clouds) {
      expect(c.z).toBeLessThan(-10);              // outfield band only
      expect(el.inSteam(c.x, c.z)).toBe(true);
      expect(el.inSteam(c.x + 20, c.z)).toBe(false);
    }
  });
});
