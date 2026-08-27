// THE LOCKER (dev, 2026-08-03): earnable gear — special kicks, cleats,
// uniforms. Headless like trophies.js: screens/scenes call these, SaveManager
// persists. No currency — milestones ARE the price tag.
//
// Save keys:
//   'career'        lifetime counters {wins, roadWins, blowouts, runs, hr,
//                   defOuts, steals, pickleEscapes, games, perfects}
//   'gear.unlocked' string[] of GEAR ids
//   'gear.equip'    {kick, cleats, uniform, taunt} -> GEAR id | null per slot

export const GEAR = [
  // ---- special kicks: the clip swaps in when the crown meter is armed, and
  //      the mods flavor the launch (powerMult replaces the stock 1.35)
  { id: 'kick-flair', cat: 'kick', name: 'THE FLAIR', clip: 'kickFlair', mods: { powerMult: 1.45 }, stock: true, unlock: null, hint: 'FREE · yours from day one', play: '2 power kicks a game · ×1.45 power' },
  { id: 'kick-hurricane', cat: 'kick', name: 'HURRICANE KICK', clip: 'kickHurricane', mods: { powerMult: 1.38, loftDeg: 10 }, unlock: { stat: 'hr', n: 3 }, hint: '3 career home runs', play: '2 power kicks a game · ×1.38 power, +10° loft' },
  { id: 'kick-spinflip', cat: 'kick', name: 'SPIN FLIP KICK', clip: 'kickSpinFlip', mods: { powerMult: 1.42, curl: 1.2 }, unlock: { stat: 'hr', n: 10 }, hint: '10 career home runs', play: '2 power kicks a game · ×1.42 power, curl ×1.2' },
  { id: 'kick-crescent', cat: 'kick', name: 'INSIDE CRESCENT', clip: 'kickCrescent', mods: { powerMult: 1.35, curl: 1.5 }, unlock: { stat: 'wins', n: 5 }, hint: '5 career wins', play: '2 power kicks a game · ×1.35 power, curl ×1.5' },
  { id: 'kick-blast', cat: 'kick', name: 'STRAIGHT BLAST', clip: 'kickBlast', mods: { powerMult: 1.35, speed: 1.12, loftDeg: -8 }, unlock: { stat: 'defOuts', n: 10 }, hint: '10 outs in the field', play: '2 power kicks a game · ×1.35 power, low liner ×1.12 speed' },
  { id: 'kick-meia', cat: 'kick', name: 'MEIA LUA', clip: 'kickMeia', mods: { powerMult: 1.35, curl: 1.5 }, unlock: { stat: 'wins', n: 3 }, hint: '3 career wins', play: '2 power kicks a game · ×1.35 power, curl ×1.5' },
  { id: 'kick-meiaback', cat: 'kick', name: 'MEIA LUA BACK', clip: 'kickMeiaBack', mods: { powerMult: 1.35, curl: -1.4 }, unlock: { stat: 'pickleEscapes', n: 5 }, hint: '5 pickle escapes', play: '2 power kicks a game · ×1.35 power, reverse curl' },
  { id: 'kick-sweep', cat: 'kick', name: 'LEG SWEEP', clip: 'kickSweep', mods: { powerMult: 1.35, speed: 1.2, loftDeg: -12 }, unlock: { stat: 'steals', n: 15 }, hint: '15 career steals', play: '2 power kicks a game · ×1.35 power, grounder ×1.2 speed' },
  // ---- pack k kicks (dev, 2026-08-25): earned on realistic career marks
  { id: 'kick-martelo', cat: 'kick', name: 'MARTELO', clip: 'kickMartelo', mods: { powerMult: 1.4, loftDeg: 6 }, unlock: { stat: 'runs', n: 20 }, hint: '20 career runs', play: '2 power kicks a game · ×1.4 power, +6° loft' },
  { id: 'kick-armada', cat: 'kick', name: 'ARMADA', clip: 'kickArmada', mods: { powerMult: 1.38, curl: 1.3 }, unlock: { stat: 'games', n: 5 }, hint: 'Play 5 games', play: '2 power kicks a game · ×1.38 power, curl ×1.3' },
  { id: 'kick-scissor', cat: 'kick', name: 'SCISSOR KICK', clip: 'kickScissor', mods: { powerMult: 1.4, speed: 1.1 }, unlock: { stat: 'wins', n: 10 }, hint: '10 career wins', play: '2 power kicks a game · ×1.4 power, ×1.1 speed' },
  { id: 'kick-punt', cat: 'kick', name: 'STREET PUNT', clip: 'kickPunt', mods: { powerMult: 1.35, loftDeg: 12 }, unlock: { stat: 'perfects', n: 10 }, hint: '10 PERFECT kicks', play: '2 power kicks a game · ×1.35 power, +12° sky ball' },
  { id: 'kick-flip', cat: 'kick', name: 'FLIP KICK', clip: 'kickFlip', mods: { powerMult: 1.42, curl: -1.3 }, unlock: { stat: 'blowouts', n: 3 }, hint: 'Win 3 games by 5+', play: '2 power kicks a game · ×1.42 power, reverse curl' },
  // kick-bicycle: source clip is a 0.67 s fragment — re-add when a full Flying Bicycle Kick lands (bake name kickBicycle)
  { id: 'kick-kipup', cat: 'kick', name: 'KIP-UP DOUBLE', clip: 'kickKipUp', mods: { powerMult: 1.5 }, unlock: { stat: 'hr', n: 25 }, hint: '25 career home runs', play: '2 power kicks a game · ×1.5 power — the biggest boot in the game' },
  // ---- taunts: the walk-up move before every kick
  { id: 'taunt-point', cat: 'taunt', name: 'THE POINT', clip: 'tauntPoint', stock: true, unlock: null, hint: 'Yours from day one', play: 'your walk-up taunt' },
  { id: 'taunt-cry', cat: 'taunt', name: 'BATTLE CRY', clip: 'tauntCry', unlock: { stat: 'wins', n: 1 }, hint: 'Win your first game', play: 'your walk-up taunt' },
  { id: 'taunt-chest', cat: 'taunt', name: 'CHEST THUMP', clip: 'tauntChest', unlock: { stat: 'hr', n: 5 }, hint: '5 career home runs', play: 'your walk-up taunt' },
  { id: 'taunt-gesture', cat: 'taunt', name: 'COME AT ME', clip: 'tauntGesture', unlock: { stat: 'games', n: 10 }, hint: 'Play 10 games', play: 'your walk-up taunt' },
  { id: 'taunt-loser', cat: 'taunt', name: 'THE L', clip: 'tauntLoser', unlock: { stat: 'crews', n: 3 }, hint: 'Beat 3 crews on their turf', play: 'your walk-up taunt' },
  // ---- cleats: foot-region tint on the kit texture + a real leg on the bases
  { id: 'cleats-fire', cat: 'cleats', name: 'FIRE REDS', hex: '#ff3b1f', speedMult: 1.06, play: '+6% speed on the bases', stock: true, unlock: null, hint: 'FREE · yours from day one' },
  { id: 'cleats-ice', cat: 'cleats', name: 'ICE KICKS', hex: '#7fe7ff', speedMult: 1.06, stealMult: 1.1, play: '+6% speed · +10% steal jump', unlock: { stat: 'wins', n: 2 }, hint: 'Win 2 games' },
  { id: 'cleats-volt', cat: 'cleats', name: 'NEON VOLTS', hex: '#c8ff1f', speedMult: 1.08, play: '+8% speed on the bases', unlock: { stat: 'crews', n: 3 }, hint: 'Beat 3 crews on their turf' },
  { id: 'cleats-royal', cat: 'cleats', name: 'ROYALS', hex: '#8a4dff', speedMult: 1.08, play: '+8% speed on the bases', unlock: { stat: 'crews', n: 5 }, hint: 'Beat 5 crews on their turf' },
  { id: 'cleats-black', cat: 'cleats', name: 'BLACKOUTS', hex: '#15151a', speedMult: 1.10, play: '+10% speed on the bases', unlock: { stat: 'runs', n: 25 }, hint: '25 career runs' },
  { id: 'cleats-gold', cat: 'cleats', name: 'GOLD CROWNS', hex: '#f5c518', speedMult: 1.12, play: '+12% speed on the bases', unlock: { stat: 'king', n: 1 }, hint: 'Become King of the Streets' },
  // ---- uniforms: whole-kit tint override for YOUR squad
  { id: 'kit-blackout', cat: 'uniform', name: 'BLACKOUT KIT', hex: '#1b1b22', play: "your crew's kit", unlock: { stat: 'wins', n: 3 }, hint: '3 career wins' },
  { id: 'kit-whiteout', cat: 'uniform', name: 'WHITEOUT KIT', hex: '#f2f2f4', play: "your crew's kit", unlock: { stat: 'blowouts', n: 1 }, hint: 'Win by 5 or more' },
  { id: 'kit-gold', cat: 'uniform', name: 'GOLD RUSH KIT', hex: '#f5c518', play: "your crew's kit", unlock: { stat: 'king', n: 1 }, hint: 'Become King of the Streets' },
];

