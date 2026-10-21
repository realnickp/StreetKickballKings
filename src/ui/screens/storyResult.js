// AFTER A STORY GAME (story spec §4–6): the result lands in ONE save write
// (climb + coins), then the box score, the group chat, the recruit DM and the
// take-them-or-not card, any chapter beats, and back to the hub.
import { loadStory, saveStory, applyResult, resultPlan } from '../../meta/story.js';
import { payout } from '../../meta/storyEconomy.js';
import { adsAvailable, offerDoubleCoins } from '../../meta/storyHooks.js';
import { recruitOffer, acceptRecruit, declineRecruit } from '../../meta/recruit.js';
import { crewTeam } from '../../meta/yourCrew.js';
import { withTintedMarks } from '../../meta/markTint.js';
import { playScenes, varsFor, teamById } from './storyFlow.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const STATS = ['power', 'speed', 'arm', 'glove'];
const LABEL = { power: 'PWR', speed: 'SPD', arm: 'ARM', glove: 'HND' };

/** Apply a finished story game to the save. Pure-ish: everything it changes
 *  goes through `save`; returns what the screen needs to show. */
export function settleStoryGame(ctx, { won, stop, replay = false, score, stats, playerSide }) {
  const save = ctx.save;
  const map = ctx.data.storyMap;
  const tuning = ctx.data.tuning;
  const story = loadStory(save);
  const rival = teamById(ctx, stop.teamId);
  let next = story;
  let events = [won ? 'win' : 'loss'];
  let offer = null;
  if (!replay) {
    ({ story: next, events } = applyResult(story, map, { won }));
    if (won && stop.kind !== 'nationals' && rival) offer = recruitOffer(next, rival);
  }
  const coins = replay ? (won ? tuning.story.pay.ladderWin : tuning.story.pay.loss) : payout(stop, won, events, tuning);
  save.set('crowns', save.get('crowns', 0) + coins);
  if (next !== story) saveStory(save, next);
  if (events.includes('king')) save.set('kingOfStreets', true); // the Locker's King gear keys off this
  let fresh = [];
  if (ctx.unlocks) {
    const mine = Number(score?.[playerSide]) || 0;
    const theirs = Number(score?.[playerSide === 'away' ? 'home' : 'away']) || 0;
    ctx.unlocks.careerAdd(save, {
      games: 1, wins: won ? 1 : 0, roadWins: won ? 1 : 0, blowouts: won && mine - theirs >= 5 ? 1 : 0,
      runs: mine, hr: stats?.hr ?? 0, defOuts: stats?.defOuts ?? 0, steals: stats?.steals ?? 0,
      pickleEscapes: stats?.pickleEscapes ?? 0, perfects: stats?.perfects ?? 0,
    });
    fresh = ctx.unlocks.checkUnlocks(save);
  }
  return { story: next, events, offer, coins, fresh, rival };
}

