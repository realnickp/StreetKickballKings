// Street Kickball Kings — boot + full screen flow
// splash video -> title -> menu -> team select -> coin toss -> match -> post-game
import './ui/ui.css';
import { createEngine } from './engine/renderer.js';
import { GestureInput } from './engine/input.js';
import { EventBus } from './engine/events.js';
import { AudioBus } from './engine/audio.js';
import { SaveManager } from './meta/save.js';
import { buildField } from './game/field.js';
import { buildPlayer, CLIP_NAMES } from './game/characters.js';
import { buildTeamCharsGlb } from './game/glbCharacters.js';
import { MatchScene } from './game/matchScene.js';
import { CinematicDirector } from './cinematics/director.js';
import { ReplayPlayer } from './cinematics/replay.js';
import { playVideo } from './cinematics/videoPlayer.js';
import { showLogoClash } from './cinematics/introSequence.js';
import { ScreenRouter } from './ui/router.js';
import { TitleScreen, MenuScreen, TeamSelectScreen, CoinTossScreen, PostGameScreen } from './ui/screens/screens.js';
import fieldsData from './data/fields.json';
import teamsData from './data/teams.json';
import tuning from './data/tuning.json';

// ---------- uniform colour helpers (light/dark kits so teams don't clash) ----------
const hexToRgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const mix = (hex, target, t) => { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t); };
/** A uniform for `hex` that contrasts in brightness with `vsHex`, keeping its hue. */
const contrastUniform = (hex, vsHex) =>
  lum(vsHex) < 0.5 ? mix(hex, [255, 255, 255], 0.6) : mix(hex, [12, 14, 20], 0.55);

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const stage = document.getElementById('stage') ?? document.body;
// The HUD lives in its OWN layer — ScreenRouter.go() calls replaceChildren() on
// #ui-root, which would otherwise wipe the HUD the moment we leave for the coin
// toss, leaving the match with no UI at all. It lives inside the phone frame.
const hudRoot = document.createElement('div');
hudRoot.id = 'hud-root';
stage.appendChild(hudRoot);
const engine = createEngine(canvas);
const input = new GestureInput();
input.attach(stage); // gestures scoped to the phone frame, not the desktop letterbox
const bus = new EventBus();
const audio = new AudioBus(bus);
const save = new SaveManager({});
window.__bus = bus; window.__audio = audio; // dev/debug handles

// PWA: register the service worker in production only (keeps dev hot-reload clean)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const params = new URLSearchParams(location.search);
const blacktop = fieldsData.fields.find(f => f.id === 'blacktop');

// ---------- dev: 3D GLB character harness (?glb) ----------
if (params.has('glb')) {
  const field = buildField(blacktop, engine.scene);
  let elapsed = 0;
  engine.onFrame((dt) => { elapsed += dt; field.updateCrowd(elapsed); });
  import('./game/glbCharacters.js').then(async ({ buildGlbCharacter }) => {
    const url = params.get('glb') === '1' ? '/assets/models/monarchs-23.glb' : (params.get('glb') || '/assets/models/monarchs-23.glb');
    const char = await buildGlbCharacter({ model: url }, { heightM: 2.05 });
    char.group.position.set(0, 0, -5);
    engine.scene.add(char.group);
    // show the STATIC character by default (bind pose) — set ?glb=1&anim to play
    const playAnim = location.search.includes('anim');
    if (playAnim) {
      engine.onFrame((dt) => char.animator.update(dt));
    } else {
      char.group.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    }
    engine.cameraLock = true;
    let spin = Math.PI;
    engine.onFrame((dt) => {
      spin += dt * 0.5; // slow turntable so they can see it in 3D
      char.group.rotation.y = spin;
      engine.camera.position.set(0, 1.25, -1.7);
      engine.camera.lookAt(0, 1.05, -5);
    });
    window.__char = char;
    window.__cam = engine.camera;
    window.__engine = engine;
    console.log('GLB loaded:', url, 'clips:', Object.keys(char.animator.clips));
  }).catch(e => console.error('GLB load failed', e));
} else

// ---------- dev: animation harness ----------
if (params.has('dance')) {
  const monarchs = teamsData.teams.find(t => t.id === 'monarchs');
  const snappers = teamsData.teams.find(t => t.id === 'snappers');
  const field = buildField(blacktop, engine.scene);
  let elapsed = 0;
  engine.onFrame((dt) => { elapsed += dt; field.updateCrowd(elapsed); });
  const p1 = buildPlayer(monarchs.roster[0].look, monarchs.colors);
  p1.group.position.set(-0.75, 0, -3.4);
  engine.scene.add(p1.group);
  const p2 = buildPlayer(snappers.roster[1].look, snappers.colors);
  p2.group.position.set(0.75, 0, -3.4);
  engine.scene.add(p2.group);
  let clipIdx = 0;
  const nextClip = () => {
    const name = CLIP_NAMES[clipIdx % CLIP_NAMES.length];
    p1.animator.play(name, { variant: 'tank' });
    p2.animator.play(name);
    clipIdx++;
  };
  nextClip();
  setInterval(nextClip, 2500);
  engine.onFrame((dt) => { p1.animator.update(dt); p2.animator.update(dt); });
  engine.camera.position.set(0, 1.6, 0.2);
  engine.camera.lookAt(0, 1.0, -3.4);
  engine.cameraLock = true;
} else

