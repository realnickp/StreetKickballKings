// City soundtrack registry (dev, 2026-08-04: "the music for each field should
// represent the city that its in but hip hop style"). Pure data — headless-
// testable; AudioBus merges CITY_TRACKS into its music table. Every track is
// a generated original instrumental loop, one hip hop dialect per crew city.
export const CITY_TRACKS = {
  'city-baltimore': 'assets/audio/music/city/baltimore.m4a',       // B-more club breaks
  'city-new-york': 'assets/audio/music/city/new-york.m4a',         // 90s boom-bap
  'city-brooklyn': 'assets/audio/music/city/brooklyn.m4a',         // drill
  'city-philadelphia': 'assets/audio/music/city/philadelphia.m4a', // soul-sample boom-bap
  'city-akron': 'assets/audio/music/city/akron.m4a',               // moody midwest bounce
  'city-washington-dc': 'assets/audio/music/city/washington-dc.m4a', // go-go swing
  'city-chicago': 'assets/audio/music/city/chicago.m4a',           // drill, dark piano
  'city-phoenix': 'assets/audio/music/city/phoenix.m4a',           // lowrider desert trap
  'city-memphis': 'assets/audio/music/city/memphis.m4a',           // phonk / crunk
  'city-los-angeles': 'assets/audio/music/city/los-angeles.m4a',   // G-funk
};

/** Music-table id for a city name; the generic 'beat' pool when unknown.
 *  Periods/apostrophes ("D.C.", "St. Louis") are dropped rather than turned
 *  into dashes, so punctuation variants of the same city slug the same way. */
export function cityTrackId(city) {
  if (!city) return 'beat';
  const id = `city-${city.toLowerCase().replace(/[.']/g, '').replace(/[^a-z]+/g, '-')}`;
  return CITY_TRACKS[id] ? id : 'beat';
}
