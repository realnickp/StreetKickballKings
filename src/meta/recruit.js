// RECRUITING (story spec §6): beat a crew and one of theirs DMs you to roll
// with you. They keep their body and their stats and pull on your kit; one of
// your eight sits. Nobody is ever offered twice — taken or turned down.
import { castSlotFor } from '../game/glbCharacters.js';

const STATS = ['power', 'speed', 'arm', 'glove'];
const best = (p) => Math.max(...STATS.map((s) => p.stats[s]));

/** The player from `team` who wants in, or null when they've all been asked. */
export function recruitOffer(story, team) {
  const asked = new Set(story.recruited);
  const crewAvg = (s) => story.roster.reduce((a, p) => a + p.stats[s], 0) / story.roster.length;
  const weakest = STATS.reduce((w, s) => (crewAvg(s) < crewAvg(w) ? s : w));
  let pickIdx = -1;
  team.roster.forEach((p, i) => {
    if (asked.has(`${team.id}:${p.id}`)) return;
    if (pickIdx < 0) { pickIdx = i; return; }
    const cur = team.roster[pickIdx];
    if (best(p) > best(cur) || (best(p) === best(cur) && p.stats[weakest] > cur.stats[weakest])) pickIdx = i;
  });
  if (pickIdx < 0) return null;
  const p = team.roster[pickIdx];
  return { ...p, stats: { ...p.stats }, id: `${team.id}:${p.id}`, from: team.id, cast: castSlotFor(team, pickIdx) };
}

/** The recruit takes `benchId`'s spot; that player waits on the bench. */
export function acceptRecruit(story, offer, benchId) {
  const i = story.roster.findIndex((p) => p.id === benchId);
  if (i < 0) return story;
  const roster = story.roster.slice();
  const sat = roster[i];
  roster[i] = offer;
  return { ...story, roster, bench: [...story.bench, sat], recruited: [...story.recruited, offer.id] };
}

export function declineRecruit(story, offer) {
  return { ...story, recruited: [...story.recruited, offer.id] };
}

/** Put bench player `benchId` in for roster player `rosterId` (same slot). */
export function swapBench(story, rosterId, benchId) {
  const i = story.roster.findIndex((p) => p.id === rosterId);
  const j = story.bench.findIndex((p) => p.id === benchId);
  if (i < 0 || j < 0) return story;
  const roster = story.roster.slice();
  const bench = story.bench.slice();
  [roster[i], bench[j]] = [bench[j], roster[i]];
  return { ...story, roster, bench };
}
