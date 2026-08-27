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
export function buildLocker(ctx, { mode, team, onPlay = null, onBack = null }) {
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
  const cap = root.querySelector('.locker-stage-cap');
  const refreshPreview = () => {
    const eq = equippedGear(save);
    cap.textContent = `${(team.roster?.[0]?.nick ?? 'YOUR CAPTAIN').toUpperCase()} — ${gearLine(eq)}`;
    preview?.show({ team, uniformHex: eq.uniform?.hex ?? null, gear: eq }).catch((e) => console.warn('[skk] locker preview failed:', e));
  };
  const render = () => {
    const eq = equippedGear(save);
    const tabs = lockerTabs({ GEAR, isUnlocked: (id) => isUnlocked(save, id), eq });
    const bar = root.querySelector('.locker-tabs');
    bar.replaceChildren(...tabs.map((t) => {
      const b = el(`<button class="locker-tab ${t.cat === tab ? 'on' : ''}">${t.label}<small>${t.owned}/${t.total}</small></button>`);
      b.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'ui-tap'); tab = t.cat; render(); });
      return b;
    }));
    const row = root.querySelector('.locker-chips');
    const t = tabs.find((x) => x.cat === tab);
    row.replaceChildren(...t.chips.map((c) => {
      const swatch = c.hex && (t.cat === 'cleats' || t.cat === 'uniform') ? `<i class="swatch" style="background:${c.hex}"></i>` : '';
      const chip = el(`<div class="equip-chip locker-chip ${c.owned ? '' : 'locked'} ${c.on ? 'on' : ''} ${c.stock ? 'stock' : ''} ${isDarkHex(c.hex) ? 'dark' : ''}" style="--c:${c.hex ?? '#e8792e'}">
        ${swatch}${c.owned ? c.name : '🔒 ' + c.name}<small>${c.owned ? (c.stock ? 'FREE · ' : '') + c.play : c.hint.toUpperCase()}</small></div>`);
      if (c.owned) chip.addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'ui-confirm');
        equipGear(save, t.cat, c.id);
        render();
        row.querySelector('.on')?.classList.add('just');
        // a kick/taunt tap PLAYS on the captain standing there — the kit and
        // cleats didn't change, so rebuilding him would only cost a beat.
        if (c.clip) { if (!preview?.playMove(c.clip)) refreshPreview(); } else refreshPreview();
      });
      return chip;
    }));
  };
  render();
  try {
    preview = new LockerPreview(root.querySelector('.locker-preview'));
    refreshPreview();
  } catch (e) { console.warn('[skk] locker preview unavailable:', e); }
  return {
    el: root,
    selectTab(cat) { tab = cat; render(); },
    flashFree() { const f = root.querySelector('.locker-free'); f.classList.remove('hidden'); setTimeout(() => f.classList.add('hidden'), 3000); root.querySelector('.locker-chip.stock')?.classList.add('just'); },
    destroy() { preview?.destroy(); preview = null; },
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

export function gearUpArgs({ away, home, kits }) {
  if (!away || !home) throw new Error('gearUp needs { away, home }');
  return [away, home, kits ?? {}];
}
/** Pre-game GEAR UP: the Locker with PLAY. Team select routes here; PLAY hands
 *  the untouched team/kit choice to startMatchFlow, which reads equippedGear. */
export function GearUpScreen(ctx) {
  return {
    mount(root, params = {}) {
      const [away, home, kits] = gearUpArgs(params);
      this.locker = buildLocker(ctx, {
        mode: 'gearUp', team: away,
        // startMatchFlow (main.js) tears down #ui-root itself instead of going
        // through router.go(), so the router never calls our unmount() — kill
        // the preview's WebGL context/rAF loop HERE, before handoff, or it
        // keeps running against a detached canvas through the whole intro
        // (and leaks for good if anything throws before coinToss unmounts it).
        onPlay: () => { this.locker?.destroy(); this.locker = null; ctx.startMatchFlow(away, home, kits); },
        onBack: () => ctx.router.go('teamSelect'),
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
