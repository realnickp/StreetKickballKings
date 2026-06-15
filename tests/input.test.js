import { it, expect } from 'vitest';
import { GestureInput } from '../src/engine/input.js';

it('detects tap (short, no travel)', () => {
  const g = new GestureInput();
  const got = [];
  g.on('tap', e => got.push(e));
  g.handleDown(100, 100, 0);
  g.handleUp(102, 101, 120);
  expect(got.length).toBe(1);
  expect(got[0].x).toBe(102);
});

it('long press or big travel is not a tap', () => {
  const g = new GestureInput();
  const got = [];
  g.on('tap', e => got.push(e));
  g.handleDown(100, 100, 0);
  g.handleUp(100, 100, 600); // too long
  g.handleDown(100, 100, 1000);
  g.handleMove(160, 100, 1050);
  g.handleUp(160, 100, 1100); // travelled
  expect(got.length).toBe(0);
});

it('detects horizontal swipe direction', () => {
  const g = new GestureInput();
  let dir = null;
  g.on('swipe', e => (dir = e.dir));
  g.handleDown(200, 300, 0);
  g.handleMove(120, 305, 80);
  g.handleUp(90, 306, 140);
  expect(dir).toBe('left');

  g.handleDown(100, 300, 1000);
  g.handleMove(190, 304, 1080);
  g.handleUp(220, 303, 1140);
  expect(dir).toBe('right');
});

it('tracks taps-per-second over a rolling window', () => {
  const g = new GestureInput();
  for (let i = 0; i < 5; i++) {
    g.handleDown(50, 50, i * 100);
    g.handleUp(50, 50, i * 100 + 40);
  }
  expect(g.tapRate(500, 500)).toBeGreaterThan(4);
  expect(g.tapRate(500, 5000)).toBe(0); // window has passed
});

it('emits continuous drag positions with deltas', () => {
  const g = new GestureInput();
  const pts = [];
  g.on('drag', e => pts.push(e));
  g.handleDown(10, 10, 0);
  g.handleMove(40, 60, 100);
  g.handleMove(80, 90, 200);
  g.handleUp(80, 90, 300);
  expect(pts.length).toBe(2);
  expect(pts[0]).toMatchObject({ x: 40, y: 60 });
  expect(pts[1].dx).toBe(40);
});
