// THE HUB (story spec §4): where you are on the climb — the region's ladder,
// its bracket, Nationals — who's next, and one lit PLAY. Plus the intro that
// runs once after you name your crew, and REPLAY after you're King.
import { loadStory, saveStory, currentStop, markSeen } from '../../meta/story.js';
import { crewTeam } from '../../meta/yourCrew.js';
import { withTintedMarks } from '../../meta/markTint.js';
import { playScenes, varsFor, teamById } from './storyFlow.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const short = (t) => (t?.name ?? '').split(' ').slice(-1)[0].toUpperCase();

/** Scenes that haven't run yet among `ids` — played, then marked seen. */
async function playUnseen(ctx, story, ids, vars) {
  const fresh = ids.filter((id) => !story.seen.includes(id));
  if (!fresh.length) return story;
  await playScenes(ctx, fresh, vars);
  let s = story;
  for (const id of fresh) s = markSeen(s, id);
  saveStory(ctx.save, s);
  return s;
}

export function StoryIntroScreen(ctx) {
  return {
    async mount() {
      const story = loadStory(ctx.save);
      if (!story) return ctx.router.go('createCrew');
      const crewLogo = (await withTintedMarks(crewTeam(story), story.crew)).logo;
      await playUnseen(ctx, story, ['prologue', 'east-open'], varsFor(story, { crewLogo }));
      ctx.router.go('storyHub');
    },
  };
}

