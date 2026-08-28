// THE LOCKER / GEAR UP. Dev, 2026-08-27: "you have everything on one menu …
// put all of that in sections so it's easier to navigate and so that you can
// make the changes to the player and be able to see them immediately as you
// click the buttons"; "they need to actually be able to see it on the player
// in the preview."
//
// So: the turntable is PINNED at the top and never remounts, the catalog is
// four tabs of one chip row, and every tap re-renders in place — kits/cleats
// rebuild the captain on the SAME canvas, kicks/taunts play the move on him.
import { LockerPreview } from '../lockerPreview.js';
import { lockerTabs } from '../lockerModel.js';
import { gearLine } from '../../meta/gearLine.js';
import { dressTeams } from '../../game/kits.js';

// THE LOCKER has no opponent, but the captain must be the SAME colour on both
// screens — it read as a bug that the menu showed the crew's signature primary
// and GEAR UP showed the dressed kit. So the menu dresses him through the same
// path against this stand-in crew, seeded so his own DARK kit is the default
// look; anything equipped still pins his side and wins.
const NEUTRAL_CREW = { id: '', colors: { primary: '#8a8a92' }, kits: {
  dark: { hex: '#23232a', ink: '#f4f4f6', logo: '', img: '' },
  light: { hex: '#f2f2f4', ink: '#0b0c10', logo: '', img: '' },
} };

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

// An EQUIPPED chip is painted in the gear's own colour (.equip-chip.on), with
// #0b0d12 ink. On near-black gear — BLACKOUT KIT #1b1b22, BLACKOUTS #15151a —
// that label disappears into its own chip, so the one piece you ARE wearing
// becomes the one you can't read. Flag dark gear so the CSS keeps it bright.
const isDarkHex = (hex) => {
  const n = parseInt(String(hex ?? '').replace('#', ''), 16);
  if (!Number.isFinite(n)) return false;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.42;
};

/** One component, two modes: the menu's Locker (MAIN MENU) and the pre-game
 *  GEAR UP (PLAY). Turntable pinned on top, one tab's chips at a time; every
 *  tap re-renders the captain in place — no remount, no context churn. */
