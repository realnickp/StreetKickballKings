/** One line naming what the player is wearing — the NOW KICKING card and the
 *  first-at-bat toast both read it (dev, 2026-08-25: gear must be SEEN). */
export function gearLine(gear) {
  const g = gear ?? {};
  return [g.kick?.name ?? 'STOCK KICK', g.cleats?.name ?? 'STOCK CLEATS', g.uniform?.name ?? 'STOCK KIT'].join(' · ');
}
