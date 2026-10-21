// STORY MODE — King of the Court (spec 2026-10-20). Headless like trophies.js:
// pure functions over one plain `story` object, screens call these and
// SaveManager persists it under ONE key. Never mutates its input — every
// transition hands back a new object, so a half-applied result can't exist.
//
// The climb: five regions, each a LADDER of five crews (weakest → strongest),
// then a bracket — SEMI vs rung 4, FINAL vs rung 5 (lose the final, re-enter at
// the semi). Then NATIONALS: a rematch with every regional finalist, in region
// order, the last on THE CROWN. Win that and you're King of the Court.

export const STORY_KEY = 'story';
const VERSION = 1;
const LADDER = 5;
const PER_REGION = LADDER + 2; // ladder + semi + final

export function newStory({ crew, roster }) {
  return {
    v: VERSION, crew, roster, bench: [],
    region: 0, rung: 0, phase: 'ladder',
    finals: {}, beaten: [], recruited: [], seen: [], king: false,
  };
}

const totalStops = (map) => map.regions.length * PER_REGION + map.regions.length;

/** Where you stand: who's next, what kind of game, how far along (0…1). */
export function currentStop(story, map) {
  const regions = map.regions;
  const last = totalStops(map) - 1;
  const at = (kind, regionId, teamId, index, total, ordinal, fieldId = null) =>
    ({ kind, regionId, teamId, index, total, progress01: Math.min(1, ordinal / last), fieldId });
  if (story.king) return at('king', null, null, 0, 0, last);
  if (story.phase === 'nationals') {
    const k = story.rung;
    const r = regions[k];
    const fieldId = k === regions.length - 1 ? map.nationals.finalField : null;
    return at('nationals', r.id, story.finals[r.id], k, regions.length, regions.length * PER_REGION + k, fieldId);
  }
  const r = regions[story.region];
  const base = story.region * PER_REGION;
  if (story.phase === 'semi') return at('semi', r.id, r.ladder[LADDER - 2], 0, 2, base + LADDER);
  if (story.phase === 'final') return at('final', r.id, r.ladder[LADDER - 1], 1, 2, base + LADDER + 1);
  return at('ladder', r.id, r.ladder[story.rung], story.rung, LADDER, base + story.rung);
}

/** Apply one game. Returns the next story and the beats it earned, in order:
 *  'loss' | 'win', 'rungUp', 'bracket', 'final', 'regionChamp', 'nationals', 'king'. */
export function applyResult(story, map, { won }) {
  if (story.king) return { story, events: [] };
  if (!won) {
    // lose the FINAL and you re-enter the bracket at the semi (spec §4)
    const back = story.phase === 'final' ? { ...story, phase: 'semi' } : story;
    return { story: back, events: ['loss'] };
  }
  const stop = currentStop(story, map);
  const s = { ...story, beaten: story.beaten.includes(stop.teamId) ? story.beaten : [...story.beaten, stop.teamId] };
  const events = ['win'];
  if (stop.kind === 'ladder') {
    if (s.rung + 1 < LADDER) { s.rung += 1; events.push('rungUp'); }
    else { s.phase = 'semi'; s.rung = 0; events.push('bracket'); }
  } else if (stop.kind === 'semi') {
    s.phase = 'final'; events.push('final');
  } else if (stop.kind === 'final') {
    s.finals = { ...s.finals, [stop.regionId]: stop.teamId };
    events.push('regionChamp');
    if (s.region + 1 < map.regions.length) { s.region += 1; s.rung = 0; s.phase = 'ladder'; }
    else { s.phase = 'nationals'; s.rung = 0; events.push('nationals'); }
  } else if (stop.kind === 'nationals') {
    if (s.rung + 1 < map.regions.length) s.rung += 1;
    else { s.king = true; events.push('king'); }
  }
  return { story: s, events };
}

export function markSeen(story, sceneId) {
  return story.seen.includes(sceneId) ? story : { ...story, seen: [...story.seen, sceneId] };
}

/** The saved story, or null for none / a version this build can't read. */
export function loadStory(save) {
  const s = save.get(STORY_KEY, null);
  return s && s.v === VERSION ? s : null;
}

export function saveStory(save, story) {
  save.set(STORY_KEY, story);
}