export function buildLocker(ctx, { mode, team, opponent = null, tones = null, onPlay = null, onBack = null }) {
  const save = ctx.save;
  const { GEAR, isUnlocked, equipGear, equippedGear, careerGet } = ctx.unlocks;
  const career = careerGet(save);
  let tab = 'kick';
  const root = el(`
    <div class="screen locker-screen ${mode === 'gearUp' ? 'gear-up' : ''}">
      <h1 class="screen-title gold">${mode === 'gearUp' ? 'GEAR UP' : 'THE LOCKER'}</h1>
      <p class="map-sub">${mode === 'gearUp' ? "what you're taking to the block" : 'Earn it on the block. Tap it to rock it.'}</p>
      <div class="locker-stage"><canvas class="locker-preview" width="440" height="520"></canvas><p class="locker-stage-cap"></p><div class="locker-free hidden">FREE — YOUR STARTER GEAR</div></div>
      <div class="locker-tabs"></div>
      <div class="locker-chips"></div>
      <p class="locker-career">W ${career.wins} · HR ${career.hr} · STEALS ${career.steals} · GLOVE ${career.defOuts} · CREWS ${career.crews}/9</p>
      <div class="locker-actions"></div>
    </div>`);
  const actions = root.querySelector('.locker-actions');
  if (mode === 'gearUp') {
    actions.appendChild(el('<button class="big-play locker-play">PLAY<small>ROLL OUT</small></button>'));
    actions.appendChild(el('<button class="locker-back">← TEAMS</button>'));
    actions.querySelector('.locker-play').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'bassdrop'); onPlay?.(); });
    actions.querySelector('.locker-back').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); onBack?.(); });
  } else {
    actions.appendChild(el('<div class="coin-buttons"><button data-act="menu">MAIN MENU</button></div>'));
    actions.querySelector('[data-act="menu"]').addEventListener('pointerdown', () => ctx.router.go('menu'));
  }
  let preview = null;
  let freeTimer = null;
  const cap = root.querySelector('.locker-stage-cap');
  const sub = root.querySelector('.map-sub');
  // GEAR UP names the kit you'll ACTUALLY wear out there: the match dressing
  // (home dark / away light, flipped if the pair clashes) with your equipped
  // kit layered on top — so the turntable, this line and the field agree.
  const dressed = () => dressTeams({
    home: opponent ?? NEUTRAL_CREW, away: team, playerSide: 'away',
    gearKit: equippedGear(save).uniform,
    tones: opponent ? tones : { home: 'light', away: 'dark' },
  });
  const refreshPreview = () => {
    const eq = equippedGear(save);
    const d = dressed();
    cap.textContent = `${(team.roster?.[0]?.nick ?? 'YOUR CAPTAIN').toUpperCase()} — ${gearLine(eq)}`;
    if (opponent && sub) sub.textContent = `WEARING: ${d.away.tone.toUpperCase()} vs ${opponent.name.toUpperCase()} ${d.home.tone.toUpperCase()}`;
    const hex = d.away.hex;
    preview?.show({ team, uniformHex: hex, gear: eq }).catch((e) => console.warn('[skk] locker preview failed:', e));
  };
  // The model sorts equipped-first, so an equip would RE-SORT the row under the
  // thumb: the chip you just tapped jumps to the head of a horizontally
  // scrolling list and a different one lands where your finger still is. Lock
  // the order per TAB VIEW — computed when the tab opens, held across every
  // equip in it, refreshed the next time you come back to that tab.
  const orderByCat = {};
  const openTab = (cat) => { tab = cat; delete orderByCat[cat]; render(); };
  const render = () => {
    const eq = equippedGear(save);
    const tabs = lockerTabs({ GEAR, isUnlocked: (id) => isUnlocked(save, id), eq, team });
    const bar = root.querySelector('.locker-tabs');
    bar.replaceChildren(...tabs.map((t) => {
      const b = el(`<button class="locker-tab ${t.cat === tab ? 'on' : ''}">${t.label}<small>${t.owned}/${t.total}</small></button>`);
      b.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'ui-tap'); openTab(t.cat); });
      return b;
    }));
    const row = root.querySelector('.locker-chips');
    const t = tabs.find((x) => x.cat === tab);
    if (!orderByCat[tab]) orderByCat[tab] = t.chips.map((c) => c.id);
    const order = orderByCat[tab];
    const rank = (c) => { const i = order.indexOf(c.id); return i < 0 ? order.length : i; };
    const chips = [...t.chips].sort((a, b) => rank(a) - rank(b));
    row.replaceChildren(...chips.map((c) => {
      const swatch = c.hex && (t.cat === 'cleats' || t.cat === 'uniform') ? `<i class="swatch" style="background:${c.hex}"></i>` : '';
      const chip = el(`<div class="equip-chip locker-chip ${c.owned ? '' : 'locked'} ${c.on ? 'on' : ''} ${c.stock ? 'stock' : ''} ${isDarkHex(c.hex) ? 'dark' : ''}" style="--c:${c.hex ?? '#e8792e'}">
        ${swatch}${c.owned ? c.name : '🔒 ' + c.name}<small>${c.owned ? (c.stock ? 'FREE · ' : '') + c.play : c.hint.toUpperCase()}</small></div>`);
      if (c.owned) {
        // The chip row SCROLLS sideways, so pointerdown-to-equip meant a thumb
        // drag past the padlocks equipped whatever it started on. Equip on
        // pointerUP, and only if the thumb stayed put (≤ 10 px) — a browse
        // drag now just browses. (Tabs don't scroll, so they stay on down.)
        let px = 0, py = 0;
        chip.addEventListener('pointerdown', (e) => { px = e.clientX ?? 0; py = e.clientY ?? 0; });
        chip.addEventListener('pointerup', (e) => {
          if (Math.hypot((e.clientX ?? 0) - px, (e.clientY ?? 0) - py) > 10) return; // a scroll, not a tap
          ctx.bus.emit('sfx', 'ui-confirm');
          equipGear(save, t.cat, c.id);
          render();
          row.querySelector('.on')?.classList.add('just');
          // a kick/taunt tap PLAYS on the captain standing there — the kit and
          // cleats didn't change, so rebuilding him would only cost a beat.
          if (c.clip) { if (!preview?.playMove(c.clip)) refreshPreview(); } else refreshPreview();
        });
      }
      return chip;
    }));
  };
  render();
  // ?e2e hands the harness the live turntable so an equipped taunt PLAYING on
  // the captain (and the GPU cost of a rebuild) is assertable, not eyeball-only.
  const e2e = (() => { try { return new URLSearchParams(location.search).has('e2e'); } catch { return false; } })();
  const mountPreview = (canvas) => {
    try {
      preview = new LockerPreview(canvas);
      preview.onLost = onPreviewLost;
      if (e2e) { root.__preview = preview; window.__lockerPreview = preview; }
      refreshPreview();
    } catch (e) { console.warn('[skk] locker preview unavailable:', e); }
  };
  let rebuilding = false;
  // A dropped GL context (backgrounded tab, memory pressure, another canvas
  // taking the last slot) leaves a black turntable for the rest of the visit.
  // Rebuild once — on a FRESH canvas node, because the lost context stays lost
  // on the old one until the browser gets round to restoring it.
  const onPreviewLost = () => {
    if (rebuilding) return;
    rebuilding = true;
    try { preview?.destroy(); } catch { /* already gone */ }
    preview = null;
    const old = root.querySelector('canvas.locker-preview');
    if (old) { const fresh = old.cloneNode(false); old.replaceWith(fresh); mountPreview(fresh); }
    rebuilding = false;
  };
  mountPreview(root.querySelector('.locker-preview'));
  return {
    el: root,
    selectTab(cat) { openTab(cat); },
    flashFree() {
      const f = root.querySelector('.locker-free');
      f.classList.remove('hidden');
      clearTimeout(freeTimer);
      freeTimer = setTimeout(() => f.classList.add('hidden'), 3000);
      root.querySelector('.locker-chip.stock')?.classList.add('just');
    },
    // the timeout outlives the screen otherwise — it fires against a detached
    // node long after PLAY handed the display to the match flow
    destroy() { clearTimeout(freeTimer); freeTimer = null; preview?.destroy(); preview = null; },
  };
}

