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
