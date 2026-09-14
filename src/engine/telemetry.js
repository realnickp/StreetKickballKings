// The one seam every error goes through. The game had no global error path:
// a rejected promise died silently, a frame-callback throw was console noise,
// and the dev learned about crashes from players (Phase 0, 2026-09-12).
//
// Headless and vendor-free: a bounded ring of recent events, a pluggable
// sink (Sentry / PostHog / a fetch to our own endpoint, later — it takes one
// `setSink` call), and a place to hang the 'stalled game' signal. Never
// throws: a reporter that can crash the thing it reports on is worse than none.
export class Telemetry {
  constructor({ max = 50 } = {}) {
    this.max = max;
    this.ring = [];
    this.sink = null;
    this.counts = { errors: 0, events: 0 };
  }

  /** Install the forwarder (or null to detach). */
  setSink(fn) { this.sink = typeof fn === 'function' ? fn : null; }

  /** Record a thrown thing. `ctx` names where it came from ({ where, phase, … }). */
  error(err, ctx = {}) {
    const message = err instanceof Error ? err.message
      : typeof err === 'string' ? err
        : err == null ? 'unknown error' : safeString(err);
    const stack = err instanceof Error ? (err.stack ?? '') : '';
    this.counts.errors += 1;
    return this._push({ type: 'error', message, stack, ...ctx });
  }

  /** Record a non-error signal ('stalled', 'context-lost', 'match-build-failed', …). */
  event(type, data = {}) {
    this.counts.events += 1;
    return this._push({ type, ...data });
  }

  recent() { return this.ring.slice(); }

  _push(entry) {
    const e = { t: Date.now(), ...entry };
    this.ring.push(e);
    if (this.ring.length > this.max) this.ring.splice(0, this.ring.length - this.max);
    if (this.sink) {
      try { this.sink(e); } catch { /* a sink that throws must never take the game with it */ }
    }
    return e;
  }
}

function safeString(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** The app-wide instance. main.js wires window 'error' / 'unhandledrejection'
 *  into it; scenes and the renderer report through it. Exported as a single
 *  object so a later Sentry hookup is one line in main.js. */
export const telemetry = new Telemetry();

/** Hook the two browser-level catch-alls. Idempotent; safe without a window. */
export function installGlobalHandlers(t = telemetry, win = typeof window !== 'undefined' ? window : null) {
  if (!win || win.__skkTelemetryInstalled) return;
  win.__skkTelemetryInstalled = true;
  win.addEventListener('error', (ev) => {
    t.error(ev.error ?? ev.message, { where: 'window.error', src: `${ev.filename ?? ''}:${ev.lineno ?? ''}` });
  });
  win.addEventListener('unhandledrejection', (ev) => {
    t.error(ev.reason, { where: 'unhandledrejection' });
  });
}
