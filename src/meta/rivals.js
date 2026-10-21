// RIVAL SCALING (story spec §6): the further up the climb, the better every
// crew plays — their stats rise rung by rung and the AI sharpens from Rookie to
// King. A little training keeps pace; skill can still win under-trained.
// The story DIFFICULTY (CHILL / STREET / KING, set in the crew room) shifts the
// whole curve a stat point and one AI tier either way.

const STATS = ['power', 'speed', 'arm', 'glove'];
const TIERS = ['Rookie', 'Street', 'King'];

export function rivalTeam(team, stop, tuning, difficulty = 'street') {
  const { boostStart, boostEnd, tiers } = tuning.story.rival;
  const shift = tuning.story.difficulty?.[difficulty] ?? { boost: 0, tierShift: 0 };
  const p = Math.max(0, Math.min(1, stop.progress01));
  const boost = Math.round(boostStart + (boostEnd - boostStart) * p) + shift.boost;
  const roster = team.roster.map((pl) => ({
    ...pl,
    stats: Object.fromEntries(STATS.map((s) => [s, Math.max(1, Math.min(10, pl.stats[s] + boost))])),
  }));
  const base = TIERS.indexOf(tiers.find(([upTo]) => p < upTo)?.[1] ?? 'King');
  const ai = TIERS[Math.max(0, Math.min(TIERS.length - 1, base + shift.tierShift))];
  return { team: { ...team, roster }, difficulty: ai };
}
