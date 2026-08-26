// src/game/animExtras.js — lazy extras animation packs (dances, special kicks,
// soccer spin, taunts). The eager base bakes (mocap-<arch>.glb) stay lean; this
// fetches mocap-<pack>-<arch>.glb in the background once a match's characters
// exist and merges the clips into each character's MocapAnimator. Consumers
// must ALWAYS keep a fallback for the not-yet-loaded case (slow cell connections):
// HR dance -> dance1-4, walkout -> legacy swagger parade, special kick ->
// 'kick', soccerSpin -> the whirl rotation.
import { loadMocapClips } from './mocapAnimator.js';

export const PACKS = ['x', 'k']; // x = dances/special kicks, k = the 2026-08-25 kicks + taunts

/** Kick off background loading of EVERY extras pack for every character in the
 *  match. Safe to call more than once (per-URL promise cache) and never
 *  rejects — a missing pack just logs and the fallbacks stay in force. */
export function loadExtrasFor(chars) {
  const jobs = [];
  for (const c of chars ?? []) {
    if (!c?.archKey || !c.animator?.addClips) continue;
    for (const p of PACKS) {
      jobs.push(loadMocapClips(`/assets/anims/mocap-${p}-${c.archKey}.glb`)
        .then((clips) => c.animator.addClips(clips))
        .catch((e) => console.warn(`[skk] extras mocap-${p}-${c.archKey}.glb unavailable:`, e?.message ?? e)));
    }
  }
  return Promise.allSettled(jobs);
}

/** Does this character have a (possibly extras-pack) clip ready to play? */
export const hasClip = (char, name) => !!char?.animator?.hasClip?.(name);

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

/** No-repeat dance draws for the HR show (dev, 2026-08-25: "different dance
 *  every time"). A shuffled bag of every playable dance, drawn without
 *  replacement; a refill never leads with the last dance played. `recent`
 *  (saved between matches) is pushed to the back so game one isn't a rerun. */
export class DanceBag {
  constructor({ recent = [], random = Math.random, onDraw = null } = {}) {
    this.recent = [...recent].slice(-4); this.random = random; this.onDraw = onDraw;
    this.known = new Set(); this.bag = [];
  }
  _shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }
  _learn(char) {
    const fresh = [...X_DANCES.filter((n) => hasClip(char, n)), ...BASE_DANCES].filter((n) => !this.known.has(n));
    if (!fresh.length) return;
    for (const n of fresh) this.known.add(n);
    this.bag = this._shuffle([...this.bag, ...fresh]);
    this.bag = [...this.bag.filter((n) => !this.recent.includes(n)), ...this.bag.filter((n) => this.recent.includes(n))];
  }
  _refill() {
    this.bag = this._shuffle([...this.known]);
    const last = this.recent[this.recent.length - 1];
    if (this.bag.length > 1 && this.bag[0] === last) [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
  }
  draw(char) {
    this._learn(char);
    if (!this.bag.length) this._refill();
    const playable = (n) => hasClip(char, n) || BASE_DANCES.includes(n);
    // a shared bag serves every kicker in the match — the drawing character's
    // first PLAYABLE slot, not bag[0], is what must dodge the last dance
    // played, and that preference must hold on EVERY refill path, including
    // the forced mid-cycle one below (fix rounds 1 + 2, 2026-08-26: a
    // character whose playable subset runs dry mid-cycle in a shared bag
    // forces the second refill, which had no last-dance exclusion of its own)
    const last = this.recent[this.recent.length - 1];
    const pickIdx = () => {
      const j = this.bag.findIndex((n) => playable(n) && n !== last);
      return j >= 0 ? j : this.bag.findIndex(playable);
    };
    let i = pickIdx();
    if (i < 0) { this._refill(); i = pickIdx(); }
    if (i < 0) return BASE_DANCES[0];
    const [pick] = this.bag.splice(i, 1);
    this.recent = [...this.recent, pick].slice(-4);
    this.onDraw?.(this.recent);
    return pick;
  }
}