// ---------- dev: jump straight into a match (?match = you kick, ?match=field = you field) ----------
if (params.has('match')) {
  (async () => {
    const monarchs = teamsData.teams.find(t => t.id === 'monarchs');
    const snappers = teamsData.teams.find(t => t.id === 'snappers');
    const chars = {
      home: await buildTeamCharsGlb(snappers),
      away: await buildTeamCharsGlb(monarchs),
    };
    const scene = new MatchScene({
      engine, input, bus, chars,
      teams: { home: snappers, away: monarchs },
      fieldData: blacktop, tuning,
      difficulty: params.get('diff') ?? 'Street',
      playerSide: 'away', hudRoot, autoStart: false,
    });
    window.__skk = scene;
    const replayPlayer = new ReplayPlayer({ engine, hud: scene.hud, bus });
    const director = new CinematicDirector({
      engine, bus, hud: scene.hud, getBall: () => scene.ball,
      getReplay: () => ({ recorder: scene.replayRecorder, chars: scene.replayChars, ball: scene.ball, player: replayPlayer }),
    });
    void director;
    bus.on('matchOver', () => scene.startMatch(params.get('match') === 'field' ? 'home' : 'away'));
    scene.startMatch(params.get('match') === 'field' ? 'home' : 'away');
    console.log('match harness: you', params.get('match') === 'field' ? 'FIELD' : 'KICK', 'first');
  })();
} else {
  bootFlow();
}

