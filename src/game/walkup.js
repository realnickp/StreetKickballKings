// The kicker's walk-up (dev, 2026-08-25: "they should walk out before they
// kick" + a taunt). Pure numbers + the taunt pick; matchScene moves the body.
export const TAUNTS = ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser'];
export const WALKUP = { startX: -3.4, plateX: -0.9, z: 0.4, mps: 1.6, tauntS: 1.5, serveDelayS: 0.3 };
export const walkS = () => (WALKUP.plateX - WALKUP.startX) / WALKUP.mps;
/** Your kicker: the equipped taunt (THE POINT is stock). CPU: any of the five. */
export function pickTaunt({ isPlayer, equipped, random = Math.random }) {
  if (isPlayer) return equipped?.clip ?? 'tauntPoint';
  return TAUNTS[Math.floor(random() * TAUNTS.length)];
}
