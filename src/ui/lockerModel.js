// THE LOCKER, headless: the catalog folded into the four tabs the screen
// draws. Pure — no DOM, no save writes — so the ordering/count rules are
// testable and the component stays a thin renderer.
//
// Rules the screen depends on:
//   • equipped chip first, then the rest of what you OWN, then the locked ones
//     (dev, 2026-08-27: "see what you have without hunting past padlocks")
//   • `stock` marks the free day-one gear so the chip can say FREE — the KITS
//     tab's stock pair is YOUR crew's own LIGHT and DARK kit, so they lead the
//     row and the unlockables (Blackout/Whiteout/Gold) follow
//   • a bare "no piece equipped" chip only where the category has no stock
//     item to fall back to (kits/cleats), never where one exists (taunts)
export const TABS = [
  { cat: 'kick', label: 'KICKS', bare: 'STOCK KICK' },
  { cat: 'taunt', label: 'TAUNTS', bare: null },
  { cat: 'cleats', label: 'CLEATS', bare: 'CLASSIC' },
  { cat: 'uniform', label: 'KITS', bare: 'CLASSIC' },
];

/** @param {{GEAR: object[], isUnlocked: (id: string) => boolean, eq: object,
 *           team?: object|null}} deps — `team` (the crew you're dressing) turns
 *  on the two stock kit chips: LIGHT and DARK carry that crew's own colours, so
 *  their swatch is the real hex out of `teams.json`, not the catalog placeholder.
 *  Without a team they're filtered out (there'd be no colour to show).
 *  @returns {{cat: string, label: string, chips: object[], owned: number, total: number}[]} */
export function lockerTabs({ GEAR, isUnlocked, eq, team = null }) {
  return TABS.map(({ cat, label, bare }) => {
    const items = GEAR.filter((g) => g.cat === cat && (!g.teamKit || team));
    const chips = items.map((g) => ({
      id: g.id, name: g.name, hex: (g.teamKit ? team?.kits?.[g.teamKit]?.hex : null) ?? g.hex ?? null,
      clip: g.clip ?? null, stock: !!g.stock,
      owned: isUnlocked(g.id), on: eq[cat]?.id === g.id, hint: g.hint, play: g.play ?? '',
    }));
    chips.sort((a, b) => (b.on - a.on) || (b.owned - a.owned));
    const hasStock = items.some((g) => g.stock);
    if (bare && !hasStock) chips.unshift({ id: null, name: bare, hex: '#7a7a85', clip: null, stock: false, owned: true, on: !eq[cat], hint: '', play: '' });
    // the tab badge counts what you can WEAR right now — stock gear included.
    // (Excluding it read as 0/14 on a fresh save while THE FLAIR sat equipped
    //  at the top of the list: a lie the player can see.)
    return { cat, label, chips, owned: items.filter((g) => isUnlocked(g.id)).length, total: items.length };
  });
}