// ---------- the real flow ----------
async function bootFlow() {
  const ctx = {
    engine, input, bus, audio, save,
    data: { teams: teamsData.teams, fields: fieldsData.fields, tuning },
    router: null,
    scene: null,
    director: null,
    playerTeam: null,
    opponentTeam: null,
    playerSide: 'away',
    startMatchFlow,
    beginMatch,
    rematch,
    backToMenu,
  };
  const router = new ScreenRouter(uiRoot, ctx);
  ctx.router = router;
  router.register('title', TitleScreen);
  router.register('menu', MenuScreen);
  router.register('teamSelect', TeamSelectScreen);
  router.register('coinToss', CoinTossScreen);
  router.register('postGame', PostGameScreen);

  // ---------- pause button + pause/sound overlay ----------
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'pause-btn';
  pauseBtn.textContent = '❚❚';
  pauseBtn.style.display = 'none';
  stage.appendChild(pauseBtn);

  const overlay = document.createElement('div');
  overlay.className = 'pause-overlay';
  overlay.innerHTML = `
    <div class="pause-card">
      <h2 class="pause-title">PAUSED</h2>
      <div class="sound-editor">
        <label><span>MASTER</span><input type="range" min="0" max="100" data-vol="master"></label>
        <label><span>MUSIC</span><input type="range" min="0" max="100" data-vol="music"></label>
        <label><span>SFX</span><input type="range" min="0" max="100" data-vol="sfx"></label>
      </div>
      <button class="p-resume">RESUME</button>
      <button class="p-menu">MAIN MENU</button>
    </div>`;
  stage.appendChild(overlay);
  // the overlay swallows pointer events so taps on it never reach the game input
  for (const ev of ['pointerdown', 'pointermove', 'pointerup']) overlay.addEventListener(ev, (e) => e.stopPropagation());

  // load saved sound-editor volumes into the engine + sliders
  for (const ch of ['master', 'music', 'sfx']) {
    const v = save.get('vol_' + ch, 1);
    audio.setVolume(ch, v);
    overlay.querySelector(`[data-vol="${ch}"]`).value = Math.round(v * 100);
  }
  overlay.querySelectorAll('[data-vol]').forEach((sl) => {
    sl.addEventListener('input', () => { const ch = sl.dataset.vol, v = sl.value / 100; audio.setVolume(ch, v); save.set('vol_' + ch, v); });
  });

  const showOverlay = (mode) => {
    overlay.classList.add('show');
    overlay.querySelector('.pause-title').textContent = mode === 'pause' ? 'PAUSED' : 'SOUND';
    overlay.querySelector('.p-menu').style.display = mode === 'pause' ? '' : 'none';
    overlay.querySelector('.p-resume').textContent = mode === 'pause' ? 'RESUME' : 'CLOSE';
    if (mode === 'pause') engine.paused = true;
  };
  const hideOverlay = () => { overlay.classList.remove('show'); engine.paused = false; };
  pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); showOverlay('pause'); });
  overlay.querySelector('.p-resume').addEventListener('pointerdown', (e) => { e.stopPropagation(); hideOverlay(); });
  overlay.querySelector('.p-menu').addEventListener('pointerdown', (e) => { e.stopPropagation(); hideOverlay(); backToMenu(); });
  ctx.setMatchActive = (on) => { pauseBtn.style.display = on ? 'flex' : 'none'; if (!on) hideOverlay(); };
  ctx.showSettings = () => showOverlay('settings');

  // "TAP IN" gate gives us the user gesture, so the splash plays WITH the theme
  if (!params.has('nosplash')) {
    await new Promise((resolve) => {
      const gate = document.createElement('div');
      gate.className = 'screen title-screen';
      gate.innerHTML = `<img class="title-logo" src="assets/branding/logo-square.png" alt="" />
        <div class="tap-start bounce-beat">TAP IN</div>`;
      uiRoot.appendChild(gate);
      gate.addEventListener('pointerdown', () => { gate.remove(); resolve(); }, { once: true });
    });
    audio.ensureCtx();
    audio.music('theme'); // Red Rubber Felony rides over the splash video
    await playVideo('assets/video/splash-intro.mp4', { muted: true });
  }
  router.go('title');
  // dev: jump straight to a screen for screenshots, e.g. ?nosplash&go=teamSelect
  if (params.has('go')) router.go(params.get('go'));

  async function startMatchFlow(playerTeam, opponentTeam, kits) {
    ctx.playerTeam = playerTeam;
    ctx.opponentTeam = opponentTeam;

    // Leave the team-select screen NOW. Otherwise it sits in #ui-root under the
    // intro videos (z-index 50) and flashes back into view between clips — the
    // "it bounces back to the select screen" bug. A black backdrop covers the gap.
    uiRoot.replaceChildren();
    const black = document.createElement('div');
    black.className = 'screen';
    black.style.cssText = 'background:#050308;position:absolute;inset:0;z-index:1;';
    uiRoot.appendChild(black);

    // Build the world in parallel with the intro so there's no dead wait at the end.
    if (ctx.scene) ctx.scene.destroy();
    // Use the kits chosen in team select; otherwise default to contrasting kits so
    // the two teams never clash (player keeps their colour, opponent gets a variant).
    const awayColor = kits?.away ?? playerTeam.colors.primary;
    const homeColor = kits?.home ?? contrastUniform(opponentTeam.colors.primary, awayColor);
    const charsPromise = (async () => ({
      home: await buildTeamCharsGlb(opponentTeam, homeColor),
      away: await buildTeamCharsGlb(playerTeam, awayColor),
    }))();

    // INTRO SEQUENCE: kill the theme (so it doesn't fight each video's own music).
    // YOUR squad's video first, then the opponent's — the VS slam only AFTER both
    // teams have been shown — then the logo clash leads into the coin toss.
    audio.stopMusic();
    await playVideo(playerTeam.introVideo);
    audio.stopMusic();
    await playVideo(opponentTeam.introVideo);
    // ONE versus moment: the logo clash (it already shows the "VS" + both crests)
    bus.emit('sfx', 'bassdrop');
    await showLogoClash(playerTeam, opponentTeam);

    const chars = await charsPromise;
    // Play at the HOME team's (opponent's) city field so each team's stadium shows.
    const homeField = fieldsData.fields.find(f => f.id === opponentTeam.homeField) ?? blacktop;
    ctx.scene = new MatchScene({
      engine, input, bus, chars,
      teams: { home: opponentTeam, away: playerTeam },
      fieldData: homeField,
      tuning,
      difficulty: params.get('diff') ?? 'Street',
      playerSide: 'away',
      hudRoot,
      autoStart: false,
    });
    window.__skk = ctx.scene; // dev/debug handle
    // director + replay follow the CURRENT scene (rebuilt every match)
    ctx.replayPlayer = ctx.replayPlayer ?? new ReplayPlayer({ engine, hud: ctx.scene.hud, bus });
    ctx.replayPlayer.hud = ctx.scene.hud;
    ctx.director = ctx.director ?? new CinematicDirector({
      engine, bus, hud: ctx.scene.hud, getBall: () => ctx.scene.ball,
      getReplay: () => ({ recorder: ctx.scene.replayRecorder, chars: ctx.scene.replayChars, ball: ctx.scene.ball, player: ctx.replayPlayer }),
    });
    ctx.director.hud = ctx.scene.hud;

    audio.stopMusic();      // silence game music so the coin-toss video's own audio plays clean
    audio.ambience(true);
    router.go('coinToss', { scene: ctx.scene, director: ctx.director, playerSide: 'away' });
  }

  function beginMatch(firstKick) {
    uiRoot.querySelectorAll('.screen').forEach(s => s.remove());
    audio.music('beat'); // game music starts AFTER the coin toss — no clash with its video audio
    ctx.setMatchActive?.(true);
    ctx.scene.startMatch(firstKick);
  }

  function rematch() {
    router.go('coinToss', { scene: ctx.scene, director: ctx.director, playerSide: 'away' });
  }

  function backToMenu() {
    ctx.setMatchActive?.(false);
    if (ctx.scene) { ctx.scene.destroy(); ctx.scene = null; }
    audio.ambience(false);
    audio.music('theme');
    router.go('menu');
  }

  bus.on('matchOver', ({ winner, score }) => {
    ctx.setMatchActive?.(false);
    router.go('postGame', {
      winner, score,
      playerSide: 'away',
      teams: { home: ctx.opponentTeam, away: ctx.playerTeam },
    });
  });
}