export function LockerScreen(ctx) {
  return {
    mount(root) {
      const team = ctx.playerTeam ?? ctx.data.teams[0];
      this.locker = buildLocker(ctx, { mode: 'locker', team });
      root.appendChild(this.locker.el);
    },
    // the router calls unmount() on the outgoing screen — kill the RAF loop and
    // hand back the WebGL context so leaving the Locker can't leak one
    unmount() { this.locker?.destroy(); this.locker = null; },
  };
}

/** The match-flow args, and ONLY those: `pick` rides along in the route params
 *  so ← TEAMS can restore the matchup, and is deliberately not returned here. */
export function gearUpArgs({ away, home, kits }) {
  if (!away || !home) throw new Error('gearUp needs { away, home }');
  return [away, home, kits ?? {}];
}
/** Pre-game GEAR UP: the Locker with PLAY. Team select routes here; PLAY hands
 *  the untouched team/kit choice to startMatchFlow, which reads equippedGear. */
export function GearUpScreen(ctx) {
  return {
    mount(root, params = {}) {
      // ?go=gearUp (the dev harness / a deep link) arrives with no matchup —
      // send it through team select instead of throwing on the way in.
      if (!params.away) { ctx.router.go('teamSelect'); return; }
      const [away, home, kits] = gearUpArgs(params);
      const pick = params.pick ?? null; // team select's cursor, so ← TEAMS restores it
      this.locker = buildLocker(ctx, {
        mode: 'gearUp', team: away, opponent: home, tones: kits?.tone ?? null,
        // startMatchFlow (main.js) tears down #ui-root itself instead of going
        // through router.go(), so the router never calls our unmount() — kill
        // the preview's WebGL context/rAF loop HERE, before handoff, or it
        // keeps running against a detached canvas through the whole intro
        // (and leaks for good if anything throws before coinToss unmounts it).
        onPlay: () => { this.locker?.destroy(); this.locker = null; ctx.startMatchFlow(away, home, kits); },
        onBack: () => ctx.router.go('teamSelect', { pick }),
      });
      root.appendChild(this.locker.el);
      if (!ctx.save.get('gearSeen', false)) {   // first time: show them the free gear ON the player
        ctx.save.set('gearSeen', true);
        this.locker.selectTab('cleats');
        this.locker.flashFree();
      }
    },
    unmount() { this.locker?.destroy(); this.locker = null; },
  };
}
