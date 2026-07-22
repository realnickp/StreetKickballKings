// Crew trophies (Win It): beat a crew ON THEIR home field, take their ball.
// Headless — screens call these; SaveManager persists. Winning is the economy.

/** Beat `homeTeamId` on their turf. Returns {claimed, count, king} — king fires
 *  the FIRST time the 9th rival falls. */
export function claimTrophy(save, homeTeamId) {
  const crews = save.get('unlocks.crews', []);
  if (crews.includes(homeTeamId)) return { claimed: false, count: crews.length, king: false };
  const next = [...crews, homeTeamId];
  save.set('unlocks.crews', next);
  const wasKing = save.get('kingOfStreets', false);
  const king = next.length >= 9 && !wasKing;
  if (king) save.set('kingOfStreets', true);
  return { claimed: true, count: next.length, king };
}

export function hasTrophy(save, teamId) {
  return save.get('unlocks.crews', []).includes(teamId);
}

/** Equip a beaten crew's ball + kick style (or null to go back to the classic). */
export function equipCrew(save, teamId) {
  if (teamId !== null && !hasTrophy(save, teamId)) return false;
  save.set('equip', teamId === null ? null : { ball: teamId, kickStyle: teamId });
  return true;
}

export function equippedCrew(save) {
  return save.get('equip', null)?.ball ?? null;
}
