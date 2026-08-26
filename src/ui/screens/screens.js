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
            <div class="mode-card map-card">RUN THE MAP<small>${save.get('kingOfStreets', false) ? '👑 KING OF THE STREETS' : `${save.get('unlocks.crews', []).length}/9 CROWNS CLAIMED`}</small></div>
            <div class="mode-card locker-card">THE LOCKER<small>${save.get('gear.unlocked', []).length}/17 EARNED</small></div>
            <div class="mode-card locked">DERBY<small>COMING SOON</small></div>
          </div>
          <div class="daily-card">DAILY CHALLENGE<small>Hit 3 home runs — 0/3</small><b>+500 XP</b></div>
          <div class="menu-learn">
            <button class="menu-tutorial">🎓 TUTORIAL</button>
            <button class="menu-howto">📖 CONTROLS</button>
          </div>
        </div>`);
      root.appendChild(s);
      s.querySelector('.big-play').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        // first time out? run the playable drills (skippable inside), then play
        if (!save.get('tutorialPlayed', false)) return ctx.startTutorial?.();
        ctx.router.go('teamSelect');
      });
      s.querySelector('.map-card').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        if (!save.get('tutorialPlayed', false)) return ctx.startTutorial?.();
        ctx.router.go('map');
      });
      s.querySelector('.locker-card').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        ctx.router.go('locker');
      });
      s.querySelector('.menu-tutorial').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        ctx.startTutorial?.();
      });
      s.querySelector('.menu-howto').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        ctx.router.go('tutorial');
      });
      s.querySelector('.menu-settings').addEventListener('pointerdown', (e) => { e.stopPropagation(); ctx.showSettings?.(); });
    },
  };
}

// ---------- RUN THE MAP (Win It): beat every crew ON THEIR turf, take their
//            ball. 9 crowns = KING OF THE STREETS. No currency — winning IS
//            the economy. ----------
export function MapScreen(ctx) {
  return {
    mount(root) {
      const save = ctx.save;
      const { claimTrophy, hasTrophy, equipCrew, equippedCrew } = ctx.trophies;
      void claimTrophy;
      const teams = ctx.data.teams.filter((t) => t.status === 'ready');
      const fieldByTeam = Object.fromEntries(ctx.data.fields.map((f) => [f.homeTeam, f]));
      const count = save.get('unlocks.crews', []).length;
      const king = save.get('kingOfStreets', false);
      const equipped = equippedCrew(save);

      const s = el(`
        <div class="screen map-screen">
          <h1 class="screen-title gold">${king ? '👑 KING OF THE STREETS' : 'RUN THE MAP'}</h1>
          <p class="map-sub">${king ? 'Every block answers to you.' : `Beat every crew ON THEIR turf. ${count}/9 crowns claimed.`}</p>
          <div class="map-grid"></div>
          <p class="map-equip-label">TROPHY CASE — TAP A BEATEN CREW TO REP THEIR BALL</p>
          <div class="map-equip"></div>
          <div class="coin-buttons"><button data-act="menu">MAIN MENU</button></div>
        </div>`);
      const grid = s.querySelector('.map-grid');
      for (const t of teams) {
        const won = hasTrophy(save, t.id);
        const field = fieldByTeam[t.id];
        const node = el(`
          <div class="map-node ${won ? 'won' : ''}">
            <img src="assets/logos/${t.id}.png" alt="" onerror="this.remove()" />
            <b>${t.name.split(' ').pop().toUpperCase()}</b>
            <small>${field?.label ?? ''}</small>
            <span class="map-mark">${won ? '👑' : 'CHALLENGE'}</span>
          </div>`);
        if (!won) {
          node.addEventListener('pointerdown', () => {
            ctx.bus.emit('sfx', 'scratch');
            ctx.mapTarget = t.id; // TeamSelect locks the HOME side to this crew
            ctx.router.go('teamSelect');
          });
        }
        grid.appendChild(node);
      }
      const equipRow = s.querySelector('.map-equip');
      const beaten = teams.filter((t) => hasTrophy(save, t.id));
      const classic = el(`<div class="equip-chip ${equipped === null ? 'on' : ''}" style="--c:#c83232">CLASSIC</div>`);
      classic.addEventListener('pointerdown', () => { equipCrew(save, null); ctx.router.go('map'); });
      equipRow.appendChild(classic);
      for (const t of beaten) {
        const chip = el(`<div class="equip-chip ${equipped === t.id ? 'on' : ''}" style="--c:${t.colors.primary}">${t.name.split(' ').pop().toUpperCase()}</div>`);
        chip.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); equipCrew(save, t.id); ctx.router.go('map'); });
        equipRow.appendChild(chip);
      }
      if (!beaten.length) equipRow.appendChild(el('<small class="map-none">No trophies yet — go take one.</small>'));
      s.querySelector('[data-act="menu"]').addEventListener('pointerdown', () => ctx.router.go('menu'));
      root.appendChild(s);
    },
  };
}

// ---------- THE LOCKER: earnable gear (special kicks, cleats, uniforms).
//            Milestones are the price tag — no currency. Silhouetted until
//            earned, tap an owned piece to rock it. ----------
export function LockerScreen(ctx) {
  return {
    mount(root) {
      const save = ctx.save;
      const { GEAR, isUnlocked, equipGear, equippedGear, careerGet } = ctx.unlocks;
      const eq = equippedGear(save);
      const career = careerGet(save);
      const CATS = [
        ['kick', 'SPECIAL KICKS — FILL THE CROWN METER, THEN LET IT RIP'],
        ['cleats', 'CLEATS'],
        ['uniform', 'UNIFORMS'],
      ];
      const s = el(`
        <div class="screen locker-screen">
          <h1 class="screen-title gold">THE LOCKER</h1>
          <p class="map-sub">Earn it on the block. Tap it to rock it.</p>
          <div class="locker-rows"></div>
          <p class="locker-career">W ${career.wins} · HR ${career.hr} · STEALS ${career.steals} · GLOVE ${career.defOuts} · ESCAPES ${career.pickleEscapes} · CREWS ${career.crews}/9</p>
          <div class="coin-buttons"><button data-act="menu">MAIN MENU</button></div>
        </div>`);
      const rows = s.querySelector('.locker-rows');
      for (const [cat, label] of CATS) {
        rows.appendChild(el(`<p class="map-equip-label">${label}</p>`));
        const row = el('<div class="map-equip locker-row"></div>');
        const bare = el(`<div class="equip-chip ${eq[cat] ? '' : 'on'}" style="--c:#7a7a85">${cat === 'kick' ? 'STOCK KICK' : 'CLASSIC'}</div>`);
        bare.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'juke'); equipGear(save, cat, null); ctx.router.go('locker'); });
        row.appendChild(bare);
        for (const g of GEAR.filter((x) => x.cat === cat)) {
          const own = isUnlocked(save, g.id);
          const chip = el(`
            <div class="equip-chip locker-chip ${own ? '' : 'locked'} ${eq[cat]?.id === g.id ? 'on' : ''}" style="--c:${g.hex ?? '#e8792e'}">
              ${own ? g.name : '🔒 ' + g.name}<small>${own ? '' : g.hint.toUpperCase()}</small>
            </div>`);
          if (own) {
            chip.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); equipGear(save, cat, g.id); ctx.router.go('locker'); });
          }
          row.appendChild(chip);
        }
        rows.appendChild(row);
      }
      s.querySelector('[data-act="menu"]').addEventListener('pointerdown', () => ctx.router.go('menu'));
      root.appendChild(s);
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
      // Run the Map challenge: the HOME side is the crew you called out — locked.
      const mapLock = ctx.mapTarget && ready.some((t) => t.id === ctx.mapTarget);
      if (mapLock) {
        sel.home = ready.findIndex((t) => t.id === ctx.mapTarget);
        if (sel.away === sel.home) sel.away = (sel.home + 1) % ready.length;
      }

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
        if (mapLock && side === 'home') return; // you called THEM out — no swapping rivals
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
      // ONE quick opaque card (dev, 2026-08-04: "more basic and quick") —
      // no flip video, no 3D field peeking through, three taps max
      const s = el(`
        <div class="screen coin-screen">
          <div class="coin-card">
            <h2 class="coin-title">COIN TOSS</h2>
            <img class="coin-coin" src="assets/branding/coin-heads.png" alt="coin" />
            <div class="coin-flip-line">CALL IT IN THE AIR</div>
            <div class="coin-choose">
              <div class="coin-buttons">
                <button data-call="heads">HEADS</button>
                <button data-call="tails">TAILS</button>
              </div>
            </div>
          </div>
        </div>`);
      root.appendChild(s);
      const coinImg = s.querySelector('.coin-coin');
      const line = s.querySelector('.coin-flip-line');
      const choose = s.querySelector('.coin-choose');

      s.querySelector('.coin-buttons').addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const call = btn.dataset.call;
        choose.textContent = '';
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const playerWon = result === call;
        coinImg.classList.add('spin'); // ~0.8s CSS flip
        line.textContent = `YOU CALLED ${call.toUpperCase()}…`;
        setTimeout(() => {
          coinImg.src = `assets/branding/coin-${result}.png`;
          coinImg.classList.remove('spin');
          ctx.bus.emit('sfx', playerWon ? 'crowd-cheer' : 'scratch');
          line.textContent = "IT'S ";
          const bold = document.createElement('b');
          bold.textContent = result.toUpperCase();
          line.append(bold, ` — ${playerWon ? 'YOU WIN THE TOSS' : 'THEY WIN THE TOSS'}`);
          if (playerWon) {
            const pick = el(`
              <div class="coin-buttons">
                <button data-first="${playerSide}">KICK FIRST</button>
                <button data-first="${playerSide === 'home' ? 'away' : 'home'}">FIELD FIRST</button>
              </div>`);
            choose.append(pick);
            pick.addEventListener('pointerdown', (e2) => {
              const b = e2.target.closest('button');
              if (b) ctx.beginMatch(b.dataset.first);
            });
          } else {
            const aiSide = playerSide === 'home' ? 'away' : 'home';
            const first = Math.random() < 0.85 ? aiSide : playerSide;
            choose.append(el(`<div class="coin-note">${first !== playerSide ? 'THEY ELECT TO KICK FIRST' : 'THEY PUT YOU UP FIRST'}</div>`));
            setTimeout(() => ctx.beginMatch(first), 1200);
          }
        }, 800);
      });
    },
  };
}

// ---------- POST-GAME ----------
export function PostGameScreen(ctx) {
  return {
    mount(root, { winner, score, playerSide, teams, stats }) {
      const won = winner === playerSide;
      const save = ctx.save;
      const xpGain = won ? 250 : 90;
      const crownGain = won ? 40 : 12;
      save.set('xp', save.get('xp', 0) + xpGain);
      save.set('crowns', save.get('crowns', 0) + crownGain);
      save.set('streak', won ? save.get('streak', 0) + 1 : 0);
      ctx.bus.emit('vo', 'gameover');

      // Win It: beat the HOME crew on THEIR field = take their trophy
      let trophy = null;
      if (won && playerSide === 'away' && ctx.trophies) {
        const res = ctx.trophies.claimTrophy(save, teams.home.id);
        if (res.claimed) trophy = res;
      }

      // THE LOCKER: feed the career, roll the catalog, toast what's new
      let fresh = [];
      if (ctx.unlocks) {
        const myRuns = Number(score?.[playerSide]) || 0;
        const theirRuns = Number(score?.[playerSide === 'away' ? 'home' : 'away']) || 0;
        ctx.unlocks.careerAdd(save, {
          wins: won ? 1 : 0,
          roadWins: won && playerSide === 'away' ? 1 : 0,
          blowouts: won && myRuns - theirRuns >= 5 ? 1 : 0,
          runs: myRuns,
          hr: stats?.hr ?? 0,
          defOuts: stats?.defOuts ?? 0,
          steals: stats?.steals ?? 0,
          pickleEscapes: stats?.pickleEscapes ?? 0,
        });
        fresh = ctx.unlocks.checkUnlocks(save);
      }

      const s = el(`
        <div class="screen postgame-screen">
          <h1 class="screen-title ${won ? 'gold' : ''}">${trophy?.king ? '👑 KING OF THE STREETS!' : won ? '👑 CROWNED!' : 'TOOK THE L'}</h1>
          <div class="mixtape">
            <div class="tape-row"><span data-side-a></span><b>${Number(score.away)}</b></div>
            <div class="tape-row"><span data-side-b></span><b>${Number(score.home)}</b></div>
            ${trophy ? `<div class="tape-row gold-row"><span>🏆 TROPHY CLAIMED</span><b>${teams.home.name.split(' ').pop().toUpperCase()}'S BALL</b></div>` : ''}
            ${trophy ? `<div class="tape-row dim"><span>CROWNS CLAIMED</span><b>${trophy.count}/9</b></div>` : ''}
            ${fresh.map((g) => `<div class="tape-row gold-row"><span>🔓 UNLOCKED — CHECK THE LOCKER</span><b>${g.name}</b></div>`).join('')}
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
      fresh.forEach((_, i) => setTimeout(() => ctx.bus.emit('sfx', 'unlock'), 400 + i * 260));
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
