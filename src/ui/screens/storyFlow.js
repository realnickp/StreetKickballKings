// Story glue shared by the story screens: who a scene is about (its fill-in
// vars) and playing a run of scenes over the UI root, then giving the menu its
// music back.
import { playStoryScene } from './storyScene.js';
import { SCENES } from '../../meta/storyScenes.js';
import { markFileUrl } from '../../meta/markTint.js';

export const captainOf = (team) => (team?.roster?.find((p) => p.pos === 'Captain') ?? team?.roster?.[0])?.nick ?? '';

export function varsFor(story, { rival = null, recruit = null, crewLogo = null } = {}) {
  return {
    crew: story?.crew?.name ?? '',
    crewLogo: crewLogo ?? (story?.crew ? markFileUrl(story.crew.mark) : ''),
    rival: rival?.name ?? '',
    city: rival?.city ?? '',
    captain: captainOf(rival),
    rivalLogo: rival?.logo ?? '',
    recruit: recruit?.nick ?? '',
  };
}

/** Play each scene id that exists, in order; ids with no script are skipped. */
export async function playScenes(ctx, ids, vars) {
  const played = [];
  for (const id of ids) {
    const scene = SCENES[id];
    if (!scene) continue;
    await playStoryScene(ctx.router.root, scene, { audio: ctx.audio, bus: ctx.bus, vars });
    played.push(id);
  }
  if (played.length) ctx.audio?.music('theme');
  return played;
}

export const teamById = (ctx, id) => ctx.data.teams.find((t) => t.id === id) ?? null;
