// src/game/animExtras.js — lazy extras animation pack (dances, special kicks,
// soccer spin). The eager base bakes (mocap-<arch>.glb) stay lean; this fetches
// mocap-x-<arch>.glb in the background once a match's characters exist and
// merges the clips into each character's MocapAnimator. Consumers must ALWAYS
// keep a fallback for the not-yet-loaded case (slow cell connections):
// HR dance -> dance1-4, walkout -> legacy swagger parade, special kick ->
// 'kick', soccerSpin -> the whirl rotation.
import { loadMocapClips } from './mocapAnimator.js';

/** Kick off background loading of the extras pack for every character in the
 *  match. Safe to call more than once (per-URL promise cache) and never
 *  rejects — a missing pack just logs and the fallbacks stay in force. */
export function loadExtrasFor(chars) {
  const jobs = [];
  for (const c of chars ?? []) {
    if (!c?.archKey || !c.animator?.addClips) continue;
    jobs.push(loadMocapClips(`/assets/anims/mocap-x-${c.archKey}.glb`)
      .then((clips) => c.animator.addClips(clips))
      .catch((e) => console.warn(`[skk] extras mocap-x-${c.archKey}.glb unavailable:`, e?.message ?? e)));
  }
  return Promise.allSettled(jobs);
}

/** Does this character have a (possibly extras-pack) clip ready to play? */
export const hasClip = (char, name) => !!char?.animator?.hasClip?.(name);

/** All of `chars` have the clip — the gate for synced group choreography. */
export const allHaveClip = (chars, name) => (chars?.length ?? 0) > 0 && chars.every((c) => hasClip(c, name));

const BASE_DANCES = ['dance1', 'dance2', 'dance3', 'dance4'];
const X_DANCES = ['thriller1', 'thriller2', 'thriller3', 'thriller4', 'danceLock',
  'danceTut', 'danceWave', 'danceChicken', 'danceStep', 'danceSilly'];

/** Random dance this character can play RIGHT NOW: the full new-dance pool
 *  once the extras pack lands, always at least the base four. */
export function pickDance(char) {
  const pool = [...X_DANCES.filter((n) => hasClip(char, n)), ...BASE_DANCES];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** One dance per squad member, as DISTINCT as the loaded pools allow — eight
 *  winners doing eight different moves reads like a block party; eight clones
 *  don't. Repeats only start once every playable dance is already on the floor. */
export function pickDances(chars) {
  const useCount = new Map();
  return (chars ?? []).map((c) => {
    const pool = [...X_DANCES.filter((n) => hasClip(c, n)), ...BASE_DANCES];
    const low = Math.min(...pool.map((n) => useCount.get(n) ?? 0));
    const fresh = pool.filter((n) => (useCount.get(n) ?? 0) === low);
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    useCount.set(pick, (useCount.get(pick) ?? 0) + 1);
    return pick;
  });
}
