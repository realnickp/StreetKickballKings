// Unified gesture layer. Pointer events (touch AND mouse) feed handleDown/
// Move/Up; gameplay listens for tap / swipe / drag / stroke / mash-rate. Pure
// logic — attach() is the only DOM touchpoint, so everything is unit-testable.
//
// stroke + the enriched `up` event are what M1 needs: swipe-to-kick reads the
// release time + aim angle off `up`, and pitch-pattern tracing reads the full
// point path off `stroke`.
import { EventBus } from './events.js';

const TAP_MAX_MS = 250;
const TAP_MAX_TRAVEL_PX = 12;
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 300;

export class GestureInput {
  constructor() {
    this.bus = new EventBus();
    this.down = null;
    this.last = null;
    this.points = [];   // full stroke path of the current press
    this.taps = [];     // timestamps ring for tapRate
  }

  on(event, fn) {
    return this.bus.on(event, fn);
  }

  handleDown(x, y, tMs) {
    this.down = { x, y, t: tMs };
    this.last = { x, y, t: tMs };
    this.points = [{ x, y, t: tMs }];
    this.bus.emit('down', { x, y, t: tMs });
  }

  handleMove(x, y, tMs) {
    if (!this.down) return;
    this.points.push({ x, y, t: tMs });
    const travel = Math.hypot(x - this.down.x, y - this.down.y);
    if (travel > TAP_MAX_TRAVEL_PX) {
      this.bus.emit('drag', {
        x, y, t: tMs,
        dx: x - this.last.x,
        dy: y - this.last.y,
        fromX: this.down.x,
        fromY: this.down.y,
      });
    }
    this.last = { x, y, t: tMs };
  }

  handleUp(x, y, tMs) {
    if (!this.down) return;
    const downT = this.down.t;
    const dt = tMs - downT;
    const dx = x - this.down.x;
    const dy = y - this.down.y;
    const travel = Math.hypot(dx, dy);
    this.points.push({ x, y, t: tMs });

    if (dt <= TAP_MAX_MS && travel <= TAP_MAX_TRAVEL_PX) {
      this.taps.push(tMs);
      if (this.taps.length > 32) this.taps.shift();
      this.bus.emit('tap', { x, y, t: tMs });
    } else if (dt <= SWIPE_MAX_MS && travel >= SWIPE_MIN_PX) {
      // angle: 0 = straight up, + = toward right, - = toward left (screen y is down)
      const angleDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      this.bus.emit('swipe', { dir, angleDeg, dx, dy, mag: travel, downT, t: tMs });
    }

    // every press that moved beyond a tap is a traceable stroke
    if (travel > TAP_MAX_TRAVEL_PX) {
      this.bus.emit('stroke', { points: this.points.slice(), downT, upT: tMs, dur: dt });
    }

    // enriched release — the kick trigger. dx/dy give aim, t gives release timing.
    this.bus.emit('up', { x, y, t: tMs, downT, dx, dy, travel, dur: dt });
    this.down = null;
    this.last = null;
    this.points = [];
  }

  /** Taps per second within the trailing window. nowMs defaults to the last event time. */
  tapRate(windowMs, nowMs = this.taps[this.taps.length - 1] ?? 0) {
    const cutoff = nowMs - windowMs;
    const n = this.taps.filter(t => t > cutoff && t <= nowMs).length;
    return n / (windowMs / 1000);
  }

  /** Bind to a DOM element. Pointer events give touch + mouse parity for free. */
  attach(el) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => this.handleDown(e.clientX, e.clientY, e.timeStamp));
    el.addEventListener('pointermove', e => this.handleMove(e.clientX, e.clientY, e.timeStamp));
    el.addEventListener('pointerup', e => this.handleUp(e.clientX, e.clientY, e.timeStamp));
    el.addEventListener('pointercancel', () => { this.down = null; this.last = null; this.points = []; });
  }
}
