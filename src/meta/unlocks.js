// THE LOCKER (dev, 2026-08-03): earnable gear — special kicks, cleats,
// uniforms. Headless like trophies.js: screens/scenes call these, SaveManager
// persists. No currency — milestones ARE the price tag.
//
// Save keys:
//   'career'        lifetime counters {wins, roadWins, blowouts, runs, hr,
//                   defOuts, steals, pickleEscapes}
//   'gear.unlocked' string[] of GEAR ids
//   'gear.equip'    {kick, cleats, uniform} -> GEAR id | null per slot

export const GEAR = [
  // ---- special kicks: the clip swaps in when the crown meter is armed, and
  //      the mods flavor the launch (powerMult replaces the stock 1.35)
  { id: 'kick-flair', cat: 'kick', name: 'THE FLAIR', clip: 'kickFlair', mods: { powerMult: 1.45 }, unlock: { stat: 'hr', n: 1 }, hint: 'Kick your first home run' },
  { id: 'kick-hurricane', cat: 'kick', name: 'HURRICANE KICK', clip: 'kickHurricane', mods: { powerMult: 1.38, loftDeg: 10 }, unlock: { stat: 'hr', n: 3 }, hint: '3 career home runs' },
  { id: 'kick-spinflip', cat: 'kick', name: 'SPIN FLIP KICK', clip: 'kickSpinFlip', mods: { powerMult: 1.42, curl: 1.2 }, unlock: { stat: 'hr', n: 10 }, hint: '10 career home runs' },
  { id: 'kick-crescent', cat: 'kick', name: 'INSIDE CRESCENT', clip: 'kickCrescent', mods: { powerMult: 1.35, curl: 1.5 }, unlock: { stat: 'wins', n: 5 }, hint: '5 career wins' },
  { id: 'kick-blast', cat: 'kick', name: 'STRAIGHT BLAST', clip: 'kickBlast', mods: { powerMult: 1.35, speed: 1.12, loftDeg: -8 }, unlock: { stat: 'defOuts', n: 10 }, hint: '10 outs in the field' },
  { id: 'kick-meia', cat: 'kick', name: 'MEIA LUA', clip: 'kickMeia', mods: { powerMult: 1.35, curl: 1.5 }, unlock: { stat: 'roadWins', n: 3 }, hint: '3 road wins' },
  { id: 'kick-meiaback', cat: 'kick', name: 'MEIA LUA BACK', clip: 'kickMeiaBack', mods: { powerMult: 1.35, curl: -1.4 }, unlock: { stat: 'pickleEscapes', n: 5 }, hint: '5 pickle escapes' },
  { id: 'kick-sweep', cat: 'kick', name: 'LEG SWEEP', clip: 'kickSweep', mods: { powerMult: 1.3, speed: 1.2, loftDeg: -12 }, unlock: { stat: 'steals', n: 15 }, hint: '15 career steals' },
  // ---- cleats: foot-region tint on the kit texture
  { id: 'cleats-fire', cat: 'cleats', name: 'FIRE REDS', hex: '#ff3b1f', unlock: { stat: 'wins', n: 1 }, hint: 'Win your first game' },
  { id: 'cleats-ice', cat: 'cleats', name: 'ICE KICKS', hex: '#7fe7ff', unlock: { stat: 'roadWins', n: 1 }, hint: 'Win on the road' },
  { id: 'cleats-volt', cat: 'cleats', name: 'NEON VOLTS', hex: '#c8ff1f', unlock: { stat: 'crews', n: 3 }, hint: 'Beat 3 crews on their turf' },
  { id: 'cleats-royal', cat: 'cleats', name: 'ROYALS', hex: '#8a4dff', unlock: { stat: 'crews', n: 5 }, hint: 'Beat 5 crews on their turf' },
  { id: 'cleats-black', cat: 'cleats', name: 'BLACKOUTS', hex: '#15151a', unlock: { stat: 'runs', n: 25 }, hint: '25 career runs' },
  { id: 'cleats-gold', cat: 'cleats', name: 'GOLD CROWNS', hex: '#f5c518', unlock: { stat: 'king', n: 1 }, hint: 'Become King of the Streets' },
  // ---- uniforms: whole-kit tint override for YOUR squad
  { id: 'kit-blackout', cat: 'uniform', name: 'BLACKOUT KIT', hex: '#1b1b22', unlock: { stat: 'wins', n: 3 }, hint: '3 career wins' },
  { id: 'kit-whiteout', cat: 'uniform', name: 'WHITEOUT KIT', hex: '#f2f2f4', unlock: { stat: 'blowouts', n: 1 }, hint: 'Win by 5 or more' },
  { id: 'kit-gold', cat: 'uniform', name: 'GOLD RUSH KIT', hex: '#f5c518', unlock: { stat: 'king', n: 1 }, hint: 'Become King of the Streets' },
];

export const gearById = (id) => GEAR.find((g) => g.id === id) ?? null;

/** Merge a match's stat deltas into the lifetime career counters. */
export function careerAdd(save, delta) {
  const c = { ...save.get('career', {}) };
  for (const [k, v] of Object.entries(delta ?? {})) {
    if (v) c[k] = (c[k] ?? 0) + v;
  }
  save.set('career', c);
  return c;
}

/** Lifetime counters + the derived ones (crews beaten, king) read from the
 *  trophy save keys so Run the Map progress feeds the locker too. */
export function careerGet(save) {
  return {
    wins: 0, roadWins: 0, blowouts: 0, runs: 0, hr: 0,
    defOuts: 0, steals: 0, pickleEscapes: 0,
    ...save.get('career', {}),
    crews: save.get('unlocks.crews', []).length,
    king: save.get('kingOfStreets', false) ? 1 : 0,
  };
}

/** Roll the career against the catalog; persist and RETURN newly unlocked
 *  items (post-game toast material). Never un-unlocks. */
export function checkUnlocks(save) {
  const career = careerGet(save);
  const owned = save.get('gear.unlocked', []);
  const fresh = GEAR.filter((g) => !owned.includes(g.id) && (career[g.unlock.stat] ?? 0) >= g.unlock.n);
  if (fresh.length) save.set('gear.unlocked', [...owned, ...fresh.map((g) => g.id)]);
  return fresh;
}

export function isUnlocked(save, id) {
  return save.get('gear.unlocked', []).includes(id);
}

/** Equip an unlocked item into its category slot (null/undefined id = bare). */
export function equipGear(save, cat, id) {
  if (id != null && (!isUnlocked(save, id) || gearById(id)?.cat !== cat)) return false;
  save.set('gear.equip', { ...save.get('gear.equip', {}), [cat]: id ?? null });
  return true;
}

/** Resolve the equip slots to catalog entries: {kick, cleats, uniform}. */
export function equippedGear(save) {
  const eq = save.get('gear.equip', {}) ?? {};
  const pick = (cat) => {
    const g = eq[cat] != null ? gearById(eq[cat]) : null;
    return g && isUnlocked(save, g.id) ? g : null;
  };
  return { kick: pick('kick'), cleats: pick('cleats'), uniform: pick('uniform') };
}
