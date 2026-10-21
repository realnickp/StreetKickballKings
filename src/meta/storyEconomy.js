// STORY ECONOMY: coins are the menu's 🪙 `crowns` — one wallet, never a second
// currency. Wins pay, losses pay a little, and coins buy +1 on one stat of one
// player. Slow on purpose (dev, 2026-09-22: "can't be achieved easily or
// quickly"), deterministic, capped at 10. Numbers live in tuning.story.

const PAY_KEY = { ladder: 'ladderWin', semi: 'semiWin', final: 'finalWin', nationals: 'nationalsWin' };
export const STATS = ['power', 'speed', 'arm', 'glove'];

export function payout(stop, won, events, tuning) {
  const pay = tuning.story.pay;
  if (!won) return pay.loss;
  return (pay[PAY_KEY[stop.kind]] ?? pay.ladderWin) + (events.includes('regionChamp') ? pay.regionBonus : 0);
}

export function trainCost(level, tuning) {
  const t = tuning.story.train;
  return level >= t.cap ? Infinity : t.base + t.perLevel * level;
}

/** +1 `stat` on roster player `playerId`, paid from the crowns wallet. */
export function train(story, save, playerId, stat, tuning) {
  const i = story.roster.findIndex((p) => p.id === playerId);
  if (i < 0) return { ok: false, story, reason: 'noPlayer' };
  const p = story.roster[i];
  const cost = trainCost(p.stats[stat], tuning);
  if (cost === Infinity) return { ok: false, story, reason: 'maxed' };
  const crowns = save.get('crowns', 0);
  if (crowns < cost) return { ok: false, story, reason: 'broke' };
  save.set('crowns', crowns - cost);
  const roster = story.roster.slice();
  roster[i] = { ...p, stats: { ...p.stats, [stat]: p.stats[stat] + 1 } };
  return { ok: true, story: { ...story, roster }, cost };
}
