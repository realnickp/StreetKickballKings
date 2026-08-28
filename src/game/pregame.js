// Match open. STARTING LINEUPS stamp, then each crew WALKS OUT to the field
// under three broadcast angles (walkoutShow.js), then the GAME TIME break.
// pregameTimeline() is the splash-only fallback that runs when a side has no
// bodies to walk (sprite/short rosters) — the lineup must always show.
import { WALKOUT_SHOW } from './walkoutShow.js';

export const PREGAME = { openS: 0.2, splashS: 1.9, leadS: 0.6, gapS: 0.2 };

export function pregameTimeline() {
  const ev = [];
  let t = PREGAME.openS; ev.push({ t, kind: 'open' });
  t += 0.3; ev.push({ t, kind: 'splash', side: 'away' });
  t += PREGAME.splashS; ev.push({ t, kind: 'splash', side: 'home' });
  t += PREGAME.splashS; ev.push({ t, kind: 'cleanup' });
  return { events: ev, totalS: t };
}

/** Stamp → away walk-out → home walk-out → the break. ~17 s, per the design. */
export function walkoutPregame(showS = WALKOUT_SHOW.totalS) {
  const ev = [];
  let t = PREGAME.openS; ev.push({ t, kind: 'open' });
  t += PREGAME.leadS; ev.push({ t, kind: 'walkout', side: 'away' });
  t += showS + PREGAME.gapS; ev.push({ t, kind: 'walkout', side: 'home' });
  t += showS + PREGAME.gapS; ev.push({ t, kind: 'cleanup' });
  return { events: ev, totalS: t };
}
