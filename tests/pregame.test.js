import { it, expect } from 'vitest';
import { PREGAME, pregameTimeline } from '../src/game/pregame.js';

it('stamp, away splash, home splash, then the break — under six seconds', () => {
  const { events, totalS } = pregameTimeline();
  expect(events.map((e) => `${e.kind}${e.side ? ':' + e.side : ''}`)).toEqual(['open', 'splash:away', 'splash:home', 'cleanup']);
  expect(events[1].t).toBe(PREGAME.openS + 0.3);
  expect(events[2].t).toBeCloseTo(events[1].t + PREGAME.splashS);
  expect(totalS).toBeCloseTo(events[2].t + PREGAME.splashS);
  expect(totalS).toBeLessThan(6);
});
