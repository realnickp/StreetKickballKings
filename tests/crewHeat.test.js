import { describe, it, expect } from 'vitest';
import { CrewHeat, HEAT_EVENTS } from '../src/game/crewHeat.js';

describe('CrewHeat', () => {
  it('offensive events gain heat for that side', () => {
    const h = new CrewHeat();
    h.add('home', 'homerun');
    expect(h.value.home).toBe(HEAT_EVENTS.homerun.gain);
    expect(h.value.away).toBe(0);
  });

  it('defensive events gain AND steal from the other crew (floored at 0)', () => {
    const h = new CrewHeat();
    h.add('home', 'homerun'); // home 30
    h.add('away', 'doubleplay'); // away +25, steals 15 from home
    expect(h.value.away).toBe(HEAT_EVENTS.doubleplay.gain);
    expect(h.value.home).toBe(30 - HEAT_EVENTS.doubleplay.steal);
    h.add('away', 'doubleplay'); // home 15-15=0, never negative
    expect(h.value.home).toBe(0);
  });

  it('ignites exactly once at 100, burns 4 plays, resets to 25', () => {
    const h = new CrewHeat();
    h.add('home', 'homerun');
    h.add('home', 'homerun');
    h.add('home', 'homerun');
    expect(h.onFire('home')).toBe(false);
    expect(h.add('home', 'homerun')).toBe('ignited'); // 120 -> capped, fire on
    expect(h.onFire('home')).toBe(true);
    expect(h.value.home).toBe(100);
    expect(h.add('home', 'double')).not.toBe('ignited'); // already burning
    for (let i = 0; i < 4; i++) h.notePlay();
    expect(h.onFire('home')).toBe(false);
    expect(h.value.home).toBe(25);
  });

  it('fire modifiers flip only for the burning side', () => {
    const h = new CrewHeat();
    for (let i = 0; i < 4; i++) h.add('away', 'homerun');
    expect(h.onFire('away')).toBe(true);
    expect(h.kickPowerMult('away')).toBeGreaterThan(1);
    expect(h.fielderSpeedScale('away')).toBeGreaterThan(1);
    expect(h.throwSpeedScale('away')).toBeGreaterThan(1);
    expect(h.kickPowerMult('home')).toBe(1);
    expect(h.fielderSpeedScale('home')).toBe(1);
    expect(h.throwSpeedScale('home')).toBe(1);
  });

  it('heat decays over time, but a burning bar holds', () => {
    const h = new CrewHeat();
    h.add('home', 'homerun'); // 30
    h.update(10);             // -3.5
    expect(h.value.home).toBeCloseTo(30 - 3.5, 5);
    for (let i = 0; i < 4; i++) h.add('away', 'homerun'); // away ignites
    h.update(10);
    expect(h.value.away).toBe(100); // no decay while on fire
  });
});
