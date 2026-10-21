// RIVAL SCALING (story spec §6): the further up the climb, the better every
// crew plays — their stats rise rung by rung and the AI sharpens from Rookie to
// King. A little training keeps pace; skill can still win under-trained.

const STATS = ['power', 'speed', 'arm', 'glove'];

export function rivalTeam(team, stop, tuning) {
  const { boostStart, boostEnd, tiers } = tuning.story.rival;
  const p = Math.max(0, Math.min(1, stop.progress01));
  const boost = Math.round(boostStart + (boostEnd - boostStart) * p);
  const roster = team.roster.map((pl) => ({
    ...pl,
    stats: Object.fromEntries(STATS.map((s) => [s, Math.max(1, Math.min(10, pl.stats[s] + boost))])),
  }));
  const difficulty = tiers.find(([upTo]) => p < upTo)?.[1] ?? 'King';
  return { team: { ...team, roster }, difficulty };
}
