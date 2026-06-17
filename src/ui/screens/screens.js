// All pre/post-game screens: Title, Menu, TeamSelect, CoinToss, PostGame.
// Mockup style: dark slate, orange/teal, graffiti marker accents.
import { playVideo } from '../../cinematics/videoPlayer.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const statBar = (label, v) => `
  <div class="stat-row">
    <span>${label}</span>
    <div class="stat-bar"><i style="width:${v * 10}%"></i></div>
  </div>`;

// ---- per-team kits ----------------------------------------------------------
// Every team has a DARK and a LIGHT uniform, and each is a REAL generated image
// (the signature colour + a contrasting alt), so teams never clash. The toggle
// just swaps which image is shown — NO runtime canvas tinting. `img` is the
// filename suffix ('' = base signature image, '-alt' = the generated contrast
// kit); `hex` drives the in-game 3D uniform so the preview matches the match.
const KITS = {
  monarchs:  { dark: { hex: '#16161A', img: '-alt' }, light: { hex: '#F5B312', img: '' } },
  snappers:  { dark: { hex: '#2E5944', img: '' }, light: { hex: '#ECE5D2', img: '-alt' } },
  bullies:   { dark: { hex: '#D7263D', img: '' }, light: { hex: '#F2F2F2', img: '-alt' } },
  funk:      { dark: { hex: '#1B2553', img: '' }, light: { hex: '#F4E3B2', img: '-alt' } },
  marauders: { dark: { hex: '#1C1C1C', img: '-alt' }, light: { hex: '#E0701A', img: '' } },
  metros:    { dark: { hex: '#2B2D4F', img: '' }, light: { hex: '#F4F4F0', img: '-alt' } },
  kestrals:  { dark: { hex: '#2C3035', img: '-alt' }, light: { hex: '#A8D8EA', img: '' } },
  gilas:     { dark: { hex: '#5A2A1F', img: '-alt' }, light: { hex: '#E8772E', img: '' } },
  hustlers:  { dark: { hex: '#1D8AC4', img: '' }, light: { hex: '#F1F4F8', img: '-alt' } },
  threshers: { dark: { hex: '#7A2417', img: '' }, light: { hex: '#EAD9A6', img: '-alt' } },
};
/** Resolve a team's kit for a tone ('dark'|'light'), falling back to the team's
 *  signature colour + base image for any team missing from the map. */
export function kitFor(team, tone) {
  return KITS[team.id]?.[tone] ?? { hex: team.colors.primary, img: '' };
}

// ---------- TITLE ----------
export function TitleScreen(ctx) {
  return {
    mount(root) {
      const s = el(`
        <div class="screen title-screen">
          <img class="title-logo" src="assets/branding/logo-square.png" alt="Street Kickball Kings" />
          <div class="tap-start bounce-beat">TAP TO START</div>
          <div class="title-foot">NO CLEATS. NO PROBLEM. <span>JUST GAME.</span></div>
        </div>`);
      root.appendChild(s);
      s.addEventListener('pointerdown', () => {
        ctx.audio.ensureCtx();
        ctx.audio.music('theme');
        ctx.bus.emit('sfx', 'scratch');
        ctx.router.go('menu');
      }, { once: true });
    },
  };
}

// ---------- MENU ----------
export function MenuScreen(ctx) {
  return {
    mount(root) {
      const save = ctx.save;
      const xp = save.get('xp', 0);
      const crowns = save.get('crowns', 0);
      const streak = save.get('streak', 0);
      const title = xp >= 2000 ? 'KING' : xp >= 1200 ? 'LEGEND' : xp >= 600 ? 'BALLER' : xp >= 250 ? 'HUSTLER' : 'ROOKIE';
      const s = el(`
        <div class="screen menu-screen">
          <button class="menu-settings" aria-label="sound settings">🔊</button>
          <div class="profile-strip">
            <div class="profile-id">
              <div class="pfp">👑</div>
              <div><b>KICKKING</b><span>${title}</span></div>
            </div>
            <div class="wallet"><span>🪙 ${crowns}</span><span>⭐ ${xp} XP</span></div>
          </div>
          <div class="streak-card">WIN STREAK <b>${streak}</b> 🔥</div>
          <img class="menu-logo" src="assets/branding/logo-square.png" alt="" />
          <button class="big-play bounce-beat">PLAY 1v1<small>VS AI · THE BLACKTOP</small></button>
          <div class="mode-cards">
            <div class="mode-card locked">CITY LEAGUE<small>SEASON — COMING SOON</small></div>
            <div class="mode-card locked">DERBY<small>COMING SOON</small></div>
          </div>
          <div class="daily-card">DAILY CHALLENGE<small>Hit 3 home runs — 0/3</small><b>+500 XP</b></div>
        </div>`);
      root.appendChild(s);
      s.querySelector('.big-play').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        ctx.router.go('teamSelect');
      });
      s.querySelector('.menu-settings').addEventListener('pointerdown', (e) => { e.stopPropagation(); ctx.showSettings?.(); });
    },
  };
}

// ---------- TEAM SELECT (Madden-style matchup: AWAY on the left, HOME on the
//            right, each a full standing player; cycle each side, then play.
//            You control the AWAY team; the match is played at the HOME team's
//            home field — so picking the HOME side chooses the stadium.) ----------
export function TeamSelectScreen(ctx) {
  return {
    mount(root) {
      const ready = ctx.data.teams.filter(t => t.status === 'ready');
      const sel = { away: 0, home: Math.min(1, ready.length - 1) }; // away = you, home = their field
      const kit = { away: 'dark', home: 'light' }; // default contrasting kits (one dark, one light)

      const sideHtml = (side, tag) => `
        <div class="m-side ${side}">
          <div class="m-tag ${side === 'home' ? 'rival' : ''}">${tag}</div>
          <div class="m-head">
            <img class="m-logo" alt="" />
            <h2 class="m-name"></h2>
            <span class="m-city"></span>
            <div class="m-stats"></div>
          </div>
          <div class="m-players">
            <img class="m-player woman" alt="" />
            <img class="m-player man" alt="" />
          </div>
          <div class="m-cycle">
            <button class="prev" aria-label="prev">‹</button>
            <button class="kit-toggle"><i class="kit-swatch"></i><span class="kit-label"></span></button>
            <button class="next" aria-label="next">›</button>
          </div>
        </div>`;

      const s = el(`
        <div class="screen matchup-screen">
          <h1 class="screen-title">SET THE MATCHUP</h1>
          <div class="matchup">
            ${sideHtml('away', 'AWAY')}
            ${sideHtml('home', 'HOME')}
            <div class="m-vs">VS</div>
          </div>
          <div class="matchup-foot">
            <button class="m-intro" data-side="away">▶ INTRO</button>
            <button class="m-start">START MATCH</button>
            <button class="m-intro" data-side="home">INTRO ◂</button>
          </div>
        </div>`);
      root.appendChild(s);

      const render = (side) => {
        const t = ready[sel[side]];
        const w = s.querySelector(`.m-side.${side}`);
        const k = kitFor(t, kit[side]);
        w.style.setProperty('--c1', k.hex); // accent + kit swatch reflect the chosen uniform
        w.style.setProperty('--c2', t.colors.secondary);
        w.querySelector('.kit-label').textContent = kit[side] === 'dark' ? 'DARK KIT' : 'LIGHT KIT';
        w.querySelector('.m-logo').src = t.logo;
        w.querySelector('.m-name').textContent = t.name;
        w.querySelector('.m-city').textContent = t.city.toUpperCase() + ' · ' + t.musicGenre.toUpperCase();
        const avg = (k) => t.roster.reduce((a, p) => a + p.stats[k], 0) / t.roster.length;
        w.querySelector('.m-stats').innerHTML =
          statBar('PWR', avg('power')) + statBar('SPD', avg('speed')) + statBar('ARM', avg('arm')) + statBar('GLV', avg('glove'));
        // a man + a woman, each shown in the SELECTED kit — REAL images, no tint.
        const setImg = (img, base) => {
          img.style.visibility = 'visible';
          const signature = `assets/players/${base}.png`;
          img.onerror = () => { // alt kit missing -> signature image -> generic team image
            img.onerror = () => { img.onerror = null; img.src = `assets/players/${t.id}.png`; };
            img.src = signature;
          };
          img.src = `assets/players/${base}${k.img}.png`;
        };
        setImg(w.querySelector('.m-player.man'), `${t.id}-man`);
        setImg(w.querySelector('.m-player.woman'), `${t.id}-woman`);
      };

      const cycle = (side, dir) => {
        const other = side === 'away' ? 'home' : 'away';
        let i = sel[side];
        do { i = (i + dir + ready.length) % ready.length; } while (i === sel[other]); // can't pick the same team
        sel[side] = i;
        ctx.bus.emit('sfx', 'juke');
        render(side);
      };

      for (const side of ['away', 'home']) {
        const w = s.querySelector(`.m-side.${side}`);
        w.querySelector('.prev').addEventListener('pointerdown', (e) => { e.stopPropagation(); cycle(side, -1); });
        w.querySelector('.next').addEventListener('pointerdown', (e) => { e.stopPropagation(); cycle(side, 1); });
        // tap the kit chip to flip this team's light/dark uniform
        w.querySelector('.kit-toggle').addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          kit[side] = kit[side] === 'dark' ? 'light' : 'dark';
          ctx.bus.emit('sfx', 'juke');
          render(side);
        });
        // swipe left/right on a side to cycle that team (fires on move, capture-safe)
        let sx = null, sy = null, swiped = false;
        w.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; swiped = false; try { w.setPointerCapture(e.pointerId); } catch {} });
        w.addEventListener('pointermove', (e) => {
          if (sx == null || swiped) return;
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy)) { swiped = true; cycle(side, dx < 0 ? 1 : -1); }
        });
        const endSwipe = () => { sx = null; };
        w.addEventListener('pointerup', endSwipe);
        w.addEventListener('pointercancel', endSwipe);
      }
      s.querySelectorAll('.m-intro').forEach((b) =>
        b.addEventListener('pointerdown', () => playVideo(ready[sel[b.dataset.side]].introVideo)));
      s.querySelector('.m-start').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'bassdrop');
        const kits = {
          away: kitFor(ready[sel.away], kit.away).hex,
          home: kitFor(ready[sel.home], kit.home).hex,
        };
        ctx.startMatchFlow(ready[sel.away], ready[sel.home], kits); // away = you, home = opponent (their field)
      });

      render('away');
      render('home');
    },
  };
}

// ---------- COIN TOSS (Higgsfield video ceremony) ----------
export function CoinTossScreen(ctx) {
  return {
    async mount(root, { scene, playerSide }) {
      const s = el(`
        <div class="screen coin-screen transparent">
          <h1 class="screen-title outline">COIN TOSS — CALL IT!</h1>
          <div class="coin-buttons">
            <button data-call="heads">HEADS</button>
            <button data-call="tails">TAILS</button>
          </div>
        </div>`);
      root.appendChild(s);

      s.querySelector('.coin-buttons').addEventListener('pointerdown', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const call = btn.dataset.call;
        s.querySelector('.coin-buttons').remove();
        s.querySelector('.screen-title').remove();

        // coin-only flip video (never reveals the result) → the reveal is the still below
        await playVideo('assets/video/coin-flip.mp4');

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const playerWon = result === call;
        ctx.bus.emit('sfx', 'crowd-cheer');

        // the real coin lands as a still — clean, no-wrap result card
        const card = el(`
          <div class="coin-result">
            <img class="coin-coin ${result}" src="assets/branding/coin-${result}.png" alt="${result}" />
            <div class="coin-flip-line">YOU CALLED ${call.toUpperCase()} · IT'S <b>${result.toUpperCase()}</b></div>
            <div class="coin-verdict ${playerWon ? 'win' : 'lose'}">${playerWon ? 'YOU WIN THE TOSS' : 'OPPONENT WINS THE TOSS'}</div>
            <div class="coin-choose"></div>
          </div>`);
        s.append(card);
        const choose = card.querySelector('.coin-choose');

        if (playerWon) {
          const pick = el(`
            <div class="coin-buttons">
              <button data-first="${playerSide}">KICK FIRST</button>
              <button data-first="${playerSide === 'home' ? 'away' : 'home'}">FIELD FIRST</button>
            </div>`);
          choose.append(pick);
          pick.addEventListener('pointerdown', (e2) => {
            const b = e2.target.closest('button');
            if (!b) return;
            ctx.beginMatch(b.dataset.first);
          });
        } else {
          const aiSide = playerSide === 'home' ? 'away' : 'home';
          const first = Math.random() < 0.85 ? aiSide : playerSide;
          choose.append(el(`<div class="coin-note">${first !== playerSide ? 'THEY ELECT TO KICK FIRST' : 'THEY PUT YOU UP FIRST'}</div>`));
          setTimeout(() => ctx.beginMatch(first), 1900);
        }
      });
    },
  };
}

// ---------- POST-GAME ----------
export function PostGameScreen(ctx) {
  return {
    mount(root, { winner, score, playerSide, teams }) {
      const won = winner === playerSide;
      const save = ctx.save;
      const xpGain = won ? 250 : 90;
      const crownGain = won ? 40 : 12;
      save.set('xp', save.get('xp', 0) + xpGain);
      save.set('crowns', save.get('crowns', 0) + crownGain);
      save.set('streak', won ? save.get('streak', 0) + 1 : 0);
      ctx.bus.emit('vo', 'gameover');

      const s = el(`
        <div class="screen postgame-screen">
          <h1 class="screen-title ${won ? 'gold' : ''}">${won ? '👑 CROWNED!' : 'TOOK THE L'}</h1>
          <div class="mixtape">
            <div class="tape-row"><span data-side-a></span><b>${Number(score.away)}</b></div>
            <div class="tape-row"><span data-side-b></span><b>${Number(score.home)}</b></div>
            <div class="tape-row dim"><span>RESPECT EARNED</span><b>+${xpGain} XP</b></div>
            <div class="tape-row dim"><span>CROWNS</span><b>+${crownGain} 🪙</b></div>
            <div class="tape-row dim"><span>WIN STREAK</span><b>${save.get('streak', 0)} 🔥</b></div>
          </div>
          <div class="coin-buttons">
            <button data-act="rematch">REMATCH</button>
            <button data-act="menu">MAIN MENU</button>
          </div>
        </div>`);
      root.appendChild(s);
      s.querySelector('[data-side-a]').textContent = 'SIDE A · ' + teams.away.name.toUpperCase();
      s.querySelector('[data-side-b]').textContent = 'SIDE B · ' + teams.home.name.toUpperCase();
      s.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        ctx.bus.emit('sfx', 'scratch');
        if (b.dataset.act === 'rematch') ctx.rematch();
        else ctx.backToMenu();
      });
    },
  };
}
