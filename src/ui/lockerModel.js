// THE LOCKER, headless: the catalog folded into the four tabs the screen
// draws. Pure — no DOM, no save writes — so the ordering/count rules are
// testable and the component stays a thin renderer.
//
// Rules the screen depends on:
//   • equipped chip first, then the rest of what you OWN, then the locked ones
//     (dev, 2026-08-27: "see what you have without hunting past padlocks")
//   • `stock` marks the free day-one gear so the chip can say FREE
//   • a bare "no piece equipped" chip only where the category has no stock
//     item to fall back to (kits/cleats), never where one exists (taunts)
export const TABS = [
  { cat: 'kick', label: 'KICKS', bare: 'STOCK KICK' },
  { cat: 'taunt', label: 'TAUNTS', bare: null },
  { cat: 'cleats', label: 'CLEATS', bare: 'CLASSIC' },
  { cat: 'uniform', label: 'KITS', bare: 'CLASSIC' },
];

/** @param {{GEAR: object[], isUnlocked: (id: string) => boolean, eq: object}} deps
 *  @returns {{cat: string, label: string, chips: object[], owned: number, total: number}[]} */
export function lockerTabs({ GEAR, isUnlocked, eq }) {
  return TABS.map(({ cat, label, bare }) => {
    const items = GEAR.filter((g) => g.cat === cat);
    const chips = items.map((g) => ({
      id: g.id, name: g.name, hex: g.hex ?? null, clip: g.clip ?? null, stock: !!g.stock,
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
