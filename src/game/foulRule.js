// src/game/foulRule.js — where a batted ball is FOUL.
//
// Dev rule (2026-08-27): "foul balls should only be called foul if it goes
// outside the boundaries, short kicks should not be called fouls." Mistimed
// contact is no longer an automatic foul call — it is a weak LIVE kick that
// gets judged by geometry like every other kick.
//
// Field frame: home plate at the origin, the outfield is -z, the 45° foul
// lines are |x| = -z. The 1 m term is the plate tolerance: right at home the
// wedge has no width, so without it every dribbler off the plate would be foul.

/**
 * @param {{x:number, z:number}} lp landing point (world metres)
 * @returns {boolean} true when the ball lands behind home or outside the lines
 */
export function isFoulLanding(lp) {
  return lp.z > 0 || Math.abs(lp.x) > -lp.z + 1.0;
}
