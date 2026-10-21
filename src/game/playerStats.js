// STATS THAT MATTER (story spec §6): power/speed/arm/glove move the kick, the
// legs, the throw and the catch — ONLY in story matches (`useStats`), so Quick
// Play keeps the balance it was tuned on. 5 is neutral; each point is a few
// percent (tuning.story.statMult).

export function statMult(stat, value, tuning) {
  const v = Math.max(1, Math.min(10, value));
  return 1 + (v - 5) * tuning.story.statMult[stat];
}

const statOf = (char, stat) => char?.data?.stats?.[stat];
const mult = (char, stat, on, tuning) => {
  const v = statOf(char, stat);
  return on && Number.isFinite(v) ? statMult(stat, v, tuning) : 1;
};

export const kickPowerFor = (kicker, on, tuning) => mult(kicker, 'power', on, tuning);
export const runSpeedFor = (runner, on, tuning) => mult(runner, 'speed', on, tuning);
export const gloveFor = (fielder, on, tuning) => mult(fielder, 'glove', on, tuning);

/** The fielding side's arm: its AVERAGE (every relay, every cut-off throws). */
export function throwArmFor(fielders, on, tuning) {
  const arms = (fielders ?? []).map((c) => statOf(c, 'arm')).filter(Number.isFinite);
  if (!on || !arms.length) return 1;
  return statMult('arm', arms.reduce((a, b) => a + b, 0) / arms.length, tuning);
}
