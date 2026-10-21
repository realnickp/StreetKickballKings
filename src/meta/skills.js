// SKILLS (dev, 2026-10-20: "build the skills you can gain and improve your
// team"): hit 8 in a stat — by training, or by recruiting someone who already
// has it — and that player EARNS the stat's skill, an edge on top of the stat
// itself. Story matches only, like every stat (playerStats.js). Rivals with an
// 8 have the skill too, which is half of why the top of the climb bites.

export const SKILL_AT = 8;

export const SKILLS = {
  power: { id: 'moonshot', name: 'MOONSHOT', icon: '🚀', mult: 1.08, play: '+8% kick power' },
  speed: { id: 'burner', name: 'BURNER', icon: '🔥', mult: 1.06, play: '+6% on the bases' },
  arm: { id: 'cannon', name: 'CANNON', icon: '💥', mult: 1.08, play: '+8% throw speed' },
  glove: { id: 'vacuum', name: 'VACUUM', icon: '🧲', mult: 1.1, play: '+10% catch reach' },
};

const statsOf = (p) => p?.stats ?? p?.data?.stats ?? {};

/** Every skill a player (roster entry or match character) has earned. */
export function skillsOf(player) {
  const st = statsOf(player);
  return Object.entries(SKILLS).filter(([stat]) => (st[stat] ?? 0) >= SKILL_AT).map(([, s]) => s);
}

/** The skill's multiplier for `stat` — 1 off-story or below the bar. */
export function skillMult(player, stat, on, _tuning) {
  return on && (statsOf(player)[stat] ?? 0) >= SKILL_AT ? SKILLS[stat].mult : 1;
}

/** Skills `after` has that `before` didn't — the SKILL UNLOCKED moment. */
export function newSkills(before, after) {
  const had = new Set(skillsOf(before).map((s) => s.id));
  return skillsOf(after).filter((s) => !had.has(s.id));
}