export function StoryHubScreen(ctx) {
  return {
    async mount(root) {
      let story = loadStory(ctx.save);
      if (!story) return ctx.router.go('createCrew');
      const map = ctx.data.storyMap;
      const stop = currentStop(story, map);
      const mine = await withTintedMarks(crewTeam(story), story.crew);
      // a new chapter opens the first time you land in it
      const opener = stop.kind === 'nationals' ? 'nationals-open' : stop.kind === 'king' ? null : `${stop.regionId}-open`;
      if (opener && !story.seen.includes(opener)) {
        story = await playUnseen(ctx, story, [opener], varsFor(story, { crewLogo: mine.logo }));
      }
      const region = map.regions.find((r) => r.id === stop.regionId);
      const rival = teamById(ctx, stop.teamId);
      const stageLine = {
        ladder: `RUNG ${stop.index + 1} OF 5`, semi: 'REGIONALS · SEMI', final: 'REGIONALS · FINAL',
        nationals: `NATIONALS · ${stop.index + 1} OF 5`, king: '👑 KING OF THE COURT',
      }[stop.kind];
      const title = stop.kind === 'nationals' ? 'NATIONALS' : stop.kind === 'king' ? 'KING OF THE COURT' : region.name;
      const s = el(`
        <div class="screen story-hub">
          <div class="sh-top">
            <div class="sh-crew"><img class="sh-crewlogo" alt="" /><b class="sh-crewname"></b></div>
            <div class="sh-coins">🪙 <b>${ctx.save.get('crowns', 0)}</b></div>
          </div>
          <h1 class="screen-title gold sh-title"></h1>
          <p class="sh-tag"></p>
          <div class="sh-ladder"></div>
          <div class="sh-next"></div>
          <div class="sh-actions">
            <button class="sh-play big-play bounce-beat">PLAY</button>
            <div class="coin-buttons">
              <button data-act="crew">CREW</button>
              <button data-act="menu">MENU</button>
            </div>
          </div>
        </div>`);
      root.appendChild(s);
      s.querySelector('.sh-crewlogo').src = mine.logo;
      s.querySelector('.sh-crewname').textContent = story.crew.name;
      s.querySelector('.sh-title').textContent = title;
      s.querySelector('.sh-tag').textContent = stop.kind === 'king'
        ? 'Every court in the country answers to you.'
        : stop.kind === 'nationals' ? 'Every region sent its best. You beat them once.' : region.tag;
      s.style.setProperty('--cc1', story.crew.primary);

      // the climb: five rungs, the bracket, Nationals
      const ladder = s.querySelector('.sh-ladder');
      if (stop.kind !== 'nationals' && stop.kind !== 'king') {
        region.ladder.forEach((id, i) => {
          const t = teamById(ctx, id);
          const state = stop.kind !== 'ladder' || i < stop.index ? 'won' : i === stop.index ? 'now' : 'locked';
          const node = el(`<div class="sh-rung ${state}"><img alt="" /><small></small><span>${state === 'won' ? '👑' : i + 1}</span></div>`);
          node.querySelector('img').src = t?.logo ?? '';
          node.querySelector('img').onerror = function () { this.style.visibility = 'hidden'; };
          node.querySelector('small').textContent = short(t);
          ladder.appendChild(node);
        });
        ladder.appendChild(el(`<div class="sh-rung bracket ${stop.kind === 'ladder' ? 'locked' : 'now'}"><b>🏆</b><small>REGIONALS</small></div>`));
      } else if (stop.kind === 'nationals') {
        map.regions.forEach((r, i) => {
          const t = teamById(ctx, story.finals[r.id]);
          const state = i < stop.index ? 'won' : i === stop.index ? 'now' : 'locked';
          const node = el(`<div class="sh-rung ${state}"><img alt="" /><small></small><span>${state === 'won' ? '👑' : i + 1}</span></div>`);
          node.querySelector('img').src = t?.logo ?? '';
          node.querySelector('small').textContent = short(t);
          ladder.appendChild(node);
        });
      }

      // who's next
      const next = s.querySelector('.sh-next');
      if (rival) {
        const card = el(`<div class="sh-card"><img alt="" /><div><small class="sh-stage"></small><b></b><span></span></div></div>`);
        card.querySelector('img').src = rival.logo;
        card.querySelector('img').onerror = function () { this.style.visibility = 'hidden'; };
        card.querySelector('.sh-stage').textContent = stageLine;
        card.querySelector('b').textContent = rival.name.toUpperCase();
        card.querySelector('span').textContent = rival.city.toUpperCase();
        card.style.setProperty('--rc', rival.colors.primary);
        next.appendChild(card);
      } else if (stop.kind === 'king') {
        next.appendChild(el(`<div class="sh-card king"><div><small>${stageLine}</small><b>RUN IT BACK</b><span>Pick any crew you beat — coins, no pressure.</span></div></div>`));
      }

      const play = s.querySelector('.sh-play');
      if (stop.kind === 'king') {
        play.textContent = 'REPLAY';
        play.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); ctx.router.go('storyReplay'); });
      } else {
        // { once }: a double tap must not build two matches (the second would orphan the first)
        play.addEventListener('pointerdown', () => { play.disabled = true; ctx.bus.emit('sfx', 'bassdrop'); ctx.startStoryMatch?.(); }, { once: true });
      }
      s.querySelector('[data-act="crew"]').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); ctx.router.go('crewRoom'); });
      s.querySelector('[data-act="menu"]').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); ctx.router.go('menu'); });
    },
  };
}

/** After the crown: any crew you beat, again — ladder coins, no story movement. */
export function StoryReplayScreen(ctx) {
  return {
    mount(root) {
      const story = loadStory(ctx.save);
      if (!story) return ctx.router.go('menu');
      const s = el(`<div class="screen story-hub"><h1 class="screen-title gold">RUN IT BACK</h1><div class="sh-replay"></div>
        <div class="coin-buttons"><button data-act="back">BACK</button></div></div>`);
      root.appendChild(s);
      const grid = s.querySelector('.sh-replay');
      for (const id of story.beaten) {
        const t = teamById(ctx, id);
        if (!t) continue;
        const b = el(`<button class="sh-card"><img alt="" /><div><b></b><span></span></div></button>`);
        b.querySelector('img').src = t.logo;
        b.querySelector('b').textContent = t.name.toUpperCase();
        b.querySelector('span').textContent = t.city.toUpperCase();
        b.addEventListener('pointerdown', () => {
          if (grid.dataset.going) return; // one match at a time
          grid.dataset.going = '1';
          ctx.bus.emit('sfx', 'bassdrop');
          ctx.startStoryMatch?.({ replay: id });
        });
        grid.appendChild(b);
      }
      s.querySelector('[data-act="back"]').addEventListener('pointerdown', () => ctx.router.go('storyHub'));
    },
  };
}
