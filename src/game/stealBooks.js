// src/game/stealBooks.js — dead-ball steal bookkeeping (fun drop §6: a foul
// kills the steal, and a dead ball never gifts a bag — or a run). Pure so the
// rule is testable without the scene.

/** Revert a committed steal on the 3-bag books. `to === 3` means he stole HOME
 *  and the run already counted — the revert hands the run back too.
 *  @param {(number|null)[]} bases  the live 3-slot bases array
 *  @param {{idx:number, from:number, to:number}} commit  the committed steal
 *  @returns {{bases:(number|null)[], runsDelta:number}} */
export function revertStealBooks(bases, { idx, from, to }) {
  const next = bases.slice(0, 3);
  if (to >= 0 && to <= 2) next[to] = null;
  if (from >= 0 && from <= 2) next[from] = idx;
  return { bases: next, runsDelta: to >= 3 ? -1 : 0 };
}