export const TAUNT_IDS = GEAR.filter((g) => g.cat === 'taunt').map((g) => g.id);

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
    defOuts: 0, steals: 0, pickleEscapes: 0, games: 0, perfects: 0,
    ...save.get('career', {}),
    crews: save.get('unlocks.crews', []).length,
    king: save.get('kingOfStreets', false) ? 1 : 0,
  };
}

/** Roll the career against the catalog; persist and RETURN newly unlocked
 *  items (post-game toast material). Stock items are owned from the start
 *  and never appear here. Never un-unlocks. */
export function checkUnlocks(save) {
  const career = careerGet(save);
  const owned = save.get('gear.unlocked', []);
  const fresh = GEAR.filter((g) => !g.stock && !owned.includes(g.id) && g.unlock && (career[g.unlock.stat] ?? 0) >= g.unlock.n);
  if (fresh.length) save.set('gear.unlocked', [...owned, ...fresh.map((g) => g.id)]);
  return fresh;
}

/** Stock items (e.g. the default taunt) are owned from day one; everything
 *  else needs to show up in the unlocked save list. */
export function isUnlocked(save, id) {
  return !!gearById(id)?.stock || save.get('gear.unlocked', []).includes(id);
}

/** Equip an unlocked item into its category slot (null/undefined id = bare). */
export function equipGear(save, cat, id) {
  if (id != null && (!isUnlocked(save, id) || gearById(id)?.cat !== cat)) return false;
  save.set('gear.equip', { ...save.get('gear.equip', {}), [cat]: id ?? null });
  return true;
}

/** Resolve the equip slots to catalog entries: {kick, cleats, uniform, taunt}.
 *  A category with a stock item (taunt) falls back to it when nothing's
 *  equipped or the equipped piece isn't owned; others fall back to null (bare). */
export function equippedGear(save) {
  const eq = save.get('gear.equip', {}) ?? {};
  const pick = (cat) => {
    const g = eq[cat] != null ? gearById(eq[cat]) : null;
    if (g && isUnlocked(save, g.id)) return g;
    return GEAR.find((x) => x.cat === cat && x.stock) ?? null;
  };
  return { kick: pick('kick'), cleats: pick('cleats'), uniform: pick('uniform'), taunt: pick('taunt') };
}