export function StoryResultScreen(ctx) {
  return {
    async mount(root, { winner, score, stats, playerSide, stop, replay = false }) {
      const won = winner === playerSide;
      const res = settleStoryGame(ctx, { won, stop, replay, score, stats, playerSide });
      let story = res.story;
      ctx.bus.emit('vo', 'gameover');
      const mine = await withTintedMarks(crewTeam(story), story.crew);
      const vars = varsFor(story, { rival: res.rival, recruit: res.offer, crewLogo: mine.logo });

      // 1. the box score
      await new Promise((done) => {
        const s = el(`
          <div class="screen postgame-screen">
            <h1 class="screen-title ${won ? 'gold' : ''}">${won ? 'W' : 'TOOK THE L'}</h1>
            <div class="mixtape">
              <div class="tape-row"><span class="r-a"></span><b>${Number(score?.[playerSide]) || 0}</b></div>
              <div class="tape-row"><span class="r-b"></span><b>${Number(score?.[playerSide === 'away' ? 'home' : 'away']) || 0}</b></div>
              <div class="tape-row dim"><span>COINS</span><b>+${res.coins} 🪙</b></div>
              ${res.fresh.map(() => '<div class="tape-row gold-row"><span>🔓 UNLOCKED — CHECK THE LOCKER</span><b class="r-gear"></b></div>').join('')}
            </div>
            <div class="coin-buttons">${won && adsAvailable() ? '<button data-act="x2">2× COINS ▶</button>' : ''}<button data-act="go">CONTINUE</button></div>
          </div>`);
        s.querySelector('.r-a').textContent = story.crew.name;
        s.querySelector('.r-b').textContent = (res.rival?.name ?? '').toUpperCase();
        s.querySelectorAll('.r-gear').forEach((b, i) => { b.textContent = res.fresh[i].name; });
        root.appendChild(s);
        res.fresh.forEach((_, i) => setTimeout(() => ctx.bus.emit('sfx', 'unlock'), 400 + i * 260));
        s.querySelector('[data-act="x2"]')?.addEventListener('pointerdown', async (e) => {
          e.currentTarget.disabled = true;
          if (await offerDoubleCoins()) ctx.save.set('crowns', ctx.save.get('crowns', 0) + res.coins);
        }, { once: true });
        s.querySelector('[data-act="go"]').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); s.remove(); done(); }, { once: true });
      });
      if (replay) return ctx.router.go('storyReplay');

      // 2. the scenes — the recruit card slots in right after the recruit DM
      const ids = resultPlan(res.events, stop, !!res.offer);
      const recruitId = `${stop.regionId}-${stop.teamId}-recruit`;
      for (const id of ids) {
        await playScenes(ctx, [id], vars);
        if (id === recruitId && res.offer) story = await recruitCard(ctx, root, story, res.offer, res.rival);
      }
      if (res.offer && !ids.includes(recruitId)) story = await recruitCard(ctx, root, story, res.offer, res.rival);
      ctx.audio?.music('theme');
      ctx.router.go('storyHub');
    },
  };
}

/** TAKE THEM OR NOT: the recruit's card, and if yes, who sits for them. */
function recruitCard(ctx, root, story, offer, rival) {
  return new Promise((done) => {
    const s = el(`
      <div class="screen recruit-card">
        <small class="rc-from"></small>
        <h1 class="screen-title gold rc-name"></h1>
        <p class="rc-pos"></p>
        <div class="rc-stats"></div>
        <p class="rc-ask">Wants to roll with you. Who sits?</p>
        <div class="rc-bench"></div>
        <div class="coin-buttons"><button data-act="no">NAH, WE GOOD</button></div>
      </div>`);
    s.querySelector('.rc-from').textContent = `FROM THE ${(rival?.name ?? '').toUpperCase()}`;
    s.querySelector('.rc-name').textContent = offer.nick;
    s.querySelector('.rc-pos').textContent = `#${offer.number ?? ''} ${offer.pos ?? ''}`;
    s.querySelector('.rc-stats').innerHTML = STATS.map((st) =>
      `<div class="stat-row"><span>${LABEL[st]}</span><div class="stat-bar"><i style="width:${offer.stats[st] * 10}%"></i></div><em>${offer.stats[st]}</em></div>`).join('');
    const bench = s.querySelector('.rc-bench');
    for (const p of story.roster) {
      const b = el('<button class="cr-chip"></button>');
      b.textContent = `${p.nick} · ${STATS.map((st) => p.stats[st]).join('/')}`;
      b.addEventListener('pointerdown', () => {
        const next = acceptRecruit(story, offer, p.id);
        saveStory(ctx.save, next);
        ctx.bus.emit('sfx', 'crowd-cheer');
        s.remove();
        done(next);
      }, { once: true });
      bench.appendChild(b);
    }
    s.querySelector('[data-act="no"]').addEventListener('pointerdown', () => {
      const next = declineRecruit(story, offer);
      saveStory(ctx.save, next);
      ctx.bus.emit('sfx', 'scratch');
      s.remove();
      done(next);
    }, { once: true });
    root.appendChild(s);
  });
}

