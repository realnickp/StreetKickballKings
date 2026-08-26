// Match open (dev, 2026-08-25: the lineup dance number is gone — walk-ups
// replace it). STARTING LINEUPS stamp, away crest, home crest, GAME TIME.
export const PREGAME = { openS: 0.2, splashS: 1.9 };
export function pregameTimeline() {
  const ev = [];
  let t = PREGAME.openS; ev.push({ t, kind: 'open' });
  t += 0.3; ev.push({ t, kind: 'splash', side: 'away' });
  t += PREGAME.splashS; ev.push({ t, kind: 'splash', side: 'home' });
  t += PREGAME.splashS; ev.push({ t, kind: 'cleanup' });
  return { events: ev, totalS: t };
}
