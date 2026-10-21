// DEV ONLY (?go=storyDev): plays the fixture scene so the harness can check the
// phone without a save, a crew or a match. Unlinked from every menu.
import { playStoryScene } from './storyScene.js';

export function StoryDevScreen(ctx) {
  return {
    async mount(root) {
      const { default: scene } = await import('../../data/story/fixtures/test-scene.json');
      window.__storyScene = { done: false };
      await playStoryScene(root, scene, {
        audio: ctx.audio, bus: ctx.bus,
        vars: { crew: 'EASTSIDE', captain: 'Big Mo', rival: 'Brooklyn Bullies', city: 'Brooklyn', rivalLogo: 'assets/logos/bullies.png', crewLogo: 'assets/logos/monarchs.png' },
      });
      window.__storyScene.done = true;
    },
  };
}
