// Skip the post chain while an opaque DOM layer covers the canvas (audit B16).
// Frame CALLBACKS keep running — this only decides whether composer.render()
// is worth calling. `settleFrames` frames are always drawn after a change so
// the framebuffer holds a current image when a screen lifts.
export class RenderGate {
  constructor({ settleFrames = 2 } = {}) {
    this.covered = false;
    this.settleFrames = settleFrames;
    this._pending = 0;
  }
  setCovered(on) {
    on = !!on;
    if (on === this.covered) return;
    this.covered = on;
    this._pending = this.settleFrames;
  }
  /** Call once per frame. true = draw this frame. */
  shouldRender() {
    if (!this.covered) return true;
    if (this._pending > 0) { this._pending -= 1; return true; }
    return false;
  }
}

/** Is the stage's canvas hidden behind something opaque right now? Opaque =
 *  a `.screen` in #ui-root that is not `.transparent` (ui.css supports that
 *  modifier; no shipped screen sets it today — the coin toss is opaque too)
 *  and not hidden, or a set-piece video wrapper (`.video-cover`). The pause
 *  overlay is neither: the game stays visible behind it. */
export function isCovered(stage) {
  if (!stage) return false;
  if (stage.querySelector('.video-cover')) return true;
  const ui = stage.querySelector('#ui-root');
  if (!ui) return false;
  for (const child of ui.children) {
    if (!child.classList?.contains('screen')) continue;
    if (child.classList.contains('transparent') || child.hidden) continue;
    return true;
  }
  return false;
}
