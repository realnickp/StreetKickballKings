// Ads + purchases for story mode — HOOK POINTS ONLY. Real rewarded video and
// coin packs need the native app-store shell (Phase 2); in the PWA every hook
// answers "not available" so the free path is the only path, and it's beatable.

/** Rewarded video after a win: resolves true when the player earned double coins. */
export async function offerDoubleCoins() {
  return false;
}

/** A coin pack purchase: resolves true when the store confirmed it. */
export async function buyCoins(_pack) {
  return false;
}

/** Whether the shell can show rewarded video at all (the PWA can't). */
export const adsAvailable = () => false;
