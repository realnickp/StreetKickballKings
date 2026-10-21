// THE CREW ROOM (story spec §6): your eight, their four stats, a + on each that
// costs coins (training), and the bench — tap a bench player, then the player
// they replace. Recruits wear a FROM badge naming the crew you took them from.
import { loadStory, saveStory, resetStory, DIFFICULTIES, difficultyOf, setDifficulty } from '../../meta/story.js';
import { skillsOf, newSkills, SKILL_AT } from '../../meta/skills.js';
import { train, trainCost, STATS } from '../../meta/storyEconomy.js';
import { swapBench } from '../../meta/recruit.js';
import { teamById } from './storyFlow.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const LABEL = { power: 'PWR', speed: 'SPD', arm: 'ARM', glove: 'HND' };

export function CrewRoomScreen(ctx) {
  return {
    mount(root) {
      let story = loadStory(ctx.save);
      if (!story) return ctx.router.go('createCrew');
      const tuning = ctx.data.tuning;
      let benchPick = null;
      const s = el(`
        <div class="screen crew-room">
          <div class="sh-top"><h1 class="screen-title gold cr-title"></h1><div class="sh-coins">🪙 <b class="cr-coins"></b></div></div>
          <div class="cr-diff"><span>DIFFICULTY</span><div class="cr-diff-row"></div></div>
          <p class="cr-hint">Wins pay coins. Coins make your crew better — one point at a time.</p>
          <div class="cr-list"></div>
          <div class="cr-bench-wrap"><div class="cc-label">BENCH</div><div class="cr-bench"></div></div>
          <div class="coin-buttons">
            <button data-act="edit">EDIT CREW</button>
            <button data-act="back">BACK</button>
          </div>
          <button class="cr-reset" data-act="reset">START OVER</button>
        </div>`);
      root.appendChild(s);
      s.style.setProperty('--cc1', story.crew.primary);

      const render = () => {
        s.querySelector('.cr-title').textContent = story.crew.name;
        const coins = ctx.save.get('crowns', 0);
        s.querySelector('.cr-coins').textContent = coins;
        const list = s.querySelector('.cr-list');
        list.replaceChildren();
        for (const p of story.roster) {
          const from = p.from ? teamById(ctx, p.from) : null;
          const card = el(`<div class="cr-card ${benchPick ? 'swappable' : ''}">
            <div class="cr-head"><b class="cr-nick"></b><small class="cr-pos"></small><span class="cr-from"></span></div>
            <div class="cr-skills"></div>
            <div class="cr-stats"></div></div>`);
          card.querySelector('.cr-nick').textContent = p.nick;
          card.querySelector('.cr-pos').textContent = `#${p.number ?? ''} ${p.pos ?? ''}`;
          if (from) card.querySelector('.cr-from').textContent = `FROM ${from.name.split(' ').slice(-1)[0].toUpperCase()}`;
          for (const sk of skillsOf(p)) {
            const chip = el('<span class="cr-skill"></span>');
            chip.textContent = `${sk.icon} ${sk.name}`;
            chip.title = sk.play;
            card.querySelector('.cr-skills').appendChild(chip);
          }
          const stats = card.querySelector('.cr-stats');
          for (const st of STATS) {
            const v = p.stats[st];
            const cost = trainCost(v, tuning);
            const row = el(`<div class="cr-stat"><span>${LABEL[st]}</span><div class="stat-bar"><i style="width:${v * 10}%"></i></div><em>${v}</em><button class="cr-up"></button></div>`);
            const btn = row.querySelector('.cr-up');
            btn.textContent = cost === Infinity ? 'MAX' : `+ ${cost}`;
            btn.disabled = cost === Infinity || coins < cost;
            btn.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              const r = train(story, ctx.save, p.id, st, tuning);
              if (!r.ok) { ctx.bus.emit('sfx', 'scratch'); return; }
              const gained = newSkills(p, r.story.roster.find((x) => x.id === p.id));
              story = r.story;
              saveStory(ctx.save, story);
              ctx.bus.emit('sfx', 'unlock');
              render();
              for (const sk of gained) skillToast(s, p.nick, sk, ctx);
            });
            stats.appendChild(row);
          }
          card.addEventListener('pointerdown', () => {
            if (!benchPick) return;
            story = swapBench(story, p.id, benchPick);
            benchPick = null;
            saveStory(ctx.save, story);
            ctx.bus.emit('sfx', 'juke');
            render();
          });
          list.appendChild(card);
        }
        const bench = s.querySelector('.cr-bench');
        bench.replaceChildren();
        s.querySelector('.cr-bench-wrap').style.display = story.bench.length ? '' : 'none';
        for (const p of story.bench) {
          const chip = el(`<button class="cr-chip ${benchPick === p.id ? 'on' : ''}"></button>`);
          chip.textContent = `${p.nick} · ${Math.max(...STATS.map((st) => p.stats[st]))}`;
          chip.addEventListener('pointerdown', () => { benchPick = benchPick === p.id ? null : p.id; render(); });
          bench.appendChild(chip);
        }
        s.querySelector('.cr-hint').textContent = benchPick
          ? 'Now tap the player they replace.'
          : 'Wins pay coins. Coins make your crew better — one point at a time.';
      };
      // CHILL / STREET / KING — shifts every rival a stat point and an AI tier
      const diffRow = s.querySelector('.cr-diff-row');
      const paintDiff = () => diffRow.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.d === difficultyOf(story)));
      for (const d of DIFFICULTIES) {
        const b = el(`<button data-d="${d}">${d.toUpperCase()}</button>`);
        b.addEventListener('pointerdown', () => {
          story = setDifficulty(story, d);
          saveStory(ctx.save, story);
          ctx.bus.emit('sfx', 'juke');
          paintDiff();
        });
        diffRow.appendChild(b);
      }
      paintDiff();
      render();
      s.querySelector('[data-act="edit"]').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); ctx.router.go('createCrew', { edit: true }); });
      armStartOver(s.querySelector('[data-act="reset"]'), ctx);
      s.querySelector('[data-act="back"]').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); ctx.router.go('storyHub'); });
    },
  };
}

/** START OVER, two taps: the first arms it (and says what it wipes), the second starts a new crew. */
export function armStartOver(btn, ctx) {
  let armed = null;
  btn.addEventListener('pointerdown', () => {
    if (!armed) {
      btn.classList.add('armed');
      btn.textContent = 'TAP AGAIN — NEW CREW, CLIMB WIPED';
      ctx.bus.emit('sfx', 'scratch');
      armed = setTimeout(() => { armed = null; btn.classList.remove('armed'); btn.textContent = 'START OVER'; }, 3500);
      return;
    }
    clearTimeout(armed);
    resetStory(ctx.save);
    ctx.bus.emit('sfx', 'juke');
    ctx.router.go('createCrew');
  });
}

/** SKILL UNLOCKED — the moment a stat hits SKILL_AT (8). */
export function skillToast(root, nick, skill, ctx) {
  const t = el('<div class="skill-toast"><small>SKILL UNLOCKED</small><b></b><span></span></div>');
  t.querySelector('b').textContent = `${skill.icon} ${skill.name}`;
  t.querySelector('span').textContent = `${nick} · ${skill.play}`;
  root.appendChild(t);
  ctx.bus.emit('sfx', 'crowd-cheer');
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}
