// Race-the-ball resolution for base throws, and juke-aware peg checks.

/**
 * @param {{throwDistM: number, runnerRemainingM: number, runnerSpeedMs: number}} p
 * @returns {{out: boolean, marginS: number}} margin > 0 means the ball won
 */
export function resolveBaseThrow(p, tuning) {
  const ballT = p.throwDistM / tuning.throwing.throwSpeedMs;
  const runnerT = p.runnerRemainingM / p.runnerSpeedMs;
  const marginS = runnerT - ballT;
  return { out: marginS > 0, marginS }; // tie (margin 0) goes to the runner
}

/**
 * @param {{throwDistM: number, runnerLateralM: number}} p
 * @returns {{hit: boolean}}
 */
export function resolvePeg(p, tuning) {
  return { hit: Math.abs(p.runnerLateralM) < tuning.throwing.pegHitRadiusM };
}
