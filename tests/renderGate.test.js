import { it, expect } from 'vitest';
import { RenderGate, isCovered } from '../src/engine/renderGate.js';

// Title, Menu, Team Select, Locker, Post-game and the intro videos all sit on
// an OPAQUE layer over the canvas, and the engine kept rendering the full
// post chain at 60 fps underneath every one of them (audit B16). The gate
// lets a couple of frames through after any change (so the last drawn frame
// is current when a screen lifts) and then skips composer.render().

it('renders while uncovered, settles two frames after being covered, then skips', () => {
  const g = new RenderGate({ settleFrames: 2 });
  expect(g.shouldRender()).toBe(true);
  g.setCovered(true);
  expect([g.shouldRender(), g.shouldRender(), g.shouldRender(), g.shouldRender()]).toEqual([true, true, false, false]);
  g.setCovered(false);
  expect([g.shouldRender(), g.shouldRender(), g.shouldRender()]).toEqual([true, true, true]);
});

it('setting the same state twice does not re-arm the settle frames', () => {
  const g = new RenderGate({ settleFrames: 1 });
  g.setCovered(true); g.shouldRender();
  g.setCovered(true);
  expect(g.shouldRender()).toBe(false);
});

// a tiny DOM stand-in: elements with classList/children/querySelector
function el(cls = '', children = [], attrs = {}) {
  const classes = new Set(cls.split(' ').filter(Boolean));
  const node = {
    classList: { contains: (c) => classes.has(c) }, children, hidden: !!attrs.hidden, id: attrs.id ?? '',
    querySelector(sel) {
      const want = sel.startsWith('#') ? (n) => n.id === sel.slice(1) : (n) => n.classList.contains(sel.slice(1));
      const walk = (n) => { for (const c of n.children) { if (want(c)) return c; const r = walk(c); if (r) return r; } return null; };
      return walk(this);
    },
  };
  return node;
}

it('an opaque .screen in #ui-root covers; a .transparent one (a CSS modifier no shipped screen uses yet) or an empty root does not', () => {
  const stage = (kids) => el('', [el('', kids, { id: 'ui-root' })]);
  expect(isCovered(stage([el('screen menu-screen')]))).toBe(true);
  expect(isCovered(stage([el('screen transparent coin-screen')]))).toBe(false);
  expect(isCovered(stage([]))).toBe(false);
  expect(isCovered(stage([el('screen', [], { hidden: true })]))).toBe(false);
});

it('an intro/splash video wrapper covers; the pause overlay (not a .screen) does not', () => {
  const stage = el('', [el('', [], { id: 'ui-root' }), el('video-cover')]);
  expect(isCovered(stage)).toBe(true);
  const paused = el('', [el('', [], { id: 'ui-root' }), el('pause-overlay show')]);
  expect(isCovered(paused)).toBe(false);
  expect(isCovered(null)).toBe(false);
});
