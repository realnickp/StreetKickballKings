import { describe, it, expect } from 'vitest';
import { GestureInput } from '../src/engine/input.js';

describe('gesture: swipe-to-kick + stroke', () => {
  it('reports a straight-up swipe as ~0° aim', () => {
    const g = new GestureInput();
    let sw = null;
    g.on('swipe', e => sw = e);
    g.handleDown(100, 300, 0);
    g.handleMove(100, 250, 60);
    g.handleUp(100, 200, 120);
    expect(sw.dir).toBe('up');
    expect(Math.abs(sw.angleDeg)).toBeLessThan(5);
  });

  it('reports an up-right swipe as a positive aim angle', () => {
    const g = new GestureInput();
    let sw = null;
    g.on('swipe', e => sw = e);
    g.handleDown(100, 300, 0);
    g.handleUp(170, 210, 120);
    expect(sw.angleDeg).toBeGreaterThan(20);
  });

  it('the enriched up event carries aim delta + travel for the kick', () => {
    const g = new GestureInput();
    let up = null;
    g.on('up', e => up = e);
    g.handleDown(100, 300, 0);
    g.handleUp(140, 210, 130);
    expect(up.dx).toBe(40);
    expect(up.dy).toBe(-90);
    expect(up.travel).toBeGreaterThan(60);
  });

  it('emits a stroke with the full path for pattern tracing', () => {
    const g = new GestureInput();
    let stroke = null;
    g.on('stroke', e => stroke = e);
    g.handleDown(50, 300, 0);
    g.handleMove(60, 250, 40);
    g.handleMove(40, 200, 80);
    g.handleUp(70, 150, 120);
    expect(stroke.points.length).toBeGreaterThanOrEqual(3);
    expect(stroke.dur).toBe(120);
  });

  it('a plain tap is not a swipe and emits no stroke', () => {
    const g = new GestureInput();
    let sw = null, stroke = null, tap = null;
    g.on('swipe', e => sw = e);
    g.on('stroke', e => stroke = e);
    g.on('tap', e => tap = e);
    g.handleDown(100, 100, 0);
    g.handleUp(102, 101, 120);
    expect(tap).not.toBeNull();
    expect(sw).toBeNull();
    expect(stroke).toBeNull();
  });
});
