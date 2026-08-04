// Crew signature walkout routines (dev, 2026-08-04: "make each team do
// different dances but all choreographed"). Two parts per crew — partA plays
// on squad entry, partB at the +4.6 s switch — frame-synced across the whole
// wedge by the single play() burst in lineupIntro. Personality-matched:
// the Monarchs OWN Thriller (the crown), everyone else dances their city.
export const TEAM_ROUTINES = {
  monarchs: ['thriller1', 'thriller2'],   // Baltimore — the crown's identity
  snappers: ['danceLock', 'danceTut'],    // New York — locking into tuts
  bullies: ['danceStep', 'danceLock'],    // Brooklyn — stomp then lock
  funk: ['danceWave', 'danceSilly'],      // Philadelphia — the funk flows
  marauders: ['danceStep', 'danceWave'],  // Akron — grind into glide
  metros: ['danceTut', 'danceStep'],      // Washington DC — precision pocket
  kestrals: ['danceLock', 'danceWave'],   // Chicago — cold lock, windy wave
  gilas: ['danceSilly', 'danceStep'],     // Phoenix — heat-crazed stomp
  hustlers: ['danceChicken', 'danceSilly'], // Memphis — grit and gags
  threshers: ['danceWave', 'danceLock'],  // Los Angeles — smooth then locked
};

/** A crew's two-part routine. Unmapped crews split the Thriller parts by
 *  side, so any matchup still shows two DIFFERENT choreographed shows. */
export function routineFor(teamId, side) {
  return TEAM_ROUTINES[teamId] ?? (side === 'home' ? ['thriller3', 'thriller4'] : ['thriller1', 'thriller2']);
}
